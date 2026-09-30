import { SUN_REFERENCE_LAKE, type Lake } from "../lakes";
import type { WeatherResult } from "../weather";
import { selectLakeCamera, type VideoItem } from "../youtube";
import { CARRY_MAX_MS, type LakeSnapshot, type Snapshot } from "./schema";

export type SourceResult<T> = { ok: true; value: T } | { ok: false; error: string };

type BuildInput = {
  lakes: readonly Lake[];
  previous: Snapshot | null;
  videos: SourceResult<VideoItem[]>;
  weather: SourceResult<WeatherResult>;
  now: Date;
};

export function buildSnapshot({ lakes, previous, videos, weather, now }: BuildInput): Snapshot | null {
  if (!videos.ok && !weather.ok) return null;
  const nowIso = now.toISOString();
  const carryable = (checkedAt: string | null): checkedAt is string =>
    checkedAt !== null && now.getTime() - Date.parse(checkedAt) <= CARRY_MAX_MS;

  const lakeSnapshots = lakes.map((lake): LakeSnapshot => {
    const prev = previous?.lakes.find((candidate) => candidate.id === lake.id) ?? null;

    let cameraPart: Pick<LakeSnapshot, "camera" | "candidates" | "cameraCheckedAt">;
    if (videos.ok) {
      cameraPart = { ...selectLakeCamera(lake.candidates, videos.value), cameraCheckedAt: nowIso };
    } else if (prev && carryable(prev.cameraCheckedAt)) {
      cameraPart = { camera: prev.camera, candidates: prev.candidates, cameraCheckedAt: prev.cameraCheckedAt };
    } else {
      cameraPart = { camera: null, candidates: [], cameraCheckedAt: null };
    }

    let weatherPart: Pick<LakeSnapshot, "weather" | "weatherCheckedAt">;
    if (weather.ok) {
      weatherPart = { weather: weather.value.byLake[lake.id], weatherCheckedAt: nowIso };
    } else if (prev && carryable(prev.weatherCheckedAt)) {
      weatherPart = { weather: prev.weather, weatherCheckedAt: prev.weatherCheckedAt };
    } else {
      weatherPart = { weather: null, weatherCheckedAt: null };
    }

    return { id: lake.id, ...cameraPart, ...weatherPart };
  });

  let sun: Pick<Snapshot, "sunrise" | "sunset">;
  if (weather.ok) {
    sun = { sunrise: weather.value.sunrise, sunset: weather.value.sunset };
  } else {
    const reference = previous?.lakes.find((candidate) => candidate.id === SUN_REFERENCE_LAKE);
    sun =
      previous && reference && carryable(reference.weatherCheckedAt)
        ? { sunrise: previous.sunrise, sunset: previous.sunset }
        : { sunrise: null, sunset: null };
  }

  return { writtenAt: nowIso, ...sun, lakes: lakeSnapshots };
}
