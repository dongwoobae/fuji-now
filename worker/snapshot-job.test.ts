import { afterEach, describe, expect, it, vi } from "vitest";
import amedasFixture from "../lib/__fixtures__/amedas-points.json";
import weatherFixture from "../lib/__fixtures__/open-meteo-msm.json";
import { LAKES } from "../lib/lakes";
import { SNAPSHOT_KEY, type Snapshot } from "../lib/snapshot/schema";
import { runSnapshotJob } from "./snapshot-job";

const NOW = new Date("2026-09-29T07:00:00.000Z");
const API_KEY = "test-key-should-not-leak";

function fakeKv() {
  const data = new Map<string, string>();
  const kv = {
    async get(key: string, type?: string) {
      const value = data.get(key);
      if (value === undefined) return null;
      return type === "json" ? JSON.parse(value) : value;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
  } as unknown as KVNamespace;
  const stored = () => (data.has(SNAPSHOT_KEY) ? (JSON.parse(data.get(SNAPSHOT_KEY)!) as Snapshot) : null);
  return { kv, stored };
}

const youtubeBody = {
  items: LAKES.flatMap((lake) => lake.candidates).map((id) => ({
    id,
    snippet: { title: `title ${id}`, channelTitle: "channel", liveBroadcastContent: "live" },
    status: { embeddable: true },
  })),
};

const amedasOk = (url: URL) => {
  if (url.pathname.endsWith("/latest_time.txt")) return new Response(amedasFixture.latestTime);
  return Response.json(amedasFixture.points[url.pathname.split("/")[5] as keyof typeof amedasFixture.points]);
};

function stubFetch(handlers: { youtube: () => Response; weather: () => Response; amedas?: (url: URL) => Response }) {
  vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    if (url.hostname === "www.googleapis.com") return handlers.youtube();
    if (url.hostname === "api.open-meteo.com") return handlers.weather();
    if (url.hostname === "www.jma.go.jp") return (handlers.amedas ?? amedasOk)(url);
    throw new Error(`unexpected fetch ${url.hostname}`);
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runSnapshotJob", () => {
  it("writes a snapshot when both sources succeed", async () => {
    stubFetch({ youtube: () => Response.json(youtubeBody), weather: () => Response.json(weatherFixture) });
    const { kv, stored } = fakeKv();
    await runSnapshotJob({ SNAPSHOT_KV: kv, YOUTUBE_API_KEY: API_KEY }, NOW);
    const snapshot = stored();
    expect(snapshot?.lakes.map((lake) => lake.id)).toEqual(LAKES.map((lake) => lake.id));
    expect(snapshot?.lakes.every((lake) => lake.weatherCheckedAt === NOW.toISOString())).toBe(true);
    expect(snapshot?.lakes.find((lake) => lake.id === "yamanakako")?.camera?.videoId).toBe("F2NbYrc-gBU");
    expect(snapshot?.observations.map((o) => o.id).sort()).toEqual(["49251", "49256"]);
    expect(snapshot?.observationsCheckedAt).toBe(NOW.toISOString());
  });

  it("still writes weather when the API key is missing", async () => {
    stubFetch({ youtube: () => Response.json(youtubeBody), weather: () => Response.json(weatherFixture) });
    const { kv, stored } = fakeKv();
    await runSnapshotJob({ SNAPSHOT_KV: kv }, NOW);
    const lake = stored()?.lakes.find((l) => l.id === "kawaguchiko");
    expect(lake).toMatchObject({ camera: null, cameraCheckedAt: null, weatherCheckedAt: NOW.toISOString() });
  });

  it("does not write when every source fails", async () => {
    stubFetch({
      youtube: () => new Response("quota", { status: 403 }),
      weather: () => new Response("down", { status: 503 }),
      amedas: () => new Response("down", { status: 503 }),
    });
    const { kv, stored } = fakeKv();
    await runSnapshotJob({ SNAPSHOT_KV: kv, YOUTUBE_API_KEY: API_KEY }, NOW);
    expect(stored()).toBeNull();
  });

  it("never logs the API key", async () => {
    stubFetch({ youtube: () => new Response("quota", { status: 403 }), weather: () => Response.json(weatherFixture) });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    vi.spyOn(console, "error").mockImplementation((...args) => logs.push(args.join(" ")));
    await runSnapshotJob({ SNAPSHOT_KV: fakeKv().kv, YOUTUBE_API_KEY: API_KEY }, NOW);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join("\n")).not.toContain(API_KEY);
  });
});
