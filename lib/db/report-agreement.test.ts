import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { compareReports, formatAgreement, queryReportPairs, type ReportPair } from "./report-agreement";
import { humanReport, weatherHourly, type WeatherHourlyRow } from "./schema";

const db = drizzle(new PGlite());

const hour = (point: string, jst: string, low: number, overrides: Partial<WeatherHourlyRow> = {}): WeatherHourlyRow => ({
  point,
  time: new Date(`${jst}:00+09:00`),
  lowCloudCover: low,
  midCloudCover: 0,
  highCloudCover: 0,
  precipitation: 0,
  grade: point === "summit" ? null : "clear",
  daylight: true,
  fetchedAt: new Date("2026-10-20T00:00:00Z"),
  source: "live",
  ...overrides,
});

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(weatherHourly).values([
    hour("summit", "2026-10-08T15:00", 35, { highCloudCover: 4 }),
    hour("kawaguchiko", "2026-10-08T15:00", 2, { midCloudCover: 5, precipitation: 0.1 }),
    hour("summit", "2026-10-06T18:00", 31, { daylight: false }),
    hour("kawaguchiko", "2026-10-06T18:00", 39, { daylight: false }),
    // 정상 행이 없는 시각
    hour("kawaguchiko", "2026-10-09T10:00", 0),
  ]);
  await db.insert(humanReport).values([
    { place: "kawaguchiko", observedAt: new Date("2026-10-08T15:56:00+09:00"), grade: "cloudy" },
    // 밤 시각은 통계처럼 빼고 본다
    { place: "kawaguchiko", observedAt: new Date("2026-10-06T18:08:00+09:00"), grade: "bad" },
    // 그 호수의 기상 기록이 없다
    { place: "motosuko", observedAt: new Date("2026-10-08T15:56:00+09:00"), grade: "clear" },
    // 같은 시각의 정상 기록이 없다
    { place: "kawaguchiko", observedAt: new Date("2026-10-09T10:20:00+09:00"), grade: "perfect" },
  ]);
});

describe("queryReportPairs", () => {
  it("pairs each daylight report with its lake and the summit at the hour it falls in", async () => {
    expect(await queryReportPairs(db)).toEqual([
      {
        hour: "2026-10-08T06:00:00Z",
        human: "cloudy",
        lake: { low: 2, mid: 5, high: 0, precipitation: 0.1 },
        summit: { low: 35, mid: 0, high: 4 },
      },
    ]);
  });
});

const clearSky = { low: 0, mid: 0, high: 0 };
const pair = (hour: string, human: ReportPair["human"], lakeLow: number): ReportPair => ({
  hour,
  human,
  lake: { ...clearSky, low: lakeLow, precipitation: 0 },
  summit: clearSky,
});

describe("compareReports", () => {
  // 맑은 하늘은 완벽, 호수 하층 100%는 안 보임이다. 기준값을 조금 옮겨도 바뀌지 않는 값만 쓴다.
  const pairs = [
    pair("2026-10-08T06:00:00Z", "perfect", 0),
    pair("2026-10-08T06:00:00Z", "cloudy", 100),
    pair("2026-10-09T01:00:00Z", "bad", 0),
    pair("2026-10-09T01:00:00Z", "clear", 100),
  ];

  it("counts agreement, error and the visible split against the current rules", () => {
    const result = compareReports(pairs);
    expect(result).toMatchObject({ reports: 4, hours: 2, exact: 1, modelOnlyVisible: 1, humanOnlyVisible: 2 });
    // 등급 차이(모델 − 실측): 0, +2, −4, +3
    expect(result?.meanAbsError).toBeCloseTo(9 / 4);
    expect(result?.bias).toBeCloseTo(1 / 4);
    expect(result?.matrix.perfect.perfect).toBe(1);
    expect(result?.matrix.cloudy.bad).toBe(1);
    expect(result?.matrix.bad.perfect).toBe(1);
    expect(result?.matrix.clear.bad).toBe(1);
    expect(result?.matrix.bad.bad).toBe(0);
  });

  it("returns null without reports", () => {
    expect(compareReports([])).toBeNull();
  });

  it("formats the matrix with rows of equal width", () => {
    const lines = formatAgreement(compareReports(pairs)).split("\n");
    const header = lines.findIndex((line) => line.startsWith("human"));
    const table = lines.slice(header, header + 6);
    expect(new Set(table.map((line) => line.length)).size).toBe(1);
    expect(table.find((line) => line.startsWith("bad"))).toMatch(/^bad\s+1\s+0\s+0\s+0\s+0$/);
  });

  it("says so when there is nothing to compare", () => {
    expect(formatAgreement(null)).toContain("실측이 없다");
  });
});
