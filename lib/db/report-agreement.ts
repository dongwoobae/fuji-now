import { sql } from "drizzle-orm";
import { z } from "zod";
import { SUMMIT } from "../lakes";
import { VISIBLE_GRADES } from "../stats";
import { estimateGrade, GRADE_RULES, VISIBILITY_GRADES, type CloudLayers, type VisibilityGrade } from "../visibility";
import type { SqlExecutor } from "./stats";

// 사람 실측과 지금 GRADE_RULES의 모델 추정을 대조한다. DB에 남은 등급이 아니라 원시 운량으로 다시 매기므로,
// 기준을 고친 뒤 배포·regrade 전에 로컬에서 비교할 수 있다. pnpm calibrate가 월별 보정표와 함께 출력한다.

export type ReportPair = {
  hour: string;
  human: VisibilityGrade;
  lake: CloudLayers & { precipitation: number };
  summit: CloudLayers;
};

const pairRowSchema = z.object({
  hour: z.string(),
  human: z.enum(VISIBILITY_GRADES),
  low: z.coerce.number(),
  mid: z.coerce.number(),
  high: z.coerce.number(),
  precip: z.coerce.number(),
  summit_low: z.coerce.number(),
  summit_mid: z.coerce.number(),
  summit_high: z.coerce.number(),
});

// 통계(lib/db/stats.ts)처럼 실측을 그 정시 한 시간에 붙이고 낮 시각만 본다. 정상 기록이 없는 시각은 등급을 매길 수 없어 뺀다.
export async function queryReportPairs(db: SqlExecutor): Promise<ReportPair[]> {
  const result = await db.execute(sql`
    select
      to_char(w.time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as hour,
      h.grade::text as human,
      w.low_cloud_cover as low, w.mid_cloud_cover as mid, w.high_cloud_cover as high, w.precipitation as precip,
      s.low_cloud_cover as summit_low, s.mid_cloud_cover as summit_mid, s.high_cloud_cover as summit_high
    from human_report h
    join weather_hourly w on w.point = h.place and w.time = date_trunc('hour', h.observed_at)
    join weather_hourly s on s.point = ${SUMMIT.id} and s.time = w.time
    where w.daylight
    order by h.observed_at, h.id
  `);
  return result.rows.map((row) => {
    const r = pairRowSchema.parse(row);
    return {
      hour: r.hour,
      human: r.human,
      lake: { low: r.low, mid: r.mid, high: r.high, precipitation: r.precip },
      summit: { low: r.summit_low, mid: r.summit_mid, high: r.summit_high },
    };
  });
}

export type ReportAgreement = {
  reports: number;
  // 다섯 호수를 같은 시각에 이어서 기록하므로 실측 건수보다 서로 독립인 표본이 적다.
  hours: number;
  exact: number;
  // 등급 차이는 VISIBILITY_GRADES의 순서(완벽 0 … 안 보임 4)로 센다. bias가 양수면 모델이 더 나쁘게 본다.
  meanAbsError: number;
  bias: number;
  modelOnlyVisible: number;
  humanOnlyVisible: number;
  // matrix[실측][모델] = 건수
  matrix: Record<VisibilityGrade, Record<VisibilityGrade, number>>;
};

export function compareReports(pairs: readonly ReportPair[]): ReportAgreement | null {
  if (pairs.length === 0) return null;
  const zeros = () => Object.fromEntries(VISIBILITY_GRADES.map((grade) => [grade, 0])) as Record<VisibilityGrade, number>;
  const matrix = Object.fromEntries(VISIBILITY_GRADES.map((grade) => [grade, zeros()])) as ReportAgreement["matrix"];
  const visible = (grade: VisibilityGrade) => VISIBLE_GRADES.includes(grade);
  let exact = 0, absError = 0, diff = 0, modelOnlyVisible = 0, humanOnlyVisible = 0;
  for (const pair of pairs) {
    const model = estimateGrade(pair.lake, pair.summit);
    const d = VISIBILITY_GRADES.indexOf(model) - VISIBILITY_GRADES.indexOf(pair.human);
    matrix[pair.human][model] += 1;
    if (d === 0) exact += 1;
    absError += Math.abs(d);
    diff += d;
    if (visible(model) && !visible(pair.human)) modelOnlyVisible += 1;
    if (!visible(model) && visible(pair.human)) humanOnlyVisible += 1;
  }
  return {
    reports: pairs.length,
    hours: new Set(pairs.map((pair) => pair.hour)).size,
    exact,
    meanAbsError: absError / pairs.length,
    bias: diff / pairs.length,
    modelOnlyVisible,
    humanOnlyVisible,
    matrix,
  };
}

const LABEL = 12;
const COLUMN = 10;

// formatCalibration처럼 표 안은 영문과 숫자만 쓰고 설명은 아래에 둔다.
export function formatAgreement(agreement: ReportAgreement | null): string {
  if (agreement === null) return "[실측 대조] 낮 시각에 모델 기록과 짝지을 실측이 없다";
  const a = agreement;
  const percent = Math.round((a.exact / a.reports) * 100);
  const signed = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
  const header = "human\\model".padEnd(LABEL) + VISIBILITY_GRADES.map((grade) => grade.padStart(COLUMN)).join("");
  const rows = VISIBILITY_GRADES.map(
    (human) => human.padEnd(LABEL) + VISIBILITY_GRADES.map((model) => String(a.matrix[human][model]).padStart(COLUMN)).join(""),
  );
  return [
    `reports ${a.reports} in ${a.hours} hours   exact ${a.exact} (${percent}%)   MAE ${a.meanAbsError.toFixed(2)}   bias ${signed(a.bias)}`,
    `visible split: model only ${a.modelOnlyVisible}, human only ${a.humanOnlyVisible}`,
    header,
    ...rows,
    "",
    "[실측 대조] human_report를 같은 정시의 호수·정상 운량과 짝지어 지금 GRADE_RULES로 다시 매긴 등급과 비교한다(낮 시각만)",
    `${"hours".padEnd(8)}: 실측이 든 정시의 수. 같은 시각의 호수끼리는 정상 값을 함께 쓰므로 독립 표본은 이 수에 가깝다`,
    `${"MAE".padEnd(8)}: 등급 차이의 절댓값 평균(단계). bias: 모델 − 실측 평균, 양수면 모델이 더 나쁘게 본다`,
    `${"visible".padEnd(8)}: 구름 걸림 이상인지가 갈린 건수. model only = 모델만 보인다고 함, human only = 실측만 보였음`,
    `지금 기준: ${JSON.stringify(GRADE_RULES)}`,
  ].join("\n");
}
