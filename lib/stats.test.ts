import { describe, expect, it } from "vitest";
import { buildStats, isStatsStale, readStats, STATS_KEY, STATS_MAX_AGE_MS, sumCounts, visibleShare, writeStats, type DayRow } from "./stats";

const day = (lake: DayRow["lake"], month: number, first: string, last: string): DayRow => ({
  lake,
  month,
  days: 10,
  visible_days: 4,
  human_days: 1,
  first_day: first,
  last_day: last,
});

describe("buildStats", () => {
  const stats = buildStats(
    [day("motosuko", 8, "2019-08-01", "2025-08-31"), day("kawaguchiko", 8, "2018-08-01", "2025-08-31"), day("kawaguchiko", 1, "2019-01-01", "2026-01-31")],
    [
      { lake: "kawaguchiko", month: 8, grade: "bad", hours: 30 },
      { lake: "kawaguchiko", month: 8, grade: "clear", hours: 12 },
      // 일 집계에 없는 칸의 시간 행은 버린다
      { lake: "saiko", month: 8, grade: "bad", hours: 5 },
    ],
    new Date("2026-10-01T15:00:00Z"),
  );

  it("orders cells by month, then by lake from east to west", () => {
    expect(stats.cells.map((cell) => `${cell.month}:${cell.lake}`)).toEqual(["1:kawaguchiko", "8:kawaguchiko", "8:motosuko"]);
  });

  it("fills hours per grade with zeros for missing grades", () => {
    expect(stats.cells[1].hours).toEqual({ perfect: 0, clear: 12, cloudy: 0, obscured: 0, bad: 30 });
    expect(stats.cells[2].hours).toEqual({ perfect: 0, clear: 0, cloudy: 0, obscured: 0, bad: 0 });
  });

  it("spans the earliest and latest day", () => {
    expect(stats.firstDay).toBe("2018-08-01");
    expect(stats.lastDay).toBe("2026-01-31");
    expect(buildStats([], [], new Date()).firstDay).toBeNull();
  });
});

describe("isStatsStale", () => {
  const computedAt = "2026-10-01T15:00:00.000Z";
  const stats = { computedAt, firstDay: null, lastDay: null, cells: [] };
  it("is stale when missing or older than the max age", () => {
    expect(isStatsStale(null, new Date())).toBe(true);
    expect(isStatsStale(stats, new Date(Date.parse(computedAt) + STATS_MAX_AGE_MS))).toBe(false);
    expect(isStatsStale(stats, new Date(Date.parse(computedAt) + STATS_MAX_AGE_MS + 1))).toBe(true);
  });
});

describe("visibleShare", () => {
  it("is null without samples", () => {
    expect(visibleShare(null)).toBeNull();
    expect(visibleShare({ days: 0, visibleDays: 0, humanDays: 0, hours: { perfect: 0, clear: 0, cloudy: 0, obscured: 0, bad: 0 } })).toBeNull();
    expect(visibleShare({ days: 4, visibleDays: 1, humanDays: 0, hours: { perfect: 0, clear: 0, cloudy: 0, obscured: 0, bad: 0 } })).toBe(0.25);
  });
});

describe("sumCounts", () => {
  it("adds days and hours across cells, and is null for none", () => {
    const zero = { perfect: 0, clear: 0, cloudy: 0, obscured: 0, bad: 0 };
    expect(sumCounts([])).toBeNull();
    expect(
      sumCounts([
        { days: 3, visibleDays: 1, humanDays: 0, hours: { ...zero, bad: 2 } },
        { days: 2, visibleDays: 2, humanDays: 1, hours: { ...zero, bad: 1, clear: 4 } },
      ]),
    ).toEqual({ days: 5, visibleDays: 3, humanDays: 1, hours: { ...zero, bad: 3, clear: 4 } });
  });
});

describe("readStats / writeStats", () => {
  function fakeKv(initial?: string) {
    const data = new Map<string, string>(initial === undefined ? [] : [[STATS_KEY, initial]]);
    const puts: Array<{ key: string; options: unknown }> = [];
    const kv = {
      async get(key: string) {
        const value = data.get(key);
        return value === undefined ? null : JSON.parse(value);
      },
      async put(key: string, value: string, options: unknown) {
        data.set(key, value);
        puts.push({ key, options });
      },
    } as unknown as KVNamespace;
    return { kv, puts };
  }

  it("round-trips and expires after the TTL", async () => {
    const { kv, puts } = fakeKv();
    const stats = buildStats([day("saiko", 3, "2019-03-01", "2025-03-31")], [], new Date("2026-10-01T00:00:00Z"));
    await writeStats(kv, stats);
    expect(await readStats(kv)).toEqual(stats);
    expect(puts[0]).toEqual({ key: STATS_KEY, options: { expirationTtl: 8 * 24 * 60 * 60 } });
  });

  it("treats a missing or malformed value as no stats", async () => {
    expect(await readStats(fakeKv().kv)).toBeNull();
    expect(await readStats(fakeKv(JSON.stringify({ cells: "x" })).kv)).toBeNull();
  });
});
