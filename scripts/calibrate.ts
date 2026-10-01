// 등급 기준값과 "보인 날" 규칙 후보를 바꿔 가며 월별 보인 날 비율을 출력한다. 로컬에서 실행한다.
// 실행: pnpm calibrate   (.env.local의 DATABASE_URL)
import { createDb } from "../lib/db/client";
import { calibrationLines, formatCalibration, queryCalibration } from "../lib/db/calibrate";

try {
  process.loadEnvFile(".env.local");
} catch {}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("[calibrate] DATABASE_URL이 없다 (.env.local)");
  process.exit(1);
}

let lines;
try {
  lines = calibrationLines(await queryCalibration(createDb(databaseUrl)));
} catch (error) {
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : null;
  console.error(`[calibrate] 실패: ${cause ?? (error instanceof Error ? error.message.slice(0, 300) : String(error))}`);
  process.exit(1);
}

console.log(formatCalibration(lines));
