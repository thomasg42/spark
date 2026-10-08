// @vitest-environment jsdom
import {createDemoBackend} from '@/lib/backend/demo';
import {demoStore,DEMO_ALEX,DEMO_SAM} from '@/lib/backend/demo/store';
import {buddySession,clearBuddySessions,setBuddySession,waitBuddySession,withBuddyTurn} from '@/lib/buddy/session';
import {readConversation,readActiveConversation} from '@shared/buddy-conversations.ts';
import {fallbackReply,sanitizeClientContext,type BuddyTurn} from '@shared/buddy.ts';
const backend=createDemoBackend();
const first:BuddyTurn={role:'user',text:'Our first trip was Kyoto and my favorite color is blue.',at:'2026-10-08T12:00:00Z'};
beforeEach(()=>{localStorage.clear();demoStore.reset(false);backend.demo!.actAs(DEMO_ALEX);});
it('retains all turns in memory across backend instances but never persists unsaved chat',async()=>{
 setBuddySession(`demo:${DEMO_ALEX}`,[first]);
 expect(await createDemoBackend().buddy.history()).toMatchObject([first]);
 demoStore.update(s=>{s.signedIn=true;});
 expect(localStorage.getItem('spark-demo-v4')).not.toContain('first trip was Kyoto');
 clearBuddySessions(); // equivalent to a fresh JavaScript document after close/reload
 expect(await backend.buddy.history()).toEqual([]);
});
it('explicit saves survive a fresh session, reopen exactly, and remain private',async()=>{
 const id=buddySession(`demo:${DEMO_ALEX}`).id;
 await backend.buddy.saveConversation({id,title:'Travel talk',turns:[first]});
 clearBuddySessions();
 expect(await backend.buddy.history()).toEqual([]);
 expect((await backend.buddy.conversations())[0]?.title).toBe('Travel talk');
 expect((await backend.buddy.openConversation(id)).turns[0]).toMatchObject(first);
 backend.demo!.actAs(DEMO_SAM);
 expect(await backend.buddy.conversations()).toEqual([]);
 await expect(backend.buddy.openConversation(id)).rejects.toThrow('not found');
 backend.demo!.actAs(DEMO_ALEX);
 await backend.buddy.clear();
 expect((await backend.buddy.openConversation(id)).turns[0]).toMatchObject(first);
});
it('re-saving updates the same saved chat, and future unsaved messages do not change it',async()=>{
 const id=buddySession(`demo:${DEMO_ALEX}`).id;
 await backend.buddy.saveConversation({id,title:'Travel talk',turns:[first]});
 const more={...first,text:'We changed our plan to Osaka.'};
 setBuddySession(`demo:${DEMO_ALEX}`,[first,more]);
 expect((await backend.buddy.openConversation(id)).turns).toHaveLength(1);
 await backend.buddy.saveConversation({id,title:'Updated trip',turns:[first,more]});
 expect(await backend.buddy.conversations()).toHaveLength(1);
 expect((await backend.buddy.openConversation(id)).turns).toHaveLength(2);
});
it('the demo recalls the first detail even after more than twelve turns',()=>{
 const history=[first,...Array.from({length:24},(_,i)=>({...first,role:i%2?'buddy' as const:'user' as const,text:`A later topic ${i}`}))];
 const reply=fallbackReply({text:'Do you remember our first trip?',history,context:sanitizeClientContext({}),interviewQuestionId:null,partnerShares:[]});
 expect(reply.reply).toContain('Kyoto');
});
it('rejects malformed or overfull memory instead of silently truncating it',()=>{
 expect(()=>readConversation([{...first,role:'system'}])).toThrow('Invalid');
 expect(()=>readActiveConversation(Array(599).fill(first))).toThrow(/full/);
 expect(readConversation([first])[0]!.text).toBe(first.text);
});
it('signing out clears unsaved session memory',async()=>{
 setBuddySession(`demo:${DEMO_ALEX}`,[first]);
 await backend.auth.signOut();backend.demo!.actAs(DEMO_ALEX);
 expect(await backend.buddy.history()).toEqual([]);
});

it('a returning view waits for its pending reply without persisting it',async()=>{
 const scope=`demo:${DEMO_ALEX}`;
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 const send=withBuddyTurn(scope,async()=>{await gate;setBuddySession(scope,[first]);});
 let ready=false;
 const load=waitBuddySession(scope).then(()=>{ready=true;});
 await Promise.resolve();expect(ready).toBe(false);
 release();await send;await load;
 expect(ready).toBe(true);expect(buddySession(scope).turns).toEqual([first]);
});
it('clearing during an in-flight request cannot repopulate the new conversation',async()=>{
 const context=sanitizeClientContext({});
 const request=backend.buddy.send({text:'A temporary demo thought',context,interviewQuestionId:null,aiConsent:false});
 await backend.buddy.clear();await request;
 expect(await backend.buddy.history()).toEqual([]);
});
