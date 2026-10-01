import { createDb, describeError } from "../lib/db/client";
import { forecast, weatherHourly } from "../lib/db/schema";
import { FORECAST_POINTS } from "../lib/lakes";
import { buildRecordRows, RECORD_HOURS, type RecordRows } from "../lib/record";
import { fetchForecastPoints } from "../lib/weather";

const CALL_TIMEOUT_MS = 10_000;

export type RecordEnv = { DATABASE_URL?: string };

// 기록은 매시 한 번만 한다. Neon 무료 플랜은 컴퓨트가 깨어 있는 시간만큼 한도를 쓰는데, 5분마다 쓰면 쉬지 못한다.
// wrangler.jsonc의 triggers.crons에 같은 문자열이 있어야 돈다. 분은 5분 주기 스냅샷 실행과 겹치지 않게 고른다.
export const RECORD_CRON = "1 * * * *";

export async function saveRecordRows(databaseUrl: string, rows: RecordRows): Promise<void> {
  const db = createDb(databaseUrl);
  // 같은 시각을 다시 받으면 먼저 쓴 값을 둔다. 예약 작업이 겹쳐 돌아도 안전하다.
  // batch는 HTTP 한 번에 트랜잭션 하나라, 한쪽만 들어가고 로그는 실패로 남는 일이 없다.
  const queries = [
    ...(rows.actual.length > 0 ? [db.insert(weatherHourly).values(rows.actual).onConflictDoNothing()] : []),
    ...(rows.forecasts.length > 0 ? [db.insert(forecast).values(rows.forecasts).onConflictDoNothing()] : []),
  ];
  if (queries.length === 0) return;
  const [first, ...rest] = queries;
  await db.batch([first, ...rest]);
}

export async function runRecordJob(env: RecordEnv, now: Date, save = saveRecordRows): Promise<void> {
  const log = (result: Record<string, unknown>) => console.log(JSON.stringify({ event: "record", ...result }));
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    log({ written: false, error: "DATABASE_URL is not set" });
    return;
  }
  try {
    const points = await fetchForecastPoints(FORECAST_POINTS, RECORD_HOURS, AbortSignal.timeout(CALL_TIMEOUT_MS));
    const rows = buildRecordRows(points, now);
    await save(databaseUrl, rows);
    log({ written: true, actual: rows.actual.length, forecasts: rows.forecasts.length });
  } catch (error) {
    log({ written: false, error: describeError(error) });
  }
}
