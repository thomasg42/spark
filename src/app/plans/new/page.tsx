"use client";
import { Suspense } from "react";
import { ActivityForm } from "@/components/plans/activity-form";
import { RequireStage } from "@/components/require-stage";
import { LoadingBlock } from "@/components/ui";
export default function NewPlanPage() { return <RequireStage allow="ready"><Suspense fallback={<LoadingBlock label="Opening the activity form…" />}><ActivityForm /></Suspense></RequireStage>; }
