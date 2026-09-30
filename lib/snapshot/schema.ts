import { z } from "zod";
import { LAKE_IDS } from "../lakes";

export const SNAPSHOT_KEY = "snapshot:v1";
export const SNAPSHOT_TTL_SECONDS = 24 * 60 * 60;
// 한쪽 호출만 계속 실패하면 다른 쪽의 쓰기가 KV 만료를 계속 연장한다. 이어받기를 여기서 끊어야 옛 값이 사라진다.
export const CARRY_MAX_MS = 60 * 60 * 1000;

const candidateStatusSchema = z.enum(["live", "ended", "upcoming", "missing", "not_embeddable"]);

const cameraSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  channelTitle: z.string(),
});

const lakeWeatherSchema = z.object({
  time: z.string(),
  temperature: z.number(),
  cloudCover: z.number(),
  precipitation: z.number(),
  windSpeed: z.number(),
  hourly: z.array(z.object({ time: z.string(), cloudCover: z.number(), precipitation: z.number() })),
});

const lakeSnapshotSchema = z.object({
  id: z.enum(LAKE_IDS),
  camera: cameraSchema.nullable(),
  candidates: z.array(z.object({ videoId: z.string(), status: candidateStatusSchema })),
  cameraCheckedAt: z.string().nullable(),
  weather: lakeWeatherSchema.nullable(),
  weatherCheckedAt: z.string().nullable(),
});

const snapshotSchema = z.object({
  writtenAt: z.string(),
  sunrise: z.string().nullable(),
  sunset: z.string().nullable(),
  lakes: z.array(lakeSnapshotSchema),
});

export type CandidateStatus = z.infer<typeof candidateStatusSchema>;
export type Camera = z.infer<typeof cameraSchema>;
export type LakeWeather = z.infer<typeof lakeWeatherSchema>;
export type LakeSnapshot = z.infer<typeof lakeSnapshotSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;

export function parseSnapshot(raw: unknown): Snapshot | null {
  const result = snapshotSchema.safeParse(raw);
  return result.success ? result.data : null;
}
