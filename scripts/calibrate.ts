// 등급 기준값과 "보인 날" 규칙 후보를 바꿔 가며 월별 보인 날 비율을 출력하고, 지금 기준을 사람 실측과 대조한다. 로컬에서 실행한다.
// 실행: pnpm calibrate   (.env.local의 DATABASE_URL)
import { calibrationLines, formatCalibration, queryCalibration } from "../lib/db/calibrate";
import { createDb, describeError } from "../lib/db/client";
import { compareReports, formatAgreement, queryReportPairs } from "../lib/db/report-agreement";
import { requireDatabaseUrl } from "./env";

const databaseUrl = requireDatabaseUrl("calibrate");
const db = createDb(databaseUrl);

let lines, pairs;
try {
  [lines, pairs] = await Promise.all([queryCalibration(db).then(calibrationLines), queryReportPairs(db)]);
} catch (error) {
  console.error(`[calibrate] 실패: ${describeError(error)}`);
  process.exit(1);
}

console.log(formatCalibration(lines));
console.log("");
console.log(formatAgreement(compareReports(pairs)));
