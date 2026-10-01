import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/open-meteo-msm.json";
import { FORECAST_POINTS, SUMMIT } from "./lakes";
import { buildRecordRows, hourStartOf, RECORD_LEADS } from "./record";
import { parseForecastPoints, toJstIso } from "./weather";

const forecasts = parseForecastPoints(fixture, FORECAST_POINTS);
// 테스트 데이터의 첫 시각을 정각으로 삼는다. 받은 시각은 그로부터 몇 분 뒤다.
const firstHour = toJstIso(fixture[0].hourly.time[0]);
const NOW = new Date(Date.parse(firstHour) + 3 * 60_000);

describe("hourStartOf", () => {
  it("truncates to the hour", () => {
    expect(hourStartOf(NOW).toISOString()).toBe(new Date(firstHour).toISOString());
  });
});

describe("buildRecordRows", () => {
  const rows = buildRecordRows(forecasts, NOW);

  it("records the current hour once per point", () => {
    expect(rows.actual.map((row) => row.point)).toEqual(FORECAST_POINTS.map((point) => point.id));
    for (const row of rows.actual) {
      expect(row.time?.toISOString()).toBe(new Date(firstHour).toISOString());
      expect(row.source).toBe("live");
    }
  });

  it("keeps only the chosen lead times that the response covers", () => {
    const span = fixture[0].hourly.time.length - 1;
    const expected = RECORD_LEADS.filter((lead) => lead <= span);
    const yamanakako = rows.forecasts.filter((row) => row.point === "yamanakako");
    expect(yamanakako.map((row) => row.leadHours)).toEqual(expected);
    for (const row of yamanakako) {
      expect(row.targetTime?.getTime()).toBe(Date.parse(firstHour) + row.leadHours * 3_600_000);
    }
  });

  it("stores raw layers with the grade, and no grade for the summit", () => {
    const lake = rows.actual.find((row) => row.point === "kawaguchiko");
    expect(lake).toMatchObject({
      lowCloudCover: fixture[1].hourly.cloud_cover_low[0],
      midCloudCover: fixture[1].hourly.cloud_cover_mid[0],
      highCloudCover: fixture[1].hourly.cloud_cover_high[0],
      precipitation: fixture[1].hourly.precipitation[0],
      fetchedAt: NOW,
    });
    expect(lake?.grade).not.toBeNull();
    expect(rows.actual.find((row) => row.point === SUMMIT.id)?.grade).toBeNull();
  });

  it("records nothing as current when the response starts after this hour", () => {
    const later = buildRecordRows(forecasts, new Date(Date.parse(firstHour) - 3_600_000));
    expect(later.actual).toEqual([]);
    expect(later.forecasts.every((row) => row.leadHours !== 0)).toBe(true);
  });
});
