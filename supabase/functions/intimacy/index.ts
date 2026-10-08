import {z} from 'zod';
import {makeRequestHandler,HttpError,dbError} from '../_shared/http.ts';
import {sealerFromEnv} from '../_shared/answers-handler.ts';
import {createClaudeGenerator} from '../_shared/anthropic.ts';
import {intimacyReply} from '../_shared/intimacy-coach.ts';
import type {IntimacyState} from '../_shared/intimacy.ts';
const sealer=sealerFromEnv(Deno.env.get('ENCRYPTION_KEY'));
const generate=createClaudeGenerator(Deno.env.get('ANTHROPIC_API_KEY'));
const noteSchema=z.object({repeat:z.string().max(1000),change:z.string().max(1000),history:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().max(1500)})).max(20)});
Deno.serve(makeRequestHandler({supabaseUrl:Deno.env.get('SUPABASE_URL')!,anonKey:Deno.env.get('SUPABASE_ANON_KEY')!,allowedOrigins:Deno.env.get('ALLOWED_ORIGINS')},async(body,ctx)=>{
 const {data:state,error}=await ctx.supabase.rpc('intimacy_action',{input:{action:'list'}});if(error)dbError(error);if(!(state as IntimacyState).enabled)throw new HttpError(403,'Turn on your Intimacy area first.');
 const {data:member,error:memberError}=await ctx.supabase.from('couple_members').select('couple_id').eq('user_id',ctx.user.id).single();if(memberError)dbError(memberError);
 const cid=member!.couple_id as string,uid=ctx.user.id;
 const {data:row,error:readError}=await ctx.supabase.from('intimacy_private_notes').select('payload_ciphertext').eq('couple_id',cid).eq('user_id',uid).maybeSingle();if(readError)dbError(readError);
 if(!sealer)throw new HttpError(503,'Private storage is not configured yet.');
 const scope=`user:${uid}` as const,aad=`intimacy_private_notes|${cid}|${uid}`;
 const note=row?noteSchema.parse(await sealer.decryptJson(row.payload_ciphertext,scope,aad)):{repeat:'',change:'',history:[] as Array<{role:'user'|'assistant';content:string}>};
 if(body.action==='note')return note;
 let reply:Awaited<ReturnType<typeof intimacyReply>>|null=null;
 if(body.action==='saveNote'){
  const parsed=z.object({repeat:z.string().max(1000),change:z.string().max(1000)}).safeParse(body);if(!parsed.success)throw new HttpError(400,'Keep each reflection under 1,000 characters.');Object.assign(note,parsed.data);
 }else if(body.action==='coach'){
  const parsed=z.object({message:z.string().trim().min(1).max(1000),aiConsent:z.boolean()}).safeParse(body);if(!parsed.success)throw new HttpError(400,'Write a short message and choose whether to use AI.');
  reply=await intimacyReply(parsed.data.message,state as IntimacyState,note,generate,parsed.data.aiConsent);
  note.history.push({role:'user',content:parsed.data.message},{role:'assistant',content:reply.reply});note.history=note.history.slice(-20);
 }else throw new HttpError(400,'Unknown Intimacy action.');
 const ciphertext=await sealer.encryptJson(note,scope,aad);
 const {error:writeError}=await ctx.supabase.from('intimacy_private_notes').upsert({couple_id:cid,user_id:uid,payload_ciphertext:ciphertext});if(writeError)dbError(writeError);
 return reply??{ok:true};
}));
