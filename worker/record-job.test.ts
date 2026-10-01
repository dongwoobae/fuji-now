import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../lib/__fixtures__/open-meteo-msm.json";
import { FORECAST_POINTS } from "../lib/lakes";
import type { RecordRows } from "../lib/record";
import { toJstIso } from "../lib/weather";
import { RECORD_CRON, runRecordJob } from "./record-job";

const NOW = new Date(Date.parse(toJstIso(fixture[0].hourly.time[0])));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubWeather(response: () => Response) {
  const fetchMock = vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    if (url.hostname !== "api.open-meteo.com") throw new Error(`unexpected fetch ${url.hostname}`);
    return response();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("RECORD_CRON", () => {
  it("is registered in wrangler.jsonc on a minute the five-minute snapshot run never uses", () => {
    const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, ""));
    expect(config.triggers.crons).toContain(RECORD_CRON);
    expect(Number(RECORD_CRON.split(" ")[0]) % 5).not.toBe(0);
  });
});

describe("runRecordJob", () => {
  it("skips without calling anything when DATABASE_URL is not set", async () => {
    const fetchMock = stubWeather(() => Response.json(fixture));
    const save = vi.fn();
    vi.spyOn(console, "log").mockImplementation(() => {});
    await runRecordJob({}, NOW, save);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("requests 73 hours and saves the rows", async () => {
    const fetchMock = stubWeather(() => Response.json(fixture));
    const save = vi.fn<(url: string, rows: RecordRows) => Promise<void>>(async () => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    await runRecordJob({ DATABASE_URL: "postgresql://test" }, NOW, save);
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("forecast_hours")).toBe("73");
    expect(save).toHaveBeenCalledOnce();
    const [url, rows] = save.mock.calls[0];
    expect(url).toBe("postgresql://test");
    expect(rows.actual).toHaveLength(FORECAST_POINTS.length);
    expect(rows.forecasts.length).toBeGreaterThan(0);
  });

  it("logs and returns when the weather call fails", async () => {
    stubWeather(() => new Response("down", { status: 503 }));
    const save = vi.fn();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runRecordJob({ DATABASE_URL: "postgresql://test" }, NOW, save);
    expect(save).not.toHaveBeenCalled();
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ event: "record", written: false, error: "Open-Meteo 503" });
  });

  it("logs and returns when saving fails", async () => {
    stubWeather(() => Response.json(fixture));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runRecordJob({ DATABASE_URL: "postgresql://test" }, NOW, async () => {
      throw new Error("neon down");
    });
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ written: false, error: "neon down" });
  });
});
