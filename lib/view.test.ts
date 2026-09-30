import { describe, expect, it } from "vitest";
import type { LakeSnapshot, Snapshot } from "./snapshot/schema";
import { cameraStateOf, formatJstTime, freshnessOf, isNight, isStale, upcomingHours, windLabel } from "./view";

const lake = (patch: Partial<LakeSnapshot>): LakeSnapshot => ({
  id: "kawaguchiko",
  camera: null,
  candidates: [],
  cameraCheckedAt: "2026-09-29T07:00:00.000Z",
  weather: null,
  weatherCheckedAt: "2026-09-29T07:00:00.000Z",
  ...patch,
});
const snapshotOf = (lakes: LakeSnapshot[]): Snapshot => ({
  writtenAt: "2026-09-29T07:00:00.000Z",
  sunrise: null,
  sunset: null,
  lakes,
  observations: [],
  observationsCheckedAt: null,
});

describe("freshnessOf", () => {
  it("uses the oldest check time across lakes and sources", () => {
    const snapshot = snapshotOf([
      lake({ cameraCheckedAt: "2026-09-29T06:50:00.000Z" }),
      lake({ id: "saiko", weatherCheckedAt: "2026-09-29T06:40:00.000Z" }),
    ]);
    expect(freshnessOf(snapshot)).toEqual({ kind: "checked", at: "2026-09-29T06:40:00.000Z" });
  });

  it("is partial when any check time is missing", () => {
    expect(freshnessOf(snapshotOf([lake({}), lake({ id: "saiko", cameraCheckedAt: null })]))).toEqual({
      kind: "partial",
      at: "2026-09-29T07:00:00.000Z",
    });
  });

  it("keeps the oldest known time while partial", () => {
    const snapshot = snapshotOf([
      lake({ cameraCheckedAt: null, weatherCheckedAt: "2026-09-29T06:30:00.000Z" }),
      lake({ id: "saiko", weatherCheckedAt: "2026-09-29T06:50:00.000Z" }),
    ]);
    expect(freshnessOf(snapshot)).toEqual({ kind: "partial", at: "2026-09-29T06:30:00.000Z" });
  });

  it("is partial with no time when nothing was checked", () => {
    expect(freshnessOf(snapshotOf([lake({ cameraCheckedAt: null, weatherCheckedAt: null })]))).toEqual({ kind: "partial", at: null });
  });
});

describe("isStale", () => {
  it("is stale only after 20 minutes", () => {
    const at = "2026-09-29T07:00:00.000Z";
    expect(isStale(at, Date.parse("2026-09-29T07:20:00.000Z"))).toBe(false);
    expect(isStale(at, Date.parse("2026-09-29T07:20:01.000Z"))).toBe(true);
  });
});

describe("isNight", () => {
  const sunrise = "2026-09-29T05:37:00+09:00";
  const sunset = "2026-09-29T17:32:00+09:00";
  it("is night before sunrise and after sunset", () => {
    expect(isNight(new Date("2026-09-29T05:00:00+09:00"), sunrise, sunset)).toBe(true);
    expect(isNight(new Date("2026-09-29T12:00:00+09:00"), sunrise, sunset)).toBe(false);
    expect(isNight(new Date("2026-09-29T18:00:00+09:00"), sunrise, sunset)).toBe(true);
  });

  it("is never night when sun times are unknown", () => {
    expect(isNight(new Date("2026-09-29T23:00:00+09:00"), null, null)).toBe(false);
  });
});

describe("windLabel", () => {
  it("is calm up to 1.2 m/s", () => {
    expect(windLabel(1.2)).toBe("잔잔함");
    expect(windLabel(1.3)).toBe("물결 있음");
  });
});

describe("upcomingHours", () => {
  it("drops past hours and keeps at most eight", () => {
    const hourly = Array.from({ length: 10 }, (_, i) => ({
      time: `2026-09-29T${String(14 + i).padStart(2, "0")}:00:00+09:00`,
      cloudCover: i,
      precipitation: 0,
    }));
    const weather = { time: hourly[0].time, temperature: 10, cloudCover: 0, precipitation: 0, windSpeed: 1, hourly };
    const result = upcomingHours(weather, new Date("2026-09-29T15:30:00+09:00"));
    expect(result[0].time).toBe("2026-09-29T15:00:00+09:00");
    expect(result).toHaveLength(8);
  });
});

describe("cameraStateOf", () => {
  it("distinguishes unchecked, offline and live", () => {
    expect(cameraStateOf(null)).toEqual({ kind: "unchecked" });
    expect(cameraStateOf(lake({ cameraCheckedAt: null }))).toEqual({ kind: "unchecked" });
    expect(cameraStateOf(lake({ camera: null }))).toEqual({ kind: "offline" });
    const camera = { videoId: "abc", title: "t", channelTitle: "c" };
    expect(cameraStateOf(lake({ camera }))).toEqual({ kind: "live", camera });
  });
});

describe("formatJstTime", () => {
  it("formats in Japan time", () => {
    expect(formatJstTime("2026-09-29T07:05:00.000Z")).toBe("16:05");
  });
});
