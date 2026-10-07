"use client";
import { useApp } from "@/components/app-provider";
import { ButtonLink, Card } from "@/components/ui";

const PROMISES = [
  { emoji: "🔒", title: "Private by design", body: "Your private answers are never shown to your partner. Only what you choose to share, in the form you choose." },
  { emoji: "🚫", title: "No tracking, ever", body: "No location, no monitoring, no reading each other's phone. Trust is built with honesty and routine." },
  { emoji: "🌱", title: "Small, repeated actions", body: "Quick check-ins at a pace you both agree on, a monthly check-in, date ideas that aren't repeats. No streaks, no guilt." },
  { emoji: "✦", title: "Moments, just for two", body: "Send each other clips, photos and links here instead of posting them everywhere." },
];

export default function Landing() {
  const { stage, backend } = useApp();
  const demo = backend.mode === "demo";
  const cta = stage === "ready" ? { href: "/home/", label: "Open Spark" } : { href: "/sign-in/", label: demo ? "Explore the demo" : "Get started" };
  return (
    <div className="fade-up">
      <section className="py-6 text-center">
        <p className="text-5xl" aria-hidden>
          ✦
        </p>
        <h1 className="mt-3 text-4xl font-bold leading-tight text-ink sm:text-5xl">Stay close for the long run.</h1>
        <p className="mx-auto mt-3 max-w-md text-lg text-muted">
          Spark is a private space for the two of you: catch drift early, make hard conversations easier, and keep things a little exciting.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <ButtonLink href={cta.href} className="w-full max-w-xs">
            {cta.label}
          </ButtonLink>
          {demo ? <p className="text-sm text-muted">Demo uses sample data that stays in your browser.</p> : null}
        </div>
      </section>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {PROMISES.map((p) => (
          <Card as="li" key={p.title}>
            <p className="text-2xl" aria-hidden>
              {p.emoji}
            </p>
            <h2 className="mt-2 text-lg font-bold text-ink">{p.title}</h2>
            <p className="mt-1 text-muted">{p.body}</p>
          </Card>
        ))}
      </ul>
      <p className="mt-6 text-center text-sm text-muted">For adults 18+. Spark supports your relationship; it is not therapy.</p>
    </div>
  );
}
