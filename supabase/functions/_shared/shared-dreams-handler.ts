import type {SupabaseClient} from '@supabase/supabase-js';
import {scopes, type Sealer} from './crypto.ts';
import {dbError,HttpError,type Handler} from './http.ts';
import {normalizeDream,canReadDream,type DreamRecord,type DreamInput,type DreamState} from './shared-dreams.ts';
export interface DreamRow {id:string;owner_id:string;couple_id:string;kind:DreamRecord['kind'];visibility:'private'|'shared';payload_ciphertext:string;updated_at:string;}
export interface DreamsRepo {
 couple():Promise<string|null>;
 consents(coupleId:string):Promise<Array<{user_id:string;enabled:boolean}>>;
 list(coupleId:string):Promise<DreamRow[]>;
 save(row:DreamRow,update:boolean):Promise<DreamRow>;
 remove(id:string,ownerId:string):Promise<void>;
 consent(coupleId:string,userId:string,enabled:boolean):Promise<void>;
}
const columns='id,owner_id,couple_id,kind,visibility,payload_ciphertext,updated_at';
export function supabaseDreamsRepo(client:SupabaseClient):DreamsRepo {
 return {
  async couple(){const {data,error}=await client.rpc('my_couple_id');if(error)dbError(error);return data;},
  async consents(id){const {data,error}=await client.from('dream_roadmap_consent').select('user_id,enabled').eq('couple_id',id);if(error)dbError(error);return data??[];},
  async list(id){const {data,error}=await client.from('shared_dreams').select(columns).eq('couple_id',id).order('updated_at',{ascending:false});if(error)dbError(error,'Could not load Shared Dreams.');return (data??[]) as DreamRow[];},
  async save(row,update){const result=update?await client.from('shared_dreams').update({visibility:row.visibility,payload_ciphertext:row.payload_ciphertext}).eq('id',row.id).eq('owner_id',row.owner_id).select(columns).single():await client.from('shared_dreams').insert(row).select(columns).single();if(result.error)dbError(result.error,'Could not save this card.');return result.data as DreamRow;},
  async remove(id,uid){const {error}=await client.from('shared_dreams').delete().eq('id',id).eq('owner_id',uid);if(error)dbError(error);},
  async consent(id,uid,enabled){const {error}=await client.from('dream_roadmap_consent').upsert({couple_id:id,user_id:uid,enabled},{onConflict:'couple_id,user_id'});if(error)dbError(error);},
 };
}
const binding=(r:DreamRow)=>`shared_dreams|${r.id}|${r.owner_id}|${r.couple_id}|${r.kind}|${r.visibility}`;
const scope=(r:DreamRow)=>r.visibility==='private'?scopes.user(r.owner_id):scopes.couple(r.couple_id);
export function createDreamsHandler({repo,sealer}:{repo:DreamsRepo;sealer:Sealer|null}):Handler {
 return async(body,ctx)=>{
  const uid=ctx.user?.id;if(!uid)throw new HttpError(401,'Please sign in.');
  if(!sealer)throw new HttpError(503,'Secure storage is unavailable. Nothing was saved or shown.');
  const coupleId=await repo.couple();if(!coupleId)throw new HttpError(400,'Pair with your partner first.');
  const consent=await repo.consents(coupleId);
  const status={mine:consent.some(x=>x.user_id===uid&&x.enabled),partner:consent.some(x=>x.user_id!==uid&&x.enabled)};
  const both=status.mine&&status.partner;
  const visible=(row:DreamRow)=>canReadDream({id:row.id,ownerId:row.owner_id,coupleId:row.couple_id,kind:row.kind,visibility:row.visibility} as DreamRecord,uid,coupleId,both);
  async function open(row:DreamRow):Promise<DreamRecord>{
   try {const payload=await sealer!.decryptJson(row.payload_ciphertext,scope(row),binding(row));const clean=normalizeDream({kind:row.kind,visibility:row.visibility,payload});return {id:row.id,ownerId:row.owner_id,coupleId:row.couple_id,updatedAt:row.updated_at,...clean} as DreamRecord;}catch{throw new HttpError(500,'Could not unlock your saved cards. Nothing was changed.');}
  }
  if(body.action==='consent'){if(typeof body.enabled!=='boolean')throw new HttpError(400,'Choose whether to join the roadmap.');await repo.consent(coupleId,uid,body.enabled);return {ok:true};}
  const rows=(await repo.list(coupleId)).filter(visible);
  if(body.action==='list')return {items:await Promise.all(rows.map(open)),roadmapConsent:status} satisfies DreamState;
  if(body.action==='remove'){const own=rows.find(x=>x.id===body.id&&x.owner_id===uid);if(!own)throw new HttpError(404,'That card is not available.');await repo.remove(own.id,uid);return {ok:true};}
  if(body.action!=='save')throw new HttpError(400,'Unknown action.');
  let input:DreamInput & {visibility:'private'|'shared'};
  try{input=normalizeDream(body.input);}catch{throw new HttpError(400,'Check the card fields and sharing choice. Nothing was saved.');}
  if(input.kind==='roadmap'&&!both)throw new HttpError(403,'Both partners must join the roadmap first.');
  let old=input.id?rows.find(x=>x.id===input.id):undefined;
  if(input.id&&(!old||old.owner_id!==uid||old.kind!==input.kind))throw new HttpError(403,'Only the author can change this card.');
  if(!input.id&&['anchors','reflection','health'].includes(input.kind))old=rows.find(x=>x.owner_id===uid&&x.kind===input.kind);
  const row:DreamRow={id:old?.id??crypto.randomUUID(),couple_id:coupleId,owner_id:uid,kind:input.kind,visibility:input.visibility,payload_ciphertext:'',updated_at:new Date().toISOString()};
  row.payload_ciphertext=await sealer.encryptJson(input.payload,scope(row),binding(row));
  return {item:await open(await repo.save(row,!!old))};
 };
}
