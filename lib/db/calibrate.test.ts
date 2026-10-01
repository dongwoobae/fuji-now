import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { calibrationLines, CALIBRATION_THRESHOLDS, formatCalibration, queryCalibration, REFERENCE_NORTH, type CalibrationRow } from "./calibrate";
import { weatherHourly, type WeatherHourlyRow } from "./schema";

const db = drizzle(new PGlite());

const row = (point: string, jst: string, low: number, precipitation = 0, daylight = true): WeatherHourlyRow => ({
  point,
  time: new Date(`2025-08-01T${jst}:00+09:00`),
  lowCloudCover: low,
  midCloudCover: 0,
  highCloudCover: 0,
  precipitation,
  grade: point === "summit" ? null : "clear",
  daylight,
  fetchedAt: new Date("2026-10-01T00:00:00Z"),
  source: "backfill",
});

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  const times = ["07:00", "12:00", "13:00", "14:00", "15:00", "21:00"];
  await db.insert(weatherHourly).values([
    // 정상은 맑아서 가림은 호수 하층 운량이 정한다. 단 12시의 정상 중층은 아래에서 따로 넣는다.
    ...times.filter((t) => t !== "12:00").map((t) => row("summit", t, 0)),
    { ...row("summit", "12:00", 0), midCloudCover: 45 },
    row("kawaguchiko", "07:00", 15),
    row("kawaguchiko", "12:00", 0),
    row("kawaguchiko", "13:00", 45),
    row("kawaguchiko", "14:00", 80),
    // 맑아도 비가 오면 알아볼 수 없는 시각이다
    row("kawaguchiko", "15:00", 0, 1),
    // 밤은 세지 않는다
    row("kawaguchiko", "21:00", 0, 0, false),
  ]);
});

describe("queryCalibration", () => {
  it("re-judges each daylight hour per threshold and counts days per rule", async () => {
    const rows = await queryCalibration(db);
    const at = (threshold: number) => rows.find((r) => r.threshold === threshold && r.month === 8);
    // 낮 5시간 중 가림: 07시 15, 12시 45(정상 중층), 13시 45, 14시 80, 15시 0(비)
    expect(at(60)).toEqual({ threshold: 60, month: 8, days: 1, any1: 1, min3: 1, half: 1, morning: 1 });
    expect(at(40)).toEqual({ threshold: 40, month: 8, days: 1, any1: 1, min3: 0, half: 0, morning: 1 });
    expect(at(10)).toEqual({ threshold: 10, month: 8, days: 1, any1: 0, min3: 0, half: 0, morning: 0 });
    expect(rows).toHaveLength(CALIBRATION_THRESHOLDS.length);
  });
});

describe("calibrationLines", () => {
  it("turns counts into monthly percents and sorts by distance from the reference", () => {
    const rows: CalibrationRow[] = CALIBRATION_THRESHOLDS.flatMap((threshold) =>
      REFERENCE_NORTH.map((reference, i) => ({
        threshold,
        month: i + 1,
        days: 100,
        // 기준 40의 "절반 이상"이 참고 곡선과 똑같도록 만든다
        any1: 100,
        min3: 50,
        half: threshold === 40 ? reference : 0,
        morning: 90,
      })),
    );
    const lines = calibrationLines(rows);
    expect(lines[0]).toEqual({ threshold: 40, rule: "half", percents: [...REFERENCE_NORTH], meanAbsDiff: 0 });
    expect(lines).toHaveLength(CALIBRATION_THRESHOLDS.length * 4);
  });

  it("leaves months without data empty and ignores them in the difference", () => {
    const lines = calibrationLines([{ threshold: 60, month: 1, days: 10, any1: 10, min3: 10, half: 10, morning: 10 }]);
    const line = lines.find((l) => l.threshold === 60 && l.rule === "any1");
    expect(line?.percents[0]).toBe(100);
    expect(line?.percents[1]).toBeNull();
    expect(line?.meanAbsDiff).toBe(0);
  });
});

describe("formatCalibration", () => {
  it("keeps every row the same width so the columns line up", () => {
    const lines = calibrationLines([{ threshold: 60, month: 1, days: 10, any1: 10, min3: 5, half: 3, morning: 9 }]);
    const table = formatCalibration(lines).split("\n").slice(0, 2 + lines.length);
    expect(new Set(table.map((line) => line.length)).size).toBe(1);
    expect(table[1]).toContain(REFERENCE_NORTH.map((v) => String(v).padStart(5)).join(""));
  });
});
