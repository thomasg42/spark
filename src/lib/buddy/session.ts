import type { BuddyTurn } from '@shared/buddy.ts';

/** Document memory only: survives SPA navigation, never browser storage or server autosave. */
const sessions = new Map<string, {id:string; title?:string; pending?:Promise<void>; turns:BuddyTurn[]}>();
export function buddySession(scope:string) {
  let session = sessions.get(scope);
  if (!session) {session = {id:crypto.randomUUID(),turns:[]}; sessions.set(scope,session);}
  return session;
}
export function setBuddySession(scope:string, turns:BuddyTurn[], id?:string, title?:string) {
  const previous = buddySession(scope);
  sessions.set(scope,{...previous,id:id ?? previous.id,title:title ?? (id && id!==previous.id ? undefined : previous.title),turns:structuredClone(turns)});
}
export function clearBuddySessions(scope?:string) {if(scope) sessions.delete(scope); else sessions.clear();}

/** Reopening Buddy while a reply is in flight waits for that same reply. */
export async function waitBuddySession(scope:string) {await buddySession(scope).pending;}
export async function withBuddyTurn<T>(scope:string,work:()=>Promise<T>):Promise<T> {
  const session=buddySession(scope);
  if(session.pending) throw new Error('Buddy is still replying. Please wait a moment.');
  let finish!:()=>void;
  session.pending=new Promise<void>(resolve=>{finish=resolve;});
  try{return await work();}finally{
    const current=sessions.get(scope);
    if(current?.id===session.id) delete current.pending;
    finish();
  }
}
