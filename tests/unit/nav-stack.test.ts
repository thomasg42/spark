// @vitest-environment jsdom
/**
 * Back navigation (Thomas, 2026-10-08): open Spark Buddy, then "What Buddy may
 * share", go back, and the phone's swipe-back looped into the screen you just
 * left, because the ‹ arrow OPENED its target as a new page. The arrow, the
 * tabs and the swipe now share one back stack.
 */
import { EDGE_PX, isBackSwipe, isBackTo, nextStack, normalizePath, parentPath, readStack, recordVisit, stackForLoad, swipeBackTarget } from "@/lib/ui/nav-stack";

describe("the app's back stack", () => {
  it("Us → Spark Buddy → What Buddy may share → back: a real back, so nothing loops", () => {
    let stack: string[] = [];
    for (const p of ["/us/", "/us/buddy/", "/us/buddy/sharing/"]) stack = nextStack(stack, p);
    expect(isBackTo(stack, "/us/buddy/")).toBe(true); // the ‹ Spark Buddy arrow goes back
    stack = nextStack(stack, "/us/buddy/");
    expect(stack).toEqual(["/us/", "/us/buddy/"]);
    expect(isBackTo(stack, "/us/")).toBe(true); // and ‹ Us goes back again
    stack = nextStack(stack, "/us/");
    expect(stack).toEqual(["/us/"]);
  });

  it("opens the target fresh when you arrived some other way (a link, a reload)", () => {
    expect(isBackTo(["/us/buddy/sharing/"], "/us/buddy/")).toBe(false);
    expect(isBackTo(["/home/", "/us/buddy/"], "/us/")).toBe(false);
  });

  it("treats /us/buddy, /us/buddy/ and /us/buddy/?x=1 as one screen, and stays bounded", () => {
    expect(normalizePath("/us/buddy")).toBe("/us/buddy/");
    expect(normalizePath("/us/buddy/?x=1#y")).toBe("/us/buddy/");
    expect(nextStack(["/us/buddy/"], "/us/buddy")).toEqual(["/us/buddy/"]);
    let stack: string[] = [];
    for (let i = 0; i < 50; i++) stack = nextStack(stack, `/p${i}/`);
    expect(stack).toHaveLength(30);
  });

  it("swipe-back goes back in history, else up to the parent screen, else nowhere", () => {
    expect(swipeBackTarget(["/us/", "/us/buddy/"], "/us/buddy/", true)).toBe("history");
    expect(swipeBackTarget(["/us/buddy/sharing/"], "/us/buddy/sharing/", true)).toBe("/us/buddy/");
    expect(swipeBackTarget(["/home/"], "/home/", false)).toBeNull();
    expect(parentPath("/checkin/pulse/")).toBe("/checkin/");
    expect(parentPath("/home/")).toBe("/");
  });

  it("only a deliberate rightward swipe from the left edge counts", () => {
    expect(isBackSwipe({ x: 5, y: 300 }, { x: 120, y: 310 })).toBe(true);
    expect(isBackSwipe({ x: EDGE_PX + 40, y: 300 }, { x: 200, y: 300 })).toBe(false); // not from the edge
    expect(isBackSwipe({ x: 5, y: 300 }, { x: 40, y: 300 })).toBe(false); // too short
    expect(isBackSwipe({ x: 5, y: 300 }, { x: 90, y: 500 })).toBe(false); // a scroll, not a swipe
  });

  it("a fresh load from outside starts clean, so ‹ back never leaves Spark; a reload keeps the stack", () => {
    expect(stackForLoad(["/us/", "/us/buddy/"], "navigate")).toEqual([]);
    expect(stackForLoad(["/us/", "/us/buddy/"], "reload")).toEqual(["/us/", "/us/buddy/"]);
    expect(stackForLoad(["/us/"], "back_forward")).toEqual(["/us/"]);
    expect(stackForLoad(["/us/"], undefined)).toEqual(["/us/"]);
  });

  it("survives blocked storage", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(readStack()).toEqual([]);
      expect(() => recordVisit("/us/")).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
