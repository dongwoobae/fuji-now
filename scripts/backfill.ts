// Open-Meteo 과거 예보로 weather_hourly를 채운다. 로컬에서 한 번 실행한다.
// 실행: pnpm backfill [시작일] [끝일]   (기본: 2018-08-01 ~ 일본 날짜로 어제)
// 이미 있는 시각은 건너뛰므로(ON CONFLICT DO NOTHING) 중간에 끊기면 같은 명령을 다시 실행하면 된다.
import { sql } from "drizzle-orm";
import { BACKFILL_FROM, isIsoDate, jstYesterday, monthRanges } from "../lib/backfill";
import { createDb } from "../lib/db/client";
import { weatherHourly } from "../lib/db/schema";
import { FORECAST_POINTS } from "../lib/lakes";
import { buildBackfillRows } from "../lib/record";
import { buildHistoryUrl, parseForecastPoints } from "../lib/weather";

// 매개변수 수 한도(65,535)보다 충분히 작게. 한 행은 열 12개라 2,000행이면 24,000개다.
const INSERT_CHUNK = 2_000;
// Open-Meteo 무료 한도(분당 600회)를 넉넉히 지키려고 요청 사이를 띄운다.
const PAUSE_MS = 1_000;
const CALL_TIMEOUT_MS = 60_000;

try {
  process.loadEnvFile(".env.local");
} catch {}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[backfill] DATABASE_URL이 없다 (.env.local)");
  process.exit(1);
}

const [from = BACKFILL_FROM, to = jstYesterday(new Date())] = process.argv.slice(2);
if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
  console.error(`[backfill] 날짜가 잘못됐다: ${from} ~ ${to} (YYYY-MM-DD)`);
  process.exit(1);
}

// drizzle은 쿼리 오류를 "Failed query: <SQL> params: <값 수천 개>"로 감싸고 원인을 cause에 둔다. 원인만 짧게 보여준다.
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : null;
  return cause ?? error.message.slice(0, 300);
}

const db = createDb(databaseUrl);

// 0001 마이그레이션(source 열) 전에 돌리면 첫 달에서 실패하므로 미리 확인한다.
try {
  await db.execute(sql`select source from weather_hourly limit 0`);
} catch (error) {
  console.error(`[backfill] weather_hourly를 확인하지 못했다: ${describeError(error)}`);
  console.error("[backfill] 마이그레이션이 아직이면 main 병합 후 CI가 적용하기를 기다리거나 pnpm db:migrate를 먼저 실행한다");
  process.exit(1);
}

let total = 0;

for (const { start, end } of monthRanges(from, to)) {
  try {
    const response = await fetch(buildHistoryUrl(FORECAST_POINTS, start, end), { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}: ${await response.text()}`);
    const rows = buildBackfillRows(parseForecastPoints(await response.json(), FORECAST_POINTS), new Date());
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await db.insert(weatherHourly).values(rows.slice(i, i + INSERT_CHUNK)).onConflictDoNothing();
    }
    total += rows.length;
    console.log(`[backfill] ${start} ~ ${end}: ${rows.length}행`);
  } catch (error) {
    console.error(`[backfill] ${start} ~ ${end} 실패: ${describeError(error)}`);
    console.error(`[backfill] 이어서 실행: pnpm backfill ${start} ${to}`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
}

console.log(`[backfill] 완료: ${from} ~ ${to}, ${total}행 (이미 있던 시각은 건너뜀)`);
