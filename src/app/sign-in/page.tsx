"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { HOME_FOR } from "@/components/require-stage";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, PageHeader, TextField } from "@/components/ui";
import { signInAs } from "@/lib/backend/demo/auth";
import { messageOf } from "@/lib/backend/types";

function DemoSignIn() {
  const { backend, refresh } = useApp();
  const router = useRouter();
  const personas = backend.demo!.personas;
  const go = async (id: string) => {
    signInAs(id);
    await refresh();
    router.push("/home/");
  };
  return (
    <>
      <PageHeader title="Explore the demo" subtitle="Pick a partner. You can switch any time from the banner at the top." />
      <div className="grid gap-3 sm:grid-cols-2">
        {personas.map((p) => (
          <Card key={p.id}>
            <p className="text-lg font-bold text-ink">{p.name}</p>
            <p className="mb-4 text-sm text-muted">Sample account</p>
            <Button className="w-full" onClick={() => go(p.id)}>
              Continue as {p.name}
            </Button>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <p className="font-semibold text-ink">Want to see pairing from scratch?</p>
        <p className="mt-1 text-sm text-muted">Start a fresh demo with two empty accounts. Make a profile as Alex, invite, then switch to Sam and join.</p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={async () => {
            backend.demo!.reset(true);
            backend.demo!.actAs(personas[0]!.id);
            await refresh();
            router.push("/welcome/profile/");
          }}
        >
          Start a fresh demo
        </Button>
      </Card>
      <Notice className="mt-4" title="This demo has no server">
        Everything you type stays in this browser. Real accounts use email sign-in with Supabase.
      </Notice>
    </>
  );
}

function LiveSignIn() {
  const { backend, refresh } = useApp();
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "password">("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPending(false);
    }
  };

  const afterSignIn = async () => {
    await refresh();
    router.push("/home/");
  };

  return (
    <>
      <PageHeader title="Sign in" subtitle="Use your email. New here? The same step creates your account." />
      <Card>
        {mode === "link" && !sent ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await backend.auth.sendMagicLink(email);
                setSent(true);
              });
            }}
          >
            <TextField label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} required autoFocus />
            <Button type="submit" className="w-full" loading={pending} disabled={!email.includes("@")}>
              Email me a sign-in link
            </Button>
          </form>
        ) : null}

        {mode === "link" && sent ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await backend.auth.verifyEmailCode(email, code);
                await afterSignIn();
              });
            }}
          >
            <Notice tone="success" title="Check your email">
              Tap the link we sent to {email}. Or type the 6-digit code here, which works even if the email opens on another device.
            </Notice>
            <div className="mt-4">
              <TextField label="6-digit code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" />
            </div>
            <Button type="submit" className="w-full" loading={pending} disabled={code.length !== 6}>
              Sign in with code
            </Button>
            <Button variant="ghost" className="mt-2 w-full" onClick={() => setSent(false)}>
              Use a different email
            </Button>
          </form>
        ) : null}

        {mode === "password" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await backend.auth.signInWithPassword(email, password);
                await afterSignIn();
              });
            }}
          >
            <TextField label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={setEmail} required />
            <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={setPassword} required />
            <Button type="submit" className="w-full" loading={pending}>
              Sign in
            </Button>
          </form>
        ) : null}

        {error ? <Notice tone="danger" className="mt-4" title={error} /> : null}

        <Button variant="ghost" className="mt-3 w-full" onClick={() => { setMode(mode === "link" ? "password" : "link"); setError(null); }}>
          {mode === "link" ? "Use a password instead" : "Email me a link instead"}
        </Button>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">Spark is for adults 18 and older.</p>
    </>
  );
}

export default function SignInPage() {
  const { backend, stage } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (stage !== "loading" && stage !== "signedOut") router.replace(HOME_FOR[stage]);
  }, [stage, router]);
  return backend.mode === "demo" ? <DemoSignIn /> : <LiveSignIn />;
}
