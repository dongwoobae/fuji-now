import { z } from "zod";
import { FORECAST_POINTS, SUMMIT, type ForecastPoint, type LakeId, type PointId } from "./lakes";
import type { LakeWeather } from "./snapshot/schema";
import { estimateGrade, type VisibilityGrade } from "./visibility";

// MSM 격자는 위도 0.05°·경도 0.0625°다. 쇼지코·모토스코가 서로 바뀌면 요청 좌표와 경도가 0.037° 이상 어긋나므로 그보다 좁게 잡는다. 이 값은 경도 반 칸(0.03125°)보다 좁아서, 경도가 격자선 사이 한가운데에 가까운 호수를 추가하면 정상 응답도 실패한다.
export const COORDINATE_TOLERANCE = 0.03;
export const FORECAST_HOURS = 9;

const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
// MSM은 실행 시각에 따라 예보 길이가 달라 먼 시각은 null로 올 수 있다.
const hourlyValues = z.array(z.number().nullable());

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  // 과거 예보(백필) 요청에는 current가 없다.
  current: z
    .object({
      time: localTime,
      temperature_2m: z.number(),
      cloud_cover: z.number(),
      precipitation: z.number(),
      wind_speed_10m: z.number(),
    })
    .optional(),
  hourly: z.object({
    time: z.array(localTime),
    cloud_cover_low: hourlyValues,
    cloud_cover_mid: hourlyValues,
    cloud_cover_high: hourlyValues,
    precipitation: hourlyValues,
  }),
  daily: z.object({
    time: z.array(z.string()),
    sunrise: z.array(localTime).min(1),
    sunset: z.array(localTime).min(1),
  }),
});

const weatherResponseSchema = z.array(locationSchema);
type Location = z.infer<typeof locationSchema>;

export type PointHour = {
  time: string;
  lowCloudCover: number;
  midCloudCover: number;
  highCloudCover: number;
  precipitation: number;
  daylight: boolean;
};

export type PointForecast = { id: PointId; location: Location; hourly: PointHour[] };

export type GradedHour = PointHour & { grade: VisibilityGrade | null };

export type WeatherResult = { byLake: Record<LakeId, LakeWeather>; sunrise: string; sunset: string };

// Open-Meteo는 timezone을 지정하면 오프셋 없는 현지 시각을 준다. 일본은 서머타임이 없어 +09:00으로 고정할 수 있다.
export function toJstIso(local: string): string {
  return `${local}:00+09:00`;
}

function msmUrl(base: string, points: readonly ForecastPoint[]): URL {
  const url = new URL(base);
  url.searchParams.set("latitude", points.map((point) => point.latitude).join(","));
  url.searchParams.set("longitude", points.map((point) => point.longitude).join(","));
  url.searchParams.set("models", "jma_msm");
  // 기본값(land)은 표고가 비슷한 육지 격자를 골라 최근접이 아닐 수 있다. 좌표 대조가 최근접 격자를 전제로 한다.
  url.searchParams.set("cell_selection", "nearest");
  url.searchParams.set("hourly", "cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation");
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("timezone", "Asia/Tokyo");
  return url;
}

export function buildWeatherUrl(points: readonly ForecastPoint[], forecastHours: number = FORECAST_HOURS): URL {
  const url = msmUrl("https://api.open-meteo.com/v1/forecast", points);
  url.searchParams.set("current", "temperature_2m,cloud_cover,precipitation,wind_speed_10m");
  url.searchParams.set("forecast_hours", String(forecastHours));
  url.searchParams.set("wind_speed_unit", "ms");
  return url;
}

// 과거 예보 API는 시각마다 그 무렵 실행의 첫 시간대 값을 이어 붙여 준다. 날짜는 일본 날짜(YYYY-MM-DD)이고 양 끝을 포함한다.
export function buildHistoryUrl(points: readonly ForecastPoint[], startDate: string, endDate: string): URL {
  const url = msmUrl("https://historical-forecast-api.open-meteo.com/v1/forecast", points);
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  return url;
}

// 시각이 그날 일출 이후, 일몰 이전에 시작하면 낮으로 본다. 그날의 일출·일몰이 응답에 없으면 낮이 아닌 것으로 둔다.
function daylightOf(local: string, daily: Location["daily"]): boolean {
  const day = daily.time.indexOf(local.slice(0, 10));
  if (day < 0 || daily.sunrise[day] === undefined || daily.sunset[day] === undefined) return false;
  const t = Date.parse(toJstIso(local));
  return t >= Date.parse(toJstIso(daily.sunrise[day])) && t < Date.parse(toJstIso(daily.sunset[day]));
}

