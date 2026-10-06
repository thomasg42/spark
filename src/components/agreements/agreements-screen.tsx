"use client";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { RhythmCard } from "./rhythm-card";
import { SocialCard } from "./social-card";

/** /us/agreements/: check-in rhythm and social media, with both partners' choices shown openly. */
export function AgreementsScreen() {
  return (
    <>
      <PageHeader title="Agreements" subtitle="Both choices, shown openly. Spark finds a fair middle." back={{ href: "/us/", label: "Us" }} />
      <RhythmCard />
      <SocialCard />
      <p className="mt-6 text-center text-sm text-muted">
        Your picks here are shared with your partner. Your private answers never are.{" "}
        <Link href="/privacy/" className="inline-flex min-h-11 items-center font-semibold text-accent-text underline">
          What&apos;s private
        </Link>
      </p>
    </>
  );
}
