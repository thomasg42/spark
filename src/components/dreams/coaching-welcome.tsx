"use client";
import {useRef,useState} from 'react';
import {useApp} from '@/components/app-provider';
import {Button,Card,Notice} from '@/components/ui';
import {useLoad} from '@/lib/ui/hooks';
import {messageOf} from '@/lib/backend/types';
import {EMPTY_ANCHORS,TRACKS,TRACK_COPY,type CoachingTrack} from '@shared/shared-dreams.ts';
/** First paired visit: optional onboarding choice, persisted privately with Life Anchors. */
export function CoachingWelcome(){const {user}=useApp();return <Choice key={user?.id}/>;}
function Choice(){
 const {backend,user}=useApp();const state=useLoad(()=>backend.dreams.list(),[backend,user?.id]);
 const [later,setLater]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);const lock=useRef(false);
 if(later||state.loading||state.error||!state.data||state.data.items.some(x=>x.kind==='anchors'&&x.ownerId===user?.id))return null;
 async function choose(track:CoachingTrack){if(lock.current)return;lock.current=true;setBusy(true);try{await backend.dreams.save({kind:'anchors',payload:{...EMPTY_ANCHORS,track}});await state.reload();}catch(e){setError(messageOf(e));}finally{lock.current=false;setBusy(false);}}
 return <Card className="mt-5"><h2 className="text-lg font-bold">How should Buddy support you?</h2><p className="mt-2 text-sm text-muted">Driven for accountability, Warm for connection, or Balanced for both. This choice is private and you can change it in Life Anchors anytime.</p>{error&&<Notice tone="danger" title={error}/>}<div className="mt-3 flex flex-wrap gap-2">{TRACKS.map(track=><Button key={track} disabled={busy} variant="secondary" onClick={()=>void choose(track)}>{TRACK_COPY[track]}</Button>)}<Button variant="ghost" disabled={busy} onClick={()=>setLater(true)}>Choose later</Button></div></Card>;
}