export function parseForecastPoints(json: unknown, points: readonly ForecastPoint[]): PointForecast[] {
  const locations = weatherResponseSchema.parse(json);
  if (locations.length !== points.length) {
    throw new Error(`Open-Meteo returned ${locations.length} locations for ${points.length} points`);
  }
  return points.map((point, i) => {
    const location = locations[i];
    if (
      Math.abs(location.latitude - point.latitude) > COORDINATE_TOLERANCE ||
      Math.abs(location.longitude - point.longitude) > COORDINATE_TOLERANCE
    ) {
      throw new Error(`Open-Meteo location ${i} does not match ${point.id}`);
    }
    const { time, cloud_cover_low: low, cloud_cover_mid: mid, cloud_cover_high: high, precipitation } = location.hourly;
    if ([low, mid, high, precipitation].some((values) => values.length !== time.length)) {
      throw new Error(`Open-Meteo hourly arrays differ in length for ${point.id}`);
    }
    const hourly: PointHour[] = [];
    time.forEach((hour, h) => {
      const [l, m, hi, p] = [low[h], mid[h], high[h], precipitation[h]];
      if (l === null || m === null || hi === null || p === null) return;
      hourly.push({
        time: toJstIso(hour),
        lowCloudCover: l,
        midCloudCover: m,
        highCloudCover: hi,
        precipitation: p,
        daylight: daylightOf(hour, location.daily),
      });
    });
    return { id: point.id, location, hourly };
  });
}

// 호수 시각마다 같은 시각의 정상 구름과 합쳐 등급을 매긴다. 정상은 등급이 없다. 정상 값이 없는 시각의 호수도 등급 없이 둔다.
export function gradeHours(forecasts: readonly PointForecast[]): Map<PointId, GradedHour[]> {
  const summit = forecasts.find((forecast) => forecast.id === SUMMIT.id);
  if (!summit) throw new Error("Summit point is not in the forecast");
  const summitAt = new Map(summit.hourly.map((hour) => [hour.time, hour]));
  return new Map(
    forecasts.map((forecast) => [
      forecast.id,
      forecast.hourly.map((hour): GradedHour => {
        const top = summitAt.get(hour.time);
        const grade =
          forecast.id === SUMMIT.id || !top
            ? null
            : estimateGrade(
                { low: hour.lowCloudCover, mid: hour.midCloudCover, high: hour.highCloudCover, precipitation: hour.precipitation },
                { low: top.lowCloudCover, mid: top.midCloudCover, high: top.highCloudCover },
              );
        return { ...hour, grade };
      }),
    ]),
  );
}

export function parseWeatherResponse(json: unknown, points: readonly ForecastPoint[], sunLake: LakeId): WeatherResult {
  const forecasts = parseForecastPoints(json, points);
  const graded = gradeHours(forecasts);
  const byLake = {} as Record<LakeId, LakeWeather>;
  let sun: { sunrise: string; sunset: string } | null = null;
  for (const { id, location } of forecasts) {
    if (id === SUMMIT.id) continue;
    if (!location.current) throw new Error(`Open-Meteo returned no current weather for ${id}`);
    byLake[id] = {
      time: toJstIso(location.current.time),
      temperature: location.current.temperature_2m,
      cloudCover: location.current.cloud_cover,
      precipitation: location.current.precipitation,
      windSpeed: location.current.wind_speed_10m,
      hourly: (graded.get(id) ?? []).map((hour) => ({
        time: hour.time,
        lowCloudCover: hour.lowCloudCover,
        precipitation: hour.precipitation,
        grade: hour.grade,
        daylight: hour.daylight,
      })),
    };
    if (id === sunLake) {
      sun = { sunrise: toJstIso(location.daily.sunrise[0]), sunset: toJstIso(location.daily.sunset[0]) };
    }
  }
  if (sun === null) throw new Error(`Sun reference lake ${sunLake} is not in the lake list`);
  return { byLake, ...sun };
}

export async function fetchForecastPoints(
  points: readonly ForecastPoint[],
  forecastHours: number,
  signal: AbortSignal,
): Promise<PointForecast[]> {
  const response = await fetch(buildWeatherUrl(points, forecastHours), { signal });
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
  return parseForecastPoints(await response.json(), points);
}

export async function fetchWeather(sunLake: LakeId, signal: AbortSignal): Promise<WeatherResult> {
  const response = await fetch(buildWeatherUrl(FORECAST_POINTS), { signal });
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
  return parseWeatherResponse(await response.json(), FORECAST_POINTS, sunLake);
}
