import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./client";
import { deleteReport, insertReport, placesReportedWithin, recentReports } from "./reports";
import * as schema from "./schema";

// 쿼리 빌더는 드라이버와 상관없이 같고 타입만 드라이버마다 다르다.
const pglite = drizzle(new PGlite(), { schema });
const db = pglite as unknown as Db;
const THREE_MINUTES = 3 * 60 * 1000;

beforeAll(async () => {
  await migrate(pglite, { migrationsFolder: "drizzle" });
});

describe("report queries", () => {
  it("returns the new id and deletes only that report", async () => {
    const input = { place: "kawaguchiko", grade: "clear", observedAt: new Date("2026-10-01T03:00:00Z"), note: null } as const;
    const first = await insertReport(db, input);
    const second = await insertReport(db, { ...input, place: "saiko" });
    expect(second).toBeGreaterThan(first);

    await deleteReport(db, first);
    const ids = (await recentReports(db, 20)).map((report) => report.id);
    expect(ids).toContain(second);
    expect(ids).not.toContain(first);
  });

  it("lists places by entry time within the window, not by observed time", async () => {
    await pglite.delete(schema.humanReport);
    const longAgo = new Date("2020-01-01T00:00:00Z");
    await pglite.insert(schema.humanReport).values([
      // 관측은 오래전이지만 방금 입력했다
      { place: "motosuko", grade: "bad", observedAt: longAgo },
      { place: "shojiko", grade: "bad", observedAt: longAgo, createdAt: new Date(Date.now() - 10 * 60 * 1000) },
    ]);
    expect(await placesReportedWithin(db, THREE_MINUTES)).toEqual(["motosuko"]);
  });
});
