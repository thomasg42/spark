'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useApp} from '@/components/app-provider';
import {Card,Button,Notice,TextField} from '@/components/ui';
import {useIntimacy} from './use-intimacy';
export function IntimacySettings(){const {profile,backend,refresh}=useApp();const {data,error,pending,act}=useIntimacy();const [adult,setAdult]=useState(false);const [pronouns,setPronouns]=useState(profile?.pronouns??'');const [saved,setSaved]=useState('');
 useEffect(()=>setPronouns(profile?.pronouns??''),[profile?.pronouns]);
 return <Card className="my-4"><h2 className="text-xl font-bold">Your Intimacy area</h2><p className="my-3 text-sm text-muted">For adults 18 and older. Each person chooses independently. Turning this off removes shared options without sending a notice. Private choices and declines are never attributed to you.</p>{error&&<Notice tone="danger" title={error}/>}<label className="my-3 flex items-center gap-3"><input type="checkbox" checked={adult} onChange={e=>setAdult(e.target.checked)}/>I confirm I am 18 or older</label><Button loading={pending} disabled={!data||(!data.enabled&&!adult)} onClick={()=>void act({action:'consent',enabled:!data?.enabled,adult})}>{data?.enabled?'Turn off Intimacy':'Enable my Intimacy tab'}</Button>{data?.enabled&&<Link className="ml-4 font-semibold underline" href="/intimacy/">Open Intimacy</Link>}<div className="mt-5"><TextField label="Your pronouns (optional)" value={pronouns} onChange={setPronouns} maxLength={40}/><Button variant="secondary" className="mt-2" onClick={async()=>{try{await backend.profiles.update({pronouns:pronouns.trim()||null});await refresh();setSaved('Pronouns saved.');}catch{setSaved('Could not save pronouns.');}}}>Save pronouns</Button><p role="status" className="mt-2 text-sm">{saved}</p></div></Card>;
}
