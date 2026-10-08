export const ASK_FIRST='Ask first, and check in as you go.';
export const MENU_NOTE="Being on the menu means it’s welcome to ask. It doesn’t mean anyone owes anyone anything.";
export const EMPTY_MENU='Shared ideas appear here when they are available. Your private answers stay yours.';
export const EDUCATION_HOSTS=['rainn.org','www.rainn.org','www.plannedparenthood.org','www.nhs.uk'] as const;
export function allowedEducationLink(value:string):boolean {try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(EDUCATION_HOSTS as readonly string[]).includes(u.hostname);}catch{return false;}}
export const LEARN_LINKS=[{label:'Consent and checking in',url:'https://rainn.org/share-the-facts/consent-101-respect-boundaries-and-building-trust'},{label:'Healthy relationships',url:'https://www.plannedparenthood.org/learn/relationships/healthy-relationships'},{label:'Comfort and lubricant guidance',url:'https://www.nhs.uk/conditions/vaginal-dryness/'}];
export type Choice='yes'|'maybe'|'not_now'|'no';
export type IntimacyCard={id:string;title:string;category:string;description:string;comfort:string;pace:string;diagram:'seated'|'side'|'walk'|'talk';safety?:boolean};
export const INTIMACY_CATALOG:IntimacyCard[]=[
 {id:'quiet',title:'A little anticipation',category:'Pace & setting',description:'Choose a quiet evening together. Keep the details a small surprise only if you both welcome surprises.',comfort:'Agree on the kind of evening and its boundaries first.',pace:'Try a short, warm invitation earlier in the day.',diagram:'talk'},
 {id:'walk',title:'A walk with no agenda',category:'Affection & touch',description:'Make space to reconnect outdoors or by a window. Holding hands is a separate invitation.',comfort:'Choose a route or seated alternative that suits both bodies.',pace:'Let conversation wander. There is no next step you need to reach.',diagram:'walk'},
 {id:'music',title:'Your two-song evening',category:'Pace & setting',description:'Each choose a song and something you appreciate about the other person.',comfort:'A quiet room and comfortable seats are enough.',pace:'One song each, with a pause to listen.',diagram:'seated'},
 {id:'touch',title:'Comfortable closeness',category:'Affection & touch',description:'Ask which kind of affection feels welcome today: a hug, holding hands, or sitting nearby.',comfort:'Offer space as an equally good choice.',pace:'Check in whenever the kind of touch changes.',diagram:'seated'},
 {id:'kiss',title:'Take your time',category:'Kissing & warm-up',description:'Talk about whether kissing is welcome today and how each person likes to set the pace.',comfort:'Anyone can pause or change their mind.',pace:'Agree on a stopping point without expectations beyond it.',diagram:'talk'},
 {id:'side',title:'Side-by-side comfort',category:'Positions & movement',description:'A neutral positioning idea: rest beside each other with space to move freely. The drawing shows comfortable rest, not an activity prescription.',comfort:'Use pillows if helpful; stop for pain or numbness. Ask a clinician about persistent discomfort.',pace:'Try a comfortable resting position, then ask how it feels.',diagram:'side'},
 {id:'seated',title:'Face-to-face, supported',category:'Positions & movement',description:'Sit in separate supported seats facing each other for a relaxed conversation or a welcome handhold.',comfort:'Keep feet supported and avoid straining your back or knees.',pace:'Choose closeness together; leave room to move away.',diagram:'seated'},
 {id:'massage',title:'A relaxing shoulder break',category:'Slow-build ideas',description:'Ask about a gentle shoulder massage. Decide the area, pressure and duration together.',comfort:'Avoid painful areas; stop immediately if it hurts.',pace:'Take turns asking what feels comfortable. A massage can simply remain a massage.',diagram:'seated'},
 {id:'shower',title:'A fresh-start ritual',category:'Slow-build ideas',description:'Discuss whether a shared wash-up ritual feels welcome, or choose separate showers followed by a quiet tea together.',comfort:'Avoid slippery surfaces and anything that makes balance difficult.',pace:'Keep it unhurried and optional.',diagram:'talk'},
 {id:'sensory',title:'Set the atmosphere',category:'Slow-build ideas',description:'Choose a playlist, soft lighting or a familiar scent together. Keep sight and movement unrestricted.',comfort:'Check sensitivities; leave candles unattended only when unlit.',pace:'Change one detail and ask whether it helps.',diagram:'talk'},
 {id:'toys',title:'Toys: a conversation first',category:'Toys & play basics',description:'Discuss questions, materials and care before choosing a product. Follow the maker’s cleaning and compatibility instructions; never improvise with household objects.',comfort:'Check for damage. Avoid sharing without appropriate cleaning and a fresh barrier where applicable. Ask a qualified health professional about suitability.',pace:'No purchases or product recommendations here. Reading does not commit either person to trying anything.',diagram:'talk',safety:true},
 {id:'restraints',title:'Boundaries before restraint topics',category:'Restraints & power play',description:'Start with a conversation about boundaries, freely chosen roles and the right to stop. This library does not teach tying, immobilization or higher-risk techniques.',comfort:'Sober only. A safety checklist does not remove risk. Seek qualified in-person education before considering any restraint.',pace:'Discuss only; no surprise restriction or pressure.',diagram:'talk',safety:true},
 {id:'language',title:'Words that feel welcome',category:'Talk & language',description:'Ask which affectionate words feel good and which to avoid. Warm, respectful wording is the default.',comfort:'No assumed roles, degradation or gender rules. This guide stays non-explicit.',pace:'Agree before changing your language, and check again later.',diagram:'talk'},
 {id:'fantasy',title:'Share an idea, not an obligation',category:'Fantasy sharing',description:'Ask whether your partner wants to hear a non-graphic idea. Listening does not mean agreeing to act it out.',comfort:'Keep the discussion adult, respectful and easy to stop.',pace:'Start with the feeling you want, such as closeness or novelty.',diagram:'talk'},
 {id:'boundaries',title:'A boundary conversation',category:'Hard nos',description:'You can keep a boundary private, or state it directly when needed. Nobody needs to defend a no.',comfort:'Private No and Not now answers never appear on the shared menu.',pace:'Thank each other for clarity; do not bargain.',diagram:'talk'},
];
export const SAFETY_COPY=[
 'Sober only. Agree freely on boundaries before any intense play. Stop if either person is unsure.',
 'Agree on a clear stop word and traffic lights: green means check and continue, yellow means pause and change, red means stop. Silence is never a yes.',
 'Never leave a restrained person alone. Keep safety shears accessible. Avoid the neck and joints; check circulation and stop for pain, numbness, coldness or discoloration.',
 'Plan release, comfort and aftercare together. This is a starting checklist, not training or a guarantee of safety. This app provides no restraint techniques.',
 'For toys, read cleaning instructions and material guidance. Use only a lubricant compatible with the product and any barrier. Water-based options are often suitable; check the labels and ask a clinician when unsure.',
];
export type IntimacyInvitation={id:string;item:string;ownerId:string;kind:'invite'|'time';status:'pending'|'yes'|'another_time'|'ended';when:string|null;label:string|null;mineFeeling:boolean|null;ready:boolean};
export type IntimacyState={enabled:boolean;muted:boolean;desire:number|null;answers:Record<string,{choice:Choice;pending:Choice|null;effectiveAt:string|null}>;overlaps:string[];matched:string[];sparks:string[];invitations:IntimacyInvitation[]};
export type IntimacyAction={action:'list'}|{action:'consent';enabled:boolean;adult?:boolean}|{action:'answer';item:string;choice:Choice}|{action:'preferences';muted?:boolean;desire?:number}|{action:'spark';item:string}|{action:'propose';item:string;kind:'invite'|'time';when?:string;label?:string}|{action:'respond';id:string;response:'yes'|'later'|'no'|'not_tonight'|'another_time'}|{action:'check';id:string;feeling:boolean};
export type IntimacyNote={repeat:string;change:string;history:Array<{role:'user'|'assistant';content:string}>};
export type IntimacyApi={act(input:IntimacyAction):Promise<IntimacyState>;note():Promise<IntimacyNote>;saveNote(input:Pick<IntimacyNote,'repeat'|'change'>):Promise<void>;coach(message:string,aiConsent:boolean):Promise<{reply:string;source:'guide'|'claude'}>};
export const COACH_REPLIES={
 pressure:'A no stays a no. Do not try to change a reluctant answer. You can say: “Would you like to talk about what feels comfortable? It is okay to pass.” If you feel pressured or unsafe, RAINN is 1-800-656-4673 and the DV hotline is 1-800-799-7233.',
 crisis:'Your safety comes first. If there is immediate danger, call 911. In the US, 988 offers crisis support. RAINN: 1-800-656-4673. DV hotline: 1-800-799-7233. Reach someone you trust when it is safe.',
 boundaries:'I can help with non-explicit intimacy, communication and consent. I cannot create erotica or roleplay. Try naming the feeling you want: closeness, calm, or a little novelty.',
 safety:'Sober only. Read the safety page before discussing restraints or intense play. Agree on boundaries and a stop signal, and do not improvise techniques. Would a conversation about boundaries be a better first step?',
 private:'Your partner’s private answers stay private. I cannot tell you what they chose or infer what they want. Ask one low-pressure question about today instead.',
 anticipation:'Keep the mystery in the small details, with the boundaries agreed first. Try: “I have a quiet evening idea for us. Want a small surprise, or shall we choose together?” Their answer sets the pace.',
 mismatch:'Different levels of desire do not make either person wrong. Choose a calm moment to ask what kind of closeness feels welcome today, including space. The aim is understanding, not securing a yes.',
 feedback:'Start with one thing you appreciated, then one change you would welcome. Ask: “How did that feel for you?” Listen without defending or bargaining.',
 rut:'Choose one small change from your shared menu, then ask about it directly. A mutual spark is interest in talking, not a promise. What would make time together feel less rushed?',
 next:'Keep the next move simple: ask “Would you like to keep going, change something, or pause?” A caring partner checks in; nobody has to guess or perform certainty.',
};
export type CoachTopic=keyof typeof COACH_REPLIES;
export function coachTopic(message:string):CoachTopic {
 const m=message.toLowerCase();
 if(/suicid|overdose|assault|abuse|unsafe|kill myself/.test(m))return 'crisis';
 if(/make .* (agree|yes)|convince|persuad|guilt|reluctant|pressure|won.t agree|wear .*down|said no/.test(m))return 'pressure';
 if(/erotic|explicit|role.?play|naughty|dirty talk|porn/.test(m))return 'boundaries';
 if(/partner.*(private|answer)|what did.*(choose|answer)|spy|location|track.*partner/.test(m))return 'private';
 if(/restraint|rope|tied|tie .*up|bondage/.test(m))return 'safety';
 if(/desire|mismatch|not in.*mood/.test(m))return 'mismatch';
 if(/feedback|felt|change|defens/.test(m))return 'feedback';
 if(/anticip|surprise|excite|mystery/.test(m))return 'anticipation';
 if(/rut|boring|routine/.test(m))return 'rut';return 'next';
}

export function renderGuideReply(topic:CoachTopic,history:IntimacyNote['history'],message:string):string {
 const reply=COACH_REPLIES[topic];
 if(['crisis','pressure','boundaries','safety','private'].includes(topic))return reply;
 const repeats=history.filter(m=>m.role==='user'&&m.content.trim().toLowerCase()===message.trim().toLowerCase()).length;
 if(repeats>=2)return 'This keeps coming up, so let’s look underneath the idea itself. Are you hoping for closeness, reassurance, or a change in routine? Name that need privately first, then decide whether to ask for a calm conversation.';
 if(history.at(-1)?.content===reply)return 'We have come back to this. Before choosing another idea, name what you want to feel more of: closeness, calm, or novelty. Then ask about one small step, with room for a no.';
 return reply;
}
