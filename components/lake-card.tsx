import { OBSERVATION_STATIONS, type Lake } from "@/lib/lakes";
import type { LakeSnapshot, Observation } from "@/lib/snapshot/schema";
import { formatJstTime, upcomingHours, windLabel } from "@/lib/view";
import { CameraSlot } from "./camera-slot";
import { GradeChip } from "./grade-chip";

type Props = { lake: Lake; data: LakeSnapshot | null; observation: Observation | null; night: boolean; now: Date };

const mm = (value: number | null) => (value === null ? "—" : `${value}mm`);

export function LakeCard({ lake, data, observation, night, now }: Props) {
  const weather = data?.weather ?? null;

  return (
    <article className="panel lake-card" id={`lake-${lake.id}`}>
      <header className="lake-head">
        <h2>{lake.name}</h2>
        {night && <span className="tag">야간 — 화면이 어두울 수 있음</span>}
      </header>

      {weather ? (
        <div className="lake-metrics">
          <div><span>운량</span><strong>{weather.cloudCover}%</strong></div>
          <div><span>기온</span><strong>{Math.round(weather.temperature)}°</strong></div>
          <div><span>강수</span><strong>{weather.precipitation}mm</strong><small>예보</small></div>
          <div>
            <span>바람</span>
            <strong>{weather.windSpeed.toFixed(1)}m/s</strong>
            <small>{windLabel(weather.windSpeed)} · 참고</small>
          </div>
        </div>
      ) : (
        <p className="muted">기상 정보 없음</p>
      )}

      {observation && (
        <p className="observed">
          <span>관측 강수</span>
          <strong>1시간 {mm(observation.precipitation1h)} · 24시간 {mm(observation.precipitation24h)}</strong>
          <small>
            {OBSERVATION_STATIONS.find((station) => station.id === lake.station)?.name} 관측소 ·{" "}
            {formatJstTime(observation.observedAt)} 기준
          </small>
        </p>
      )}

      {weather && (
        <div className="hour-list">
          <div className="hour hour-head">
            <span>시각</span>
            <span>하층 운량 (예보)</span>
            <span />
            <span>강수</span>
            <span>전망</span>
          </div>
          {upcomingHours(weather, now).map((hour) => (
            <div className="hour" key={hour.time}>
              <span>{formatJstTime(hour.time)}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${hour.lowCloudCover}%` }} /></div>
              <strong>{hour.lowCloudCover}%</strong>
              <small>{hour.precipitation}mm</small>
              <GradeChip grade={hour.grade} daylight={hour.daylight} />
            </div>
          ))}
        </div>
      )}

      <CameraSlot card={lake} part={data} />
    </article>
  );
}
