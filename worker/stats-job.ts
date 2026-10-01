import { createDb, describeError } from "../lib/db/client";
import { computeStats, type SqlExecutor } from "../lib/db/stats";
import { isStatsStale, readStats, writeStats } from "../lib/stats";

export type StatsEnv = { SNAPSHOT_KV: KVNamespace; DATABASE_URL?: string };

// 기록 작업과 같은 매시 예약 실행(RECORD_CRON)에서 부른다. KV의 통계가 없거나 하루 가까이 지났을 때만 Neon에서 다시 집계한다.
export async function runStatsJob(env: StatsEnv, now: Date, connect: (url: string) => SqlExecutor = createDb): Promise<void> {
  const log = (result: Record<string, unknown>) => console.log(JSON.stringify({ event: "stats", ...result }));
  if (!isStatsStale(await readStats(env.SNAPSHOT_KV), now)) return;
  if (!env.DATABASE_URL) {
    log({ written: false, error: "DATABASE_URL is not set" });
    return;
  }
  try {
    const stats = await computeStats(connect(env.DATABASE_URL), now);
    await writeStats(env.SNAPSHOT_KV, stats);
    log({ written: true, cells: stats.cells.length, firstDay: stats.firstDay, lastDay: stats.lastDay });
  } catch (error) {
    log({ written: false, error: describeError(error) });
  }
}
