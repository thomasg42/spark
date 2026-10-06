"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { RequireStage } from "@/components/require-stage";
import { Button, Card, Notice, PageHeader, TextField, useToast } from "@/components/ui";
import { appUrl } from "@/lib/config";
import { messageOf } from "@/lib/backend/types";
import { takeInvite } from "@/lib/ui/pending-invite";

function formatCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function PairFlow() {
  const { backend, couple, setCouple, refresh, profile } = useApp();
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<null | "create" | "join" | "regen" | "check">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pendingCode = takeInvite();
    if (pendingCode) setCode(pendingCode);
  }, []);

  const run = async (kind: typeof pending, fn: () => Promise<void>) => {
    setPending(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPending(null);
    }
  };

  const inviteLink = couple?.inviteCode ? appUrl(`/join/?code=${couple.inviteCode}`) : null;

  // While waiting, check now and then whether the partner has joined.
  useEffect(() => {
    if (!couple || couple.memberIds.length >= 2) return;
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [couple, refresh]);

  const share = async () => {
    if (!inviteLink || !couple?.inviteCode) return;
    const text = `Join me on Spark. Use code ${formatCode(couple.inviteCode)} or open this link:`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Join me on Spark", text, url: inviteLink });
        return;
      }
    } catch {
      return; // user cancelled the share sheet
    }
    try {
      await navigator.clipboard.writeText(`${text} ${inviteLink}`);
      toast.show("Invite copied");
    } catch {
      toast.show("Copy the code above instead", "error");
    }
  };

  if (couple && couple.memberIds.length < 2) {
    const expires = couple.inviteExpiresAt ? new Date(couple.inviteExpiresAt) : null;
    const expired = !expires || expires < new Date();
    return (
      <>
        <PageHeader title="Invite your partner" subtitle="Send them this code or link. It works once and expires in 7 days." />
        <Card className="text-center">
          {couple.inviteCode && !expired ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted">Your invite code</p>
              <p className="mt-2 font-mono text-4xl font-bold tracking-[0.2em] text-ink" aria-label={`Invite code ${couple.inviteCode.split("").join(" ")}`}>
                {formatCode(couple.inviteCode)}
              </p>
              {expires ? <p className="mt-2 text-sm text-muted">Expires {expires.toLocaleDateString()}</p> : null}
              <div className="mt-5 flex flex-col gap-2">
                <Button onClick={share}>Share invite</Button>
              </div>
            </>
          ) : (
            <Notice tone="warning" title="This invite has expired.">
              Make a new code and send it to your partner.
            </Notice>
          )}
          <Button variant="ghost" className="mt-2" loading={pending === "regen"} onClick={() => run("regen", async () => setCouple(await backend.couple.regenerateInvite()))}>
            Make a new code
          </Button>
        </Card>
        <Card className="mt-4">
          <p className="font-semibold text-ink">Waiting for your partner…</p>
          <p className="mt-1 text-sm text-muted">Once they join, Spark opens for both of you. This page checks every few seconds.</p>
          <Button variant="secondary" className="mt-3" loading={pending === "check"} onClick={() => run("check", refresh)}>
            Check now
          </Button>
          {backend.demo ? (
            <Notice className="mt-4" title="Demo tip">
              Switch to {backend.demo.personas.find((p) => p.id !== backend.demo!.actingAs())?.name} using the banner at the top, then enter this code.
            </Notice>
          ) : null}
        </Card>
        {error ? <Notice tone="danger" className="mt-4" title={error} /> : null}
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Welcome, ${profile?.nickname || profile?.displayName || "friend"}`} subtitle="Spark works with exactly two people. Start a couple, or join your partner's." />
      <Card>
        <h2 className="text-lg font-bold text-ink">I'm inviting my partner</h2>
        <p className="mt-1 text-sm text-muted">You'll get a code and a link to send them.</p>
        <Button
          className="mt-4 w-full"
          loading={pending === "create"}
          onClick={() =>
            run("create", async () => {
              setCouple(await backend.couple.create());
              await refresh();
            })
          }
        >
          Create our space
        </Button>
      </Card>
      <Card className="mt-4">
        <h2 className="text-lg font-bold text-ink">My partner invited me</h2>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run("join", async () => {
              await backend.couple.join(code);
              await refresh();
              toast.show("You're paired!");
              router.push("/home/");
            });
          }}
        >
          <TextField label="Invite code" value={code} onChange={(v) => setCode(v.toUpperCase().slice(0, 12))} autoComplete="off" placeholder="ABCD-EFGH" />
          <Button type="submit" variant="secondary" className="w-full" loading={pending === "join"} disabled={code.replace(/[^A-Za-z0-9]/g, "").length !== 8}>
            Join
          </Button>
        </form>
      </Card>
      {error ? <Notice tone="danger" className="mt-4" title={error} /> : null}
    </>
  );
}

export default function WelcomePair() {
  return (
    <RequireStage allow="needsPartner">
      <PairFlow />
    </RequireStage>
  );
}
