import { parseSnapshot, SNAPSHOT_KEY, SNAPSHOT_TTL_SECONDS, type Snapshot } from "./schema";

export async function readSnapshot(kv: KVNamespace): Promise<Snapshot | null> {
  try {
    return parseSnapshot(await kv.get(SNAPSHOT_KEY, "json"));
  } catch (error) {
    console.error("snapshot read failed", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export async function writeSnapshot(kv: KVNamespace, snapshot: Snapshot): Promise<void> {
  await kv.put(SNAPSHOT_KEY, JSON.stringify(snapshot), { expirationTtl: SNAPSHOT_TTL_SECONDS });
}
