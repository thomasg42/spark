import {RequireStage} from "@/components/require-stage";
import {IntimacyScreen} from "@/components/intimacy/intimacy-screen";
export const metadata={title:"Intimacy"};
export default function Page(){return <RequireStage allow="ready"><IntimacyScreen view="library"/></RequireStage>;}
