// @vitest-environment jsdom
/**
 * Spark Buddy, Projects, Money and Stars screens in the demo: the interview fills
 * in an answer from what you say and then asks "Do you trust this to your Spark
 * Buddy?"; suggestions arrive as cards you confirm; projects show in priority
 * order; private savings goals of the partner never render.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { AppProvider } from "@/components/app-provider";
import { PageHeader, ToastProvider } from "@/components/ui";
import BuddyPage from "@/app/us/buddy/page";
import BuddySharingPage from "@/app/us/buddy/sharing/page";
import StarsPage from "@/app/us/stars/page";
import ProjectsPage from "@/app/projects/page";
import MoneyPage from "@/app/plans/money/page";
import { DEMO_ALEX, DEMO_SAM, demoStore } from "@/lib/backend/demo/store";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/us/buddy/",
  useSearchParams: () => new URLSearchParams(),
}));

const renderApp = (view: ReactNode) => render(<AppProvider><ToastProvider>{view}</ToastProvider></AppProvider>);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  demoStore.reset(false);
  demoStore.update((s) => {
    s.signedIn = true;
    s.actingAs = DEMO_ALEX;
  });
});
afterEach(() => cleanup());

describe("Spark Buddy screen", () => {
  it("saves, starts fresh, reopens and continues the same private conversation", async()=>{
    const view=renderApp(<BuddyPage />);
    const send=async(text:string)=>{const box=await screen.findByLabelText("Talk to your Buddy");fireEvent.change(box,{target:{value:text}});fireEvent.click(within(box.closest('form')!).getByRole('button',{name:'Send'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Save Conversation'}).hasAttribute('disabled')).toBe(false),{timeout:4000});};
    await send('Our first trip was Kyoto.');
    fireEvent.change(screen.getByLabelText('Conversation name (optional)'),{target:{value:'Our trip chat'}});
    fireEvent.click(screen.getByRole('button',{name:'Save Conversation'}));
    await screen.findByText('Conversation saved. Save again to keep later messages.');
    fireEvent.click(screen.getByRole('button',{name:'New conversation'}));
    fireEvent.click(screen.getByRole('button',{name:'Start fresh'}));
    await waitFor(()=>expect(screen.queryByText('Our first trip was Kyoto.')).toBeNull());
    fireEvent.click(screen.getByRole('button',{name:'Saved conversations'}));
    fireEvent.click(await screen.findByRole('button',{name:/Our trip chat/}));
    fireEvent.click(screen.getByRole('button',{name:'Open conversation'}));
    await screen.findByText('Our first trip was Kyoto.');
    await send('Do you remember our first trip?');
    expect(await screen.findByText(/Earlier in this conversation you said:.*Kyoto/)).toBeTruthy();
    view.unmount();renderApp(<BuddyPage />);
    expect(await screen.findByText('Our first trip was Kyoto.')).toBeTruthy();
    expect((screen.getByLabelText('Conversation name (optional)') as HTMLInputElement).value).toBe('Our trip chat');
  });

  it("interviews you, fills in the answer from what you say, then asks what Buddy may share", async () => {
    renderApp(<BuddyPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Fill out my onboarding" }));
    expect(await screen.findByText("Who raised you, mostly?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Your answer"), { target: { value: "My single mom raised me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Do you trust this to your Spark Buddy?", {}, { timeout: 4000 })).toBeTruthy();
    expect(demoStore.get().answers[DEMO_ALEX]!.find((a) => a.questionId === "raised_by")?.value).toBe("single_parent");
    fireEvent.click(screen.getByRole("button", { name: /Off the table \(default\)/ }));
    expect(await screen.findByText("How many brothers and sisters did you grow up with?")).toBeTruthy();
    expect(demoStore.get().buddyShares[DEMO_ALEX] ?? []).toEqual([]);
  });

  // Thomas, 2026-10-08: "What's my partner up to?" should get what Sam shared, one offer, and a
  // question. "Yeah let's do that" does it, then Buddy asks: the stars, or something deeper?
  it("answers 'what's my partner up to?', and a typed yes does the whole offer, then asks the follow-up", async () => {
    renderApp(<BuddyPage />);
    const box = await screen.findByLabelText("Talk to your Buddy");
    const submit = () => fireEvent.click(within(box.closest("form")!).getByRole("button", { name: "Send" }));
    fireEvent.change(box, { target: { value: "What's my partner up to?" } });
    submit();
    expect(await screen.findByText(/^Looking at what Sam chose to share/, {}, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText(/Here's what I can do/)).toBeNull();
    expect(screen.getByRole("button", { name: "Add it" })).toBeTruthy();
    expect(screen.getByText("Note to Sam")).toBeTruthy();
    fireEvent.change(box, { target: { value: "yeah let's do that" } });
    submit();
    await waitFor(() => expect(demoStore.get().datePlans.map((p) => p.title)).toEqual(["Date night, just us"]), { timeout: 4000 });
    await waitFor(() => expect(demoStore.get().notes.some((n) => n.authorId === DEMO_ALEX && /Can I take you out/.test(n.body))).toBe(true));
    expect(await screen.findByText(/^Done!.*(stars|deeper)/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add it" })).toBeNull();
  });

  it("turns a suggestion into a card you confirm", async () => {
    renderApp(<BuddyPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Plan a date night for us" }));
    const add = await screen.findByRole("button", { name: "Add it" }, { timeout: 4000 });
    fireEvent.click(add);
    await waitFor(() => expect(demoStore.get().datePlans).toHaveLength(1));
    expect(demoStore.get().datePlans[0]!.createdBy).toBe(DEMO_ALEX);
  });

  it("asks no AI question in the demo (the demo never uses AI)", async () => {
    renderApp(<BuddyPage />);
    await screen.findByRole("button", { name: "Fill out my onboarding" });
    expect(screen.queryByText("Turn on AI replies for your Buddy?")).toBeNull();
  });
});

describe("talking with Buddy out loud", () => {
  type Rec = { onresult: ((e: unknown) => void) | null; onend: (() => void) | null; onerror: ((e: unknown) => void) | null; start(): void; stop(): void };
  let recs: Rec[] = [];
  let spoken: string[] = [];
  let holdSpeech = false;
  let held: Array<() => void> = [];

  beforeEach(() => {
    recs = [];
    spoken = [];
    holdSpeech = false;
    held = [];
    class FakeRec {
      lang = "";
      interimResults = false;
      continuous = false;
      maxAlternatives = 1;
      onresult: Rec["onresult"] = null;
      onend: Rec["onend"] = null;
      onerror: Rec["onerror"] = null;
      constructor() {
        recs.push(this as unknown as Rec);
      }
      start() {}
      stop() {}
    }
    class FakeUtterance {
      text: string;
      rate = 1;
      pitch = 1;
      volume = 1;
      lang = "";
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(t: string) {
        this.text = t;
      }
    }
    Object.assign(window, {
      webkitSpeechRecognition: FakeRec,
      SpeechSynthesisUtterance: FakeUtterance,
      speechSynthesis: {
        getVoices: () => [{ name: "Samantha", lang: "en-US", voiceURI: "Samantha", localService: true, default: true }],
        speak: (u: FakeUtterance) => {
          if (u.text.trim()) spoken.push(u.text);
          if (holdSpeech && u.text.trim()) held.push(() => u.onend?.());
          else queueMicrotask(() => u.onend?.());
        },
        cancel: () => {
          while (held.length) held.shift()!(); // cancel ends whatever is speaking
        },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => undefined;
  });
  afterEach(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.webkitSpeechRecognition;
    delete w.speechSynthesis;
    delete w.SpeechSynthesisUtterance;
  });

  it("listens, shows what it heard, sends, and says the reply out loud", async () => {
    renderApp(<BuddyPage />);
    fireEvent.click(await screen.findByRole("button", { name: "🎙 Talk" }));
    expect(await screen.findByText("Listening…")).toBeTruthy();
    recs[0]!.onresult!({ resultIndex: 0, results: { length: 1, 0: { isFinal: false, 0: { transcript: "plan a date night for us" } } } });
    expect(await screen.findByText(/I heard: “plan a date night for us”/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "✓ Done talking" }));
    expect(await screen.findByRole("button", { name: "Add it" }, { timeout: 4000 })).toBeTruthy();
    await waitFor(() => expect(spoken.join(" ")).toMatch(/How about/));
    expect(spoken.join(" ")).toMatch(/Just say yes/);
  });

  it("lets you say yes to Buddy's suggestion", async () => {
    renderApp(<BuddyPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Plan a date night for us" }));
    await screen.findByRole("button", { name: "Add it" }, { timeout: 4000 });
    fireEvent.click(screen.getByRole("button", { name: "🎙 Talk" }));
    await screen.findByText("Listening…");
    recs.at(-1)!.onresult!({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, 0: { transcript: "yeah add it" } } } });
    fireEvent.click(screen.getByRole("button", { name: "✓ Done talking" }));
    await waitFor(() => expect(demoStore.get().datePlans).toHaveLength(1), { timeout: 4000 });
    await waitFor(() => expect(spoken.join(" ")).toMatch(/Done!/));
  });

  const heardWords = async (words: string) => {
    const rec = recs.at(-1)!;
    rec.onresult!({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, 0: { transcript: words } } } });
    fireEvent.click(await screen.findByRole("button", { name: "✓ Done talking" }));
  };

  it("hands-free: 'off the table' keeps the earlier answer private even when the next answer says 'open'", async () => {
    localStorage.setItem(`spark-buddy-voice:${DEMO_ALEX}`, JSON.stringify({ speak: true, handsFree: true, voiceURI: null, energy: 1.1, onDeviceOnly: false }));
    demoStore.update((s) => {
      for (const id of ["siblings", "birth_order"]) {
        s.answers[DEMO_ALEX]!.push({ questionId: id, section: "roots", value: id === "siblings" ? "one" : "oldest", skipped: false, updatedAt: new Date().toISOString() });
      }
    });
    renderApp(<BuddyPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Fill out my onboarding" }));
    await screen.findByText("Who raised you, mostly?");
    fireEvent.click(screen.getByRole("button", { name: "🎙 Talk" }));
    await heardWords("my single mom raised me");
    await screen.findByText("Do you trust this to your Spark Buddy?", {}, { timeout: 4000 });
    // Hands-free re-opens the mic for the trust answer.
    await waitFor(() => expect(screen.getByRole("button", { name: "✓ Done talking" })).toBeTruthy(), { timeout: 4000 });
    await heardWords("off the table");
    await screen.findByText("Where did you grow up?", {}, { timeout: 4000 });
    await waitFor(() => expect(screen.getByRole("button", { name: "✓ Done talking" })).toBeTruthy(), { timeout: 4000 });
    await heardWords("I'd want him to be more open with me");
    await waitFor(() => expect(demoStore.get().answers[DEMO_ALEX]!.find((a) => a.questionId === "hometown")?.value).toBe("I'd want him to be more open with me"), { timeout: 4000 });
    expect(demoStore.get().answers[DEMO_ALEX]!.find((a) => a.questionId === "raised_by")?.value).toBe("single_parent");
    expect(demoStore.get().buddyShares[DEMO_ALEX] ?? []).toEqual([]); // nothing shared, least of all the first answer
  });

  it("a spoken yes only confirms the suggestion Buddy just offered", async () => {
    renderApp(<BuddyPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Plan a date night for us" }));
    await screen.findByRole("button", { name: "Add it" }, { timeout: 4000 }); // an older offer, left untouched
    fireEvent.change(screen.getByLabelText("Talk to your Buddy"), { target: { value: "Add a project: paint the nursery" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Add it" })).toHaveLength(2), { timeout: 4000 });
    fireEvent.click(screen.getByRole("button", { name: "🎙 Talk" }));
    await heardWords("yes");
    await waitFor(() => expect(demoStore.get().projects.some((p) => p.title === "Paint the nursery")).toBe(true), { timeout: 4000 });
    expect(demoStore.get().datePlans).toHaveLength(0);
  });

  it("Esc while Buddy talks hands-free stops everything and never opens the mic", async () => {
    localStorage.setItem(`spark-buddy-voice:${DEMO_ALEX}`, JSON.stringify({ speak: true, handsFree: true, voiceURI: null, energy: 1.1, onDeviceOnly: false }));
    renderApp(<BuddyPage />);
    await screen.findByRole("button", { name: "🎙 Talk" });
    holdSpeech = true;
    fireEvent.click(screen.getByRole("button", { name: "🎙 Talk" }));
    await heardWords("plan a date night");
    await waitFor(() => expect(held.length).toBeGreaterThan(0), { timeout: 4000 }); // Buddy is mid-reply
    const before = recs.length;
    fireEvent.keyDown(document, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 50));
    expect(recs.length).toBe(before);
    expect(screen.queryByText("Listening…")).toBeNull();
  });

  it("Talk while Buddy is talking cuts in: Buddy stops and the mic opens", async () => {
    renderApp(<BuddyPage />);
    const starter = await screen.findByRole("button", { name: "Plan a date night for us" });
    holdSpeech = true;
    fireEvent.click(starter);
    await waitFor(() => expect(held.length).toBeGreaterThan(0), { timeout: 4000 }); // Buddy is mid-reply
    const talkNow = await screen.findByRole("button", { name: "✋ Talk now" });
    const before = recs.length;
    fireEvent.click(talkNow);
    expect(held).toHaveLength(0); // the speech engine was cancelled
    expect(await screen.findByText("Listening…")).toBeTruthy();
    expect(recs.length).toBe(before + 1);
  });

  it("cancelling a listening turn is not an error", async () => {
    renderApp(<BuddyPage />);
    fireEvent.click(await screen.findByRole("button", { name: "🎙 Talk" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/didn't catch that/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("has voice settings with talking back on and a lively default", async () => {
    renderApp(<BuddyPage />);
    fireEvent.click(await screen.findByRole("button", { name: "🔊 Voice" }));
    expect((screen.getByLabelText("Buddy talks back out loud") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Hands-free/) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("Buddy's pick (the liveliest on this device)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "▶ Hear Buddy" }));
    await waitFor(() => expect(spoken.join(" ")).toMatch(/Spark Buddy/));
  });
});

describe("back arrow", () => {
  it("goes BACK when it names the screen you came from, so swipe-back can't loop", () => {
    sessionStorage.setItem("spark-nav-stack", JSON.stringify(["/us/", "/us/buddy/", "/us/buddy/sharing/"]));
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    try {
      render(<PageHeader title="What Buddy may share" back={{ href: "/us/buddy/", label: "Spark Buddy" }} />);
      const link = screen.getByRole("link", { name: /Spark Buddy/ });
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      link.dispatchEvent(event);
      expect(back).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    } finally {
      back.mockRestore();
    }
  });

  it("opens its target normally when you arrived another way", () => {
    sessionStorage.setItem("spark-nav-stack", JSON.stringify(["/us/buddy/sharing/"]));
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    try {
      render(<PageHeader title="What Buddy may share" back={{ href: "/us/buddy/", label: "Spark Buddy" }} />);
      const event = new MouseEvent("click", { bubbles: true, cancelable: true });
      screen.getByRole("link", { name: /Spark Buddy/ }).dispatchEvent(event);
      expect(back).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    } finally {
      back.mockRestore();
    }
  });
});

describe("sharing screen", () => {
  it("lists your answers with their share level, off the table by default", async () => {
    demoStore.update((s) => {
      s.actingAs = DEMO_SAM;
    });
    renderApp(<BuddySharingPage />);
    const card = (await screen.findByText("Something from growing up you'd rather leave behind.")).closest("article")!;
    expect(within(card).getByRole("button", { name: "Off the table" }).getAttribute("aria-pressed")).toBe("true");
    const hint = (await screen.findByText("What tends to shake your trust, even a little?")).closest("article")!;
    expect(within(hint).getByText(/Their Buddy may see/)).toBeTruthy();
  });
});

describe("projects, money and stars", () => {
  it("shows projects numbered in priority order", async () => {
    renderApp(<ProjectsPage />);
    const list = await screen.findByRole("list", { name: "Projects in priority order" });
    const titles = (await within(list).findAllByRole("heading")).map((h) => h.textContent);
    expect(titles[0]).toMatch(/Priority 1: Paint the baby's room/);
    expect(titles[1]).toMatch(/Priority 2: Finish the garage/);
  });

  it("shows joint and personal savings, and never the partner's private goal", async () => {
    renderApp(<MoneyPage />);
    expect(await screen.findByText("Vacation fund")).toBeTruthy();
    expect(screen.getByText("My savings")).toBeTruthy();
    expect(screen.getByText("New camera")).toBeTruthy();
    expect(screen.queryByText(/Private sample goal/)).toBeNull();
  });

  it("reads both charts and the couple's watch-outs", async () => {
    renderApp(<StarsPage />);
    expect(await screen.findByText(/Taurus/)).toBeTruthy();
    expect(screen.getByText(/Scorpio/)).toBeTruthy();
    expect(screen.getByText("Things to watch for")).toBeTruthy();
  });
});
