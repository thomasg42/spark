"use client";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-provider";
import { Button, ButtonLink, Card, Notice, PageHeader } from "@/components/ui";

export default function DemoOptions() {
  const { backend, refresh } = useApp();
  const router = useRouter();
  const demo = backend.demo;
  if (!demo) {
    return (
      <>
        <PageHeader title="Demo" />
        <Notice title="This copy of Spark is connected to a real server, so demo controls are off." />
        <ButtonLink href="/" className="mt-4">
          Home
        </ButtonLink>
      </>
    );
  }
  return (
    <>
      <PageHeader title="Demo options" subtitle="Everything here stays in this browser." />
      <Card>
        <p className="font-semibold text-ink">View as</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {demo.personas.map((p) => (
            <Button
              key={p.id}
              variant={demo.actingAs() === p.id ? "primary" : "secondary"}
              onClick={async () => {
                demo.actAs(p.id);
                await refresh();
                router.push("/home/");
              }}
            >
              {p.name}
            </Button>
          ))}
        </div>
      </Card>
      <Card className="mt-4">
        <p className="font-semibold text-ink">Start over</p>
        <p className="mt-1 text-sm text-muted">Restore the sample couple, or start fresh with two empty accounts to try pairing.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              demo.reset(false);
              await refresh();
              router.push("/home/");
            }}
          >
            Restore sample couple
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              demo.reset(true);
              demo.actAs(demo.personas[0]!.id);
              await refresh();
              router.push("/welcome/profile/");
            }}
          >
            Fresh start
          </Button>
        </div>
      </Card>
    </>
  );
}
