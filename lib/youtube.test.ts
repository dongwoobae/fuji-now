import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/youtube-videos.json";
import { classifyCandidate, parseVideosResponse, selectLakeCamera, type VideoItem } from "./youtube";

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
