"use client";
/**
 * Spark Buddy: a private chat with your own Buddy. You talk (or type), it fills in
 * your onboarding, coaches you, and proposes actions as cards you confirm.
 * After each interview answer it asks "Do you trust this to your Spark Buddy?"
 * (Off the table by default, a hint you approve, or open).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useApp } from "@/components/app-provider";
import { CrisisResources } from "@/components/crisis-resources";
import { QuestionField } from "@/components/questions/question-field";
import type { Draft } from "@/components/questions/flow";
import { Badge, Button, Card, Notice, PageHeader, ProgressBar, Spinner, TextAreaField, useToast } from "@/components/ui";
import { messageOf, type BuddyTurn, type ShareLevel } from "@/lib/backend/types";
import { useAiConsent } from "@/lib/buddy/ai-consent";
import { parseConfirm, parseTrustLevel, questionToSpeech } from "@/lib/buddy/voice/spoken-intents";
import { MicBlockedError, useBuddyVoice, VoiceUnavailableError } from "./use-buddy-voice";
import { VOICE_SAMPLE, VoicePanel } from "./voice-panel";
import { buildBuddyContext } from "@/lib/buddy/context";
import { describeAction, NAV_HREF, runAction } from "@/lib/buddy/actions";
import { cx } from "@/lib/ui/cx";
import { interviewProgress, MESSAGE_MAX, nextInterviewQuestion, SHARE_COPY, SHARE_LEVELS, type BuddyAction } from "@shared/buddy.ts";
import { validateAnswer, type AnswerValue, type Question } from "@shared/questionnaires.ts";

interface ChatItem extends BuddyTurn {
  key: string;
  actions?: BuddyAction[];
  crisis?: boolean;
  /** Buddy's next question once this reply's offer is done ("stars, or something deeper?"). */
  followUp?: string | null;
}

/** The offer Buddy just made out loud: one or two cards a plain "yes" does together. */
interface PendingOffer {
  key: string;
  actions: BuddyAction[];
  followUp: string | null;
}

const STARTERS = [
  "Let's fill out my onboarding",
  "I feel like we're drifting. Is it something I did?",
  "Plan a date night for us",
  "What projects are we working on?",
  "How are our savings doing?",
  "Read our astrology and numbers",
];

const autoKey = (uid: string) => `spark-buddy-autosave:${uid}`;
function loadAuto(uid: string): boolean {
  try {
    return localStorage.getItem(autoKey(uid)) !== "off";
  } catch {
    return true;
  }
}

let counter = 0;
const keyOf = () => `t${Date.now().toString(36)}${++counter}`;

