"use client";
import { GoalsScreen } from "@/components/plans/goals-screen";
import { RequireStage } from "@/components/require-stage";

export default function OurGoalsPage() {
  return (
    <RequireStage allow="ready">
      <GoalsScreen />
    </RequireStage>
  );
}
