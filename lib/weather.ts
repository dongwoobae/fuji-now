import { z } from "zod";
import type { Lake, LakeId } from "./lakes";
import type { LakeWeather } from "./snapshot/schema";

// MSM 격자는 위도 0.05°·경도 0.0625°다. 쇼지코·모토스코가 서로 바뀌면 요청 좌표와 경도가 0.037° 이상 어긋나므로 그보다 좁게 잡는다. 이 값은 경도 반 칸(0.03125°)보다 좁아서, 경도가 격자선 사이 한가운데에 가까운 호수를 추가하면 정상 응답도 실패한다.
export const COORDINATE_TOLERANCE = 0.03;
export const FORECAST_HOURS = 9;

const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  current: z.object({
    time: localTime,
    temperature_2m: z.number(),
    cloud_cover: z.number(),
    precipitation: z.number(),
    wind_speed_10m: z.number(),
  }),
  hourly: z.object({
    time: z.array(localTime),
    cloud_cover: z.array(z.number()),
    precipitation: z.array(z.number()),
  }),
  daily: z.object({
    time: z.array(z.string()),
    sunrise: z.array(localTime).min(1),
    sunset: z.array(localTime).min(1),
  }),
});

const weatherResponseSchema = z.array(locationSchema);

export type WeatherResult = { byLake: Record<LakeId, LakeWeather>; sunrise: string; sunset: string };

// Open-Meteo는 timezone을 지정하면 오프셋 없는 현지 시각을 준다. 일본은 서머타임이 없어 +09:00으로 고정할 수 있다.
export function toJstIso(local: string): string {
  return `${local}:00+09:00`;
}

export function buildWeatherUrl(lakes: readonly Lake[]): URL {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lakes.map((lake) => lake.latitude).join(","));
  url.searchParams.set("longitude", lakes.map((lake) => lake.longitude).join(","));
  url.searchParams.set("models", "jma_msm");
  // 기본값(land)은 표고가 비슷한 육지 격자를 골라 최근접이 아닐 수 있다. 좌표 대조가 최근접 격자를 전제로 한다.
  url.searchParams.set("cell_selection", "nearest");
  url.searchParams.set("current", "temperature_2m,cloud_cover,precipitation,wind_speed_10m");
  url.searchParams.set("hourly", "cloud_cover,precipitation");
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("forecast_hours", String(FORECAST_HOURS));
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "Asia/Tokyo");
  return url;
}

export function parseWeatherResponse(json: unknown, lakes: readonly Lake[], sunLake: LakeId): WeatherResult {
  const locations = weatherResponseSchema.parse(json);
  if (locations.length !== lakes.length) {
    throw new Error(`Open-Meteo returned ${locations.length} locations for ${lakes.length} lakes`);
  }
  const byLake = {} as Record<LakeId, LakeWeather>;
  let sun: { sunrise: string; sunset: string } | null = null;
  for (const [i, lake] of lakes.entries()) {
    const location = locations[i];
    if (
      Math.abs(location.latitude - lake.latitude) > COORDINATE_TOLERANCE ||
      Math.abs(location.longitude - lake.longitude) > COORDINATE_TOLERANCE
    ) {
      throw new Error(`Open-Meteo location ${i} does not match ${lake.id}`);
    }
    const { time, cloud_cover: cloud, precipitation } = location.hourly;
    if (cloud.length !== time.length || precipitation.length !== time.length) {
      throw new Error(`Open-Meteo hourly arrays differ in length for ${lake.id}`);
    }
    byLake[lake.id] = {
      time: toJstIso(location.current.time),
      temperature: location.current.temperature_2m,
      cloudCover: location.current.cloud_cover,
      precipitation: location.current.precipitation,
      windSpeed: location.current.wind_speed_10m,
      hourly: time.map((hour, h) => ({ time: toJstIso(hour), cloudCover: cloud[h], precipitation: precipitation[h] })),
    };
    if (lake.id === sunLake) {
      sun = { sunrise: toJstIso(location.daily.sunrise[0]), sunset: toJstIso(location.daily.sunset[0]) };
    }
  }
  if (sun === null) throw new Error(`Sun reference lake ${sunLake} is not in the lake list`);
  return { byLake, ...sun };
}

export async function fetchWeather(lakes: readonly Lake[], sunLake: LakeId, signal: AbortSignal): Promise<WeatherResult> {
  const response = await fetch(buildWeatherUrl(lakes), { signal });
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
  return parseWeatherResponse(await response.json(), lakes, sunLake);
}
