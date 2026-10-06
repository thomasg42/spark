"use client";
import { CheckinHub } from "@/components/checkin/checkin-hub";
import { RequireStage } from "@/components/require-stage";
export default function CheckinPage() { return <RequireStage allow="ready"><CheckinHub /></RequireStage>; }
