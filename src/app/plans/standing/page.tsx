"use client";
import { RequireStage } from "@/components/require-stage";
import { StandingScreen } from "@/components/plans/standing-screen";

export default function StandingPage() {
  return (
    <RequireStage allow="ready">
      <StandingScreen />
    </RequireStage>
  );
}
