import type {DreamsApi,DreamState,DreamRecord} from '@shared/shared-dreams.ts';
import {invoke} from './client';
export const dreams:DreamsApi={
 list:()=>invoke<DreamState>('shared-dreams',{action:'list'}),
 async save(input){return (await invoke<{item:DreamRecord}>('shared-dreams',{action:'save',input})).item;},
 async remove(id){await invoke('shared-dreams',{action:'remove',id});},
 async consent(enabled){await invoke('shared-dreams',{action:'consent',enabled});},
};
