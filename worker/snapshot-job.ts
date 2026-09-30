import { LAKES, SUN_REFERENCE_LAKE } from "../lib/lakes";
import { buildSnapshot, type SourceResult } from "../lib/snapshot/build";
import { readSnapshot, writeSnapshot } from "../lib/snapshot/store";
import { fetchWeather } from "../lib/weather";
import { fetchVideos } from "../lib/youtube";

const CALL_TIMEOUT_MS = 10_000;

export type JobEnv = { SNAPSHOT_KV: KVNamespace; YOUTUBE_API_KEY?: string };

async function settle<T>(run: () => Promise<T>): Promise<SourceResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runSnapshotJob(env: JobEnv, now: Date): Promise<void> {
  const previous = await readSnapshot(env.SNAPSHOT_KV);
  const ids = LAKES.flatMap((lake) => lake.candidates);
  const apiKey = env.YOUTUBE_API_KEY;

  const [videos, weather] = await Promise.all([
    settle(() => {
      if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set");
      return fetchVideos(ids, apiKey, AbortSignal.timeout(CALL_TIMEOUT_MS));
    }),
    settle(() => fetchWeather(LAKES, SUN_REFERENCE_LAKE, AbortSignal.timeout(CALL_TIMEOUT_MS))),
  ]);

  const snapshot = buildSnapshot({ lakes: LAKES, previous, videos, weather, now });
  if (snapshot) await writeSnapshot(env.SNAPSHOT_KV, snapshot);

  const candidates = snapshot?.lakes.flatMap((lake) => lake.candidates) ?? [];
  console.log(
    JSON.stringify({
      event: "snapshot",
      written: snapshot !== null,
      youtube: videos.ok ? "ok" : videos.error,
      weather: weather.ok ? "ok" : weather.error,
      live: candidates.filter((candidate) => candidate.status === "live").length,
      notLive: candidates.filter((candidate) => candidate.status !== "live").map((c) => `${c.videoId}:${c.status}`),
    }),
  );
}
