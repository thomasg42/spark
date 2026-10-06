"use client";
import { RequireStage } from "@/components/require-stage";
import { StoryScreen } from "@/components/story/story-screen";

export default function StoryPage() {
  return (
    <RequireStage allow="ready">
      <StoryScreen />
    </RequireStage>
  );
}
