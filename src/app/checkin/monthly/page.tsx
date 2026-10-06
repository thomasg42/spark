"use client";
import { Suspense } from "react";
import { MonthlyScreen } from "@/components/checkin/monthly-screen";
import { RequireStage } from "@/components/require-stage";
import { LoadingBlock } from "@/components/ui";
export default function MonthlyPage() { return <RequireStage allow="ready"><Suspense fallback={<LoadingBlock label="Opening this check-in…" />}><MonthlyScreen /></Suspense></RequireStage>; }
