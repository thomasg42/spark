import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "What's private" };

const ROWS = [
  { what: "Your onboarding answers", who: "Only you, unless you choose to share one through Spark Buddy.", how: "Encrypted before they're saved. Every answer starts off the table." },
  { what: "What you let Spark Buddy share", who: "Your partner's Buddy, and only the items you marked Hint (your approved words) or Open. If your partner turned on AI, their Buddy may send them to Claude, and read them aloud with the studio voice (ElevenLabs).", how: "Encrypted. Change or stop sharing any item at any time." },
  { what: "Your chat with Spark Buddy", who: "Only you. Your partner can't see it, and their Buddy can't either.", how: "Encrypted before it's saved. Clear it any time." },
  { what: "Projects, the shared calendar, joint savings goals", who: "The two of you.", how: "Either of you can add or update them." },
  { what: "Your own savings goals", who: "Only you, unless you turn on “Let my partner see this” (they still can't change it).", how: "Spark never connects to your bank." },
  { what: "Monthly check-in answers and pace votes", who: "Only you until you both submit, then both of you.", how: "Encrypted. Revealed side by side." },
  { what: "Quick check-in scores", who: "Only you until you both submit for that week.", how: "Shown as a shared trend, never as blame." },
  { what: "Our Story, Moments, notes, activities, date ideas", who: "The two of you.", how: "Photos and clips live in a private folder only you two can open." },
  { what: "Name, nickname, colors, check-in rhythm, social choice", who: "The two of you.", how: "So you can see each other's choices openly." },
];

export default function PrivacyPage() {
  return (
    <>
      <PageHeader title="What's private" subtitle="Plain language, no fine print." />
      <div className="space-y-3">
        {ROWS.map((r) => (
          <Card key={r.what}>
            <h2 className="font-bold text-ink">{r.what}</h2>
            <p className="mt-1 text-ink">
              <span className="font-semibold">Who can see it:</span> {r.who}
            </p>
            <p className="text-muted">{r.how}</p>
          </Card>
        ))}
        <Card>
          <h2 className="font-bold text-ink">What Spark never does</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
            <li>No location tracking, no monitoring, no reading your partner's activity.</li>
            <li>No coaching one partner to play games, withhold affection, or pressure the other.</li>
            <li>No guilt streaks.</li>
          </ul>
        </Card>
        <Card>
          <h2 className="font-bold text-ink">When AI is used</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
            <li>Date ideas: your city and the titles, categories and ratings of past activities are sent to Claude to suggest new ideas.</li>
            <li>Monthly check-in summary: after you both submit, both sets of check-in answers are sent to Claude for a short, kind summary of overlaps and gaps.</li>
            <li>Spark Buddy: AI is off until you turn it on. When it's on, what you tell your Buddy, your own answers and plans, and the items your partner chose to share are sent to Claude so it can reply. Your partner's off-the-table answers never are.</li>
            <li>Buddy's studio voice: when AI is on, the words Buddy says out loud are sent to ElevenLabs (a voice service) to turn them into speech. Those words can include things you told Buddy and hints or answers your partner chose to share, and ElevenLabs may keep that text under its own policy. Your voice is never sent there. Nothing is sent when AI is off or when you choose voices that stay on your device.</li>
            <li>With AI off (the default), your private onboarding answers are never sent to AI, and Buddy talks with your browser's own voice (see the next point).</li>
            <li>Talking to Buddy uses your browser's own speech features. Some browsers, like Chrome and Edge, process speech on Google's or Microsoft's servers. In Buddy's voice settings you can choose voices that stay on your device. Spark never records or stores your voice.</li>
          </ul>
        </Card>
        <Card>
          <h2 className="font-bold text-ink">Your data, your call</h2>
          <p className="mt-1 text-ink">
            Either of you will be able to export or permanently delete all of your own data at any time. Those self-serve tools are planned for a later release and are not in this preview yet. When an account is deleted, its private answers, check-in answers and profile are removed with it.
          </p>
          <p className="mt-2 text-muted">Spark is for adults 18 and older.</p>
        </Card>
      </div>
    </>
  );
}
