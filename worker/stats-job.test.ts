import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { weatherHourly } from "../lib/db/schema";
import { readStats, STATS_KEY } from "../lib/stats";
import { runStatsJob } from "./stats-job";

const NOW = new Date("2026-10-01T15:00:00Z");
const db = drizzle(new PGlite());

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(weatherHourly).values({
    point: "saiko",
    time: new Date("2025-08-01T10:00:00+09:00"),
    lowCloudCover: 0,
    midCloudCover: 0,
    highCloudCover: 0,
    precipitation: 0,
    grade: "perfect",
    daylight: true,
    fetchedAt: NOW,
    source: "backfill",
  });
});

afterEach(() => vi.restoreAllMocks());

function fakeKv(initial?: unknown) {
  const data = new Map<string, string>(initial === undefined ? [] : [[STATS_KEY, JSON.stringify(initial)]]);
  const put = vi.fn(async (key: string, value: string) => void data.set(key, value));
  const kv = {
    async get(key: string) {
      const value = data.get(key);
      return value === undefined ? null : JSON.parse(value);
    },
    put,
  } as unknown as KVNamespace;
  return { kv, put };
}

describe("runStatsJob", () => {
  it("aggregates from the database and stores the result when there are no stats yet", async () => {
    const { kv } = fakeKv();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await runStatsJob({ SNAPSHOT_KV: kv, DATABASE_URL: "postgresql://test" }, NOW, () => db);
    const stats = await readStats(kv);
    expect(stats?.computedAt).toBe(NOW.toISOString());
    expect(stats?.cells).toEqual([
      { lake: "saiko", month: 8, days: 1, visibleDays: 1, humanDays: 0, hours: { perfect: 1, clear: 0, cloudy: 0, obscured: 0, bad: 0 } },
    ]);
  });

  it("does nothing while the stored stats are fresh", async () => {
    const { kv, put } = fakeKv({ computedAt: new Date(NOW.getTime() - 3_600_000).toISOString(), firstDay: null, lastDay: null, cells: [] });
    const connect = vi.fn(() => db);
    await runStatsJob({ SNAPSHOT_KV: kv, DATABASE_URL: "postgresql://test" }, NOW, connect);
    expect(connect).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("logs and keeps the old stats when the query fails", async () => {
    const { kv, put } = fakeKv();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const failing = { execute: async () => Promise.reject(new Error("neon down", { cause: new Error("connection refused") })) };
    await runStatsJob({ SNAPSHOT_KV: kv, DATABASE_URL: "postgresql://test" }, NOW, () => failing);
    expect(put).not.toHaveBeenCalled();
    expect(JSON.parse(String(log.mock.calls[0][0]))).toEqual({ event: "stats", written: false, error: "connection refused" });
  });

  it("skips without a database url", async () => {
    const { kv, put } = fakeKv();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await runStatsJob({ SNAPSHOT_KV: kv }, NOW);
    expect(put).not.toHaveBeenCalled();
  });
});
