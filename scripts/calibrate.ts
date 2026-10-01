// 등급 기준값과 "보인 날" 규칙 후보를 바꿔 가며 월별 보인 날 비율을 출력한다. 로컬에서 실행한다.
// 실행: pnpm calibrate   (.env.local의 DATABASE_URL)
import { calibrationLines, formatCalibration, queryCalibration } from "../lib/db/calibrate";
import { createDb, describeError } from "../lib/db/client";
import { requireDatabaseUrl } from "./env";

const databaseUrl = requireDatabaseUrl("calibrate");

let lines;
try {
  lines = calibrationLines(await queryCalibration(createDb(databaseUrl)));
} catch (error) {
  console.error(`[calibrate] 실패: ${describeError(error)}`);
  process.exit(1);
}

console.log(formatCalibration(lines));
