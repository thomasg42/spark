"use client";
import { RequireStage } from "@/components/require-stage";
import { ProjectsScreen } from "@/components/plans/projects-screen";

export default function ProjectsPage() {
  return (
    <RequireStage allow="ready">
      <ProjectsScreen />
    </RequireStage>
  );
}
