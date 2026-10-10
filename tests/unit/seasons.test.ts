import {describe,it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {SEASONS,seasonOf,seasonUrl,type Season} from '@/lib/domain/seasons';
const d=(m:number,day:number)=>new Date(2026,m-1,day);
describe('seasons (northern hemisphere)',()=>{
 it.each([[3,19,'winter'],[3,20,'spring'],[6,20,'spring'],[6,21,'summer'],[9,21,'summer'],[9,22,'fall'],[12,20,'fall'],[12,21,'winter'],[1,1,'winter']] as const)('%i/%i is %s',(m,day,s)=>expect(seasonOf(d(m,day))).toBe(s));
 it('every scene is a local original SVG with no images or links',()=>{for(const s of Object.keys(SEASONS) as Season[]){const f='public/'+SEASONS[s].file;expect(existsSync(f)).toBe(true);const svg=readFileSync(f,'utf8');expect(svg).not.toMatch(/<image|https?:\/\/(?!www\.w3\.org)/);}});
 it('honours the Pages base path',()=>expect(seasonUrl('fall','/spark')).toBe('/spark/seasons/fall.svg'));
});
