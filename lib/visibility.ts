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

// 정상 가중치와 obscuredCover·clearCover는 2026-10-20 사람 실측과 대조해 정했다. 근거와 한계는 설계 문서의 "보정 (2026-10-20)".
// pnpm calibrate가 지금 값으로 실측 대조표를 낸다. 기준을 바꾸면 pnpm regrade로 DB의 과거 등급을 다시 계산한다.
export const GRADE_RULES = {
  summitLowWeight: 0.8,
  summitMidWeight: 0.5,
  badCover: 60,
  badPrecipitation: 1,
  obscuredCover: 30,
  obscuredPrecipitation: 0.5,
  cloudyCover: 10,
  clearCover: 5,
  clearHighCover: 60,
} as const;

// 정상은 3,776m라 하층(3km까지)과 중층(3~8km) 구름이 모두 가린다. 호수에서 정상까지의 시선은 호수 쪽에서 하층을, 정상 쪽에서 하층·중층을 지난다.
// 정상 격자 값을 그대로 쓰면 실측보다 가림이 컸다. 그래서 줄여 넣고, 중층만으로는 "안 보임"에 닿지 않는다.
// 상층 구름은 산을 가리지 않지만 하늘이 흐려 선명도가 떨어지므로 "완벽"만 막는다.
export function estimateGrade(lake: CloudLayers & { precipitation: number }, summit: CloudLayers): VisibilityGrade {
  const r = GRADE_RULES;
  const cover = Math.max(lake.low, r.summitLowWeight * summit.low, r.summitMidWeight * summit.mid);
  if (lake.precipitation >= r.badPrecipitation || cover >= r.badCover) return "bad";
  if (lake.precipitation >= r.obscuredPrecipitation || cover >= r.obscuredCover) return "obscured";
  if (cover >= r.cloudyCover) return "cloudy";
  if (cover >= r.clearCover || summit.high >= r.clearHighCover) return "clear";
  return "perfect";
}
