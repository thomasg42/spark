'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useApp} from '@/components/app-provider';
import type {IntimacyAction,IntimacyState} from '@shared/intimacy.ts';
export function announceIntimacy(){window.dispatchEvent(new Event('spark-intimacy'));}
export function useIntimacy(){
 const {backend,user}=useApp();const [data,setData]=useState<IntimacyState|null>(null);const [owner,setOwner]=useState<string|undefined>();const [error,setError]=useState('');const [pending,setPending]=useState(false);const seq=useRef(0);
 const load=useCallback(async()=>{const ticket=++seq.current;try{const s=await backend.intimacy.act({action:'list'});if(ticket===seq.current){setData(s);setOwner(user?.id);setError('');}}catch(e){if(ticket===seq.current){setData(null);setError(e instanceof Error?e.message:'Could not load Intimacy.');}}},[backend,user?.id]);
 useEffect(()=>{setData(null);void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},10000);const refresh=()=>void load();window.addEventListener('spark-intimacy',refresh);window.addEventListener('focus',refresh);return()=>{seq.current++;clearInterval(timer);window.removeEventListener('spark-intimacy',refresh);window.removeEventListener('focus',refresh);};},[load]);
 const act=async(input:IntimacyAction)=>{if(pending)return;setPending(true);++seq.current;try{setData(await backend.intimacy.act(input));setError('');announceIntimacy();}catch(e){setError(e instanceof Error?e.message:'Could not save.');}finally{setPending(false);}};
 const same=owner===user?.id&&(!backend.demo||backend.demo.actingAs()===user?.id);
 return {data:same?data:null,error,pending,act,reload:load};
}
