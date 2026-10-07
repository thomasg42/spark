"use client";
/**
 * Whether the person turned on AI (Claude) for their Spark Buddy, remembered per
 * person on this device. Unset means "not asked yet", which counts as OFF: nothing
 * they say or answered is sent to AI until they say yes. The demo never uses AI.
 */
import { useCallback, useEffect, useState } from "react";

const key = (userId: string) => `spark-buddy-ai:${userId}`;

export function readAiConsent(userId: string): boolean | null {
  try {
    const v = localStorage.getItem(key(userId));
    return v === "on" ? true : v === "off" ? false : null;
  } catch {
    return null;
  }
}

export function useAiConsent(userId: string | null | undefined) {
  const [consent, setConsent] = useState<boolean | null>(null);
  useEffect(() => {
    if (userId) setConsent(readAiConsent(userId));
  }, [userId]);
  const set = useCallback(
    (on: boolean) => {
      setConsent(on);
      try {
        if (userId) localStorage.setItem(key(userId), on ? "on" : "off");
      } catch {
        // storage blocked: the choice lasts for this visit
      }
    },
    [userId],
  );
  return { consent, aiOn: consent === true, set };
}
