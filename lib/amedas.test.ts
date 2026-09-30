import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/amedas-points.json";
import { fetchObservations, parseLatestTime, parsePointResponse, pointFileUrl } from "./amedas";

const kawaguchiko = fixture.points["49251"] as Record<string, Record<string, unknown>>;
const lastKey = (points: Record<string, unknown>) => Object.keys(points).sort().at(-1)!;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseLatestTime", () => {
  it("accepts the JST timestamp the site publishes", () => {
    expect(parseLatestTime(`${fixture.latestTime}\n`)).toBe(fixture.latestTime);
  });

  it("rejects anything else", () => {
    expect(() => parseLatestTime("<html>maintenance</html>")).toThrow();
  });
});

describe("pointFileUrl", () => {
  it("uses the three-hour block that contains the latest time", () => {
    expect(pointFileUrl("49251", "2026-09-30T11:20:00+09:00").pathname).toBe("/bosai/amedas/data/point/49251/20260930_09.json");
    expect(pointFileUrl("49251", "2026-09-30T00:10:00+09:00").pathname).toBe("/bosai/amedas/data/point/49251/20260930_00.json");
    expect(pointFileUrl("49251", "2026-09-30T23:50:00+09:00").pathname).toBe("/bosai/amedas/data/point/49251/20260930_21.json");
  });
});

describe("parsePointResponse", () => {
  it("takes the latest record of the recorded response", () => {
    const last = kawaguchiko[lastKey(kawaguchiko)];
    const observation = parsePointResponse(kawaguchiko, "49251");
    expect(observation.id).toBe("49251");
    expect(observation.observedAt).toBe(fixture.latestTime);
    expect(observation.precipitation1h).toBe((last.precipitation1h as [number, number])[0]);
    expect(observation.precipitation24h).toBe((last.precipitation24h as [number, number])[0]);
  });

  it("drops values whose quality flag is not zero", () => {
    const key = lastKey(kawaguchiko);
    const flagged = { ...kawaguchiko, [key]: { ...kawaguchiko[key], precipitation1h: [3.5, 5] } };
    expect(parsePointResponse(flagged, "49251").precipitation1h).toBeNull();
  });

  it("treats a missing element as unknown", () => {
    const key = lastKey(kawaguchiko);
    const rest = { ...kawaguchiko[key] };
    delete rest.precipitation24h;
    expect(parsePointResponse({ ...kawaguchiko, [key]: rest }, "49251").precipitation24h).toBeNull();
  });

  it("throws on an empty or malformed response", () => {
    expect(() => parsePointResponse({}, "49251")).toThrow();
    expect(() => parsePointResponse({ "2026-09-30": {} }, "49251")).toThrow();
  });
});

describe("fetchObservations", () => {
  it("reads the latest time once and one point file per station", async () => {
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      requested.push(url.pathname);
      if (url.pathname.endsWith("/latest_time.txt")) return new Response(fixture.latestTime);
      const id = url.pathname.split("/")[5] as keyof typeof fixture.points;
      return Response.json(fixture.points[id]);
    }));
    const observations = await fetchObservations(["49251", "49256"], AbortSignal.timeout(1000));
    expect(observations.map((o) => o.id)).toEqual(["49251", "49256"]);
    expect(requested).toHaveLength(3);
  });

  it("fails when a point file is not available", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/latest_time.txt")) return new Response(fixture.latestTime);
      return new Response("not found", { status: 404 });
    }));
    await expect(fetchObservations(["49251"], AbortSignal.timeout(1000))).rejects.toThrow("AMeDAS 404");
  });
});
