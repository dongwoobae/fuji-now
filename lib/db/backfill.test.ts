import { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { writeBackfillRows } from "./backfill";
import type { Db } from "./client";
import * as schema from "./schema";
import { weatherHourly, type WeatherHourlyRow } from "./schema";

// 쿼리 빌더는 드라이버와 상관없이 같고 타입만 드라이버마다 다르다.
const pglite = drizzle(new PGlite(), { schema });
const db = pglite as unknown as Db;

const row = (point: string, jst: string, overrides: Partial<WeatherHourlyRow> = {}): WeatherHourlyRow => ({
  point,
  time: new Date(`${jst}:00+09:00`),
  lowCloudCover: 0,
  midCloudCover: 0,
  highCloudCover: 0,
  precipitation: 0,
  humidity700: null,
  grade: point === "summit" ? null : "perfect",
  daylight: true,
  fetchedAt: new Date("2026-10-21T00:00:00Z"),
  source: "backfill",
  ...overrides,
});

beforeAll(async () => {
  await migrate(pglite, { migrationsFolder: "drizzle" });
  await db.insert(weatherHourly).values([
    // 습도 열을 더하기 전에 매시 기록이 쓴 행
    row("summit", "2026-10-21T11:00", { lowCloudCover: 77, source: "live" }),
    row("kawaguchiko", "2026-10-21T11:00", { lowCloudCover: 11, grade: "bad", source: "live" }),
    // 이미 습도가 있는 행
    row("summit", "2026-10-21T12:00", { lowCloudCover: 74, humidity700: 40, source: "live" }),
  ]);
});

describe("writeBackfillRows", () => {
  it("fills only missing humidity on existing rows and inserts new hours", async () => {
    await writeBackfillRows(db, [
      row("summit", "2026-10-21T11:00", { lowCloudCover: 70, humidity700: 36 }),
      row("kawaguchiko", "2026-10-21T11:00", { lowCloudCover: 30, grade: "obscured", humidity700: 70 }),
      row("summit", "2026-10-21T12:00", { humidity700: 90 }),
      row("summit", "2026-10-21T13:00", { lowCloudCover: 82, humidity700: 43 }),
    ]);
    const after = await db.select().from(weatherHourly).orderBy(asc(weatherHourly.time), asc(weatherHourly.point));
    const at = (point: string, jst: string) => after.find((r) => r.point === point && r.time.getTime() === Date.parse(`${jst}:00+09:00`));
    expect(at("summit", "2026-10-21T11:00")).toMatchObject({ lowCloudCover: 77, source: "live", humidity700: 36 });
    expect(at("kawaguchiko", "2026-10-21T11:00")).toMatchObject({ lowCloudCover: 11, grade: "bad", source: "live", humidity700: 70 });
    expect(at("summit", "2026-10-21T12:00")).toMatchObject({ lowCloudCover: 74, humidity700: 40 });
    expect(at("summit", "2026-10-21T13:00")).toMatchObject({ lowCloudCover: 82, source: "backfill", humidity700: 43 });
  });

  it("keeps humidity empty and other columns untouched when the history has no humidity", async () => {
    const time = new Date("2018-08-01T10:00:00+09:00");
    await writeBackfillRows(db, [row("summit", "2018-08-01T10:00")]);
    await writeBackfillRows(db, [row("summit", "2018-08-01T10:00", { lowCloudCover: 50 })]);
    const [summit] = await db.select().from(weatherHourly).where(eq(weatherHourly.time, time));
    expect(summit).toMatchObject({ lowCloudCover: 0, humidity700: null });
  });
});
