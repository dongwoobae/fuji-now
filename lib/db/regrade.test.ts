import { PGlite } from "@electric-sql/pglite";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { estimateGrade } from "../visibility";
import { changedGrades, dateSpan, readLayerRows, writeGrades, type LayerRow } from "./regrade";
import { forecast, weatherHourly } from "./schema";

const db = drizzle(new PGlite());
const fetchedAt = new Date("2026-10-01T00:00:00Z");
const layers = (low: number, mid = 0) => ({ lowCloudCover: low, midCloudCover: mid, highCloudCover: 0, precipitation: 0, daylight: true, fetchedAt });

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  // 일본 2018-08-01 10시와 11시. 옛 기준(가림<60이면 구름 걸림)으로 매겨 둔 등급이다.
  const ten = new Date("2018-08-01T10:00:00+09:00");
  const eleven = new Date("2018-08-01T11:00:00+09:00");
  await db.insert(weatherHourly).values([
    { point: "summit", time: ten, ...layers(0, 40), grade: null, source: "backfill" },
    { point: "kawaguchiko", time: ten, ...layers(5), grade: "cloudy", source: "backfill" },
    // 이미 새 기준과 같은 등급은 고치지 않는다
    { point: "saiko", time: ten, ...layers(90), grade: "bad", source: "backfill" },
    // 정상 행이 없는 시각은 등급을 비운다
    { point: "kawaguchiko", time: eleven, ...layers(0), grade: "perfect", source: "backfill" },
    // 다음 달(일본 9월 1일 0시, UTC 8월 31일)은 8월 구간에 들어가지 않는다
    { point: "summit", time: new Date("2018-09-01T00:00:00+09:00"), ...layers(0), grade: null, source: "backfill" },
    { point: "kawaguchiko", time: new Date("2018-09-01T00:00:00+09:00"), ...layers(0), grade: "bad", source: "backfill" },
  ]);
  await db.insert(forecast).values([
    { point: "summit", targetTime: ten, leadHours: 3, ...layers(0, 15), grade: null },
    { point: "kawaguchiko", targetTime: ten, leadHours: 3, ...layers(0), grade: "perfect" },
    { point: "summit", targetTime: ten, leadHours: 24, ...layers(0, 70), grade: null },
    { point: "kawaguchiko", targetTime: ten, leadHours: 24, ...layers(0), grade: "perfect" },
  ]);
});

describe("changedGrades", () => {
  const row = (point: string, low: number, grade: LayerRow["grade"], mid = 0): LayerRow => ({
    point,
    time: "2018-08-01T01:00:00Z",
    lead: null,
    low,
    mid,
    high: 0,
    precip: 0,
    grade,
  });

  it("pairs each lake hour with the summit of the same time and returns only changed grades", () => {
    const expected = estimateGrade({ low: 5, mid: 0, high: 0, precipitation: 0 }, { low: 0, mid: 40, high: 0 });
    expect(changedGrades([row("summit", 0, null, 40), row("kawaguchiko", 5, "cloudy"), row("saiko", 90, "bad")])).toEqual([
      { point: "kawaguchiko", time: "2018-08-01T01:00:00Z", lead: null, grade: expected },
    ]);
  });
});

describe("regrade against the database", () => {
  it("rewrites weather_hourly grades inside the Japan-date window only", async () => {
    const rows = await readLayerRows(db, "weather_hourly", "2018-08-01", "2018-08-31");
    expect(rows).toHaveLength(4);
    await writeGrades(db, "weather_hourly", changedGrades(rows));
    const after = await db.select().from(weatherHourly).orderBy(asc(weatherHourly.time), asc(weatherHourly.point));
    const grade = (point: string, jst: string) => after.find((r) => r.point === point && r.time.getTime() === Date.parse(jst))?.grade;
    expect(grade("kawaguchiko", "2018-08-01T10:00:00+09:00")).toBe("obscured");
    expect(grade("saiko", "2018-08-01T10:00:00+09:00")).toBe("bad");
    expect(grade("kawaguchiko", "2018-08-01T11:00:00+09:00")).toBeNull();
    expect(grade("summit", "2018-08-01T10:00:00+09:00")).toBeNull();
    expect(grade("kawaguchiko", "2018-09-01T00:00:00+09:00")).toBe("bad");
    expect(changedGrades(await readLayerRows(db, "weather_hourly", "2018-08-01", "2018-08-31"))).toEqual([]);
  });

  it("matches forecast rows by target time and lead time", async () => {
    const rows = await readLayerRows(db, "forecast", "2018-08-01", "2018-08-01");
    await writeGrades(db, "forecast", changedGrades(rows));
    const after = await db.select().from(forecast);
    const lake = (lead: number) => after.find((r) => r.point === "kawaguchiko" && r.leadHours === lead)?.grade;
    expect(lake(3)).toBe("cloudy");
    expect(lake(24)).toBe("bad");
  });

  it("reports the Japan-date span of a table", async () => {
    expect(await dateSpan(db, "weather_hourly")).toEqual({ first: "2018-08-01", last: "2018-09-01" });
  });
});
