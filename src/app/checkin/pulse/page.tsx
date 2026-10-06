"use client";
import { PulseScreen } from "@/components/checkin/pulse-screen";
import { RequireStage } from "@/components/require-stage";
export default function PulsePage() { return <RequireStage allow="ready"><PulseScreen /></RequireStage>; }
