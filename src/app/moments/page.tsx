"use client";
import { MomentsView } from "@/components/moments/moments-view";
import { RequireStage } from "@/components/require-stage";

export default function MomentsPage() {
  return (
    <RequireStage allow="ready">
      <MomentsView />
    </RequireStage>
  );
}
