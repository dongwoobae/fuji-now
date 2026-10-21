import { and, isNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import { weatherHourly, type WeatherHourlyRow } from "./schema";

// 한 insert의 매개변수 수(행 수 × weather_hourly 열 수)가 Postgres 한도(65,535)보다 충분히 작게.
const INSERT_CHUNK = 2_000;

// 이미 있는 행은 운량·등급·출처를 두고 비어 있는 700hPa 습도만 채운다. 매시 기록(live)이 먼저 쓴 값을 덮지 않고,
// 습도 열을 더하기 전에 쌓인 행에 습도를 넣기 위해서다(설계 문서 "백필").
export async function writeBackfillRows(db: Db, rows: readonly WeatherHourlyRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db
      .insert(weatherHourly)
      .values(rows.slice(i, i + INSERT_CHUNK))
      .onConflictDoUpdate({
        target: [weatherHourly.point, weatherHourly.time],
        set: { humidity700: sql`excluded.humidity_700hpa` },
        setWhere: and(isNull(weatherHourly.humidity700), sql`excluded.humidity_700hpa is not null`),
      });
  }
}
