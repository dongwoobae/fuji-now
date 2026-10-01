// 월별 통계를 지금 바로 다시 집계해 운영 KV(lib/stats.ts의 STATS_KEY)에 넣는다. 예약 작업은 하루 한 번만 집계하므로,
// 백필이나 등급 기준을 바꾼 직후에 쓴다. 로컬에서 실행한다.
// 실행: pnpm stats:refresh   (.env.local의 DATABASE_URL, wrangler 로그인 필요)
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDb, describeError } from "../lib/db/client";
import { computeStats } from "../lib/db/stats";
import { STATS_KEY, STATS_TTL_SECONDS, sumCounts, visibleShare } from "../lib/stats";
import { requireDatabaseUrl } from "./env";

const databaseUrl = requireDatabaseUrl("stats");

let stats;
try {
  stats = await computeStats(createDb(databaseUrl), new Date());
} catch (error) {
  console.error(`[stats] 집계 실패: ${describeError(error)}`);
  process.exit(1);
}

console.log(`[stats] 자료 ${stats.firstDay} ~ ${stats.lastDay}, 칸 ${stats.cells.length}개`);
for (let month = 1; month <= 12; month++) {
  const all = sumCounts(stats.cells.filter((cell) => cell.month === month));
  const share = visibleShare(all);
  console.log(`  ${String(month).padStart(2)}월  5호 전체 보인 날 ${share === null ? "  —" : `${Math.round(share * 100)}%`.padStart(4)}  (${all?.days ?? 0}일)`);
}

// wrangler는 셸 없이 node로 직접 부른다. Windows의 pnpm.cmd·경로 공백 문제를 피하기 위해서다.
const dir = join(".wrangler", "tmp");
mkdirSync(dir, { recursive: true });
const file = join(dir, "stats.json");
writeFileSync(file, JSON.stringify(stats));
const wrangler = join("node_modules", "wrangler", "bin", "wrangler.js");
const result = spawnSync(
  process.execPath,
  [wrangler, "kv", "key", "put", STATS_KEY, "--path", file, "--binding", "SNAPSHOT_KV", "--remote", "--ttl", String(STATS_TTL_SECONDS)],
  { stdio: "inherit" },
);
if (result.status !== 0) {
  console.error("[stats] KV에 쓰지 못했다. pnpm exec wrangler login 상태를 확인한다");
  process.exit(1);
}
console.log("[stats] 운영 KV에 썼다. /stats를 새로고침하면 보인다");
