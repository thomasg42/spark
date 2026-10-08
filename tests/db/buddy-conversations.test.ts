import {asAnon,asUser,createDb,makePairedCouple,rows,type Db} from './harness';
let db:Db, alex:string, sam:string;
const id='11111111-1111-4111-8111-111111111111';
beforeAll(async()=>{db=await createDb();({alex,sam}=await makePairedCouple(db));});
afterAll(async()=>{await db.close();});
it('saved conversations are owner-only, including update, delete and forged ownership',async()=>{
 await asUser(db,alex,tx=>tx.query('insert into public.buddy_conversations(id,user_id,body_ciphertext) values($1,$2,$3)',[id,alex,'v1.sealed.test']));
 expect((await asUser(db,alex,tx=>rows(tx,'select * from public.buddy_conversations'))).length).toBe(1);
 expect(await asUser(db,sam,tx=>rows(tx,'select * from public.buddy_conversations'))).toEqual([]);
 expect(await asUser(db,sam,tx=>rows(tx,"update public.buddy_conversations set body_ciphertext='v1.hack' where id=$1 returning id",[id]))).toEqual([]);
 expect(await asUser(db,sam,tx=>rows(tx,'delete from public.buddy_conversations where id=$1 returning id',[id]))).toEqual([]);
 await expect(asUser(db,sam,tx=>tx.query('insert into public.buddy_conversations(id,user_id,body_ciphertext) values($1,$2,$3)',[crypto.randomUUID(),alex,'v1.hack']))).rejects.toThrow();
 await expect(asAnon(db,tx=>tx.query('select * from public.buddy_conversations'))).rejects.toThrow();
});
it('message quota is atomic, per owner, and cannot be cleared with a chat',async()=>{
 const charge=(user:string)=>asUser(db,user,tx=>rows<{n:number}>(tx,'select public.buddy_chat_charge() as n'));
 expect((await charge(alex))[0]!.n).toBe(1);
 expect((await charge(alex))[0]!.n).toBe(2);
 expect((await charge(sam))[0]!.n).toBe(1);
 await expect(asUser(db,alex,tx=>tx.query('delete from public.buddy_chat_usage'))).rejects.toThrow();
 await expect(asAnon(db,tx=>tx.query('select public.buddy_chat_charge()'))).rejects.toThrow();
});
