import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { SUMMIT } from "../lakes";
import { estimateGrade, VISIBILITY_GRADES, type VisibilityGrade } from "../visibility";
import type { SqlExecutor } from "./stats";

// 등급 기준(GRADE_RULES)을 바꾼 뒤 DB에 남은 원시 운량으로 과거 등급을 다시 매긴다.
// 공식을 SQL로 따로 쓰지 않고 estimateGrade를 그대로 써서 판정이 한 곳에만 있게 한다.

export const REGRADE_TABLES = ["weather_hourly", "forecast"] as const;
export type RegradeTable = (typeof REGRADE_TABLES)[number];

// 표마다 대상 시각 열과 리드타임 열. weather_hourly는 리드타임이 없다.
const COLUMNS: Record<RegradeTable, { time: SQL; lead: SQL }> = {
  weather_hourly: { time: sql.raw("time"), lead: sql.raw("null::int") },
  forecast: { time: sql.raw("target_time"), lead: sql.raw("lead_hours") },
};

const layerRowSchema = z.object({
  point: z.string(),
  time: z.string(),
  lead: z.coerce.number().int().nullable(),
  low: z.coerce.number(),
  mid: z.coerce.number(),
  high: z.coerce.number(),
  precip: z.coerce.number(),
  grade: z.enum(VISIBILITY_GRADES).nullable(),
});
export type LayerRow = z.infer<typeof layerRowSchema>;
export type GradeChange = { point: string; time: string; lead: number | null; grade: VisibilityGrade | null };

// 등급이 바뀌는 호수 행만 돌려준다. 같은 시각·리드타임의 정상 행과 짝짓고, 정상 행이 없으면 등급은 null이다(기록 작업과 같다).
export function changedGrades(rows: readonly LayerRow[]): GradeChange[] {
  const keyOf = (row: LayerRow) => `${row.time}|${row.lead}`;
  const summits = new Map(rows.filter((row) => row.point === SUMMIT.id).map((row) => [keyOf(row), row]));
  const changes: GradeChange[] = [];
  for (const row of rows) {
    if (row.point === SUMMIT.id) continue;
    const top = summits.get(keyOf(row));
    const grade = top
      ? estimateGrade(
          { low: row.low, mid: row.mid, high: row.high, precipitation: row.precip },
          { low: top.low, mid: top.mid, high: top.high },
        )
      : null;
    if (grade !== row.grade) changes.push({ point: row.point, time: row.time, lead: row.lead, grade });
  }
  return changes;
}

// 일본 날짜 [start, end] 구간의 행을 읽는다. 시각은 UTC ISO 문자열로 받아 드라이버마다 다른 날짜 변환을 피한다.
export async function readLayerRows(db: SqlExecutor, table: RegradeTable, start: string, end: string): Promise<LayerRow[]> {
  const { time, lead } = COLUMNS[table];
  const result = await db.execute(sql`
    select
      point,
      to_char(${time} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as time,
      ${lead} as lead,
      low_cloud_cover as low, mid_cloud_cover as mid, high_cloud_cover as high, precipitation as precip,
      grade::text as grade
    from ${sql.identifier(table)}
    where ${time} >= (${start}::date)::timestamp at time zone 'Asia/Tokyo'
      and ${time} < (${end}::date + 1)::timestamp at time zone 'Asia/Tokyo'
  `);
  return result.rows.map((row) => layerRowSchema.parse(row));
}

// 매개변수 수 한도(65,535) 안에서 한 번에 고친다. 한 행에 매개변수 4개다. 기본 키로 짝지어 색인을 탄다.
const UPDATE_CHUNK = 5_000;

export async function writeGrades(db: SqlExecutor, table: RegradeTable, changes: readonly GradeChange[]): Promise<void> {
  const target = sql.identifier(table);
  const match =
    table === "weather_hourly"
      ? sql`${target}.time = v.time::timestamptz`
      : sql`${target}.target_time = v.time::timestamptz and ${target}.lead_hours = v.lead::int`;
  for (let i = 0; i < changes.length; i += UPDATE_CHUNK) {
    const values = sql.join(
      changes.slice(i, i + UPDATE_CHUNK).map((c) => sql`(${c.point}, ${c.time}, ${c.lead}, ${c.grade})`),
      sql`, `,
    );
    await db.execute(sql`
      update ${target}
      set grade = v.grade::visibility_grade
      from (values ${values}) as v(point, time, lead, grade)
      where ${target}.point = v.point and ${match}
    `);
  }
}

// 표에 있는 일본 날짜 범위. 비어 있으면 null.
export async function dateSpan(db: SqlExecutor, table: RegradeTable): Promise<{ first: string; last: string } | null> {
  const { time } = COLUMNS[table];
  const result = await db.execute(sql`
    select
      to_char(min(${time} at time zone 'Asia/Tokyo'), 'YYYY-MM-DD') as first,
      to_char(max(${time} at time zone 'Asia/Tokyo'), 'YYYY-MM-DD') as last
    from ${sql.identifier(table)}
  `);
  const row = z.object({ first: z.string().nullable(), last: z.string().nullable() }).parse(result.rows[0]);
  return row.first && row.last ? { first: row.first, last: row.last } : null;
}
