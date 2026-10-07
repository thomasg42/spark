"use client";
import { RequireStage } from "@/components/require-stage";
import { MoneyScreen } from "@/components/plans/money-screen";

export default function MoneyPage() {
  return (
    <RequireStage allow="ready">
      <MoneyScreen />
    </RequireStage>
  );
}
