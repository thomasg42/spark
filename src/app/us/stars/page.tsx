"use client";
import { RequireStage } from "@/components/require-stage";
import { StarsScreen } from "@/components/stars/stars-screen";

export default function StarsPage() {
  return (
    <RequireStage allow="ready">
      <StarsScreen />
    </RequireStage>
  );
}
