import {INTIMACY_CATALOG,coachTopic,renderGuideReply,type IntimacyApi,type IntimacyState,type IntimacyNote,type IntimacyInvitation} from '@shared/intimacy.ts';
import {demoStore,me,myCouple,partnerOf} from './store';
import {isAdult} from '@/lib/domain/dates';
import {UserFacingError} from '../types';
export type DemoIntimacy={users:Record<string,IntimacyState&{note:IntimacyNote;sparkExpiry:Record<string,number>}>;invitations:Array<IntimacyInvitation&{updated:number;hidden:boolean;checks:Record<string,boolean>}>};
const fresh=():DemoIntimacy['users'][string]=>({enabled:false,muted:true,desire:null,answers:{},overlaps:[],matched:[],sparks:[],invitations:[],note:{repeat:'',change:'',history:[]},sparkExpiry:{}});
function context(){const uid=me();myCouple();const other=partnerOf(uid);if(!other)throw new UserFacingError('Pair with your partner first.');return {uid,other};}
function ensure(data:DemoIntimacy,uid:string){return data.users[uid]??(data.users[uid]=fresh());}
function current(data:DemoIntimacy,uid:string,other:string):IntimacyState{
 const mine=ensure(data,uid),partner=ensure(data,other),now=Date.now();
 for(const person of [mine,partner])for(const a of Object.values(person.answers))if(a.pending&&a.effectiveAt&&Date.parse(a.effectiveAt)<=now){a.choice=a.pending;a.pending=null;a.effectiveAt=null;}
 const overlaps=mine.enabled&&partner.enabled?INTIMACY_CATALOG.filter(c=>[mine,partner].every(p=>['yes','maybe'].includes(p.answers[c.id]?.choice??''))).map(c=>c.id).sort():[];
 const sparks=overlaps.filter(id=>(mine.sparkExpiry[id]??0)>now);const matched=sparks.filter(id=>(partner.sparkExpiry[id]??0)>now);
 for(const i of data.invitations)if(i.kind==='time'&&i.status==='yes'&&i.when&&now>Date.parse(i.when)+900000&&!(i.checks[uid]&&i.checks[other])){i.status='another_time';i.updated=now;}
 const invitations=data.invitations.filter(i=>!i.hidden&&i.status!=='ended'&&overlaps.includes(i.item)&&i.updated>now-90*86400000).map(({updated:_,hidden:__,checks,...i})=>({...i,mineFeeling:checks[uid]??null,ready:i.status==='yes'&&!!i.when&&now>=Date.parse(i.when)-3600000&&now<=Date.parse(i.when)+14400000&&checks[uid]===true&&checks[other]===true}));
 return structuredClone({enabled:mine.enabled,muted:mine.muted,desire:mine.desire,answers:mine.answers,overlaps,matched,sparks,invitations});
}
function mutate<T>(fn:(d:DemoIntimacy,uid:string,other:string)=>T):T{const {uid,other}=context();return demoStore.update(s=>{const d=s.intimacy??(s.intimacy={users:{},invitations:[]});return fn(d,uid,other);});}
export const intimacy:IntimacyApi={
 async act(input){if(input.action==='list'){const {uid,other}=context();return current(structuredClone(demoStore.get().intimacy??{users:{},invitations:[]}),uid,other);}return mutate((d,uid,other)=>{
 const mine=ensure(d,uid);const now=Date.now();const snapshot=current(d,uid,other);const fail=(m:string):never=>{throw new UserFacingError(m);};
 if(input.action==='consent'){
  if(input.enabled&&(!input.adult||!isAdult(demoStore.get().profiles[uid]!.birthday,new Date())))fail('Confirm you are 18 or older.');
  mine.enabled=input.enabled;if(!input.enabled){for(const u of Object.values(d.users))u.sparkExpiry={};for(const i of d.invitations){i.hidden=true;if(['pending','yes'].includes(i.status))i.status='ended';}}
 }else if(!mine.enabled)fail('Turn on your Intimacy area first.');
 if(input.action==='answer'){
  if(!INTIMACY_CATALOG.some(c=>c.id===input.item)||!['yes','maybe','not_now','no'].includes(input.choice))fail('Choose an available item and answer.');
  const prev=mine.answers[input.item];if(!prev||['no','not_now'].includes(input.choice)||prev.choice===input.choice){mine.answers[input.item]={choice:input.choice,pending:null,effectiveAt:null};}
  else{prev.pending=input.choice;const t=new Date();t.setUTCHours(24,0,0,0);prev.effectiveAt=t.toISOString();}
  if(['no','not_now'].includes(input.choice)){for(const u of Object.values(d.users))delete u.sparkExpiry[input.item];for(const i of d.invitations)if(i.item===input.item&&['pending','yes'].includes(i.status))i.status='ended';}
 }else if(input.action==='preferences'){
  if(input.muted!==undefined)mine.muted=input.muted;if(input.desire!==undefined){if(input.desire<1||input.desire>5)fail('Choose a value from 1 to 5.');mine.desire=input.desire;}
 }else if(input.action==='spark'){
  if(!snapshot.overlaps.includes(input.item))fail('This shared option is unavailable.');
  if((mine.sparkExpiry[input.item]??0)>now)delete mine.sparkExpiry[input.item];else{if(Object.values(mine.sparkExpiry).filter(t=>t>now).length>=3)fail('Keep up to three private sparks at a time.');mine.sparkExpiry[input.item]=now+86400000;}
 }else if(input.action==='propose'){
  if(!snapshot.overlaps.includes(input.item)||(input.kind==='time'&&!snapshot.matched.includes(input.item)))fail('Choose an available mutual idea.');
  if(d.invitations.some(i=>i.status==='pending'))fail('Leave room for the existing invitation. No follow-up is needed.');
  if(d.invitations.some(i=>i.item===input.item&&i.status==='another_time'&&i.updated>now-(i.kind==='invite'?90:1)*86400000))fail('Give this idea some space. Choose something else.');
  if(input.kind==='time'&&(!input.when||!Number.isFinite(Date.parse(input.when))||Date.parse(input.when)<=now||Date.parse(input.when)>now+90*86400000))fail('Choose a future time within 90 days.');
  d.invitations.push({id:crypto.randomUUID(),item:input.item,ownerId:uid,kind:input.kind,status:'pending',when:input.when??null,label:input.label?.slice(0,60)??null,updated:now,hidden:false,checks:{},mineFeeling:null,ready:false});
 }else if(input.action==='respond'||input.action==='check'){
  const i=d.invitations.find(i=>i.id===input.id&&!i.hidden&&snapshot.overlaps.includes(i.item));if(!i)fail('This invitation is unavailable.');
  if(input.action==='respond'){
   if(i!.ownerId===uid||i!.status!=='pending')fail('This invitation cannot be answered.');
   const allowed=i!.kind==='invite'?['yes','later','no']:['yes','not_tonight','another_time'];if(!allowed.includes(input.response))fail('Choose one of the offered answers.');i!.status=input.response==='yes'?'yes':'another_time';i!.updated=now;
  }else{if(i!.kind!=='time'||i!.status!=='yes'||!i!.when||now<Date.parse(i!.when)-3600000||now>Date.parse(i!.when)+14400000)fail('Check in near your planned time.');i!.checks[uid]=input.feeling;if(!input.feeling){i!.status='another_time';i!.updated=now;}}
 }
 return current(d,uid,other);
 });},
 async note(){const {uid}=context();const d=structuredClone(demoStore.get().intimacy??{users:{},invitations:[]});const p=ensure(d,uid);if(!p.enabled)throw new UserFacingError('Turn on your Intimacy area first.');return p.note;},
 async saveNote(input){mutate((d,uid)=>{const p=ensure(d,uid);if(!p.enabled)throw new UserFacingError('Turn on your Intimacy area first.');p.note.repeat=input.repeat.slice(0,1000);p.note.change=input.change.slice(0,1000);});},
 async coach(message){return mutate((d,uid)=>{const p=ensure(d,uid);if(!p.enabled)throw new UserFacingError('Turn on your Intimacy area first.');const topic=coachTopic(message);const reply=renderGuideReply(topic,p.note.history,message);p.note.history.push({role:'user',content:message.slice(0,1500)},{role:'assistant',content:reply});p.note.history=p.note.history.slice(-40);return {reply,source:'guide' as const};});},
};
