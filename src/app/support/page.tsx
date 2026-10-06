import { CrisisResources } from "@/components/crisis-resources";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <>
      <PageHeader title="Support" subtitle="Spark helps couples stay connected. It is not therapy, counseling, or an emergency service." />
      <CrisisResources />
      <Card className="mt-4">
        <h2 className="text-lg font-bold text-ink">When to talk to a professional</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink">
          <li>The same fight keeps coming back and neither of you feels heard.</li>
          <li>Trust has been broken and you both want to rebuild it.</li>
          <li>Past experiences or trauma are showing up in the relationship.</li>
          <li>You feel afraid, controlled, or unsafe. Please reach out to the hotline above.</li>
        </ul>
        <p className="mt-3 text-muted">A licensed couples or family therapist can help. Many offer video sessions and sliding-scale fees.</p>
      </Card>
    </>
  );
}
