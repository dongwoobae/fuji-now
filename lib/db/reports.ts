import { and, desc, eq, sql } from "drizzle-orm";
import type { ReportInput } from "../report";
import type { Db } from "./client";
import { humanReport, weatherHourly } from "./schema";

export async function insertReport(db: Db, input: ReportInput): Promise<void> {
  await db.insert(humanReport).values(input);
}

// 실측마다 같은 호수·같은 시간대의 모델 추정을 붙인다. 일본은 UTC와 정수 시간 차이라 date_trunc('hour')가 세션 시간대와 상관없이 맞는다.
export async function recentReports(db: Db, limit: number) {
  return db
    .select({
      id: humanReport.id,
      place: humanReport.place,
      observedAt: humanReport.observedAt,
      grade: humanReport.grade,
      note: humanReport.note,
      modelGrade: weatherHourly.grade,
    })
    .from(humanReport)
    .leftJoin(
      weatherHourly,
      and(eq(weatherHourly.point, humanReport.place), eq(weatherHourly.time, sql`date_trunc('hour', ${humanReport.observedAt})`)),
    )
    .orderBy(desc(humanReport.observedAt), desc(humanReport.id))
    .limit(limit);
}
