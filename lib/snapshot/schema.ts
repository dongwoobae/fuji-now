import { z } from "zod";
import { LAKE_IDS } from "../lakes";
import { VISIBILITY_GRADES } from "../visibility";

export const SNAPSHOT_KEY = "snapshot:v5";
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
  hourly: z.array(
    z.object({
      time: z.string(),
      lowCloudCover: z.number(),
      precipitation: z.number(),
      grade: z.enum(VISIBILITY_GRADES).nullable(),
      daylight: z.boolean(),
    }),
  ),
});

const observationSchema = z.object({
  id: z.string(),
  observedAt: z.string(),
  precipitation1h: z.number().nullable(),
  precipitation24h: z.number().nullable(),
});

const cameraPartSchema = z.object({
  cameras: z.array(cameraSchema),
  candidates: z.array(z.object({ videoId: z.string(), status: candidateStatusSchema })),
  cameraCheckedAt: z.string().nullable(),
});

const lakeSnapshotSchema = cameraPartSchema.extend({
  id: z.enum(LAKE_IDS),
  weather: lakeWeatherSchema.nullable(),
  weatherCheckedAt: z.string().nullable(),
});

const snapshotSchema = z.object({
  writtenAt: z.string(),
  sunrise: z.string().nullable(),
  sunset: z.string().nullable(),
  lakes: z.array(lakeSnapshotSchema),
  observations: z.array(observationSchema),
  observationsCheckedAt: z.string().nullable(),
  spots: cameraPartSchema,
});

export type CandidateStatus = z.infer<typeof candidateStatusSchema>;
export type Camera = z.infer<typeof cameraSchema>;
export type CameraPart = z.infer<typeof cameraPartSchema>;
export type LakeWeather = z.infer<typeof lakeWeatherSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type LakeSnapshot = z.infer<typeof lakeSnapshotSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;

export function parseSnapshot(raw: unknown): Snapshot | null {
  const result = snapshotSchema.safeParse(raw);
  return result.success ? result.data : null;
}
