import { GRADE_LABEL, type VisibilityGrade } from "@/lib/visibility";

// 밤에는 산이 보이지 않으니 등급 대신 "야간"을 보여준다. 등급 자체는 운량으로 계산해 DB에 남긴다.
export function GradeChip({ grade, daylight }: { grade: VisibilityGrade | null; daylight: boolean }) {
  if (!daylight) return <span className="grade grade-night">야간</span>;
  if (grade === null) return <span className="grade">—</span>;
  return <span className={`grade grade-${grade}`}>{GRADE_LABEL[grade]}</span>;
}
