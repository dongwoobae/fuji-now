import { sql } from "drizzle-orm";
import { z } from "zod";
import { SUMMIT } from "../lakes";
import { GRADE_RULES } from "../visibility";
import type { SqlExecutor } from "./stats";

// 등급 기준을 고르기 위한 보정 계산. 원시 운량으로 "알아볼 수 있는 시각"(가림 < 기준, 호수 강수 < 0.5mm)을
// 기준값마다 다시 판정하고, 하루 판정 규칙마다 월별 보인 날 수를 센다. 다섯 호수를 합친 값이다. 실측은 넣지 않는다.
export const CALIBRATION_THRESHOLDS = [60, 50, 40, 30, 20, 10] as const;

export const DAY_RULES = {
  any1: "낮에 1시간 이상",
  min3: "낮에 3시간 이상",
  half: "낮 시간의 절반 이상",
  morning: "6~9시 중 1시간 이상",
} as const;
export type DayRule = keyof typeof DAY_RULES;

// 북쪽(가와구치코) 쪽 월별 보인 비율(%). isfujivisible.com이 공개한 값이고, 기간과 판정 방식은 확인하지 못했다. 대략의 계절 곡선으로만 쓴다.
export const REFERENCE_NORTH = [100, 89, 87, 73, 74, 30, 48, 47, 40, 39, 97, 87] as const;

const rowSchema = z.object({
  threshold: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
  days: z.coerce.number().int(),
  any1: z.coerce.number().int(),
  min3: z.coerce.number().int(),
  half: z.coerce.number().int(),
  morning: z.coerce.number().int(),
});
export type CalibrationRow = z.infer<typeof rowSchema>;

export async function queryCalibration(db: SqlExecutor): Promise<CalibrationRow[]> {
  const thresholds = sql.join(
    CALIBRATION_THRESHOLDS.map((t) => sql`${t}::int`),
    sql`, `,
  );
  const result = await db.execute(sql`
    with h as (
      select
        w.point,
        w.time at time zone 'Asia/Tokyo' as local,
        greatest(w.low_cloud_cover, s.low_cloud_cover, s.mid_cloud_cover) as cover,
        w.precipitation as precip
      from weather_hourly w
      join weather_hourly s on s.point = ${SUMMIT.id} and s.time = w.time
      where w.point <> ${SUMMIT.id} and w.daylight
    ),
    t as (select unnest(array[${thresholds}]) as threshold),
    d as (
      select
        t.threshold,
        h.point,
        h.local::date as day,
        count(*) as hours,
        count(*) filter (where h.cover < t.threshold and h.precip < ${GRADE_RULES.obscuredPrecipitation}) as ok,
        count(*) filter (
          where h.cover < t.threshold and h.precip < ${GRADE_RULES.obscuredPrecipitation} and extract(hour from h.local) between 6 and 9
        ) as ok_morning
      from h cross join t
      group by t.threshold, h.point, day
    )
    select
      threshold,
      extract(month from day)::int as month,
      count(*) as days,
      count(*) filter (where ok >= 1) as any1,
      count(*) filter (where ok >= 3) as min3,
      count(*) filter (where ok * 2 >= hours) as half,
      count(*) filter (where ok_morning >= 1) as morning
    from d
    group by threshold, month
  `);
  return result.rows.map((row) => rowSchema.parse(row));
}

export type CalibrationLine = { threshold: number; rule: DayRule; percents: (number | null)[]; meanAbsDiff: number | null };

// 기준값 × 규칙마다 1~12월 보인 날 비율(%)과 참고 곡선과의 평균 절대 차이를 낸다. 차이가 작은 순으로 정렬한다.
export function calibrationLines(rows: readonly CalibrationRow[]): CalibrationLine[] {
  const lines: CalibrationLine[] = [];
  for (const threshold of CALIBRATION_THRESHOLDS) {
    for (const rule of Object.keys(DAY_RULES) as DayRule[]) {
      const percents = Array.from({ length: 12 }, (_, i) => {
        const row = rows.find((r) => r.threshold === threshold && r.month === i + 1);
        return row && row.days > 0 ? Math.round((row[rule] / row.days) * 100) : null;
      });
      const diffs = percents.flatMap((p, i) => (p === null ? [] : [Math.abs(p - REFERENCE_NORTH[i])]));
      const meanAbsDiff = diffs.length === 0 ? null : Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
      lines.push({ threshold, rule, percents, meanAbsDiff });
    }
  }
  return lines.sort((a, b) => (a.meanAbsDiff ?? Infinity) - (b.meanAbsDiff ?? Infinity));
}

const cell = (value: number | null) => (value === null ? "-" : String(value)).padStart(5);

// 한글은 터미널에서 두 칸을 차지해 열이 어긋나므로 표 안은 영문 약어와 숫자만 쓰고, 설명은 표 아래에 둔다.
export function formatCalibration(lines: readonly CalibrationLine[]): string {
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(5)).join("");
  const header = `cover<  rule    ${months}   diff`;
  const reference = `${"ref".padEnd(16)}${REFERENCE_NORTH.map(cell).join("")}      -`;
  const body = lines.map((line) => `${String(line.threshold).padStart(6)}  ${line.rule.padEnd(8)}${line.percents.map(cell).join("")}${cell(line.meanAbsDiff).padStart(7)}`);
  const legend = [
    "",
    `${"cover<".padEnd(8)}: 가림 = max(호수 하층, 정상 하층, 정상 중층) 운량(%)이 이 값보다 작고 호수 강수 < 0.5mm면 알아볼 수 있는 시각`,
    ...(Object.entries(DAY_RULES) as [DayRule, string][]).map(([rule, text]) => `${rule.padEnd(8)}: 보인 날 = 알아볼 수 있는 시각이 ${text}`),
    `${"ref".padEnd(8)}: 북쪽(가와구치코) 참고 곡선(isfujivisible.com)`,
    `${"diff".padEnd(8)}: 참고와의 평균 절대 차이(%p). 차이가 작은 순으로 정렬`,
    `지금 기준은 cover<${GRADE_RULES.obscuredCover} + any1이다`,
  ];
  return [header, reference, ...body, ...legend].join("\n");
}
