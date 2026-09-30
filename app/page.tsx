import { env } from "cloudflare:workers";
import { ExternalLink, Mountain } from "lucide-react";
import { Freshness } from "@/components/freshness";
import { LakeCard } from "@/components/lake-card";
import { LAKES } from "@/lib/lakes";
import { readSnapshot } from "@/lib/snapshot/store";
import { cameraStateOf, formatJstTime, freshnessOf, isNight } from "@/lib/view";

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
        {freshness && <Freshness at={freshness.kind === "checked" ? freshness.at : null} />}
      </header>

      <section className="intro">
        <h1>지금, 후지산이<br />보일까?</h1>
        <p className="subcopy">
          후지 5호의 라이브 카메라와 기상청 MSM 예보를 나눠서 보여줍니다. 운량은 예보 모델 값이니, 실제로 보이는지는 카메라로 확인하세요.
        </p>
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
                <tr><th>호수</th><th>운량</th><th>기온</th><th>카메라</th></tr>
              </thead>
              <tbody>
                {LAKES.map((lake) => {
                  const data = byId.get(lake.id) ?? null;
                  const weather = data?.weather ?? null;
                  return (
                    <tr key={lake.id}>
                      <td><a href={`#lake-${lake.id}`}>{lake.name}</a></td>
                      <td>{weather ? `${weather.cloudCover}%` : "—"}</td>
                      <td>{weather ? `${Math.round(weather.temperature)}°` : "—"}</td>
                      <td>{CAMERA_LABEL[cameraStateOf(data).kind]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <div className="lake-grid">
            {LAKES.map((lake) => (
              <LakeCard key={lake.id} lake={lake} data={byId.get(lake.id) ?? null} night={night} now={now} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
