import { describe, expect, it } from "vitest";
import { LAKES, SUN_REFERENCE_LAKE } from "../lakes";
import type { VideoItem } from "../youtube";
import type { WeatherResult } from "../weather";
import { buildSnapshot, type SourceResult } from "./build";
import type { Observation } from "./schema";

const NOW = new Date("2026-09-29T07:00:00.000Z");
const minutesBefore = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const liveItem = (id: string): VideoItem => ({
  id,
  snippet: { title: `title ${id}`, channelTitle: "channel", liveBroadcastContent: "live" },
  status: { embeddable: true },
});
const allLive: SourceResult<VideoItem[]> = { ok: true, value: LAKES.flatMap((lake) => lake.candidates).map(liveItem) };

const weatherOf = (temperature: number): SourceResult<WeatherResult> => ({
  ok: true,
  value: {
    sunrise: "2026-09-29T05:37:00+09:00",
    sunset: "2026-09-29T17:32:00+09:00",
    byLake: {
      kawaguchiko: { time: "2026-09-29T16:00:00+09:00", temperature, cloudCover: 50, precipitation: 0, windSpeed: 1, hourly: [] },
      yamanakako: { time: "2026-09-29T16:00:00+09:00", temperature, cloudCover: 50, precipitation: 0, windSpeed: 1, hourly: [] },
      saiko: { time: "2026-09-29T16:00:00+09:00", temperature, cloudCover: 50, precipitation: 0, windSpeed: 1, hourly: [] },
      shojiko: { time: "2026-09-29T16:00:00+09:00", temperature, cloudCover: 50, precipitation: 0, windSpeed: 1, hourly: [] },
      motosuko: { time: "2026-09-29T16:00:00+09:00", temperature, cloudCover: 50, precipitation: 0, windSpeed: 1, hourly: [] },
    },
  },
});
const failed = { ok: false, error: "boom" } as const;
const observedOf = (precipitation1h: number): SourceResult<Observation[]> => ({
  ok: true,
  value: [{ id: "49251", observedAt: "2026-09-29T15:50:00+09:00", precipitation1h, precipitation24h: 12 }],
});

type Input = Parameters<typeof buildSnapshot>[0];
const build = (input: Omit<Input, "lakes" | "observations"> & Partial<Pick<Input, "observations">>) =>
  buildSnapshot({ lakes: LAKES, observations: observedOf(0), ...input });

const previousAt = (at: Date) =>
  build({ previous: null, videos: allLive, weather: weatherOf(10), now: at });

const lake = (snapshot: ReturnType<typeof buildSnapshot>, id: string) => snapshot!.lakes.find((l) => l.id === id)!;

