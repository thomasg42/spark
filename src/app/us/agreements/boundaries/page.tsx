"use client";
import { BoundariesScreen } from "@/components/agreements/boundaries-screen";
import { RequireStage } from "@/components/require-stage";

export default function BoundariesPage() {
  return (
    <RequireStage allow="ready">
      <BoundariesScreen />
    </RequireStage>
  );
}
