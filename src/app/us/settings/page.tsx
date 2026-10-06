import { RequireStage } from "@/components/require-stage";
import { SettingsScreen } from "@/components/settings/settings-screen";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <RequireStage allow="ready">
      <SettingsScreen />
    </RequireStage>
  );
}
