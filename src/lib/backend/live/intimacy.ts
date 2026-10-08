import type {IntimacyApi,IntimacyState,IntimacyNote} from '@shared/intimacy.ts';
import {supabase,fail,invoke} from './client';
export const intimacy:IntimacyApi={
 async act(input){const {data,error}=await supabase().rpc('intimacy_action',{input});if(error)fail(error,'Could not update Intimacy.');return data as IntimacyState;},
 note:()=>invoke<IntimacyNote>('intimacy',{action:'note'}),
 async saveNote(input){await invoke('intimacy',{action:'saveNote',...input});},
 coach:(message,aiConsent)=>invoke('intimacy',{action:'coach',message,aiConsent}),
};
