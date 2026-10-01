import { z } from "zod";
import { LAKE_IDS, type LakeId } from "./lakes";
import { VISIBILITY_GRADES, type VisibilityGrade } from "./visibility";

export const STATS_KEY = "stats:v1";
// 하루 한 번 다시 집계한다. 매시 확인하므로 실패해도 한 시간 뒤 다시 시도한다.
export const STATS_MAX_AGE_MS = 23 * 60 * 60 * 1000;
// 집계 작업이 멈추면 일주일 뒤 사라져 "준비 중"으로 돌아간다. 오래된 통계를 최신처럼 두지 않는다.
export const STATS_TTL_SECONDS = 8 * 24 * 60 * 60;

// "보인 날": 그날 낮 시각 중 후지산으로 알아볼 수 있는 등급(구름 걸림 이상)이 한 시간이라도 있는 날.
export const VISIBLE_GRADES: readonly VisibilityGrade[] = ["perfect", "clear", "cloudy"];

const count = z.coerce.number().int().nonnegative();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const dayRowSchema = z.object({
  lake: z.enum(LAKE_IDS),
  month: z.coerce.number().int().min(1).max(12),
  days: count,
  visible_days: count,
  human_days: count,
  first_day: isoDate,
  last_day: isoDate,
});

export const hourRowSchema = z.object({
  lake: z.enum(LAKE_IDS),
  month: z.coerce.number().int().min(1).max(12),
  grade: z.enum(VISIBILITY_GRADES),
  hours: count,
});

export type DayRow = z.infer<typeof dayRowSchema>;
export type HourRow = z.infer<typeof hourRowSchema>;

const cellSchema = z.object({
  lake: z.enum(LAKE_IDS),
  month: z.number().int().min(1).max(12),
  days: z.number(),
  visibleDays: z.number(),
  humanDays: z.number(),
  // 확정 등급별 낮 시간 수
  hours: z.object({ perfect: z.number(), clear: z.number(), cloudy: z.number(), obscured: z.number(), bad: z.number() }),
});

const statsSchema = z.object({
  computedAt: z.string(),
  firstDay: isoDate.nullable(),
  lastDay: isoDate.nullable(),
  cells: z.array(cellSchema),
});

export type StatsCell = z.infer<typeof cellSchema>;
// 여러 칸을 합친 값(5호 전체)도 같은 모양으로 다룬다.
export type Counts = Omit<StatsCell, "lake" | "month">;
export type Stats = z.infer<typeof statsSchema>;

export function buildStats(dayRows: readonly DayRow[], hourRows: readonly HourRow[], computedAt: Date): Stats {
  const cells: StatsCell[] = dayRows.map((row) => ({
    lake: row.lake,
    month: row.month,
    days: row.days,
    visibleDays: row.visible_days,
    humanDays: row.human_days,
    hours: { perfect: 0, clear: 0, cloudy: 0, obscured: 0, bad: 0 },
  }));
  const byKey = new Map(cells.map((cell) => [`${cell.lake}:${cell.month}`, cell]));
  for (const row of hourRows) {
    const cell = byKey.get(`${row.lake}:${row.month}`);
    if (cell) cell.hours[row.grade] += row.hours;
  }
  const firsts = dayRows.map((row) => row.first_day).sort();
  const lasts = dayRows.map((row) => row.last_day).sort();
  return {
    computedAt: computedAt.toISOString(),
    firstDay: firsts[0] ?? null,
    lastDay: lasts.at(-1) ?? null,
    cells: cells.sort((a, b) => a.month - b.month || LAKE_IDS.indexOf(a.lake) - LAKE_IDS.indexOf(b.lake)),
  };
}

export function isStatsStale(stats: Stats | null, now: Date): boolean {
  return stats === null || now.getTime() - Date.parse(stats.computedAt) > STATS_MAX_AGE_MS;
}

export function sumCounts(cells: readonly Counts[]): Counts | null {
  if (cells.length === 0) return null;
  const sum = (pick: (cell: Counts) => number) => cells.reduce((acc, cell) => acc + pick(cell), 0);
  return {
    days: sum((cell) => cell.days),
    visibleDays: sum((cell) => cell.visibleDays),
    humanDays: sum((cell) => cell.humanDays),
    hours: {
      perfect: sum((cell) => cell.hours.perfect),
      clear: sum((cell) => cell.hours.clear),
      cloudy: sum((cell) => cell.hours.cloudy),
      obscured: sum((cell) => cell.hours.obscured),
      bad: sum((cell) => cell.hours.bad),
    },
  };
}

export function cellOf(stats: Stats, lake: LakeId, month: number): StatsCell | null {
  return stats.cells.find((cell) => cell.lake === lake && cell.month === month) ?? null;
}

// 보인 날 비율(0~1). 표본이 없으면 null.
export function visibleShare(cell: Counts | null): number | null {
  return cell && cell.days > 0 ? cell.visibleDays / cell.days : null;
}

export async function readStats(kv: KVNamespace): Promise<Stats | null> {
  try {
    const result = statsSchema.safeParse(await kv.get(STATS_KEY, "json"));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function writeStats(kv: KVNamespace, stats: Stats): Promise<void> {
  await kv.put(STATS_KEY, JSON.stringify(stats), { expirationTtl: STATS_TTL_SECONDS });
}
