"use client";
import { RequireStage } from "@/components/require-stage";
import { BuddyScreen } from "@/components/buddy/buddy-screen";

export default function BuddyPage() {
  return (
    <RequireStage allow="ready">
      <BuddyScreen />
    </RequireStage>
  );
}
