import { ExternalLink } from "lucide-react";
import type { Lake } from "@/lib/lakes";
import type { LakeSnapshot } from "@/lib/snapshot/schema";
import { cameraStateOf, formatJstTime, upcomingHours, windLabel } from "@/lib/view";
import { LakePlayer } from "./lake-player";

type Props = { lake: Lake; data: LakeSnapshot | null; night: boolean; now: Date };

export function LakeCard({ lake, data, night, now }: Props) {
  const camera = cameraStateOf(data);
  const weather = data?.weather ?? null;

  return (
    <article className="panel lake-card" id={`lake-${lake.id}`}>
      <header className="lake-head">
        <h2>{lake.name}</h2>
        {night && <span className="tag">야간 — 화면이 어두울 수 있음</span>}
      </header>

      {weather ? (
        <>
          <div className="lake-metrics">
            <div><span>운량</span><strong>{weather.cloudCover}%</strong></div>
            <div><span>기온</span><strong>{Math.round(weather.temperature)}°</strong></div>
            <div><span>강수</span><strong>{weather.precipitation}mm</strong></div>
            <div>
              <span>바람</span>
              <strong>{weather.windSpeed.toFixed(1)}m/s</strong>
              <small>{windLabel(weather.windSpeed)} · 참고</small>
            </div>
          </div>
          <div className="hour-list">
            {upcomingHours(weather, now).map((hour) => (
              <div className="hour" key={hour.time}>
                <span>{formatJstTime(hour.time)}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${hour.cloudCover}%` }} /></div>
                <strong>{hour.cloudCover}%</strong>
                <small>{hour.precipitation}mm</small>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">기상 정보 없음</p>
      )}

      {camera.kind === "live" ? (
        <LakePlayer videoId={camera.camera.videoId} lakeName={lake.name} channelTitle={camera.camera.channelTitle} />
      ) : (
        <div className="camera-empty">
          <p>{camera.kind === "unchecked" ? "방송 확인 전입니다." : "지금 방송 중인 카메라가 없습니다."}</p>
          <a href={lake.fallback.url} target="_blank" rel="noopener noreferrer">
            {lake.fallback.label} <ExternalLink size={14} aria-hidden />
          </a>
        </div>
      )}
    </article>
  );
}
