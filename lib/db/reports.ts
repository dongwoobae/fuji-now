import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { ReportInput } from "../report";
import type { Db } from "./client";
import { humanReport, weatherHourly } from "./schema";

export async function insertReport(db: Db, input: ReportInput): Promise<number> {
  const [row] = await db.insert(humanReport).values(input).returning({ id: humanReport.id });
  return row.id;
}

export async function deleteReport(db: Db, id: number): Promise<void> {
  await db.delete(humanReport).where(eq(humanReport.id, id));
}

// 관측 시각이 아니라 입력 시각으로 본다. 지난 시각을 나중에 적은 호수도 방금 기록한 호수다.
// 입력 시각은 DB 시계(defaultNow)로 찍히므로 워커 시계 대신 DB의 now()와 비교한다.
export async function placesReportedWithin(db: Db, windowMs: number): Promise<string[]> {
  const since = sql`now() - ${Math.round(windowMs / 1000)}::int * interval '1 second'`;
  const rows = await db.selectDistinct({ place: humanReport.place }).from(humanReport).where(gte(humanReport.createdAt, since));
  return rows.map((row) => row.place);
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
