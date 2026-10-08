import {RequireStage} from '@/components/require-stage';
import {PeopleScreen} from '@/components/people/people-screen';
export const metadata={title:'Family & Friends'};
export default function Page(){return <RequireStage allow="ready"><PeopleScreen/></RequireStage>;}
