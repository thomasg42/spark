import {RequireStage} from "@/components/require-stage";
import {ActivitiesScreen} from "@/components/plans/plans-screen";
export const metadata={title:"Activities"};
export default function Page(){return <RequireStage allow="ready"><ActivitiesScreen/></RequireStage>;}