describe("buildSnapshot", () => {
  it("records both sources with the current time", () => {
    const snapshot = build({ previous: null, videos: allLive, weather: weatherOf(12), now: NOW });
    expect(snapshot?.writtenAt).toBe(NOW.toISOString());
    expect(snapshot?.sunrise).toBe("2026-09-29T05:37:00+09:00");
    expect(lake(snapshot, "kawaguchiko").camera?.videoId).toBe("bdUbACCWmoY");
    expect(lake(snapshot, "kawaguchiko").cameraCheckedAt).toBe(NOW.toISOString());
    expect(lake(snapshot, "kawaguchiko").weather?.temperature).toBe(12);
    expect(lake(snapshot, "kawaguchiko").weatherCheckedAt).toBe(NOW.toISOString());
  });

  it("marks a lake without candidates as checked with no camera", () => {
    const snapshot = build({ previous: null, videos: allLive, weather: weatherOf(12), now: NOW });
    expect(lake(snapshot, "saiko")).toMatchObject({ camera: null, candidates: [], cameraCheckedAt: NOW.toISOString() });
  });

  it("does not write when every source fails", () => {
    expect(build({ previous: previousAt(minutesBefore(5)), videos: failed, weather: failed, observations: failed, now: NOW })).toBeNull();
  });

  it("writes when only the observations succeed", () => {
    const snapshot = build({ previous: null, videos: failed, weather: failed, now: NOW });
    expect(snapshot?.observations).toHaveLength(1);
    expect(snapshot?.observationsCheckedAt).toBe(NOW.toISOString());
  });

  it("carries the previous observations for up to an hour when AMeDAS fails", () => {
    const previous = build({ previous: null, videos: allLive, weather: weatherOf(10), observations: observedOf(1.5), now: minutesBefore(30) });
    const snapshot = build({ previous, videos: allLive, weather: weatherOf(12), observations: failed, now: NOW });
    expect(snapshot?.observations[0].precipitation1h).toBe(1.5);
    expect(snapshot?.observationsCheckedAt).toBe(minutesBefore(30).toISOString());
  });

  it("clears the observations once they are older than an hour", () => {
    const previous = build({ previous: null, videos: allLive, weather: weatherOf(10), observations: observedOf(1.5), now: minutesBefore(61) });
    const snapshot = build({ previous, videos: allLive, weather: weatherOf(12), observations: failed, now: NOW });
    expect(snapshot).toMatchObject({ observations: [], observationsCheckedAt: null });
  });

  it("carries the previous camera for up to an hour when YouTube fails", () => {
    const previous = previousAt(minutesBefore(30));
    const snapshot = build({ previous, videos: failed, weather: weatherOf(12), now: NOW });
    expect(lake(snapshot, "kawaguchiko").camera?.videoId).toBe("bdUbACCWmoY");
    expect(lake(snapshot, "kawaguchiko").cameraCheckedAt).toBe(minutesBefore(30).toISOString());
    expect(lake(snapshot, "kawaguchiko").weatherCheckedAt).toBe(NOW.toISOString());
  });

  it("clears the camera part once it is older than an hour", () => {
    const previous = previousAt(minutesBefore(61));
    const snapshot = build({ previous, videos: failed, weather: weatherOf(12), now: NOW });
    expect(lake(snapshot, "kawaguchiko")).toMatchObject({ camera: null, candidates: [], cameraCheckedAt: null });
  });

  it("carries the previous weather and sun times for up to an hour when Open-Meteo fails", () => {
    const previous = previousAt(minutesBefore(30));
    const snapshot = build({ previous, videos: allLive, weather: failed, now: NOW });
    expect(lake(snapshot, "yamanakako").weather?.temperature).toBe(10);
    expect(lake(snapshot, "yamanakako").weatherCheckedAt).toBe(minutesBefore(30).toISOString());
    expect(snapshot?.sunrise).toBe("2026-09-29T05:37:00+09:00");
  });

  it("clears weather and sun times once they are older than an hour", () => {
    const previous = previousAt(minutesBefore(61));
    const snapshot = build({ previous, videos: allLive, weather: failed, now: NOW });
    expect(lake(snapshot, "yamanakako")).toMatchObject({ weather: null, weatherCheckedAt: null });
    expect(snapshot?.sunrise).toBeNull();
    expect(snapshot?.sunset).toBeNull();
  });

  it("writes on the first run even if only one source succeeds", () => {
    const snapshot = build({ previous: null, videos: allLive, weather: failed, now: NOW });
    expect(snapshot).not.toBeNull();
    expect(lake(snapshot, "kawaguchiko")).toMatchObject({ weather: null, weatherCheckedAt: null });
    expect(snapshot?.sunrise).toBeNull();
  });

  it("treats a lake missing from the previous snapshot as never checked", () => {
    const previous = previousAt(minutesBefore(10))!;
    const withoutMotosu = { ...previous, lakes: previous.lakes.filter((l) => l.id !== "motosuko") };
    const snapshot = build({ previous: withoutMotosu, videos: failed, weather: weatherOf(12), now: NOW });
    expect(lake(snapshot, "motosuko")).toMatchObject({ camera: null, candidates: [], cameraCheckedAt: null });
  });

  it("uses the sun reference lake constant", () => {
    expect(SUN_REFERENCE_LAKE).toBe("kawaguchiko");
  });
});
