import {RequireStage} from '@/components/require-stage';
import {StoryScreen} from '@/components/story/story-screen';
export const metadata={title:'Our Story'};
export default function Page(){return <RequireStage allow="ready"><StoryScreen/></RequireStage>;}
