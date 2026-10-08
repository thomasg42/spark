import {normalizeDream,canReadDream,type DreamRecord,type DreamsApi} from '@shared/shared-dreams.ts';
import {UserFacingError} from '../types';
import {demoStore,me,myCouple,newId,nowIso,tick} from './store';
export const dreams:DreamsApi={
 async list(){await tick(40);const uid=me(),couple=myCouple(),s=demoStore.get();const consent=s.dreamRoadmapConsent??{};const status={mine:consent[uid]===true,partner:couple.memberIds.some(x=>x!==uid&&consent[x]===true)};return {items:structuredClone((s.dreams??[]).filter(x=>canReadDream(x,uid,couple.id,status.mine&&status.partner))),roadmapConsent:status};},
 async save(raw){await tick(40);const uid=me(),couple=myCouple();let input:ReturnType<typeof normalizeDream>;try{input=normalizeDream(raw);}catch{throw new UserFacingError('Check the card fields and sharing choice. Nothing was saved.');}
 return demoStore.update(s=>{
  const consent=s.dreamRoadmapConsent??{};const both=couple.memberIds.length===2&&couple.memberIds.every(x=>consent[x]===true);
  if(input.kind==='roadmap'&&!both)throw new UserFacingError('Both partners must join the roadmap first.');
  const items=s.dreams??=[];let old=input.id?items.find(x=>x.id===input.id):undefined;
  if(input.id&&(!old||old.ownerId!==uid||old.kind!==input.kind||old.coupleId!==couple.id))throw new UserFacingError('Only the author can change this card.');
  if(!input.id&&['anchors','reflection','health'].includes(input.kind))old=items.find(x=>x.ownerId===uid&&x.kind===input.kind&&x.coupleId===couple.id);
  const row={...input,payload:structuredClone(input.payload),id:old?.id??newId(),ownerId:uid,coupleId:couple.id,updatedAt:nowIso()} as DreamRecord;
  if(old)items[items.indexOf(old)]=row;else items.unshift(row);return structuredClone(row);
 });},
 async remove(id){await tick(40);const uid=me(),couple=myCouple();demoStore.update(s=>{const row=(s.dreams??[]).find(x=>x.id===id);if(!row||row.ownerId!==uid||row.coupleId!==couple.id)throw new UserFacingError('Only the author can remove this card.');s.dreams=s.dreams!.filter(x=>x.id!==id);});},
 async consent(enabled){await tick(40);const uid=me();myCouple();if(typeof enabled!=='boolean')throw new UserFacingError('Choose whether to join.');demoStore.update(s=>{(s.dreamRoadmapConsent??={})[uid]=enabled;});},
};
