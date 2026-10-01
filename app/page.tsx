import { env } from "cloudflare:workers";
import { ExternalLink, Mountain } from "lucide-react";
import Link from "next/link";
import { Freshness } from "@/components/freshness";
import { GradeChip } from "@/components/grade-chip";
import { LakeCard } from "@/components/lake-card";
import { SpotCard } from "@/components/spot-card";
import { LAKES } from "@/lib/lakes";
import { readSnapshot } from "@/lib/snapshot/store";
import { cameraStateOf, currentHour, formatJstTime, freshnessOf, isNight } from "@/lib/view";
import { GRADE_DESCRIPTION, VISIBILITY_GRADES } from "@/lib/visibility";

export const dynamic = "force-dynamic";

const CAMERA_LABEL = { live: "● 방송 중", offline: "○ 링크만", unchecked: "확인 전" } as const;

export default async function Home() {
  const snapshot = await readSnapshot(env.SNAPSHOT_KV);
  const now = new Date();
  const byId = new Map(snapshot?.lakes.map((lake) => [lake.id, lake]) ?? []);
  const freshness = snapshot ? freshnessOf(snapshot) : null;
  const night = snapshot ? isNight(now, snapshot.sunrise, snapshot.sunset) : false;

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Mountain size={23} strokeWidth={1.8} aria-hidden /></span>
          <div><strong>FUJI NOW</strong><small>후지 5호 라이브</small></div>
        </div>
        {freshness && <Freshness at={freshness.at} partial={freshness.kind === "partial"} />}
      </header>

      <section className="intro">
        <h1>지금, 후지산이 보일까?</h1>
        <p className="subcopy">
          후지 5호의 라이브 카메라와 기상청 MSM 예보를 나눠서 보여줍니다. 운량은 예보 모델 값이니, 실제로 보이는지는 카메라로 확인하세요.
        </p>
        <details className="grade-legend">
          <summary>전망 5단계 보는 법</summary>
          <p>
            호수와 후지산 정상 격자의 하층·중층 운량, 호수의 강수 예보로 매긴 모델 추정입니다. 단계 이름은 후지산 웹캠 연구
            FujiView의 5단계를 따랐습니다.
          </p>
          <dl>
            {VISIBILITY_GRADES.map((grade) => (
              <div key={grade} style={{ display: "contents" }}>
                <dt><GradeChip grade={grade} daylight /></dt>
                <dd>{GRADE_DESCRIPTION[grade]}</dd>
              </div>
            ))}
          </dl>
        </details>
        <p className="stats-link"><Link href="/stats">월별로 얼마나 보였는지 통계 보기 →</Link></p>
        {snapshot?.sunrise && snapshot.sunset && (
          <p className="sun">
            일출 {formatJstTime(snapshot.sunrise)} · 일몰 {formatJstTime(snapshot.sunset)} <span>(가와구치코 기준)</span>
          </p>
        )}
      </section>

      {snapshot === null ? (
        <section className="panel">
          <h2>준비 중</h2>
          <p className="muted">카메라와 기상 정보를 아직 불러오지 못했습니다. 아래 원본 카메라 페이지에서 직접 확인하세요.</p>
          <ul className="fallback-list">
            {LAKES.map((lake) => (
              <li key={lake.id}>
                <a href={lake.fallback.url} target="_blank" rel="noopener noreferrer">
                  {lake.name} — {lake.fallback.label} <ExternalLink size={14} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <section className="panel compare-wrap">
            <table className="compare-table">
              <thead>
                <tr><th>호수</th><th>전망</th><th>운량</th><th>기온</th><th>카메라</th></tr>
              </thead>
              <tbody>
                {LAKES.map((lake) => {
                  const data = byId.get(lake.id) ?? null;
                  const weather = data?.weather ?? null;
                  const hour = weather ? currentHour(weather, now) : null;
                  return (
                    <tr key={lake.id}>
                      <td><a href={`#lake-${lake.id}`}>{lake.name}</a></td>
                      <td>
                        <a href={`#lake-${lake.id}`} tabIndex={-1}>
                          {hour ? <GradeChip grade={hour.grade} daylight={hour.daylight} /> : "—"}
                        </a>
                      </td>
                      <td><a href={`#lake-${lake.id}`} tabIndex={-1}>{weather ? `${weather.cloudCover}%` : "—"}</a></td>
                      <td><a href={`#lake-${lake.id}`} tabIndex={-1}>{weather ? `${Math.round(weather.temperature)}°` : "—"}</a></td>
                      <td><a href={`#lake-${lake.id}`} tabIndex={-1}>{CAMERA_LABEL[cameraStateOf(data).kind]}</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <div className="lake-grid">
            {LAKES.map((lake) => (
              <LakeCard
                key={lake.id}
                lake={lake}
                data={byId.get(lake.id) ?? null}
                observation={snapshot.observations.find((o) => o.id === lake.station) ?? null}
                night={night}
                now={now}
              />
            ))}
            <SpotCard part={snapshot.spots} night={night} />
          </div>
        </>
      )}
    </main>
  );
}
