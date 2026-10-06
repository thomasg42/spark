import { createDb } from "./harness";

describe("migrations", () => {
  it("apply cleanly on a fresh database", async () => {
    const db = await createDb();
    const res = await db.query<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename",
    );
    expect(res.rows.length).toBeGreaterThanOrEqual(14);
    for (const row of res.rows) {
      expect(row.rowsecurity, `${row.tablename} must have RLS enabled`).toBe(true);
    }
    await db.close();
  });
});
