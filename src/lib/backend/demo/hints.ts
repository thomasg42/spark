import { flagActive } from "@/lib/domain/hint-moments";
import type { Backend } from "../types";
import { demoStore, me, myCouple, nowIso, tick } from "./store";

/** Demo "I'm feeling a bit distant": both see it, its owner raises or clears it, it fades after 14 days. */
export const distanceFlags: Backend["distanceFlags"] = {
  async list() {
    await tick(40);
    myCouple();
    const now = new Date();
    return demoStore.get().distanceFlags.filter((f) => flagActive(f, now)).map((f) => ({ ...f }));
  },
  async raise() {
    await tick();
    const uid = me();
    myCouple();
    demoStore.update((s) => {
      s.distanceFlags = [...s.distanceFlags.filter((f) => f.userId !== uid), { userId: uid, raisedAt: nowIso() }];
    });
  },
  async clear() {
    await tick();
    const uid = me();
    demoStore.update((s) => {
      s.distanceFlags = s.distanceFlags.filter((f) => f.userId !== uid);
    });
  },
};
