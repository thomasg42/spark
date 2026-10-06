import { AgreementsScreen } from "@/components/agreements/agreements-screen";
import { RequireStage } from "@/components/require-stage";

export const metadata = { title: "Agreements" };

export default function AgreementsPage() {
  return (
    <RequireStage allow="ready">
      <AgreementsScreen />
    </RequireStage>
  );
}
