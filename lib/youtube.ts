import { z } from "zod";
import type { Camera, CandidateStatus } from "./snapshot/schema";

const videoItemSchema = z.object({
  id: z.string(),
  snippet: z.object({
    title: z.string(),
    channelTitle: z.string(),
    liveBroadcastContent: z.string(),
  }),
  status: z.object({ embeddable: z.boolean() }),
});

const videosResponseSchema = z.object({ items: z.array(videoItemSchema) });

export type VideoItem = z.infer<typeof videoItemSchema>;

export function parseVideosResponse(json: unknown): VideoItem[] {
  return videosResponseSchema.parse(json).items;
}

export function classifyCandidate(videoId: string, items: VideoItem[]): CandidateStatus {
  const item = items.find((candidate) => candidate.id === videoId);
  if (!item) return "missing";
  if (!item.status.embeddable) return "not_embeddable";
  if (item.snippet.liveBroadcastContent === "live") return "live";
  if (item.snippet.liveBroadcastContent === "upcoming") return "upcoming";
  return "ended";
}

export const MAX_CAMERAS = 3;

export function selectCameras(candidateIds: readonly string[], items: VideoItem[]) {
  const candidates = candidateIds.map((videoId) => ({ videoId, status: classifyCandidate(videoId, items) }));
  const cameras: Camera[] = candidates
    .filter((candidate) => candidate.status === "live")
    .slice(0, MAX_CAMERAS)
    .map(({ videoId }) => items.find((item) => item.id === videoId)!)
    .map((item) => ({ videoId: item.id, title: item.snippet.title, channelTitle: item.snippet.channelTitle }));
  return { cameras, candidates };
}

export async function fetchVideos(ids: string[], apiKey: string, signal: AbortSignal): Promise<VideoItem[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,status,liveStreamingDetails");
  url.searchParams.set("id", ids.join(","));
  const response = await fetch(url, { signal, headers: { "x-goog-api-key": apiKey } });
  if (!response.ok) throw new Error(`YouTube videos.list ${response.status}`);
  return parseVideosResponse(await response.json());
}
