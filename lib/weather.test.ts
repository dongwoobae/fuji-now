import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/open-meteo-msm.json";
import { LAKES } from "./lakes";
import { buildWeatherUrl, parseWeatherResponse, toJstIso } from "./weather";

describe("toJstIso", () => {
  it("adds seconds and the +09:00 offset", () => {
    expect(toJstIso("2026-09-29T05:37")).toBe("2026-09-29T05:37:00+09:00");
  });
});

describe("buildWeatherUrl", () => {
  it("requests every lake in order from the MSM model", () => {
    const url = buildWeatherUrl(LAKES);
    expect(url.searchParams.get("latitude")).toBe(LAKES.map((lake) => lake.latitude).join(","));
    expect(url.searchParams.get("longitude")).toBe(LAKES.map((lake) => lake.longitude).join(","));
    expect(url.searchParams.get("models")).toBe("jma_msm");
    expect(url.searchParams.get("cell_selection")).toBe("nearest");
    expect(url.searchParams.get("wind_speed_unit")).toBe("ms");
    expect(url.searchParams.get("timezone")).toBe("Asia/Tokyo");
    expect(url.searchParams.get("daily")).toBe("sunrise,sunset");
  });
});

describe("parseWeatherResponse", () => {
  it("maps each location to its lake in request order", () => {
    const result = parseWeatherResponse(fixture, LAKES, "kawaguchiko");
    LAKES.forEach((lake, i) => {
      const location = fixture[i];
      const weather = result.byLake[lake.id];
      expect(weather.time).toBe(toJstIso(location.current.time));
      expect(weather.temperature).toBe(location.current.temperature_2m);
      expect(weather.cloudCover).toBe(location.current.cloud_cover);
      expect(weather.precipitation).toBe(location.current.precipitation);
      expect(weather.windSpeed).toBe(location.current.wind_speed_10m);
      expect(weather.hourly).toHaveLength(location.hourly.time.length);
      expect(weather.hourly[0]).toEqual({
        time: toJstIso(location.hourly.time[0]),
        cloudCover: location.hourly.cloud_cover[0],
        precipitation: location.hourly.precipitation[0],
      });
    });
  });

  it("takes today's sunrise and sunset from the reference lake", () => {
    const i = LAKES.findIndex((lake) => lake.id === "kawaguchiko");
    const result = parseWeatherResponse(fixture, LAKES, "kawaguchiko");
    expect(result.sunrise).toBe(toJstIso(fixture[i].daily.sunrise[0]));
    expect(result.sunset).toBe(toJstIso(fixture[i].daily.sunset[0]));
  });

  it("fails when the locations come back in a different order", () => {
    expect(() => parseWeatherResponse([...fixture].reverse(), LAKES, "kawaguchiko")).toThrow(/does not match/);
  });

  it("fails when shojiko and motosuko are swapped", () => {
    const s = LAKES.findIndex((lake) => lake.id === "shojiko");
    const m = LAKES.findIndex((lake) => lake.id === "motosuko");
    const swapped = [...fixture];
    [swapped[s], swapped[m]] = [swapped[m], swapped[s]];
    expect(() => parseWeatherResponse(swapped, LAKES, "kawaguchiko")).toThrow(/does not match/);
  });

  it("fails when a location is missing", () => {
    expect(() => parseWeatherResponse(fixture.slice(1), LAKES, "kawaguchiko")).toThrow();
  });

  it("fails on a single-object response", () => {
    expect(() => parseWeatherResponse(fixture[0], LAKES, "kawaguchiko")).toThrow();
  });
});
