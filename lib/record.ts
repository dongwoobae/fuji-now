import type { ForecastRow, WeatherHourlyRow } from "./db/schema";
import { gradeHours, type GradedHour, type PointForecast } from "./weather";

// 정각 기준 0~72시간 뒤까지 받는다. MSM 예보 길이(최대 78시간) 안이다.
export const RECORD_HOURS = 73;
// 예보를 남길 리드타임. 1시간 간격으로 다 남기면 하루 1만 행이 넘어 무료 저장 용량을 빨리 쓴다.
export const RECORD_LEADS = [1, 3, 6, 8, 12, 24, 48, 72] as const;

const HOUR_MS = 3_600_000;

export type RecordRows = { actual: WeatherHourlyRow[]; forecasts: ForecastRow[] };

export function hourStartOf(now: Date): Date {
  return new Date(now.getTime() - (now.getTime() % HOUR_MS));
}

type HourValues = Omit<WeatherHourlyRow, "time" | "source">;

function valuesOf(point: string, hour: GradedHour, fetchedAt: Date): HourValues {
  return {
    point,
    lowCloudCover: Math.round(hour.lowCloudCover),
    midCloudCover: Math.round(hour.midCloudCover),
    highCloudCover: Math.round(hour.highCloudCover),
    precipitation: hour.precipitation,
    grade: hour.grade,
    daylight: hour.daylight,
    fetchedAt,
  };
}

// 매시 받은 응답에서 리드 0(이번 정각)은 weather_hourly로, RECORD_LEADS에 있는 리드는 forecast로 나눈다.
export function buildRecordRows(forecasts: readonly PointForecast[], now: Date): RecordRows {
  const base = hourStartOf(now).getTime();
  const rows: RecordRows = { actual: [], forecasts: [] };
  for (const [point, hours] of gradeHours(forecasts)) {
    for (const hour of hours) {
      const lead = (Date.parse(hour.time) - base) / HOUR_MS;
      const values = valuesOf(point, hour, now);
      if (lead === 0) rows.actual.push({ ...values, time: new Date(hour.time), source: "live" });
      else if ((RECORD_LEADS as readonly number[]).includes(lead)) {
        rows.forecasts.push({ ...values, targetTime: new Date(hour.time), leadHours: lead });
      }
    }
  }
  return rows;
}

// 과거 예보 응답은 시각마다 그 무렵 실행의 첫 시간대 값이라, 매시 기록의 리드 0과 같은 자리(weather_hourly)에 넣는다.
export function buildBackfillRows(forecasts: readonly PointForecast[], fetchedAt: Date): WeatherHourlyRow[] {
  const rows: WeatherHourlyRow[] = [];
  for (const [point, hours] of gradeHours(forecasts)) {
    for (const hour of hours) rows.push({ ...valuesOf(point, hour, fetchedAt), time: new Date(hour.time), source: "backfill" });
  }
  return rows;
}
