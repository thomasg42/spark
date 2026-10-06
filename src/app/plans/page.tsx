"use client";
import { PlansScreen } from "@/components/plans/plans-screen";
import { RequireStage } from "@/components/require-stage";
export default function PlansPage() { return <RequireStage allow="ready"><PlansScreen /></RequireStage>; }
