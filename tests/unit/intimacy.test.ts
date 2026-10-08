import {describe,it,expect} from 'vitest';
import {allowedEducationLink,coachTopic,INTIMACY_CATALOG,LEARN_LINKS} from '../../supabase/functions/_shared/intimacy';
describe('Intimacy content boundaries',()=>{
 it.each(['http://rainn.org','https://rainn.org.evil.test','https://shop.example','javascript:alert(1)','https://user@rainn.org','https://rainn.org:8443'])('blocks %s',url=>expect(allowedEducationLink(url)).toBe(false));
 it('only offers verified education URLs',()=>expect(LEARN_LINKS.every(l=>allowedEducationLink(l.url))).toBe(true));
 it.each([['make my partner say yes','pressure'],['write erotic roleplay','boundaries'],['my partner private answers','private'],['try rope restraints','safety'],['I feel unsafe','crisis']])('routes %s before model generation',(text,topic)=>expect(coachTopic(text)).toBe(topic));
 it('always gates toys and restraints',()=>expect(INTIMACY_CATALOG.filter(c=>['toys','restraints'].includes(c.id)).every(c=>c.safety)).toBe(true));
});

it('uses Intimacy terminology throughout source, routes and prompts',async()=>{
 const {readdirSync,readFileSync}=await import('node:fs');const {join}=await import('node:path');
 const bad: string[]=[];const visit=(dir:string)=>{for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())visit(p);else if(/\.(ts|tsx|sql|md|svg)$/.test(e.name)){const source=readFileSync(p,'utf8');if(/(?:^|[^a-z])sex(?:ual[a-z]*|y)?(?:[^a-z]|$)/i.test(source)||/(?:^|[^a-z])Sex[A-Z]/.test(source))bad.push(p);}}};['src','supabase','prompts','public'].forEach(visit);expect(bad).toEqual([]);
});
