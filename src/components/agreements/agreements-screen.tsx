"use client";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui";
import { LifeChangeCard } from "./life-change-card";
import { RhythmCard } from "./rhythm-card";
import { SocialCard } from "./social-card";

/** /us/agreements/: check-in rhythm and social media, with both partners' choices shown openly. */
export function AgreementsScreen() {
  // A logged life change moves the shared rhythm: remount the rhythm card so it re-reads.
  const [version, setVersion] = useState(0);
  return (
    <>
      <PageHeader title="Agreements" subtitle="Both choices, shown openly. Spark finds a fair middle." back={{ href: "/us/", label: "Us" }} />
      <RhythmCard key={version} />
      <LifeChangeCard onChange={() => setVersion((v) => v + 1)} />
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
