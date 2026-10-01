import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { buildStats, cellOf } from "../stats";
import { humanReport, weatherHourly, type WeatherHourlyRow } from "./schema";
import { queryDayRows, queryHourRows } from "./stats";

// 실제 마이그레이션을 WASM Postgres(PGlite)에 적용해 집계 SQL을 그대로 돌린다.
const db = drizzle(new PGlite());

const hour = (point: string, jst: string, grade: WeatherHourlyRow["grade"], daylight = true): WeatherHourlyRow => ({
  point,
  time: new Date(`${jst}:00+09:00`),
  lowCloudCover: 0,
  midCloudCover: 0,
  highCloudCover: 0,
  precipitation: 0,
  grade,
  daylight,
  fetchedAt: new Date("2026-10-01T00:00:00Z"),
  source: "backfill",
});

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(weatherHourly).values([
    // 8월 1일 가와구치코: 낮 내내 안 보임, 밤에만 완벽 → 안 보인 날
    hour("kawaguchiko", "2025-08-01T10:00", "bad"),
    hour("kawaguchiko", "2025-08-01T11:00", "obscured"),
    hour("kawaguchiko", "2025-08-01T22:00", "perfect", false),
    // 8월 2일: 한 시간만 구름 걸림 → 보인 날
    hour("kawaguchiko", "2025-08-02T10:00", "bad"),
    hour("kawaguchiko", "2025-08-02T11:00", "cloudy"),
    // 8월 3일: 모델은 완벽이지만 같은 시간대 실측이 안 보임 → 실측이 이겨서 안 보인 날
    hour("kawaguchiko", "2025-08-03T09:00", "perfect"),
    // 일본 날짜로 8월 31일 23시대(UTC 14시)라도 9월이 아닌 8월로 센다. 낮이 아니라 빠진다.
    hour("kawaguchiko", "2025-08-31T23:00", "clear", false),
    // 일본 9월 1일 08시(UTC 8월 31일 23시) → 9월
    hour("kawaguchiko", "2025-09-01T08:00", "clear"),
    // 정상은 집계하지 않는다
    hour("summit", "2025-08-01T10:00", null),
    hour("yamanakako", "2025-08-01T10:00", "clear"),
  ]);
  await db.insert(humanReport).values([
    { place: "kawaguchiko", observedAt: new Date("2025-08-03T09:10:00+09:00"), grade: "obscured" },
    // 같은 시간대의 더 늦은 실측이 우선한다
    { place: "kawaguchiko", observedAt: new Date("2025-08-03T09:40:00+09:00"), grade: "bad" },
    // 기상 기록이 없는 시각의 실측은 집계에 들어가지 않는다
    { place: "kawaguchiko", observedAt: new Date("2025-08-04T09:00:00+09:00"), grade: "perfect" },
  ]);
});

describe("stats queries", () => {
  it("counts visible days by Japan month, letting a human report win its hour", async () => {
    const stats = buildStats(await queryDayRows(db), await queryHourRows(db), new Date("2026-10-01T00:00:00Z"));
    expect(cellOf(stats, "kawaguchiko", 8)).toEqual({
      lake: "kawaguchiko",
      month: 8,
      days: 3,
      visibleDays: 1,
      humanDays: 1,
      hours: { perfect: 0, clear: 0, cloudy: 1, obscured: 1, bad: 3 },
    });
    expect(cellOf(stats, "kawaguchiko", 9)).toMatchObject({ days: 1, visibleDays: 1, hours: { clear: 1 } });
    expect(cellOf(stats, "yamanakako", 8)).toMatchObject({ days: 1, visibleDays: 1 });
    expect(stats.cells.some((cell) => (cell.lake as string) === "summit")).toBe(false);
    expect(stats.firstDay).toBe("2025-08-01");
    expect(stats.lastDay).toBe("2025-09-01");
  });
});
