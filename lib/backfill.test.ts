import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/open-meteo-msm.json";
import { isIsoDate, jstYesterday, monthRanges } from "./backfill";
import { FORECAST_POINTS, SUMMIT } from "./lakes";
import { buildBackfillRows } from "./record";
import { buildHistoryUrl, parseForecastPoints } from "./weather";

describe("monthRanges", () => {
  it("splits by calendar month and clips both ends", () => {
    expect(monthRanges("2018-08-15", "2018-10-03")).toEqual([
      { start: "2018-08-15", end: "2018-08-31" },
      { start: "2018-09-01", end: "2018-09-30" },
      { start: "2018-10-01", end: "2018-10-03" },
    ]);
  });

  it("handles leap February and a single day", () => {
    expect(monthRanges("2024-02-01", "2024-02-29")).toEqual([{ start: "2024-02-01", end: "2024-02-29" }]);
    expect(monthRanges("2026-09-30", "2026-09-30")).toEqual([{ start: "2026-09-30", end: "2026-09-30" }]);
  });

  it("is empty when the start is after the end", () => {
    expect(monthRanges("2026-10-02", "2026-10-01")).toEqual([]);
  });
});

describe("jstYesterday", () => {
  it("uses the Japan date", () => {
    expect(jstYesterday(new Date("2026-10-01T14:59:00Z"))).toBe("2026-09-30");
    expect(jstYesterday(new Date("2026-10-01T15:00:00Z"))).toBe("2026-10-01");
  });
});

describe("isIsoDate", () => {
  it("accepts only real calendar dates", () => {
    expect(isIsoDate("2018-08-01")).toBe(true);
    expect(isIsoDate("2018-02-30")).toBe(false);
    expect(isIsoDate("2018-8-1")).toBe(false);
  });
});

describe("buildHistoryUrl", () => {
  it("asks the historical forecast API for the same MSM layers without current weather", () => {
    const url = buildHistoryUrl(FORECAST_POINTS, "2018-08-01", "2018-08-31");
    expect(url.hostname).toBe("historical-forecast-api.open-meteo.com");
    expect(url.searchParams.get("models")).toBe("jma_msm");
    expect(url.searchParams.get("cell_selection")).toBe("nearest");
    expect(url.searchParams.get("hourly")).toBe("cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation");
    expect(url.searchParams.get("daily")).toBe("sunrise,sunset");
    expect(url.searchParams.get("start_date")).toBe("2018-08-01");
    expect(url.searchParams.get("end_date")).toBe("2018-08-31");
    expect(url.searchParams.has("current")).toBe(false);
    expect(url.searchParams.has("forecast_hours")).toBe(false);
  });
});

describe("buildBackfillRows", () => {
  // 과거 예보 응답은 예보 응답에서 current만 빠진 형식이다(2026-10-01 2018-08 응답으로 확인).
  const history = structuredClone(fixture).map((location) => {
    const copy: Partial<typeof location> = location;
    delete copy.current;
    return copy;
  });
  const forecasts = parseForecastPoints(history, FORECAST_POINTS);
  const fetchedAt = new Date("2026-10-01T07:00:00Z");
  const rows = buildBackfillRows(forecasts, fetchedAt);

  it("keeps every hour of every point, marked as backfill", () => {
    expect(rows).toHaveLength(FORECAST_POINTS.length * fixture[0].hourly.time.length);
    expect(rows.every((row) => row.source === "backfill" && row.fetchedAt === fetchedAt)).toBe(true);
  });

  it("grades lakes and leaves the summit ungraded", () => {
    expect(rows.filter((row) => row.point === SUMMIT.id).every((row) => row.grade === null)).toBe(true);
    expect(rows.filter((row) => row.point !== SUMMIT.id).every((row) => row.grade !== null)).toBe(true);
  });
});
