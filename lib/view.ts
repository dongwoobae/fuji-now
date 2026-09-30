import type { Camera, LakeSnapshot, LakeWeather, Snapshot } from "./snapshot/schema";

export const STALE_AFTER_MS = 20 * 60 * 1000;
export const CALM_WIND_MAX_MS = 1.2;
export const OUTLOOK_HOURS = 8;

export type Freshness = { kind: "partial" } | { kind: "checked"; at: string };

export function freshnessOf(snapshot: Snapshot): Freshness {
  let oldest: string | null = null;
  for (const lake of snapshot.lakes) {
    for (const at of [lake.cameraCheckedAt, lake.weatherCheckedAt]) {
      if (at === null) return { kind: "partial" };
      if (oldest === null || Date.parse(at) < Date.parse(oldest)) oldest = at;
    }
  }
  return oldest === null ? { kind: "partial" } : { kind: "checked", at: oldest };
}

export function isStale(at: string, nowMs: number): boolean {
  return nowMs - Date.parse(at) > STALE_AFTER_MS;
}

export function isNight(now: Date, sunrise: string | null, sunset: string | null): boolean {
  if (sunrise === null || sunset === null) return false;
  const t = now.getTime();
  return t < Date.parse(sunrise) || t > Date.parse(sunset);
}

export function windLabel(speed: number): "잔잔함" | "물결 있음" {
  return speed <= CALM_WIND_MAX_MS ? "잔잔함" : "물결 있음";
}

export function upcomingHours(weather: LakeWeather, now: Date): LakeWeather["hourly"] {
  const hourStart = now.getTime() - (now.getTime() % 3_600_000);
  return weather.hourly.filter((hour) => Date.parse(hour.time) >= hourStart).slice(0, OUTLOOK_HOURS);
}

export type CameraState = { kind: "unchecked" } | { kind: "offline" } | { kind: "live"; camera: Camera };

export function cameraStateOf(lake: LakeSnapshot | null): CameraState {
  if (lake === null || lake.cameraCheckedAt === null) return { kind: "unchecked" };
  return lake.camera ? { kind: "live", camera: lake.camera } : { kind: "offline" };
}

const jstTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatJstTime(iso: string): string {
  return jstTime.format(new Date(iso));
}
