import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./__fixtures__/youtube-videos.json";
import { classifyCandidate, fetchVideos, parseVideosResponse, selectLakeCamera, type VideoItem } from "./youtube";

const items = parseVideosResponse(fixture);
const base = items[0];
const video = (id: string, liveBroadcastContent: string, embeddable = true): VideoItem => ({
  ...base,
  id,
  snippet: { ...base.snippet, liveBroadcastContent },
  status: { ...base.status, embeddable },
});

describe("parseVideosResponse", () => {
  it("parses the recorded videos.list response", () => {
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => typeof item.snippet.liveBroadcastContent === "string")).toBe(true);
  });

  it("does not include ids the API left out", () => {
    expect(items.some((item) => item.id === "qdVvly6pVhA")).toBe(false);
  });

  it("throws when items is missing", () => {
    expect(() => parseVideosResponse({ kind: "youtube#videoListResponse" })).toThrow();
  });
});

describe("classifyCandidate", () => {
  it("is missing when the id is absent from the response", () => {
    expect(classifyCandidate("qdVvly6pVhA", items)).toBe("missing");
  });

  it("is not_embeddable even while live", () => {
    expect(classifyCandidate("a", [video("a", "live", false)])).toBe("not_embeddable");
  });

  it("maps live, upcoming and none", () => {
    expect(classifyCandidate("a", [video("a", "live")])).toBe("live");
    expect(classifyCandidate("a", [video("a", "upcoming")])).toBe("upcoming");
    expect(classifyCandidate("a", [video("a", "none")])).toBe("ended");
  });
});

describe("selectLakeCamera", () => {
  it("picks the first live candidate in priority order", () => {
    const result = selectLakeCamera(["first", "second", "third"], [
      video("first", "none"),
      video("second", "live"),
      video("third", "live"),
    ]);
    expect(result.camera?.videoId).toBe("second");
    expect(result.candidates).toEqual([
      { videoId: "first", status: "ended" },
      { videoId: "second", status: "live" },
      { videoId: "third", status: "live" },
    ]);
  });

  it("returns to the first candidate once it is live again", () => {
    const result = selectLakeCamera(["first", "second"], [video("first", "live"), video("second", "live")]);
    expect(result.camera?.videoId).toBe("first");
  });

  it("copies title and channel of the chosen video", () => {
    const chosen = video("first", "live");
    expect(selectLakeCamera(["first"], [chosen]).camera).toEqual({
      videoId: "first",
      title: chosen.snippet.title,
      channelTitle: chosen.snippet.channelTitle,
    });
  });

  it("has no camera when nothing is live", () => {
    expect(selectLakeCamera(["first"], [video("first", "none")]).camera).toBeNull();
  });

  it("has no camera and no candidates for a lake without candidates", () => {
    expect(selectLakeCamera([], items)).toEqual({ camera: null, candidates: [] });
  });
});

describe("fetchVideos", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the key in a header and never in the URL", async () => {
    const fetchMock = vi.fn(async () => Response.json(fixture));
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchVideos(["a", "b"], "secret-key", new AbortController().signal);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    const url = new URL(input.toString());
    expect(`${url.origin}${url.pathname}`).toBe("https://www.googleapis.com/youtube/v3/videos");
    expect(url.searchParams.get("part")).toBe("snippet,status,liveStreamingDetails");
    expect(url.searchParams.get("id")).toBe("a,b");
    expect(url.searchParams.has("key")).toBe(false);
    expect(url.toString()).not.toContain("secret-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key");
    expect(result).toEqual(items);
  });

  it("rejects with the status only, without the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    const failure = fetchVideos(["a"], "secret-key", new AbortController().signal);
    await expect(failure).rejects.toThrow("YouTube videos.list 403");
    await expect(failure).rejects.not.toThrow("secret-key");
  });
});
