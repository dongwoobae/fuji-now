import type { CameraCard } from "./lakes";
import type { Camera, CameraPart, LakeWeather, Snapshot } from "./snapshot/schema";

export const STALE_AFTER_MS = 20 * 60 * 1000;
export const CALM_WIND_MAX_MS = 1.2;
export const OUTLOOK_HOURS = 8;

export type Freshness = { kind: "partial"; at: string | null } | { kind: "checked"; at: string };

export function freshnessOf(snapshot: Snapshot): Freshness {
  let oldest: string | null = null;
  let partial = false;
  for (const lake of snapshot.lakes) {
    for (const at of [lake.cameraCheckedAt, lake.weatherCheckedAt]) {
      if (at === null) partial = true;
      else if (oldest === null || Date.parse(at) < Date.parse(oldest)) oldest = at;
    }
  }
  if (partial || oldest === null) return { kind: "partial", at: oldest };
  return { kind: "checked", at: oldest };
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

export function currentHour(weather: LakeWeather, now: Date): LakeWeather["hourly"][number] | null {
  const hourStart = now.getTime() - (now.getTime() % 3_600_000);
  return weather.hourly.find((hour) => Date.parse(hour.time) === hourStart) ?? null;
}

export type CameraState = { kind: "none" } | { kind: "unchecked" } | { kind: "offline" } | { kind: "live"; cameras: Camera[] };

export function cameraStateOf(card: Pick<CameraCard, "candidates">, part: CameraPart | null): CameraState {
  if (card.candidates.length === 0) return { kind: "none" };
  if (part === null || part.cameraCheckedAt === null) return { kind: "unchecked" };
  return part.cameras.length > 0 ? { kind: "live", cameras: part.cameras } : { kind: "offline" };
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
