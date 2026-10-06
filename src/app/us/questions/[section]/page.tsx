import type { Metadata } from "next";
import { findSection, SECTIONS } from "@shared/questionnaires.ts";
import { SectionClient } from "./section-client";

// Static export: one page per Phase 1 section, nothing generated at request time.
export const dynamicParams = false;

export function generateStaticParams() {
  return SECTIONS.map((s) => ({ section: s.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return { title: findSection(section)?.title ?? "Questions" };
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  return <SectionClient sectionKey={section} />;
}
