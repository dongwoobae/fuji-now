import { SUN_REFERENCE_LAKE, type CameraCard, type Lake } from "../lakes";
import type { WeatherResult } from "../weather";
import { selectCameras, type VideoItem } from "../youtube";
import { CARRY_MAX_MS, type CameraPart, type LakeSnapshot, type Observation, type Snapshot } from "./schema";

export type SourceResult<T> = { ok: true; value: T } | { ok: false; error: string };

type BuildInput = {
  lakes: readonly Lake[];
  spots: CameraCard;
  previous: Snapshot | null;
  videos: SourceResult<VideoItem[]>;
  weather: SourceResult<WeatherResult>;
  observations: SourceResult<Observation[]>;
  now: Date;
};

export function buildSnapshot({ lakes, spots, previous, videos, weather, observations, now }: BuildInput): Snapshot | null {
  if (!videos.ok && !weather.ok && !observations.ok) return null;
  const nowIso = now.toISOString();
  const carryable = (checkedAt: string | null): checkedAt is string =>
    checkedAt !== null && now.getTime() - Date.parse(checkedAt) <= CARRY_MAX_MS;

  const cameraPartOf = (card: CameraCard, prev: CameraPart | null): CameraPart => {
    if (videos.ok) {
      return { ...selectCameras(card.candidates.map((candidate) => candidate.videoId), videos.value), cameraCheckedAt: nowIso };
    }
    if (prev && carryable(prev.cameraCheckedAt)) {
      return { cameras: prev.cameras, candidates: prev.candidates, cameraCheckedAt: prev.cameraCheckedAt };
    }
    return { cameras: [], candidates: [], cameraCheckedAt: null };
  };

  const lakeSnapshots = lakes.map((lake): LakeSnapshot => {
    const prev = previous?.lakes.find((candidate) => candidate.id === lake.id) ?? null;

    let weatherPart: Pick<LakeSnapshot, "weather" | "weatherCheckedAt">;
    if (weather.ok) {
      weatherPart = { weather: weather.value.byLake[lake.id], weatherCheckedAt: nowIso };
    } else if (prev && carryable(prev.weatherCheckedAt)) {
      weatherPart = { weather: prev.weather, weatherCheckedAt: prev.weatherCheckedAt };
    } else {
      weatherPart = { weather: null, weatherCheckedAt: null };
    }

    return { id: lake.id, ...cameraPartOf(lake, prev), ...weatherPart };
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

  let observed: Pick<Snapshot, "observations" | "observationsCheckedAt">;
  if (observations.ok) {
    observed = { observations: observations.value, observationsCheckedAt: nowIso };
  } else if (previous && carryable(previous.observationsCheckedAt)) {
    observed = { observations: previous.observations, observationsCheckedAt: previous.observationsCheckedAt };
  } else {
    observed = { observations: [], observationsCheckedAt: null };
  }

  return { writtenAt: nowIso, ...sun, lakes: lakeSnapshots, ...observed, spots: cameraPartOf(spots, previous?.spots ?? null) };
}
