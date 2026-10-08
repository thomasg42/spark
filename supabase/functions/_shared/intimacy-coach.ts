import {COACH_REPLIES,coachTopic,renderGuideReply,type CoachTopic,type IntimacyNote,type IntimacyState} from './intimacy.ts';
import {INTIMACY_SYSTEM} from './intimacy-prompts.ts';
import type {JsonGenerator} from './llm.ts';
const priority=new Set<CoachTopic>(['crisis','pressure','boundaries','private','safety']);
export async function intimacyReply(message:string,state:IntimacyState,note:IntimacyNote,generate:JsonGenerator|null,aiConsent:boolean){
 let topic=coachTopic(message);let source:'guide'|'claude'='guide';
 if(!priority.has(topic)&&generate&&aiConsent){
  const choices=Object.keys(COACH_REPLIES);
  const generated=await generate({system:INTIMACY_SYSTEM,user:JSON.stringify({message,history:note.history.slice(-20),ownAnswers:state.answers,ownDesire:state.desire,overlaps:state.overlaps}),schema:{type:'object',additionalProperties:false,properties:{topic:{type:'string',enum:choices}},required:['topic']},maxTokens:200,effort:'low'});
  if(generated.ok&&generated.json&&typeof generated.json==='object'&&'topic' in generated.json&&choices.includes(String(generated.json.topic))){topic=String(generated.json.topic) as CoachTopic;source='claude';}
 }
 // No model prose or URL is ever rendered. Unknown responses fail closed.
 const reply=renderGuideReply(topic,note.history,message);
 return {reply,source};
}
