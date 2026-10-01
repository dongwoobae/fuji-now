import { createDb } from "../lib/db/client";
import { queryDayRows, queryHourRows, type SqlExecutor } from "../lib/db/stats";
import { buildStats, isStatsStale, readStats, writeStats } from "../lib/stats";

export type StatsEnv = { SNAPSHOT_KV: KVNamespace; DATABASE_URL?: string };

// 매시 첫 실행에서 부른다. KV의 통계가 없거나 하루 가까이 지났을 때만 Neon에서 다시 집계한다.
export async function runStatsJob(env: StatsEnv, now: Date, connect: (url: string) => SqlExecutor = createDb): Promise<void> {
  const log = (result: Record<string, unknown>) => console.log(JSON.stringify({ event: "stats", ...result }));
  if (!isStatsStale(await readStats(env.SNAPSHOT_KV), now)) return;
  if (!env.DATABASE_URL) {
    log({ written: false, error: "DATABASE_URL is not set" });
    return;
  }
  try {
    const db = connect(env.DATABASE_URL);
    const [days, hours] = await Promise.all([queryDayRows(db), queryHourRows(db)]);
    const stats = buildStats(days, hours, now);
    await writeStats(env.SNAPSHOT_KV, stats);
    log({ written: true, cells: stats.cells.length, firstDay: stats.firstDay, lastDay: stats.lastDay });
  } catch (error) {
    log({ written: false, error: error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message.slice(0, 300)) : String(error) });
  }
}
