import { describe, expect, it } from "vitest";
import { SNAPSHOT_KEY, SNAPSHOT_TTL_SECONDS, type Snapshot } from "./schema";
import { readSnapshot, writeSnapshot } from "./store";

const snapshot: Snapshot = {
  writtenAt: "2026-09-29T07:00:00.000Z",
  sunrise: null,
  sunset: null,
  lakes: [],
  observations: [],
  observationsCheckedAt: null,
};

function fakeKv(options: { stored?: string; getError?: Error } = {}) {
  const data = new Map<string, string>();
  if (options.stored !== undefined) data.set(SNAPSHOT_KEY, options.stored);
  const puts: { key: string; value: string; options?: KVNamespacePutOptions }[] = [];
  const kv = {
    async get(key: string, type?: string) {
      if (options.getError) throw options.getError;
      const value = data.get(key);
      if (value === undefined) return null;
      return type === "json" ? JSON.parse(value) : value;
    },
    async put(key: string, value: string, putOptions?: KVNamespacePutOptions) {
      data.set(key, value);
      puts.push({ key, value, options: putOptions });
    },
  } as unknown as KVNamespace;
  return { kv, puts };
}

describe("readSnapshot", () => {
  it("returns the stored snapshot", async () => {
    expect(await readSnapshot(fakeKv({ stored: JSON.stringify(snapshot) }).kv)).toEqual(snapshot);
  });

  it("returns null when the key is missing", async () => {
    expect(await readSnapshot(fakeKv().kv)).toBeNull();
  });

  it("returns null when the stored value is not JSON", async () => {
    expect(await readSnapshot(fakeKv({ stored: "{not json" }).kv)).toBeNull();
  });

  it("returns null when the shape does not match", async () => {
    expect(await readSnapshot(fakeKv({ stored: JSON.stringify({ writtenAt: 1 }) }).kv)).toBeNull();
  });

  it("returns null when KV throws", async () => {
    expect(await readSnapshot(fakeKv({ getError: new Error("KV GET failed: 429") }).kv)).toBeNull();
  });
});

describe("writeSnapshot", () => {
  it("writes the one key with a one-day expiry", async () => {
    const { kv, puts } = fakeKv();
    await writeSnapshot(kv, snapshot);
    expect(puts).toEqual([
      { key: SNAPSHOT_KEY, value: JSON.stringify(snapshot), options: { expirationTtl: SNAPSHOT_TTL_SECONDS } },
    ]);
  });
});
