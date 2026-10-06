import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "What's private" };

const ROWS = [
  { what: "Your onboarding answers", who: "Only you. Never shown to your partner in any form.", how: "Encrypted before they're saved." },
  { what: "Monthly check-in answers", who: "Only you until you both submit, then both of you.", how: "Encrypted. Revealed side by side." },
  { what: "Weekly pulse scores", who: "Only you until you both submit for that week.", how: "Shown as a shared trend, never as blame." },
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
            <li>Your private onboarding answers are never sent to AI.</li>
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
