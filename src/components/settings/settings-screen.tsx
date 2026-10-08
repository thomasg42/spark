"use client";
import {IntimacySettings} from "@/components/intimacy/intimacy-settings";
import Link from "next/link";
import { useApp } from "@/components/app-provider";
import { Notice, PageHeader } from "@/components/ui";
import { AccountCard } from "./account-card";
import { CoupleCard } from "./couple-card";
import { DataCard } from "./data-card";
import { LookCard } from "./look-card";
import { ProfileCard } from "./profile-card";

/** /us/settings/: profile, look, shared couple details, account and data. */
export function SettingsScreen() {
  const { backend, user } = useApp();
  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile, your look, and the details you share." back={{ href: "/us/", label: "Us" }} />
      {backend.mode === "demo" ? (
        <Notice className="mb-4" title="Demo mode">
          Changes here stay in this browser. Nothing is sent anywhere.
        </Notice>
      ) : null}
      <ProfileCard />
      <IntimacySettings key={user?.id}/>
      <LookCard />
      <CoupleCard />
      <Link
        href="/us/agreements/"
        className="fade-up mt-4 flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4 transition hover:bg-surface-2"
      >
        <span>
          <span className="block font-bold text-ink">Check-in rhythm and social media</span>
          <span className="block text-sm text-muted">These live in Agreements, with both choices shown.</span>
        </span>
        <span aria-hidden className="text-xl text-accent-text">
          ›
        </span>
      </Link>
      <AccountCard />
      <DataCard />
    </>
  );
}
