import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { LAKES } from "@/lib/lakes";
import { cellOf, readStats, sumCounts, VISIBLE_GRADES, visibleShare, type Counts, type Stats } from "@/lib/stats";
import { GRADE_LABEL, VISIBILITY_GRADES } from "@/lib/visibility";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "월별 통계 | FUJI NOW" };

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
// 보인 날 비율은 파랑 한 색의 순차 램프(옅음 → 짙음)로 칠한다. 400단계(#3987e5)부터는 흰 글씨가 더 잘 읽힌다.
const SEQUENTIAL = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
const LIGHT_TEXT_FROM = 6;

const percent = (share: number) => `${Math.round(share * 100)}%`;
const jstDateTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });

function shareStyle(share: number) {
  const step = Math.round(share * (SEQUENTIAL.length - 1));
  return { background: SEQUENTIAL[step], color: step >= LIGHT_TEXT_FROM ? "#ffffff" : "#163341" };
}

// 열(호수)마다 그 달의 값을 꺼내는 방법. 첫 열은 다섯 호수를 합친 값이다.
type Column = { key: string; name: string; at: (stats: Stats, month: number) => Counts | null };
const COLUMNS: Column[] = [
  ...LAKES.map((lake): Column => ({ key: lake.id, name: lake.name, at: (stats, month) => cellOf(stats, lake.id, month) })),
  { key: "all", name: "5호 전체", at: (stats, month) => sumCounts(stats.cells.filter((cell) => cell.month === month)) },
];

function ShareCell({ cell, label }: { cell: Counts | null; label: string }) {
  const share = visibleShare(cell);
  if (cell === null || share === null) return <td className="stats-empty">—</td>;
  const human = cell.humanDays > 0 ? `, 실측 포함 ${cell.humanDays}일` : "";
  return (
    <td style={shareStyle(share)} title={`${label}: 보인 날 ${cell.visibleDays}/${cell.days}일 (${percent(share)})${human}`}>
      <strong>{percent(share)}</strong>
      <small>{cell.days}일</small>
    </td>
  );
}

function GradeBar({ cell, label }: { cell: Counts | null; label: string }) {
  const hours = cell ? VISIBILITY_GRADES.reduce((acc, grade) => acc + cell.hours[grade], 0) : 0;
  if (!cell || hours === 0) return <div className="grade-bar grade-bar-empty" aria-label={`${label}: 자료 없음`} />;
  const visible = VISIBLE_GRADES.reduce((acc, grade) => acc + cell.hours[grade], 0) / hours;
  return (
    <>
      <div className="grade-bar" role="img" aria-label={VISIBILITY_GRADES.map((g) => `${GRADE_LABEL[g]} ${percent(cell.hours[g] / hours)}`).join(", ")}>
        {VISIBILITY_GRADES.map((grade) =>
          cell.hours[grade] > 0 ? (
            <span
              key={grade}
              className={`stack-${grade}`}
              style={{ flexGrow: cell.hours[grade] }}
              title={`${label} · ${GRADE_LABEL[grade]} ${percent(cell.hours[grade] / hours)} (${cell.hours[grade]}시간)`}
            />
          ) : null,
        )}
      </div>
      <small>{percent(visible)}</small>
    </>
  );
}

export default async function StatsPage() {
  const stats = await readStats(env.SNAPSHOT_KV);
  const humanDays = stats?.cells.reduce((acc, cell) => acc + cell.humanDays, 0) ?? 0;

  return (
    <main className="stats">
      <p><Link href="/">← 지금 화면으로</Link></p>
      <h1>월별로 보면, 후지산은 얼마나 보일까?</h1>
      <p className="subcopy">
        &quot;보인 날&quot;은 그날 낮 시간 중 후지산을 알아볼 수 있는 시간(구름 걸림 이상)이 한 시간이라도 있었던 날입니다. 기상청 MSM
        운량으로 매긴 모델 추정이고, 같은 시간대에 사람이 직접 본 기록이 있으면 그 기록을 씁니다.
      </p>

      {stats === null || stats.cells.length === 0 ? (
        <section className="panel">
          <h2>준비 중</h2>
          <p className="muted">통계를 아직 집계하지 않았습니다. 하루 한 번 새로 집계합니다.</p>
        </section>
      ) : (
        <>
          <p className="muted">
            자료 {stats.firstDay} ~ {stats.lastDay} · 실측 포함 {humanDays}일(호수별 합) · {jstDateTime.format(new Date(stats.computedAt))} 집계
          </p>

          <section className="panel stats-section">
            <h2>보인 날 비율</h2>
            <div className="stats-scale" aria-hidden>
              <span>0%</span>
              <div style={{ background: `linear-gradient(to right, ${SEQUENTIAL.join(", ")})` }} />
              <span>100%</span>
            </div>
            <div className="stats-table-wrap">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th scope="col">월</th>
                    {COLUMNS.map((column) => <th key={column.key} scope="col">{column.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((month) => (
                    <tr key={month}>
                      <th scope="row">{month}월</th>
                      {COLUMNS.map((column) => (
                        <ShareCell key={column.key} cell={column.at(stats, month)} label={`${column.name} ${month}월`} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              칸의 작은 숫자는 그 달에 집계한 날 수입니다. 5호 전체는 다섯 호수의 날 수를 더한 값입니다. 칸에 마우스를 올리면 보인 날 수가
              나옵니다.
            </p>
          </section>

          <section className="panel stats-section">
            <h2>낮 시간의 단계별 비율</h2>
            <ul className="stack-legend">
              {VISIBILITY_GRADES.map((grade) => (
                <li key={grade}><span className={`stack-${grade}`} />{GRADE_LABEL[grade]}</li>
              ))}
            </ul>
            <p className="muted">막대 오른쪽 숫자는 구름 걸림 이상인 시간의 비율입니다.</p>
            {[COLUMNS.at(-1)!, ...COLUMNS.slice(0, -1)].map((column, i) => (
              <details key={column.key} open={i === 0} className="stack-group">
                <summary>{column.name}</summary>
                <div className="stack-rows">
                  {MONTHS.map((month) => (
                    <div key={month} className="stack-row">
                      <span>{month}월</span>
                      <GradeBar cell={column.at(stats, month)} label={`${column.name} ${month}월`} />
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
