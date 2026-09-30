import { describe, expect, it } from "vitest";
import { parseSnapshot, type Snapshot } from "./schema";

const valid: Snapshot = {
  writtenAt: "2026-09-29T07:00:00.000Z",
  sunrise: "2026-09-29T05:37:00+09:00",
  sunset: "2026-09-29T17:32:00+09:00",
  lakes: [
    {
      id: "kawaguchiko",
      camera: { videoId: "abc", title: "title", channelTitle: "channel" },
      candidates: [{ videoId: "abc", status: "live" }],
      cameraCheckedAt: "2026-09-29T07:00:00.000Z",
      weather: null,
      weatherCheckedAt: null,
    },
  ],
};

describe("parseSnapshot", () => {
  it("returns the snapshot when the shape matches", () => {
    expect(parseSnapshot(valid)).toEqual(valid);
  });

  it("returns null when the key is missing", () => {
    expect(parseSnapshot(null)).toBeNull();
  });

  it("returns null when candidates is not an array", () => {
    expect(parseSnapshot({ ...valid, lakes: [{ ...valid.lakes[0], candidates: null }] })).toBeNull();
  });

  it("returns null for an unknown lake id", () => {
    expect(parseSnapshot({ ...valid, lakes: [{ ...valid.lakes[0], id: "biwako" }] })).toBeNull();
  });

  it("accepts null sunrise and sunset", () => {
    expect(parseSnapshot({ ...valid, sunrise: null, sunset: null })).not.toBeNull();
  });
});
