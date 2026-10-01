import { sql, type SQL } from "drizzle-orm";
import { SUMMIT } from "../lakes";
import { dayRowSchema, hourRowSchema, VISIBLE_GRADES, type DayRow, type HourRow } from "../stats";

// neon-http와 테스트용 PGlite가 함께 맞는 최소 형태.
export type SqlExecutor = { execute: (query: SQL) => Promise<{ rows: unknown[] }> };

// 시각마다 확정 등급을 정한다: 같은 호수·같은 시간대에 실측이 있으면 실측(여럿이면 가장 늦은 것), 없으면 모델 추정.
// 낮 시각만 센다. 날짜·월은 일본 기준이다.
const resolved = sql`
  human as (
    select distinct on (place, date_trunc('hour', observed_at))
      place, date_trunc('hour', observed_at) as time, grade
    from human_report
    order by place, date_trunc('hour', observed_at), observed_at desc, id desc
  ),
  resolved as (
    select
      w.point as lake,
      (w.time at time zone 'Asia/Tokyo')::date as day,
      coalesce(h.grade, w.grade)::text as grade,
      h.grade is not null as human
    from weather_hourly w
    left join human h on h.place = w.point and h.time = w.time
    where w.point <> ${SUMMIT.id} and w.daylight and w.grade is not null
  )`;

const visibleList = sql.join(
  VISIBLE_GRADES.map((grade) => sql`${grade}`),
  sql`, `,
);

export async function queryDayRows(db: SqlExecutor): Promise<DayRow[]> {
  const result = await db.execute(sql`
    with ${resolved},
    days as (
      select lake, day, bool_or(grade in (${visibleList})) as visible, bool_or(human) as human
      from resolved
      group by lake, day
    )
    select
      lake,
      extract(month from day)::int as month,
      count(*) as days,
      count(*) filter (where visible) as visible_days,
      count(*) filter (where human) as human_days,
      to_char(min(day), 'YYYY-MM-DD') as first_day,
      to_char(max(day), 'YYYY-MM-DD') as last_day
    from days
    group by lake, month
  `);
  return result.rows.map((row) => dayRowSchema.parse(row));
}

export async function queryHourRows(db: SqlExecutor): Promise<HourRow[]> {
  const result = await db.execute(sql`
    with ${resolved}
    select lake, extract(month from day)::int as month, grade, count(*) as hours
    from resolved
    group by lake, month, grade
  `);
  return result.rows.map((row) => hourRowSchema.parse(row));
}
