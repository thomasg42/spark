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
import { buildBuddyContext } from "@/lib/buddy/context";
import { describeAction, NAV_HREF, runAction } from "@/lib/buddy/actions";
import { cx } from "@/lib/ui/cx";
import { interviewProgress, MESSAGE_MAX, nextInterviewQuestion, SHARE_COPY, SHARE_LEVELS, type BuddyAction } from "@shared/buddy.ts";
import { validateAnswer, type AnswerValue, type Question } from "@shared/questionnaires.ts";

interface ChatItem extends BuddyTurn {
  key: string;
  actions?: BuddyAction[];
  crisis?: boolean;
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

type SpeechCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
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
  const [listening, setListening] = useState(false);
  const recognizer = useRef<InstanceType<SpeechCtor> | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const ai = useAiConsent(user?.id);
  const live = backend.mode === "live";
  const question = interviewing && !trustFor ? nextInterviewQuestion(done) : null;
  const progress = interviewProgress(done);
  const canSpeak = useMemo(() => speechCtor() !== null, []);

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
  const say = (textOut: string, extra: Partial<ChatItem> = {}) => push({ role: "buddy", text: textOut, at: new Date().toISOString(), key: keyOf(), ...extra });

  function startInterview() {
    setInterviewing(true);
    setTrustFor(null);
    const next = nextInterviewQuestion(done);
    if (!next) say(`You've answered everything I have, ${myName}. You can change any answer in Questions.`, { actions: [{ type: "open", to: "questions" }] });
  }

  async function saveAnswer(q: Question, value: AnswerValue) {
    await backend.answers.save(q.id, value);
    setDone((d) => new Set(d).add(q.id));
    setTrustFor(q);
  }

  async function skipQuestion(q: Question) {
    try {
      await backend.answers.skip(q.id);
      setDone((d) => new Set(d).add(q.id));
    } catch (e) {
      setDraftError(messageOf(e));
    }
  }

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || sending || !user) return;
    setSending(true);
    setSendError(null);
    setText("");
    push({ role: "user", text: message, at: new Date().toISOString(), key: keyOf() });
    try {
      const context = await buildBuddyContext(backend, { userId: user.id, profile, partner, couple });
      const { reply, notice: n } = await backend.buddy.send({ text: message, interviewQuestionId: question?.id ?? null, context, aiConsent: live && ai.aiOn });
      if (n) setNotice(n);
      // In the interview, an answer proposal fills the card (and saves it, with auto-save on).
      const answer = question ? reply.actions.find((a) => (a.type === "save_answer" || a.type === "skip_question") && a.questionId === question.id) : undefined;
      const rest = reply.actions.filter((a) => a !== answer);
      say(reply.reply, { actions: rest, crisis: reply.crisis });
      if (answer && question) {
        if (answer.type === "skip_question") await skipQuestion(question);
        else if (answer.type === "save_answer") {
          setDraft(answer.value as Draft);
          if (auto) await saveAnswer(question, answer.value);
        }
      }
      if (reply.startInterview) startInterview();
    } catch (e) {
      setSendError(messageOf(e));
      setText(message);
    } finally {
      setSending(false);
    }
  }

  async function confirm(item: ChatItem, action: BuddyAction, index: number) {
    if (action.type === "open") {
      router.push(NAV_HREF[action.to].href);
      return;
    }
    const id = `${item.key}:${index}`;
    setBusyAction(id);
    try {
      const msg = await runAction(backend, action, partnerName);
      if (action.type === "save_answer") setDone((d) => new Set(d).add(action.questionId));
      setItems((list) => (list ?? []).map((x) => (x.key === item.key ? { ...x, actions: x.actions?.filter((_, i) => i !== index) } : x)));
      if (msg) toast.show(msg);
    } catch (e) {
      toast.show(messageOf(e), "error");
    } finally {
      setBusyAction(null);
    }
  }

  function dismiss(item: ChatItem, index: number) {
    setItems((list) => (list ?? []).map((x) => (x.key === item.key ? { ...x, actions: x.actions?.filter((_, i) => i !== index) } : x)));
  }

  function toggleMic() {
    const Ctor = speechCtor();
    if (!Ctor) return;
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    const base = text ? `${text.trim()} ` : "";
    rec.onresult = (e) => {
      let said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i]![0]!.transcript;
      setText(`${base}${said}`.slice(0, MESSAGE_MAX));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognizer.current = rec;
    setListening(true);
    rec.start();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (listening) recognizer.current?.stop();
    void send(text);
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Spark Buddy"
        subtitle={`Your private helper. Only you see this chat. ${partnerName}'s Buddy knows only what ${partnerName} chooses to share.`}
        back={{ href: "/us/", label: "Us" }}
        action={
          <Link href="/us/buddy/sharing/" className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm font-semibold text-accent-text">
            Sharing
          </Link>
        }
      />

      {live && ai.consent === null ? (
        <Card className="mb-4 border-accent">
          <p className="text-lg font-bold text-ink">Turn on AI replies for your Buddy?</p>
          <p className="mt-1 text-sm text-ink">
            With AI on, what you tell Buddy, your own answers and plans, and anything {partnerName} chose to share are sent to Claude (Anthropic's AI) so it can understand you and reply. {partnerName}'s off-the-table answers never are. With AI off, Buddy uses Spark's built-in guide and nothing leaves Spark.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => ai.set(true)}>Turn on AI</Button>
            <Button variant="secondary" onClick={() => ai.set(false)}>
              Keep AI off
            </Button>
          </div>
        </Card>
      ) : null}
      {live && ai.consent !== null ? (
        <p className="mb-3 text-sm text-muted">
          AI replies are {ai.aiOn ? "on" : "off"}.{" "}
          <button type="button" className="min-h-11 font-semibold text-accent-text underline" onClick={() => ai.set(!ai.aiOn)}>
            Turn {ai.aiOn ? "off" : "on"}
          </button>
        </p>
      ) : null}
      {notice ? <Notice className="mb-3">{notice}</Notice> : null}
      {loadError ? <Notice tone="danger" title={loadError} /> : null}
      {!items && !loadError ? (
        <div className="py-10 text-center text-accent-text">
          <Spinner label="Waking up your Buddy…" />
        </div>
      ) : null}

      {items ? (
        <ol className="space-y-3" aria-label="Conversation with Spark Buddy" aria-live="polite">
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
                            <Button variant="ghost" className="min-h-11" onClick={() => dismiss(item, index)}>
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
          question={trustFor}
          partnerName={partnerName}
          aiOn={live && ai.aiOn}
          onDone={(level) => {
            if (level !== "private") toast.show(level === "hint" ? "Hint approved." : "Shared openly.");
            setTrustFor(null);
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
            <button key={s} type="button" disabled={sending} onClick={() => void send(s)} className="min-h-11 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-accent-text hover:bg-surface-2">
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <div ref={endRef} />

      <form onSubmit={onSubmit} className="sticky bottom-0 mt-4 border-t border-line bg-bg/95 pb-4 pt-3 backdrop-blur">
        {sendError ? <Notice tone="danger" className="mb-2" title={sendError} /> : null}
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
          {canSpeak ? (
            <Button variant="secondary" aria-pressed={listening} onClick={toggleMic}>
              {listening ? "■ Stop" : "🎙 Talk"}
            </Button>
          ) : null}
          {!interviewing ? (
            <Button variant="ghost" onClick={startInterview}>
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
function TrustCard({ question, partnerName, aiOn, onDone }: { question: Question; partnerName: string; aiOn: boolean; onDone(level: ShareLevel): void }) {
  const { backend } = useApp();
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
