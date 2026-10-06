"use client";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { useApp } from "@/components/app-provider";
import { Button, Card, Notice, useToast } from "@/components/ui";
import { useAction } from "@/lib/ui/hooks";

/** The sign-in email and a sign out button. */
export function AccountCard() {
  const { backend, user, refresh } = useApp();
  const router = useRouter();
  const toast = useToast();
  const headingId = useId();

  const signOut = useAction(async () => {
    await backend.auth.signOut();
    await refresh();
    return true;
  });

  const onSignOut = async () => {
    const done = await signOut.run();
    if (done) {
      toast.show("Signed out. See you soon.");
      router.push("/");
    }
  };

  return (
    <Card as="section" aria-labelledby={headingId} className="fade-up mt-4">
      <h2 id={headingId} className="text-xl font-bold text-ink">
        Account
      </h2>
      <dl className="mt-3">
        <dt className="text-sm font-semibold text-ink">Signed in as</dt>
        <dd className="mt-0.5 break-all text-ink">{user?.email ?? "No email on file"}</dd>
      </dl>
      {signOut.error ? (
        <Notice tone="danger" className="mt-3" title="Couldn't sign out.">
          {signOut.error}
        </Notice>
      ) : null}
      <Button variant="secondary" className="mt-4 w-full sm:w-auto" loading={signOut.pending} onClick={() => void onSignOut()}>
        Sign out
      </Button>
    </Card>
  );
}
