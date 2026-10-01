import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/open-meteo-msm.json";
import { FORECAST_POINTS, LAKES, SUMMIT } from "./lakes";
import { estimateGrade } from "./visibility";
import { buildWeatherUrl, gradeHours, parseForecastPoints, parseWeatherResponse, toJstIso } from "./weather";

describe("toJstIso", () => {
  it("adds seconds and the +09:00 offset", () => {
    expect(toJstIso("2026-09-29T05:37")).toBe("2026-09-29T05:37:00+09:00");
  });
});

describe("buildWeatherUrl", () => {
  it("requests every lake and then the summit in order from the MSM model", () => {
    const url = buildWeatherUrl(FORECAST_POINTS);
    expect(FORECAST_POINTS.at(-1)?.id).toBe(SUMMIT.id);
    expect(url.searchParams.get("latitude")).toBe(FORECAST_POINTS.map((point) => point.latitude).join(","));
    expect(url.searchParams.get("longitude")).toBe(FORECAST_POINTS.map((point) => point.longitude).join(","));
    expect(url.searchParams.get("models")).toBe("jma_msm");
    expect(url.searchParams.get("cell_selection")).toBe("nearest");
    expect(url.searchParams.get("wind_speed_unit")).toBe("ms");
    expect(url.searchParams.get("timezone")).toBe("Asia/Tokyo");
    expect(url.searchParams.get("daily")).toBe("sunrise,sunset");
    expect(url.searchParams.get("hourly")).toBe("cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation");
    expect(url.searchParams.get("forecast_hours")).toBe("9");
    expect(buildWeatherUrl(FORECAST_POINTS, 73).searchParams.get("forecast_hours")).toBe("73");
  });
});

describe("parseWeatherResponse", () => {
  it("maps each location to its lake in request order", () => {
    const result = parseWeatherResponse(fixture, FORECAST_POINTS, "kawaguchiko");
    LAKES.forEach((lake, i) => {
      const location = fixture[i];
      const weather = result.byLake[lake.id];
      expect(weather.time).toBe(toJstIso(location.current.time));
      expect(weather.temperature).toBe(location.current.temperature_2m);
      expect(weather.cloudCover).toBe(location.current.cloud_cover);
      expect(weather.precipitation).toBe(location.current.precipitation);
      expect(weather.windSpeed).toBe(location.current.wind_speed_10m);
      expect(weather.hourly).toHaveLength(location.hourly.time.length);
      expect(weather.hourly[0]).toMatchObject({
        time: toJstIso(location.hourly.time[0]),
        lowCloudCover: location.hourly.cloud_cover_low[0],
        precipitation: location.hourly.precipitation[0],
      });
    });
  });

  it("grades each lake hour with the summit clouds of the same hour", () => {
    const result = parseWeatherResponse(fixture, FORECAST_POINTS, "kawaguchiko");
    const summit = fixture[FORECAST_POINTS.length - 1].hourly;
    LAKES.forEach((lake, i) => {
      const hourly = fixture[i].hourly;
      result.byLake[lake.id].hourly.forEach((hour, h) => {
        const expected = estimateGrade(
          { low: hourly.cloud_cover_low[h], mid: hourly.cloud_cover_mid[h], high: hourly.cloud_cover_high[h], precipitation: hourly.precipitation[h] },
          { low: summit.cloud_cover_low[h], mid: summit.cloud_cover_mid[h], high: summit.cloud_cover_high[h] },
        );
        expect(hour.grade).toBe(expected);
      });
    });
  });

  it("marks hours between sunrise and sunset as daylight", () => {
    const i = LAKES.findIndex((lake) => lake.id === "kawaguchiko");
    const { daily } = fixture[i];
    const result = parseWeatherResponse(fixture, FORECAST_POINTS, "kawaguchiko");
    for (const hour of result.byLake.kawaguchiko.hourly) {
      const day = daily.time.indexOf(hour.time.slice(0, 10));
      const t = Date.parse(hour.time);
      const expected = t >= Date.parse(toJstIso(daily.sunrise[day])) && t < Date.parse(toJstIso(daily.sunset[day]));
      expect(hour.daylight).toBe(expected);
    }
  });

  it("drops hours with a missing value and leaves a lake ungraded where the summit is missing", () => {
    const patched = structuredClone(fixture) as unknown as Array<{ hourly: Record<string, Array<number | null>> }>;
    patched[0].hourly.cloud_cover_mid[1] = null;
    patched[FORECAST_POINTS.length - 1].hourly.precipitation[2] = null;
    const forecasts = parseForecastPoints(patched, FORECAST_POINTS);
    expect(forecasts[0].hourly).toHaveLength(fixture[0].hourly.time.length - 1);
    const graded = gradeHours(forecasts);
    const third = toJstIso(fixture[0].hourly.time[2]);
    expect(graded.get("yamanakako")?.find((hour) => hour.time === third)?.grade).toBeNull();
    expect(graded.get(SUMMIT.id)?.every((hour) => hour.grade === null)).toBe(true);
  });

  it("takes today's sunrise and sunset from the reference lake", () => {
    const i = LAKES.findIndex((lake) => lake.id === "kawaguchiko");
    const result = parseWeatherResponse(fixture, FORECAST_POINTS, "kawaguchiko");
    expect(result.sunrise).toBe(toJstIso(fixture[i].daily.sunrise[0]));
    expect(result.sunset).toBe(toJstIso(fixture[i].daily.sunset[0]));
  });

  it("fails when the locations come back in a different order", () => {
    expect(() => parseWeatherResponse([...fixture].reverse(), FORECAST_POINTS, "kawaguchiko")).toThrow(/does not match/);
  });

  it("fails when shojiko and motosuko are swapped", () => {
    const s = LAKES.findIndex((lake) => lake.id === "shojiko");
    const m = LAKES.findIndex((lake) => lake.id === "motosuko");
    const swapped = [...fixture];
    [swapped[s], swapped[m]] = [swapped[m], swapped[s]];
    expect(() => parseWeatherResponse(swapped, FORECAST_POINTS, "kawaguchiko")).toThrow(/does not match/);
  });

  it("fails when a location is missing", () => {
    expect(() => parseWeatherResponse(fixture.slice(1), FORECAST_POINTS, "kawaguchiko")).toThrow();
  });

  it("fails on a single-object response", () => {
    expect(() => parseWeatherResponse(fixture[0], FORECAST_POINTS, "kawaguchiko")).toThrow();
  });
});
