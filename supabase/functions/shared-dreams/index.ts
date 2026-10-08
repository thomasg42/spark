import {createDreamsHandler,supabaseDreamsRepo} from '../_shared/shared-dreams-handler.ts';
import {sealerFromEnv} from '../_shared/answers-handler.ts';
import {makeRequestHandler} from '../_shared/http.ts';
const sealer=sealerFromEnv(Deno.env.get('ENCRYPTION_KEY'));
Deno.serve(makeRequestHandler({supabaseUrl:Deno.env.get('SUPABASE_URL')!,anonKey:Deno.env.get('SUPABASE_ANON_KEY')!,allowedOrigins:Deno.env.get('ALLOWED_ORIGINS')},async(body,ctx)=>createDreamsHandler({repo:supabaseDreamsRepo(ctx.supabase),sealer})(body,ctx)));
