"use client";
import { NotesScreen } from "@/components/checkin/notes-screen";
import { RequireStage } from "@/components/require-stage";
export default function NotesPage() { return <RequireStage allow="ready"><NotesScreen /></RequireStage>; }
