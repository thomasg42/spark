"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Backend } from "@/lib/backend";

/** Auth events invalidate this viewer synchronously, before the provider finishes refreshing. */
export function useAttentionViewer(backend: Backend, viewerId: string) {
  const permitted = useRef(true);
  const [valid, setValid] = useState(true);
  useEffect(() => {
    permitted.current = true;
    const unsubscribe = backend.auth.onChange((user) => {
      if (user?.id !== viewerId) {
        permitted.current = false;
        setValid(false);
      }
    });
    return () => {
      permitted.current = false;
      unsubscribe();
    };
  }, [backend, viewerId]);
  const current = useCallback(() => permitted.current && (!backend.demo || backend.demo.actingAs() === viewerId), [backend, viewerId]);
  return { valid, current };
}
