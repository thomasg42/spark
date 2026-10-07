"use client";
import { RequireStage } from "@/components/require-stage";
import { SharingScreen } from "@/components/buddy/sharing-screen";

export default function BuddySharingPage() {
  return (
    <RequireStage allow="ready">
      <SharingScreen />
    </RequireStage>
  );
}
