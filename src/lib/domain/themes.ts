/**
 * Single source of truth for colors. layout.tsx renders themeCss() into the page,
 * and tests/unit/themes.test.ts checks every text/background pair meets WCAG AA.
 * Each partner picks their own accent + light/dark; it only changes their own view.
 */
import type { AccentTheme, ColorMode } from "@/lib/backend/types";

export interface BaseTokens {
  bg: string;
  surface: string;
  surface2: string;
  ink: string;
  muted: string;
  line: string;
  danger: string;
  ok: string;
}

export interface AccentTokens {
  accent: string; // button/fill background
  accentInk: string; // text on accent fill
  accentText: string; // accent-colored text on bg/surface
  accentSoft: string; // tinted surface (ink text on top)
  deco: string; // decorative only (icons, rings), 3:1 against bg
}

export const BASE: Record<"light" | "dark", BaseTokens> = {
  light: { bg: "#FFF8F0", surface: "#FFFFFF", surface2: "#FBEFE6", ink: "#2B1B2E", muted: "#6B5A6E", line: "#E7D6CD", danger: "#B3261E", ok: "#22603F" },
  dark: { bg: "#1A1020", surface: "#2A1C30", surface2: "#33233A", ink: "#FBEFF2", muted: "#CDB9D0", line: "#4A3752", danger: "#FF8A80", ok: "#8AD3AE" },
};

export const ACCENTS: Record<AccentTheme, { label: string; light: AccentTokens; dark: AccentTokens }> = {
  rose: {
    label: "Rose",
    light: { accent: "#C2364F", accentInk: "#FFFFFF", accentText: "#B02A45", accentSoft: "#FCE4E9", deco: "#E85D75" },
    dark: { accent: "#F07A8F", accentInk: "#1A1020", accentText: "#F59AAB", accentSoft: "#4A2433", deco: "#F07A8F" },
  },
  plum: {
    label: "Royal Plum",
    light: { accent: "#5B2A86", accentInk: "#FFFFFF", accentText: "#5B2A86", accentSoft: "#EEE4F7", deco: "#7A45AD" },
    dark: { accent: "#B48CE0", accentInk: "#1A1020", accentText: "#C9A8EE", accentSoft: "#3B2752", deco: "#B48CE0" },
  },
  ocean: {
    label: "Ocean",
    light: { accent: "#16627C", accentInk: "#FFFFFF", accentText: "#15607A", accentSoft: "#DDF0F6", deco: "#1F7A99" },
    dark: { accent: "#5BC0DE", accentInk: "#1A1020", accentText: "#7FD0E8", accentSoft: "#1E3A47", deco: "#5BC0DE" },
  },
  sunset: {
    label: "Sunset",
    light: { accent: "#A84C14", accentInk: "#FFFFFF", accentText: "#A3470F", accentSoft: "#FCE8DA", deco: "#C8612A" },
    dark: { accent: "#F4A06B", accentInk: "#1A1020", accentText: "#F7B48A", accentSoft: "#4A2E1F", deco: "#F4A06B" },
  },
  forest: {
    label: "Forest",
    light: { accent: "#256446", accentInk: "#FFFFFF", accentText: "#22603F", accentSoft: "#DFF1E7", deco: "#2F7A55" },
    dark: { accent: "#6CC497", accentInk: "#1A1020", accentText: "#8AD3AE", accentSoft: "#1F3D2E", deco: "#6CC497" },
  },
};

export const ACCENT_ORDER: AccentTheme[] = ["rose", "plum", "ocean", "sunset", "forest"];
export const COLOR_MODES: Array<{ value: ColorMode; label: string }> = [
  { value: "system", label: "Match my device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const vars = (b: BaseTokens) =>
  `--bg:${b.bg};--surface:${b.surface};--surface-2:${b.surface2};--ink:${b.ink};--muted:${b.muted};--line:${b.line};--danger:${b.danger};--ok:${b.ok};`;
const accentVars = (a: AccentTokens) =>
  `--accent:${a.accent};--accent-ink:${a.accentInk};--accent-text:${a.accentText};--accent-soft:${a.accentSoft};--deco:${a.deco};`;

/** CSS custom properties for every accent x mode, keyed off <html data-accent data-mode>. */
export function themeCss(): string {
  const out: string[] = [];
  out.push(`:root{${vars(BASE.light)}${accentVars(ACCENTS.rose.light)}color-scheme:light;}`);
  for (const key of ACCENT_ORDER) out.push(`:root[data-accent="${key}"]{${accentVars(ACCENTS[key].light)}}`);
  const darkBlock = (prefix: string) => {
    const parts = [`${prefix}{${vars(BASE.dark)}${accentVars(ACCENTS.rose.dark)}color-scheme:dark;}`];
    for (const key of ACCENT_ORDER) parts.push(`${prefix}[data-accent="${key}"]{${accentVars(ACCENTS[key].dark)}}`);
    return parts.join("");
  };
  out.push(darkBlock(`:root[data-mode="dark"]`));
  out.push(`@media (prefers-color-scheme: dark){${darkBlock(`:root:not([data-mode="light"]):not([data-mode="dark"])`)}}`);
  return out.join("\n");
}

/** Contrast ratio per WCAG 2.x. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const channel = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
