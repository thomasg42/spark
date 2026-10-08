"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { useApp } from "@/components/app-provider";
import { ButtonLink, Card, LoadingBlock, PageHeader } from "@/components/ui";
import { rememberInvite } from "@/lib/ui/pending-invite";

function JoinInner() {
  const params = useSearchParams();
  const { stage } = useApp();
  const router = useRouter();
  const code = (params.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);

  useEffect(() => {
    if (code) rememberInvite(code);
    if (stage === "needsPartner") router.replace("/welcome/pair/");
    if (stage === "needsProfile") router.replace("/welcome/profile/");
    if (stage === "ready") router.replace("/home/");
  }, [code, stage, router]);

  if (stage === "loading" || stage === "needsPartner" || stage === "needsProfile" || stage === "ready") return <LoadingBlock />;
  return (
    <>
      <PageHeader title="Your partner wants to level up with you" subtitle="Hop in and let's make this relationship the best it can be. A private space for the two of you." />
      <Card>
        <p className="text-ink">
          Your invite code is <span className="font-mono font-bold tracking-widest">{code || "missing"}</span>. Sign in first, set up your profile, and we'll pair you automatically.
        </p>
        <ButtonLink href="/sign-in/" className="mt-4 w-full">
          Sign in to accept
        </ButtonLink>
      </Card>
    </>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <JoinInner />
    </Suspense>
  );
}
