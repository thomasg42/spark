import { UserFacingError, type AppreciationNote, type Backend } from "../types";
import { cleanNote } from "../live/notes";
import { demoStore, me, myCouple, newId, nowIso, tick } from "./store";

/** Demo appreciation notes: shared by the couple; only the author can delete one. */

const copy = (n: AppreciationNote): AppreciationNote => ({ ...n });
const newestFirst = (a: AppreciationNote, b: AppreciationNote) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

export const notes: Backend["notes"] = {
  async list() {
    await tick(80);
    me();
    myCouple();
    return [...demoStore.get().notes].sort(newestFirst).map(copy);
  },

  async send(body) {
    await tick();
    const text = cleanNote(body);
    const uid = me();
    myCouple();
    return demoStore.update((s) => {
      const note: AppreciationNote = { id: newId(), authorId: uid, body: text, createdAt: nowIso() };
      s.notes.push(note);
      return copy(note);
    });
  },

  async remove(id) {
    await tick(80);
    const uid = me();
    myCouple();
    demoStore.update((s) => {
      const index = s.notes.findIndex((n) => n.id === id);
      if (index < 0 || s.notes[index]!.authorId !== uid) throw new UserFacingError("You can only delete notes you wrote.");
      s.notes.splice(index, 1);
    });
  },
};
