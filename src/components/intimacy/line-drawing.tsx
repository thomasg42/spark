import type {IntimacyCard} from '@shared/intimacy.ts';
export function LineDrawing({kind,title}:{kind:IntimacyCard['diagram'];title:string}){
 return <svg viewBox="0 0 240 120" role="img" aria-label={`${title}: neutral line drawing of two adults`} className="h-32 w-full rounded-2xl bg-accent-soft" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
 {kind==='side'?<><path d="M22 90h196M25 97v8m190-8v8"/><circle cx="51" cy="63" r="10"/><path d="m61 71 53 8 53-8 27 8M67 74l16 12h40"/><circle cx="63" cy="38" r="10"/><path d="m74 47 51 7 51-6 22 7M81 49l17 11h35"/></>:<><circle cx="70" cy="31" r="12"/><circle cx="170" cy="31" r="12"/><path d="M70 43v30m100-30v30"/>{kind==='walk'?<path d="m70 52-21 17m21-17 35 15m65-15-35 15m35-15 20 17M70 73l-18 33m18-33 17 29m83-29-17 33m17-33 18 29"/>:<><path d="m70 51 25 14 15-4m60-10-25 14-15-4M70 73h25v30m75-30h-25v30M42 80h44m68 0h44M46 82v23m148-23v23"/>{kind==='talk'&&<path d="M104 22h31v19l-10-6h-21z"/>}</>}</>}
 </svg>;
}
export function GuideAvatar(){return <svg viewBox="0 0 64 64" aria-hidden className="h-14 w-14 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="32" cy="32" r="29" fill="var(--color-accent-soft, #fae9df)"/><path d="M15 52c3-13 31-13 34 0M22 21c1-10 20-10 20 0v9c0 13-20 13-20 0zM27 27h1m8 0h1m-10 8q5 4 10 0"/></svg>;}
