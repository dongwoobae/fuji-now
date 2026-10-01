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

// 처음 정한 기준값이다. 사람 실측이 쌓이면 같은 시각의 모델 추정과 비교해 고친다. 원시 운량을 DB에 남기므로 바꿔도 과거를 다시 계산할 수 있다.
export const GRADE_RULES = {
  badCover: 85,
  badPrecipitation: 1,
  obscuredCover: 60,
  obscuredPrecipitation: 0.5,
  cloudyCover: 30,
  clearCover: 10,
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
