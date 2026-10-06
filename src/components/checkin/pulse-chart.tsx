"use client";
/**
 * Weekly pulse trend as inline SVG: one line per partner on a 1 to 5 scale.
 * Identity never relies on color alone (solid line + circles for you, dashed line +
 * squares for your partner, plus a legend), and PulseTable is the full text
 * alternative. Theme tokens only.
 */
import { useId, useState } from "react";
import type { PulseMetric, TrendWeek } from "./pulse-trend";

const W = 320;
const H = 196;
const PAD = { left: 38, right: 12, top: 12, bottom: 44 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

type Point = { i: number; v: number };

function linePath(points: Array<Point | null>, x: (i: number) => number, y: (v: number) => number): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)} `;
    pen = true;
  }
  return d.trim();
}

const valueText = (v: number | null | undefined) => (v == null ? "no entry" : String(v));

export function LegendKey({ variant }: { variant: "mine" | "partner" }) {
  return (
    <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden className={variant === "mine" ? "text-accent-text" : "text-muted"}>
      <line x1="1" y1="6" x2="29" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={variant === "mine" ? undefined : "5 4"} />
      {variant === "mine" ? (
        <circle cx="15" cy="6" r="4" fill="currentColor" stroke="var(--surface)" strokeWidth="2" />
      ) : (
        <rect x="11" y="2" width="8" height="8" rx="1.5" fill="currentColor" stroke="var(--surface)" strokeWidth="2" />
      )}
    </svg>
  );
}

export function PulseLegend({ myLabel, partnerLabel }: { myLabel: string; partnerLabel: string }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink" aria-label="Chart key">
      <li className="flex items-center gap-2">
        <LegendKey variant="mine" /> {myLabel}
      </li>
      <li className="flex items-center gap-2">
        <LegendKey variant="partner" /> {partnerLabel}
      </li>
    </ul>
  );
}

export function PulseChart({
  weeks,
  metric,
  title,
  myLabel,
  partnerLabel,
}: {
  weeks: TrendWeek[];
  metric: PulseMetric;
  title: string;
  myLabel: string;
  partnerLabel: string;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const n = weeks.length;
  const x = (i: number) => PAD.left + (n <= 1 ? PLOT_W / 2 : (i * PLOT_W) / (n - 1));
  const y = (v: number) => PAD.top + ((5 - v) * PLOT_H) / 4;
  const colW = n <= 1 ? PLOT_W : PLOT_W / (n - 1);

  const mine = weeks.map((w, i) => (w.mine ? { i, v: w.mine[metric] } : null));
  const partner = weeks.map((w, i) => (w.partner ? { i, v: w.partner[metric] } : null));
  const description = `Scores from 1 to 5 for the last ${n} weeks, oldest first. ${myLabel}: ${weeks
    .map((w) => valueText(w.mine?.[metric]))
    .join(", ")}. ${partnerLabel}: ${weeks.map((w) => valueText(w.partner?.[metric])).join(", ")}.`;
  const activeWeek = active != null ? weeks[active] : undefined;

  return (
    <figure className="m-0">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-ink">{title}</span>
      </figcaption>
      <p className="mt-1 min-h-5 text-xs text-muted" aria-hidden>
        {activeWeek
          ? `Week of ${activeWeek.label}: ${myLabel} ${valueText(activeWeek.mine?.[metric])} · ${partnerLabel} ${valueText(activeWeek.partner?.[metric])}`
          : "Hover or tap a week to see the scores."}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 block h-auto w-full touch-pan-y select-none"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        onPointerLeave={() => setActive(null)}
      >
        <title id={`${id}-title`}>{title}</title>
        <desc id={`${id}-desc`}>{description}</desc>

        {/* Gridlines and y-axis ticks */}
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(v)} dy="0.35em" textAnchor="end" fontSize="10" fill="currentColor" className="text-muted">
              {v}
            </text>
          </g>
        ))}
        <text
          transform={`translate(10 ${PAD.top + PLOT_H / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="10"
          fill="currentColor"
          className="text-muted"
        >
          Score (1 to 5)
        </text>

        {/* X-axis labels: every other week keeps them readable on phones; the table has all. */}
        {weeks.map((w, i) =>
          i % 2 === (n - 1) % 2 ? (
            <text key={w.weekStart} x={x(i)} y={H - PAD.bottom + 16} textAnchor="middle" fontSize="10" fill="currentColor" className="text-muted">
              {w.label}
            </text>
          ) : null,
        )}
        <text x={PAD.left + PLOT_W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="currentColor" className="text-muted">
          Week starting
        </text>

        {/* Hover guide */}
        {active != null ? <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="var(--line)" strokeWidth="2" /> : null}

        {/* Partner first so your circles sit on top when scores match. */}
        <g className="text-muted">
          <path d={linePath(partner, x, y)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 4" />
          {partner.map((p) =>
            p ? <rect key={p.i} x={x(p.i) - 4.5} y={y(p.v) - 4.5} width="9" height="9" rx="1.5" fill="currentColor" stroke="var(--surface)" strokeWidth="2" /> : null,
          )}
        </g>
        <g className="text-accent-text">
          <path d={linePath(mine, x, y)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {mine.map((p) => (p ? <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="4.5" fill="currentColor" stroke="var(--surface)" strokeWidth="2" /> : null))}
        </g>

        {/* Generous hit targets, one column per week. */}
        {weeks.map((w, i) => (
          <rect
            key={w.weekStart}
            x={x(i) - colW / 2}
            y={PAD.top}
            width={colW}
            height={PLOT_H}
            fill="transparent"
            onPointerEnter={() => setActive(i)}
            onPointerDown={() => setActive(i)}
          />
        ))}
      </svg>
    </figure>
  );
}

/** Text alternative for both charts. */
export function PulseTable({ weeks, myLabel, partnerLabel }: { weeks: TrendWeek[]; myLabel: string; partnerLabel: string }) {
  const cell = (v: number | undefined) => (v == null ? <span className="text-muted">No entry</span> : v);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] border-collapse text-left text-sm">
        <caption className="sr-only">
          Weekly pulse scores from 1 to 5, last {weeks.length} weeks. {partnerLabel}&apos;s scores appear for weeks you both answered.
        </caption>
        <thead>
          <tr className="border-b border-line text-muted">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Week of
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              {myLabel}: excitement
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              {myLabel}: connection
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              {partnerLabel}: excitement
            </th>
            <th scope="col" className="py-2 font-semibold">
              {partnerLabel}: connection
            </th>
          </tr>
        </thead>
        <tbody>
          {[...weeks].reverse().map((w) => (
            <tr key={w.weekStart} className="border-b border-line last:border-0">
              <th scope="row" className="py-2 pr-3 font-medium text-ink">
                {w.label}
              </th>
              <td className="py-2 pr-3 text-ink">{cell(w.mine?.excitement)}</td>
              <td className="py-2 pr-3 text-ink">{cell(w.mine?.connection)}</td>
              <td className="py-2 pr-3 text-ink">{cell(w.partner?.excitement)}</td>
              <td className="py-2 text-ink">{cell(w.partner?.connection)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
