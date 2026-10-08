"use client";
import { RequireStage } from "@/components/require-stage";
import { HintsScreen } from "@/components/hints/hints-screen";

export default function HintsPage() {
  return (
    <RequireStage allow="ready">
      <HintsScreen />
    </RequireStage>
  );
}