export function BuddyScreen() {
  const { backend, user, profile, partner, couple } = useApp();
  const router = useRouter();
  const toast = useToast();
  const partnerName = partner?.nickname || partner?.displayName || "your partner";
  const myName = profile?.nickname || profile?.displayName || "there";

  const [items, setItems] = useState<ChatItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [interviewing, setInterviewing] = useState(false);
  const [draft, setDraft] = useState<Draft>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [trustFor, setTrustFor] = useState<Question | null>(null);
  const [auto, setAuto] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showVoice, setShowVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [hintRequest, setHintRequest] = useState(0);
  const [announce, setAnnounce] = useState("");
  /** True while the conversation is being driven by voice (so hands-free can keep it going). */
  const voiceMode = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const talkRef = useRef<HTMLButtonElement>(null);

  /*
   * The hands-free chain (speak -> listen -> handle -> speak ...) runs across many
   * renders, so everything it reads goes through refs that always hold the latest
   * value. Reading render-time state there once shared an EARLIER answer openly
   * and confirmed an older suggestion card (review, 2026-10-08).
   */
  const trustForRef = useRef<Question | null>(null); // set at the same moment as trustFor
  const itemsRef = useRef<ChatItem[] | null>(null);
  itemsRef.current = items;
  const sendingRef = useRef(false);
  /** The suggestion Buddy just offered ("Want me to do that?"): a yes, spoken or typed, does it. */
  const pendingConfirm = useRef<PendingOffer | null>(null);
  const handleSpokenRef = useRef<(heard: string) => Promise<void>>(async () => undefined);
  const voiceTurnRef = useRef<(opts?: { auto?: boolean }) => Promise<void>>(async () => undefined);

  const ai = useAiConsent(user?.id);
  const live = backend.mode === "live";
  const question = interviewing && !trustFor ? nextInterviewQuestion(done) : null;
  const progress = interviewProgress(done);

  // The studio (server) voice: live mode, AI turned on, and only while the server has one to offer.
  const [studioVoice, setStudioVoice] = useState(true);
  const serverVoice = useMemo(
    () =>
      live && ai.aiOn && studioVoice
        ? async (chunk: string, mood?: "lively" | "calm") => {
            const result = await backend.buddy.speak(chunk, true, mood);
            // Stop asking only when it can't help for the rest of the visit; one failed clip is just a blip.
            if (result.reason === "off" || result.reason === "limited") setStudioVoice(false);
            return result.audio;
          }
        : null,
    [live, ai.aiOn, studioVoice, backend],
  );
  const voice = useBuddyVoice(user?.id, serverVoice);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const spokenAloud = voice.prefs.speak && voice.canSpeak;

  /** Changing AI consent silences Buddy at once, so no more of the reply goes to the studio voice. */
  const setAi = (on: boolean) => {
    voice.hush();
    ai.set(on);
  };

  useEffect(() => {
    if (user) setAuto(loadAuto(user.id));
  }, [user]);

  useEffect(() => {
    let alive = true;
    Promise.all([backend.buddy.history(), backend.answers.list()])
      .then(([turns, answers]) => {
        if (!alive) return;
        setItems(turns.map((t) => ({ ...t, key: keyOf() })));
        setDone(new Set(answers.map((a) => a.questionId)));
      })
      .catch((e) => alive && setLoadError(messageOf(e)));
    return () => {
      alive = false;
    };
  }, [backend, user?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [items?.length, question?.id, trustFor?.id]);

  // Reset the answer draft whenever the interview moves to a new question.
  useEffect(() => {
    setDraft(null);
    setDraftError(null);
  }, [question?.id]);

  const push = (...more: ChatItem[]) => setItems((list) => [...(list ?? []), ...more]);
  /** Adds a Buddy message to the chat and returns its key. */
  const say = (textOut: string, extra: Partial<ChatItem> = {}) => {
    const key = keyOf();
    push({ role: "buddy", text: textOut, at: new Date().toISOString(), key, ...extra });
    if (spokenAloud) setAnnounce("Buddy replied."); // the reply itself is heard, not read twice
    return key;
  };
  const setTrust = (q: Question | null) => {
    trustForRef.current = q;
    setTrustFor(q);
  };

  /** Says something; then, in a hands-free voice conversation, listens for the answer. */
  async function speakThenListen(textOut: string, opts: { calm?: boolean } = {}) {
    const finished = await voiceRef.current.say(textOut, opts);
    // Stopped, Esc, page hidden or interrupted: the person took the floor, so never re-open the mic.
    if (!finished) return;
    await new Promise((resolve) => setTimeout(resolve, 0)); // let React commit what changed while Buddy spoke
    const v = voiceRef.current;
    if (voiceMode.current && v.prefs.handsFree && v.canListen) void voiceTurnRef.current({ auto: true });
  }

  function startInterview(lead = ""): string {
    setInterviewing(true);
    setTrust(null);
    const next = nextInterviewQuestion(done);
    if (!next) {
      const msg = `You've answered everything I have, ${myName}. You can change any answer in Questions.`;
      say(msg, { actions: [{ type: "open", to: "questions" }] });
      return `${lead} ${msg}`.trim();
    }
    return `${lead} ${questionToSpeech(next)}`.trim();
  }

  const TRUST_ASK = "Do you trust this to your Spark Buddy? Say off the table, hint, or open.";

  /** After the trust question: move on and ask the next interview question out loud. */
  function afterTrust(level: ShareLevel, answered: Question | null) {
    setTrust(null);
    const saved = new Set(done);
    if (answered) saved.add(answered.id);
    const next = nextInterviewQuestion(saved);
    const lead = level === "private" ? "Off the table it is." : level === "hint" ? "Hint approved." : "Shared openly.";
    void speakThenListen(next ? `${lead} ${questionToSpeech(next)}` : `${lead} That's everything for now. Amazing work!`);
  }

  async function saveAnswer(q: Question, value: AnswerValue) {
    await backend.answers.save(q.id, value);
    setDone((d) => new Set(d).add(q.id));
    setTrust(q);
  }

  async function skipQuestion(q: Question) {
    try {
      await backend.answers.skip(q.id);
      setDone((d) => new Set(d).add(q.id));
    } catch (e) {
      setDraftError(messageOf(e));
    }
  }

  async function send(raw: string, viaVoice = false) {
    const message = raw.trim();
    if (!message || sendingRef.current || !user) return;
    // A typed "yes" to Buddy's offer does it, exactly like saying yes (spoken replies are routed in handleSpoken).
    if (!viaVoice && pendingConfirm.current && parseConfirm(message)) {
      voice.hush();
      voiceMode.current = false;
      setText("");
      await answerOffer(message);
      return;
    }
    voiceMode.current = viaVoice;
    pendingConfirm.current = null; // a new message moves on from any earlier suggestion
    if (!viaVoice) voice.hush();
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    setVoiceError(null);
    setVoiceHint(null);
    setText("");
    push({ role: "user", text: message, at: new Date().toISOString(), key: keyOf() });
    try {
      const context = await buildBuddyContext(backend, { userId: user.id, profile, partner, couple });
      const { reply, notice: n } = await backend.buddy.send({ text: message, interviewQuestionId: question?.id ?? null, context, aiConsent: live && ai.aiOn });
      if (n) setNotice(n);
      // In the interview, an answer proposal fills the card (and saves it, with auto-save on).
      const answer = question ? reply.actions.find((a) => (a.type === "save_answer" || a.type === "skip_question") && a.questionId === question.id) : undefined;
      const rest = reply.actions.filter((a) => a !== answer);
      const key = say(reply.reply, { actions: rest, crisis: reply.crisis, followUp: reply.followUp ?? null });
      // What Buddy says out loud: the reply, then whatever it is now waiting on.
      let spoken = reply.reply;
      if (reply.crisis) {
        // Calm, on this device only (never the studio voice), and never followed by an open mic.
        voiceMode.current = false;
        void voice.say(spoken, { calm: true, deviceOnly: true });
        return;
      }
      if (answer && question) {
        if (answer.type === "skip_question") {
          await skipQuestion(question);
          const next = nextInterviewQuestion(new Set(done).add(question.id));
          if (next) spoken += ` ${questionToSpeech(next)}`;
        } else if (answer.type === "save_answer") {
          setDraft(answer.value as Draft);
          if (auto) {
            await saveAnswer(question, answer.value);
            spoken += ` ${TRUST_ASK}`;
          } else spoken += " Tap Save and next if that's right.";
        }
      } else if (question) {
        spoken += ` ${questionToSpeech(question)}`;
      }
      if (reply.startInterview) spoken = startInterview(spoken);
      // One or two cards Buddy offered together ("calendar + note"): a single yes does both.
      const doable = rest.filter((a) => a.type !== "open");
      const asks = /\?["”]?\s*$/.test(reply.reply.trim());
      const bundle = doable.length >= 1 && doable.length <= 2 ? doable : rest.length === 1 && asks ? rest : [];
      if (bundle.length) {
        pendingConfirm.current = { key, actions: bundle, followUp: reply.followUp ?? null };
        if (!asks) spoken += bundle.length > 1 ? " Want me to do both? Just say yes." : " Want me to do it? Just say yes.";
      }
      void speakThenListen(spoken);
    } catch (e) {
      setSendError(messageOf(e));
      setText(message);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  /** Removes one card by identity (indexes shift as cards are done one after another). */
  function dropAction(itemKey: string, action: BuddyAction, extra: Partial<ChatItem> = {}) {
    setItems((list) => (list ?? []).map((x) => (x.key === itemKey ? { ...x, ...extra, actions: x.actions?.filter((a) => a !== action) } : x)));
    const offer = pendingConfirm.current;
    if (offer?.key === itemKey && offer.actions.includes(action)) {
      const left = offer.actions.filter((a) => a !== action);
      pendingConfirm.current = left.length ? { ...offer, actions: left } : null;
    }
  }

  /**
   * Does one card. Tapping the last card of an offer also asks Buddy's follow-up
   * question; `quiet` is for the spoken yes, which says everything in one breath.
   */
  async function confirm(item: ChatItem, action: BuddyAction, index: number, quiet = false): Promise<string | null> {
    if (action.type === "open") {
      dropAction(item.key, action);
      router.push(NAV_HREF[action.to].href);
      return null;
    }
    const id = `${item.key}:${index}`;
    setBusyAction(id);
    try {
      const msg = await runAction(backend, action, partnerName);
      if (action.type === "save_answer") setDone((d) => new Set(d).add(action.questionId));
      const latest = itemsRef.current?.find((x) => x.key === item.key) ?? item;
      const lastOne = !(latest.actions ?? []).some((a) => a !== action && a.type !== "open");
      const followUp = !quiet && lastOne ? latest.followUp : null;
      dropAction(item.key, action, followUp ? { followUp: null } : {});
      if (msg) toast.show(msg);
      if (followUp) {
        say(followUp);
        void speakThenListen(followUp);
      }
      return msg || "Done.";
    } catch (e) {
      toast.show(messageOf(e), "error");
      return null;
    } finally {
      setBusyAction(null);
    }
  }

  function dismiss(item: ChatItem, action: BuddyAction) {
    dropAction(item.key, action);
  }

  /** A yes or no (spoken or typed) to the offer Buddy just made. Returns false when there was none. */
  async function answerOffer(said: string): Promise<boolean> {
    const offer = pendingConfirm.current;
    const answer = offer ? parseConfirm(said) : null;
    if (!offer || !answer) return false;
    pendingConfirm.current = null;
    push({ role: "user", text: said, at: new Date().toISOString(), key: keyOf() });
    const item = itemsRef.current?.find((x) => x.key === offer.key);
    const open = offer.actions.filter((a) => item?.actions?.includes(a));
    if (!item || !open.length) {
      void speakThenListen("That one's already taken care of. What else?");
      return true;
    }
    if (answer === "no") {
      for (const action of open) dismiss(item, action);
      say("No problem. What else?");
      void speakThenListen("No problem. What else?");
      return true;
    }
    const results: string[] = [];
    for (const action of open) {
      const msg = await confirm(item, action, item.actions?.indexOf(action) ?? 0, true);
      if (msg) results.push(msg);
      else if (action.type !== "open") {
        void speakThenListen("Hmm, that didn't work. Check the screen.");
        return true;
      }
    }
    setItems((list) => (list ?? []).map((x) => (x.key === item.key ? { ...x, followUp: null } : x)));
    const next = offer.followUp ?? "What else?";
    const text = `Done! ${results.join(" ")} ${next}`.replace(/\s+/g, " ").trim();
    say(text);
    void speakThenListen(text);
    return true;
  }

  /** One spoken turn: listen, then route what was heard (through the latest render's handler). */
  async function voiceTurn(opts: { auto?: boolean } = {}) {
    const v = voiceRef.current;
    if (v.isListening() || sendingRef.current) return;
    setVoiceError(null);
    setVoiceHint(null);
    let heard: string | null;
    try {
      heard = await v.listen();
    } catch (e) {
      voiceMode.current = false;
      // Re-opening the mic on its own can be refused (iPhones want a tap): ask for the tap, don't alarm.
      if (opts.auto) setVoiceHint("Your turn! Tap Talk to answer.");
      else setVoiceError(e instanceof MicBlockedError || e instanceof VoiceUnavailableError ? e.message : messageOf(e));
      return;
    }
    if (heard === null) return; // cancelled on purpose: not an error
    if (!heard) {
      voiceMode.current = false; // silence ends hands-free, so the mic never stays open on its own
      setVoiceHint("I didn't catch that. Tap Talk to try again, or type below.");
      return;
    }
    await handleSpokenRef.current(heard);
  }
  voiceTurnRef.current = voiceTurn;

  /** Routes a spoken reply: the trust question, a yes/no to Buddy's offer, or a normal message. */
  async function handleSpoken(heard: string) {
    voiceMode.current = true;
    const userSaid = () => push({ role: "user", text: heard, at: new Date().toISOString(), key: keyOf() });
    const pendingTrust = trustForRef.current; // the exact answer the trust question is about, right now
    if (pendingTrust) {
      const level = parseTrustLevel(heard);
      if (level === "private") {
        userSaid();
        return afterTrust("private", pendingTrust);
      }
      if (level === "open") {
        userSaid();
        try {
          await backend.buddy.share(pendingTrust.id, "open");
          return afterTrust("open", pendingTrust);
        } catch (e) {
          return void speakThenListen(messageOf(e));
        }
      }
      if (level === "hint") {
        userSaid();
        voiceMode.current = false; // approving the words is a tap, so the mic waits
        setHintRequest((n) => n + 1);
        return void voice.say("Drafting a hint now. Check the words on screen, then tap Approve this hint.");
      }
      return void speakThenListen("Sorry, was that off the table, a hint, or open?");
    }
    if (await answerOffer(heard)) return;
    await send(heard, true);
  }
  handleSpokenRef.current = handleSpoken;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    voice.unlock();
    if (voice.isListening()) voice.cancelListening();
    void send(text);
  }

  function onTalk() {
    if (sendingRef.current) return;
    voice.unlock(); // inside the tap, so Buddy's reply is allowed to play (iOS)
    if (voice.isListening()) return voice.finishListening();
    voiceMode.current = true;
    void voiceTurnRef.current();
  }

  /** Stop and Cancel remove the region holding the focused button: hand focus back to Talk. */
  const refocusTalk = () => requestAnimationFrame(() => talkRef.current?.focus());

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Spark Buddy"
        subtitle={`Your private helper. Only you see this chat. ${partnerName}'s Buddy knows only what ${partnerName} chooses to share.`}
        back={{ href: "/us/", label: "Us" }}
      />
      {/* Its own row under the title: in the header, two buttons squeezed "Spark Buddy" on a phone. */}
      <div className="-mt-2 mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          aria-expanded={showVoice}
          onClick={() => setShowVoice((v) => !v)}
          className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-accent-text"
        >
          {voice.prefs.speak ? "🔊 Voice" : "🔇 Voice off"}
        </button>
        <Link href="/us/buddy/sharing/" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-semibold text-accent-text">
          🔒 What Buddy may share
        </Link>
      </div>
      {voice.trouble && voice.prefs.speak ? (
        <Notice className="mb-4" title={voice.trouble === "blocked" ? "Tap to let Buddy talk" : "Can't hear Buddy?"}>
          <p>
            {voice.trouble === "blocked"
              ? "Your phone needs one tap before Buddy can speak."
              : "Check that your phone isn't on silent (the switch on the side) and the volume is up."}
          </p>
          <Button
            variant="secondary"
            className="mt-2 min-h-11"
            onClick={() => {
              voice.unlock();
              voice.hush();
              void voice.say(VOICE_SAMPLE, { force: true });
            }}
          >
            ▶ Hear Buddy
          </Button>
        </Notice>
      ) : null}

      {live && ai.consent === null ? (
        <Card className="mb-4 border-accent">
          <p className="text-lg font-bold text-ink">Turn on AI replies for your Buddy?</p>
          <p className="mt-1 text-sm text-ink">
            With AI on, what you tell Buddy, your own answers and plans, and anything {partnerName} chose to share are sent to Claude (Anthropic's AI) so it can understand you and reply. {partnerName}'s off-the-table answers never are. Buddy's studio voice is made by ElevenLabs, which receives the words Buddy says out loud (they can include things you told Buddy and what {partnerName} chose to share). With AI off, Buddy uses Spark's built-in guide and Spark sends nothing to AI or ElevenLabs.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => setAi(true)}>Turn on AI</Button>
            <Button variant="secondary" onClick={() => setAi(false)}>
              Keep AI off
            </Button>
          </div>
        </Card>
      ) : null}
      {live && ai.consent !== null ? (
        <p className="mb-3 text-sm text-muted">
          AI replies are {ai.aiOn ? "on" : "off"}.{" "}
          <button type="button" className="min-h-11 font-semibold text-accent-text underline" onClick={() => setAi(!ai.aiOn)}>
            Turn {ai.aiOn ? "off" : "on"}
          </button>
        </p>
      ) : null}
      {showVoice ? <VoicePanel voice={voice} premium={!!serverVoice} onClose={() => setShowVoice(false)} /> : null}
      {notice ? <Notice className="mb-3">{notice}</Notice> : null}
      {loadError ? <Notice tone="danger" title={loadError} /> : null}
      {!items && !loadError ? (
        <div className="py-10 text-center text-accent-text">
          <Spinner label="Waking up your Buddy…" />
        </div>
      ) : null}

      {items ? (
        <ol className="space-y-3" aria-label="Conversation with Spark Buddy" aria-live={spokenAloud ? "off" : "polite"}>
          {items.length === 0 ? (
            <li>
              <Card className="bg-accent-soft">
                <p className="text-lg font-bold text-ink">Hey {myName}, I'm your Spark Buddy. ✦</p>
                <p className="mt-1 text-ink">
                  Talk to me like a friend. I'll fill in your onboarding as we chat, help you understand what's going on with {partnerName}, and put plans on your calendar. You choose, answer by answer, what I may pass on.
                </p>
              </Card>
            </li>
          ) : null}
          {items.map((item) => (
            <li key={item.key} className={cx("flex flex-col", item.role === "user" ? "items-end" : "items-start")}>
              <div
                className={cx(
                  "max-w-[88%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-base leading-relaxed",
                  item.role === "user" ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md border border-line bg-surface text-ink",
                )}
              >
                <span className="sr-only">{item.role === "user" ? "You: " : "Buddy: "}</span>
                {item.text}
              </div>
              {item.crisis ? <CrisisResources urgent className="mt-2 w-full" /> : null}
              {item.actions?.length ? (
                <div className="mt-2 w-full max-w-[88%] space-y-2">
                  {item.actions.map((action, index) => {
                    const d = describeAction(action, partnerName);
                    return (
                      <Card key={index} as="div" className="p-4">
                        <p className="text-sm font-semibold text-muted">Buddy suggests</p>
                        <p className="mt-0.5 font-bold text-ink">{d.title}</p>
                        {d.detail ? <p className="mt-0.5 text-sm text-ink">{d.detail}</p> : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button className="min-h-11" loading={busyAction === `${item.key}:${index}`} onClick={() => void confirm(item, action, index)}>
                            {d.confirm}
                          </Button>
                          {action.type !== "open" ? (
                            <Button variant="ghost" className="min-h-11" onClick={() => dismiss(item, action)}>
                              Not now
                            </Button>
                          ) : null}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}

      {interviewing && trustFor ? (
        <TrustCard
          key={trustFor.id}
          question={trustFor}
          partnerName={partnerName}
          aiOn={live && ai.aiOn}
          hintRequest={hintRequest}
          onDone={(level) => {
            if (level !== "private") toast.show(level === "hint" ? "Hint approved." : "Shared openly.");
            afterTrust(level, trustFor);
          }}
        />
      ) : null}

      {question ? (
        <Card className="mt-4 border-accent">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Badge>
              {progress.starterDone < progress.starterTotal ? `Getting to know you · ${progress.starterDone + 1} of ${progress.starterTotal}` : `Bonus questions · ${progress.done} of ${progress.total}`}
            </Badge>
            <button type="button" className="min-h-11 text-sm font-semibold text-accent-text underline" onClick={() => setInterviewing(false)}>
              Pause
            </button>
          </div>
          <ProgressBar value={Math.min(progress.starterDone, progress.starterTotal)} max={progress.starterTotal} label="Onboarding progress" />
          <div className="mt-4">
            <QuestionField question={question} draft={draft} onChange={setDraft} error={draftError} />
          </div>
          <p className="-mt-2 mb-3 text-sm text-muted">Answer out loud or type below, and I'll fill it in. Or tap it yourself.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                setDraftError(null);
                try {
                  await saveAnswer(question, validateAnswer(question, draft));
                } catch (e) {
                  setDraftError(messageOf(e));
                }
              }}
            >
              Save &amp; next
            </Button>
            <Button variant="secondary" onClick={() => void skipQuestion(question)}>
              Skip
            </Button>
          </div>
          <label className="mt-4 flex min-h-11 items-center gap-3 text-sm text-ink">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked);
                try {
                  if (user) localStorage.setItem(autoKey(user.id), e.target.checked ? "on" : "off");
                } catch {
                  // storage blocked: the choice lasts for this visit
                }
              }}
            />
            Save my answers as soon as Buddy fills them in
          </label>
        </Card>
      ) : null}

      {items && items.length < 2 && !interviewing ? (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Try asking">
          {STARTERS.map((s) => (
            <button key={s} type="button" disabled={sending} onClick={() => { voice.unlock(); void send(s); }} className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-accent-text hover:bg-surface-2">
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <div ref={endRef} />

      {/* Sits just above the tab bar, which now stays on inner screens too. */}
      <form onSubmit={onSubmit} className="sticky bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] mt-4 border-t border-line bg-bg/95 pb-4 pt-3 backdrop-blur">
        {sendError ? <Notice tone="danger" className="mb-2" title={sendError} /> : null}
        {voiceError ? <Notice tone="danger" className="mb-2" title={voiceError} /> : null}
        {voiceHint ? <Notice className="mb-2">{voiceHint}</Notice> : null}
        <p className="sr-only" role="status">
          {voice.listening ? "Listening" : announce}
        </p>
        {voice.listening ? (
          // Visual only for the live transcript: a screen reader reading it back would talk into the open mic.
          <div className="mb-3 rounded-2xl border border-accent bg-accent-soft px-4 py-3">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <span aria-hidden className="inline-block h-3 w-3 animate-pulse rounded-full bg-accent" /> Listening…
              {voice.countdown !== null ? (
                <span aria-hidden className="text-sm font-normal text-muted">
                  sending in {voice.countdown}s
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-ink" aria-live="off">
              {voice.heard ? <>I heard: “{voice.heard}”</> : "Go ahead, I'm all ears."}
            </p>
            <button
              type="button"
              className="mt-1 min-h-11 text-sm font-semibold text-accent-text underline"
              onClick={() => {
                voiceMode.current = false;
                voice.cancelListening();
                refocusTalk();
              }}
            >
              Cancel
            </button>
          </div>
        ) : null}
        {voice.speaking ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2">
            <span className="flex items-center gap-2 font-semibold text-accent-text">
              <span aria-hidden className="buddy-talking flex items-end gap-0.5">
                <span /> <span /> <span /> <span />
              </span>
              Buddy is talking<span className="sr-only">. Tap Talk now to cut in.</span>
            </span>
            <button type="button" className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold text-ink" onClick={() => {
                voiceMode.current = false;
                voice.hush();
                refocusTalk();
              }}
            >
              ■ Stop
            </button>
          </div>
        ) : null}
        <TextAreaField
          label={question ? "Your answer" : `Talk to your Buddy`}
          value={text}
          onChange={setText}
          rows={2}
          maxLength={MESSAGE_MAX}
          placeholder={question ? "Just say it like you would to a friend…" : `Ask anything about you and ${partnerName}…`}
          name="buddy-message"
        />
        <div className="-mt-2 flex flex-wrap items-center gap-2">
          <Button type="submit" loading={sending} disabled={!text.trim()}>
            Send
          </Button>
          {voice.canListen ? (
            <Button ref={talkRef} variant="secondary" aria-pressed={voice.listening} onClick={onTalk} aria-disabled={sending || undefined}>
              {voice.listening ? "✓ Done talking" : voice.speaking ? "✋ Talk now" : "🎙 Talk"}
            </Button>
          ) : null}
          {!interviewing ? (
            <Button variant="ghost" onClick={() => {
                voice.unlock();
                voiceMode.current = false;
                void voice.say(startInterview("Let's do this!"));
              }}>
              Fill out my onboarding
            </Button>
          ) : null}
          {items?.length ? (
            <Button
              variant="ghost"
              className="ml-auto text-sm"
              onClick={async () => {
                try {
                  await backend.buddy.clear();
                  setItems([]);
                } catch (e) {
                  toast.show(messageOf(e), "error");
                }
              }}
            >
              Clear chat
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

/** "Do you trust this to your Spark Buddy?" after each interview answer. */
function TrustCard({
  question, partnerName, aiOn, hintRequest, onDone,
}: { question: Question; partnerName: string; aiOn: boolean; hintRequest: number; onDone(level: ShareLevel): void }) {
  const { backend } = useApp();
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRequest = useRef(hintRequest);

  // Saying "hint" out loud drafts it here, exactly like tapping Hint only.
  useEffect(() => {
    if (hintRequest !== firstRequest.current && hint === null && !busy) void choose("hint");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintRequest]);

  async function choose(level: ShareLevel) {
    setError(null);
    if (level === "private") return onDone("private");
    if (level === "hint" && hint === null) {
      setBusy(true);
      try {
        setHint((await backend.buddy.draftHint(question.id, aiOn)).hint);
      } catch (e) {
        setError(messageOf(e));
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await backend.buddy.share(question.id, level, level === "hint" ? hint : null);
      onDone(level);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4">
      <p className="text-sm font-semibold text-muted">Saved privately ✓</p>
      <p className="mt-1 text-lg font-bold text-ink">Do you trust this to your Spark Buddy?</p>
      <p className="mt-1 text-sm text-muted">Should {partnerName}'s Buddy know anything about “{question.prompt}”?</p>
      <div className="mt-3 grid gap-2">
        {SHARE_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            disabled={busy}
            onClick={() => void choose(level)}
            className={cx("min-h-12 rounded-2xl border px-4 py-3 text-left transition hover:bg-surface-2", level === "hint" && hint !== null ? "border-accent bg-accent-soft" : "border-line bg-surface")}
          >
            <span className="block font-semibold text-ink">
              {SHARE_COPY[level].label}
              {level === "private" ? " (default)" : ""}
            </span>
            <span className="block text-sm text-muted">{SHARE_COPY[level].body}</span>
          </button>
        ))}
      </div>
      {hint !== null ? (
        <div className="mt-4">
          <TextAreaField label="The hint (edit it until it feels right)" value={hint} onChange={setHint} rows={3} maxLength={280} />
          <Button loading={busy} onClick={() => void choose("hint")}>
            Approve this hint
          </Button>
        </div>
      ) : null}
      {error ? <Notice tone="danger" className="mt-3" title={error} /> : null}
    </Card>
  );
}
