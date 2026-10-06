"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/app-provider";
import { ButtonLink, LoadingBlock, Notice, PageHeader } from "@/components/ui";
import { messageOf } from "@/lib/backend/types";

export default function AuthCallback() {
  const { backend, refresh } = useApp();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await backend.auth.completeRedirect();
        if (!active) return;
        if (!user) throw new Error("That sign-in link didn't work. Please request a new one.");
        await refresh();
        router.replace("/home/");
      } catch (e) {
        if (active) setError(messageOf(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [backend, refresh, router]);

  if (!error) return <LoadingBlock label="Signing you in…" />;
  return (
    <>
      <PageHeader title="Almost there" />
      <Notice tone="danger" title={error} />
      <ButtonLink href="/sign-in/" className="mt-4">
        Back to sign in
      </ButtonLink>
    </>
  );
}
