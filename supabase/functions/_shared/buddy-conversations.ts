import type { BuddyTurn } from './buddy.ts';

// Never silently discard early turns. Ask for a new conversation at a bounded size.
export const CONVERSATION_MAX_CHARS = 180_000;
export const CONVERSATION_MAX_TURNS = 600;
export interface SavedConversation { id: string; title: string; turns: BuddyTurn[]; updatedAt: string }
export type ConversationSummary = Omit<SavedConversation, 'turns'>;
export function readConversation(value: unknown): BuddyTurn[] {
  if (!Array.isArray(value) || value.length > CONVERSATION_MAX_TURNS) throw new Error('This conversation is too long. Save it and start a new conversation.');
  let total = 0;
  return value.map(raw => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid conversation.');
    const t = raw as Record<string, unknown>;
    if ((t.role !== 'user' && t.role !== 'buddy') || typeof t.text !== 'string' || t.text.length > 10_000 || typeof t.at !== 'string' || !Number.isFinite(Date.parse(t.at))) throw new Error('Invalid conversation.');
    total += t.text.length;
    if (total > CONVERSATION_MAX_CHARS) throw new Error('This conversation is too long. Save it and start a new conversation.');
    const meta = t.meta as Record<string, unknown> | null;
    return {role:t.role, text:t.text, at:t.at, meta:meta && (meta.awaiting === 'plan_day' || meta.awaiting === 'note_text') ? {awaiting:meta.awaiting, ...(typeof meta.planTitle === 'string' ? {planTitle:meta.planTitle.slice(0,120)} : {})} : null};
  });
}

export function readActiveConversation(value:unknown):BuddyTurn[] {
  const turns=readConversation(value);
  if(turns.length>CONVERSATION_MAX_TURNS-2 || turns.reduce((n,t)=>n+t.text.length,0)>CONVERSATION_MAX_CHARS-3500) throw new Error('This conversation is full. Save it and start a new conversation; no earlier messages were removed.');
  return turns;
}
