"use client";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { LoadingBlock } from "./ui";
import { useApp, type Stage } from "./app-provider";

const HOME_FOR: Record<Exclude<Stage, "loading">, string> = {
  signedOut: "/sign-in/",
  needsProfile: "/welcome/profile/",
  needsPartner: "/welcome/pair/",
  ready: "/home/",
};

/**
 * Renders children only when the user is at one of the allowed stages; otherwise
 * sends them to the right step (sign in -> profile -> pair -> app).
 */
export function RequireStage({ allow, children }: { allow: Stage | Stage[]; children: ReactNode }) {
  const { stage } = useApp();
  const router = useRouter();
  const allowed = Array.isArray(allow) ? allow : [allow];
  const ok = stage !== "loading" && allowed.includes(stage);

  useEffect(() => {
    if (stage !== "loading" && !allowed.includes(stage)) router.replace(HOME_FOR[stage]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, router, allowed.join(",")]);

  if (!ok) return <LoadingBlock />;
  return <>{children}</>;
}

export { HOME_FOR };
