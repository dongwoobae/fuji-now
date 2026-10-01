// 등급 기준(lib/visibility.ts의 GRADE_RULES)을 바꾼 뒤 DB의 과거 등급을 다시 매긴다. 로컬에서 실행한다.
// 실행: pnpm regrade   (.env.local의 DATABASE_URL). 바뀐 행만 고치므로 여러 번 실행해도 된다.
// 끝나면 pnpm stats:refresh로 통계를 다시 집계한다.
import { monthRanges } from "../lib/backfill";
import { createDb } from "../lib/db/client";
import { changedGrades, dateSpan, readLayerRows, REGRADE_TABLES, writeGrades } from "../lib/db/regrade";
import { GRADE_RULES } from "../lib/visibility";

try {
  process.loadEnvFile(".env.local");
} catch {}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[regrade] DATABASE_URL이 없다 (.env.local)");
  process.exit(1);
}

const describe = (error: unknown) => {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? error.cause.message : error.message.slice(0, 300);
};

const db = createDb(databaseUrl);
console.log(`[regrade] 기준: ${JSON.stringify(GRADE_RULES)}`);

for (const table of REGRADE_TABLES) {
  let changed = 0;
  try {
    const span = await dateSpan(db, table);
    if (!span) {
      console.log(`[regrade] ${table}: 행 없음`);
      continue;
    }
    for (const { start, end } of monthRanges(span.first, span.last)) {
      const changes = changedGrades(await readLayerRows(db, table, start, end));
      await writeGrades(db, table, changes);
      changed += changes.length;
      if (changes.length > 0) console.log(`[regrade] ${table} ${start.slice(0, 7)}: ${changes.length}행 바뀜`);
    }
    console.log(`[regrade] ${table} 완료: ${changed}행 바뀜`);
  } catch (error) {
    console.error(`[regrade] ${table} 실패: ${describe(error)}`);
    console.error("[regrade] 바뀐 행만 고치므로 같은 명령을 다시 실행하면 이어진다");
    process.exit(1);
  }
}

console.log("[regrade] 끝. pnpm stats:refresh로 통계를 다시 집계한다");
