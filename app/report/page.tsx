import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GradeChip } from "@/components/grade-chip";
import { createDb } from "@/lib/db/client";
import { recentReports } from "@/lib/db/reports";
import { LAKES } from "@/lib/lakes";
import { isReportAuthorized, NOTE_MAX_LENGTH, REPORT_COOKIE, toJstInputValue } from "@/lib/report";
import { formatJstTime } from "@/lib/view";
import { GRADE_DESCRIPTION, VISIBILITY_GRADES } from "@/lib/visibility";
import { login, logout, submitReport } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "실측 기록 | FUJI NOW", robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  code: "코드가 맞지 않습니다.",
  auth: "다시 로그인해 주세요.",
  input: "입력값을 확인해 주세요. 관측 시각은 미래일 수 없습니다.",
  db: "저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
};

const RECENT_LIMIT = 20;
const placeName = (id: string) => LAKES.find((lake) => lake.id === id)?.name ?? id;
const jstDate = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });

type Props = { searchParams: Promise<{ error?: string; saved?: string }> };

export default async function ReportPage({ searchParams }: Props) {
  const { error, saved } = await searchParams;
  const authorized = await isReportAuthorized((await cookies()).get(REPORT_COOKIE)?.value, env.REPORT_CODE);
  const message = error ? ERRORS[error] : saved ? "저장했습니다." : null;

  if (!authorized) {
    return (
      <main className="report">
        <h1>실측 기록</h1>
        <p className="muted">운영자 전용 페이지입니다.</p>
        {message && <p role="alert" className="report-message">{message}</p>}
        <form action={login} className="panel report-form">
          <label>
            <span>코드</span>
            <input name="code" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">들어가기</button>
        </form>
      </main>
    );
  }

  let reports: Awaited<ReturnType<typeof recentReports>> | null = null;
  if (env.DATABASE_URL) {
    try {
      reports = await recentReports(createDb(env.DATABASE_URL), RECENT_LIMIT);
    } catch {
      reports = null;
    }
  }

  return (
    <main className="report">
      <h1>실측 기록</h1>
      <p className="muted">
        눈으로 본 후지산을 5단계로 남깁니다. 같은 시간대에 실측이 있으면 통계는 모델 추정 대신 실측을 씁니다.
      </p>
      {message && <p role="alert" className="report-message">{message}</p>}

      <form action={submitReport} className="panel report-form">
        <label>
          <span>장소</span>
          <select name="place" required defaultValue="kawaguchiko">
            {LAKES.map((lake) => <option key={lake.id} value={lake.id}>{lake.name}</option>)}
          </select>
        </label>
        <label>
          <span>관측 시각 (일본 시각)</span>
          <input name="observedAt" type="datetime-local" required defaultValue={toJstInputValue(new Date())} />
        </label>
        <fieldset>
          <legend>보이는 정도</legend>
          {VISIBILITY_GRADES.map((grade) => (
            <label key={grade} className="grade-option">
              <input type="radio" name="grade" value={grade} required />
              <GradeChip grade={grade} daylight />
              <small>{GRADE_DESCRIPTION[grade]}</small>
            </label>
          ))}
        </fieldset>
        <label>
          <span>메모 (선택)</span>
          <textarea name="note" rows={2} maxLength={NOTE_MAX_LENGTH} />
        </label>
        <button type="submit">저장</button>
      </form>

      <section className="panel">
        <h2>최근 기록</h2>
        {reports === null ? (
          <p className="muted">기록을 불러오지 못했습니다.</p>
        ) : reports.length === 0 ? (
          <p className="muted">아직 기록이 없습니다.</p>
        ) : (
          <table className="report-table">
            <thead>
              <tr><th>시각</th><th>장소</th><th>실측</th><th>모델 추정</th><th>메모</th></tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>{jstDate.format(report.observedAt)} {formatJstTime(report.observedAt.toISOString())}</td>
                  <td>{placeName(report.place)}</td>
                  <td><GradeChip grade={report.grade} daylight /></td>
                  <td>
                    {report.modelGrade ? (
                      <GradeChip grade={report.modelGrade} daylight />
                    ) : (
                      <span className="muted">기록 없음</span>
                    )}
                  </td>
                  <td>{report.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <form action={logout}>
        <button type="submit" className="link-button">로그아웃</button>
      </form>
    </main>
  );
}
