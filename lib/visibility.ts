// 단계 이름은 FujiView(WACV 2026)가 웹캠 사진에 붙인 5단계 라벨을 따른다. 정의 문장은 이 사이트가 정한 것이다.
export const VISIBILITY_GRADES = ["perfect", "clear", "cloudy", "obscured", "bad"] as const;
export type VisibilityGrade = (typeof VISIBILITY_GRADES)[number];

export const GRADE_LABEL: Record<VisibilityGrade, string> = {
  perfect: "완벽",
  clear: "잘 보임",
  cloudy: "구름 걸림",
  obscured: "거의 가려짐",
  bad: "안 보임",
};

export const GRADE_DESCRIPTION: Record<VisibilityGrade, string> = {
  perfect: "정상부터 산기슭까지 구름 없이 선명하다",
  clear: "전체 윤곽이 보이고, 옅은 구름이나 연무가 조금 있다",
  cloudy: "정상이나 중턱 일부가 가려졌지만 후지산으로 알아볼 수 있다",
  obscured: "실루엣 일부만 보인다",
  bad: "전혀 보이지 않는다",
};

export type CloudLayers = { low: number; mid: number; high: number };

// obscuredCover(알아볼 수 있는지의 경계)는 2026-10-01 pnpm calibrate로 정했다. 2018-08~2026-09 MSM으로 월별 "보인 날" 비율을
// 북쪽 참고 곡선과 비교해 가장 가까운 값(20, 평균 차이 9%p)이다. 나머지 경계는 그에 맞춰 비례로 좁힌 값이고 보정하지 않았다.
// 사람 실측이 쌓이면 다시 맞춘다. 기준을 바꾸면 pnpm regrade로 DB의 과거 등급을 다시 계산한다.
export const GRADE_RULES = {
  badCover: 60,
  badPrecipitation: 1,
  obscuredCover: 20,
  obscuredPrecipitation: 0.5,
  cloudyCover: 10,
  clearCover: 3,
  clearHighCover: 60,
} as const;

// 정상은 3,776m라 하층(3km까지)과 중층(3~8km) 구름이 모두 가린다. 호수에서 정상까지의 시선은 호수 쪽에서 하층을, 정상 쪽에서 하층·중층을 지난다.
// 상층 구름은 산을 가리지 않지만 하늘이 흐려 선명도가 떨어지므로 "완벽"만 막는다.
export function estimateGrade(lake: CloudLayers & { precipitation: number }, summit: CloudLayers): VisibilityGrade {
  const cover = Math.max(lake.low, summit.low, summit.mid);
  const r = GRADE_RULES;
  if (lake.precipitation >= r.badPrecipitation || cover >= r.badCover) return "bad";
  if (lake.precipitation >= r.obscuredPrecipitation || cover >= r.obscuredCover) return "obscured";
  if (cover >= r.cloudyCover) return "cloudy";
  if (cover >= r.clearCover || summit.high >= r.clearHighCover) return "clear";
  return "perfect";
}

// 사람 실측이 있으면 그것이 그 시각의 등급이다. 모델 추정은 실측이 없을 때만 쓴다.
export function resolveGrade(human: VisibilityGrade | null, model: VisibilityGrade | null): VisibilityGrade | null {
  return human ?? model;
}

export function isVisibilityGrade(value: unknown): value is VisibilityGrade {
  return typeof value === "string" && (VISIBILITY_GRADES as readonly string[]).includes(value);
}
