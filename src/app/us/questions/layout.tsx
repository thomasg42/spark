import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Questions" };

export default function QuestionsLayout({ children }: { children: ReactNode }) {
  return children;
}
