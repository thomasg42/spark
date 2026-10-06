"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { RequireStage } from "@/components/require-stage";
import { Button, PageHeader } from "@/components/ui";

const LINKS = [
  { href: "/us/story/", emoji: "📖", title: "Our Story", body: "Your shared timeline: how you met, firsts, trips, anniversaries." },
  { href: "/us/questions/", emoji: "🌱", title: "Questions", body: "Short private sets about you. Only you see your answers." },
  { href: "/us/agreements/", emoji: "🤝", title: "Agreements", body: "Check-in rhythm and social media, with both choices shown." },
  { href: "/us/settings/", emoji: "⚙️", title: "Settings", body: "Profile, colors, city and your together date." },
  { href: "/privacy/", emoji: "🔒", title: "What's private", body: "Exactly what your partner can and can't see." },
  { href: "/support/", emoji: "🛟", title: "Support", body: "Crisis lines and when to talk to a professional." },
];

function UsHub() {
  const { backend, refresh } = useApp();
  const router = useRouter();
  return (
    <>
      <PageHeader title="Us" subtitle="Your story, your agreements, your settings." />
      <ul className="space-y-3">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-start gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 transition hover:bg-surface-2">
              <span className="text-2xl" aria-hidden>
                {l.emoji}
              </span>
              <span>
                <span className="block font-bold text-ink">{l.title}</span>
                <span className="block text-sm text-muted">{l.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
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
