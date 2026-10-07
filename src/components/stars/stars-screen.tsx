"use client";
/**
 * Our stars & numbers: Sun signs, Chinese zodiac, Life Path and Personal Year
 * for both partners, computed from the birthdays on their profiles, plus what
 * to watch for as a couple. A lens for conversation, never a prediction.
 */
import { useMemo } from "react";
import { useApp } from "@/components/app-provider";
import { ButtonLink, Card, Notice, PageHeader, SectionTitle } from "@/components/ui";
import { ASTRO_FRAMING, chartFor, couplePairing, ELEMENT_COPY, LIFE_PATH_COPY, type Chart } from "@shared/astro.ts";

function ChartCard({ name, chart }: { name: string; chart: Chart }) {
  const lp = LIFE_PATH_COPY[chart.lifePath]!;
  return (
    <Card as="article">
      <p className="text-sm font-semibold text-muted">{name}</p>
      <p className="mt-1 text-2xl font-bold text-ink">
        <span aria-hidden>{chart.sun.symbol}</span> {chart.sun.name}
      </p>
      <p className="text-sm text-muted">
        {ELEMENT_COPY[chart.sun.element].emoji} {ELEMENT_COPY[chart.sun.element].label} · {chart.sun.modality} · {chart.sun.traits}
      </p>
      {chart.sun.cusp ? <p className="mt-1 text-xs text-muted">Born on a cusp: a birth time would confirm the sign.</p> : null}
      <dl className="mt-3 space-y-1 text-sm">
        <div>
          <dt className="inline font-semibold text-ink">Chinese zodiac: </dt>
          <dd className="inline text-ink">
            {chart.chinese.emoji} {chart.chinese.animal}
            {chart.chinese.uncertain ? ` (or ${chart.chinese.alternate}, depending on the Lunar New Year date that year)` : ""}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink">Life Path {chart.lifePath}: </dt>
          <dd className="inline text-ink">
            {lp.title}. Gifts: {lp.gift}. Watch for: {lp.watchOut}.
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink">This year: </dt>
          <dd className="inline text-ink">
            Personal Year {chart.personalYear}, {chart.personalYearTheme}.
          </dd>
        </div>
      </dl>
    </Card>
  );
}

export function StarsScreen() {
  const { profile, partner } = useApp();
  const today = useMemo(() => new Date(), []);
  const mine = profile ? chartFor(profile.birthday, today) : null;
  const theirs = partner ? chartFor(partner.birthday, today) : null;
  const pairing = mine && theirs ? couplePairing(mine, theirs) : null;
  const myName = profile?.nickname || profile?.displayName || "You";
  const partnerName = partner?.nickname || partner?.displayName || "Your partner";

  return (
    <>
      <PageHeader title="Our stars & numbers" subtitle="What to lean into, and what to watch for, so things never get stale." back={{ href: "/us/", label: "Us" }} />
      <Notice className="mb-5">{ASTRO_FRAMING}</Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        {mine ? <ChartCard name={myName} chart={mine} /> : null}
        {theirs ? <ChartCard name={partnerName} chart={theirs} /> : null}
      </div>
      {pairing ? (
        <>
          <SectionTitle>You two together</SectionTitle>
          <Card>
            <p className="font-semibold text-ink">Strength</p>
            <p className="text-ink">{pairing.elements.strength}</p>
            <p className="mt-3 font-semibold text-ink">How you move</p>
            <p className="text-ink">{pairing.modalities}</p>
            <p className="mt-3 font-semibold text-ink">Your numbers</p>
            <p className="text-ink">{pairing.lifePaths}</p>
          </Card>
          <SectionTitle>Things to watch for</SectionTitle>
          <Card>
            <ul className="list-disc space-y-2 pl-5 text-ink">
              {pairing.watchOuts.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Card>
          <SectionTitle>Keep it from getting old</SectionTitle>
          <Card>
            <ul className="list-disc space-y-2 pl-5 text-ink">
              {pairing.keepItFresh.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Card>
          <div className="mt-5">
            <ButtonLink href="/us/buddy/" className="w-full">
              Ask Buddy what to do with this
            </ButtonLink>
          </div>
        </>
      ) : (
        <Notice className="mt-4">Both birthdays are needed for the couple reading.</Notice>
      )}
      <p className="mt-6 text-xs text-muted">Moon and Rising signs need an exact birth time and place, and are coming in a later update.</p>
    </>
  );
}
