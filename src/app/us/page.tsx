"use client";
import { useRouter } from "next/navigation";
import { DrillList, DrillRow } from "@/components/drill-row";
import { useApp } from "@/components/app-provider";
import { RequireStage } from "@/components/require-stage";
import { Button, PageHeader } from "@/components/ui";

const LINKS = [
  { href: "/us/buddy/", emoji: "✦", title: "Talk to your Spark Buddy", body: "Your private helper: fills in your answers, coaches you, plans dates." },
  { href: "/us/hints/", emoji: "💡", title: "Hints from your partner", body: "What they chose to share with you. Answer the same questions to unlock more." },
  { href: "/us/stars/", emoji: "♌", title: "Our stars & numbers", body: "Astrology and numerology for you two: what to lean into and watch for." },
  { href: "/us/story/", emoji: "📖", title: "Our Story", body: "Your shared timeline: how you met, firsts, trips, anniversaries." },
  { href: "/us/questions/", emoji: "🌱", title: "Questions", body: "Short private sets about you. Only you see your answers." },
  { href: "/us/agreements/", emoji: "🤝", title: "Agreements", body: "Check-in rhythm and social media, with both choices shown." },
  { href: "/us/settings/", emoji: "⚙️", title: "Settings", body: "Profile, colors, city and your together date." },
];

function UsHub() {
  const { backend, refresh } = useApp();
  const router = useRouter();
  return (
    <>
      <PageHeader title="Us" subtitle="Your story, your agreements, your settings." />
      <DrillList label="Us">
        {LINKS.map((l) => (
          <li key={l.href}>
            <DrillRow href={l.href} icon={l.emoji} title={l.title} status={l.body} />
          </li>
        ))}
      </DrillList>
      <Button
        variant="secondary"
        className="mt-6 w-full"
        onClick={async () => {
          await backend.auth.signOut();
          await refresh();
          router.push("/");
        }}
      >
        Sign out
      </Button>
    </>
  );
}

export default function UsPage() {
  return (
    <RequireStage allow="ready">
      <UsHub />
    </RequireStage>
  );
}
