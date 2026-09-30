import { z } from "zod";
import type { Observation } from "./snapshot/schema";

// 기상청 웹사이트 내부 JSON이라 형식이 보장되지 않는다. 파일 구조와 품질 정보를 다루는 근거는 설계 문서 "기상청 AMeDAS" 절에 있다.
const AMEDAS_BASE = "https://www.jma.go.jp/bosai/amedas/data/";

const latestTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/);
const recordKey = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})00$/;
const element = z.tuple([z.number().nullable(), z.number()]).optional();
const pointSchema = z.record(
  z.string().regex(recordKey),
  z.object({ precipitation1h: element, precipitation24h: element }).passthrough(),
);

export function parseLatestTime(text: string): string {
  return latestTimeSchema.parse(text.trim());
}

export function pointFileUrl(stationId: string, latestTime: string): URL {
  const [date, time] = latestTime.split("T");
  const block = String(Math.floor(Number(time.slice(0, 2)) / 3) * 3).padStart(2, "0");
  return new URL(`point/${stationId}/${date.replaceAll("-", "")}_${block}.json`, AMEDAS_BASE);
}

function valueOf(entry: [number | null, number] | undefined): number | null {
  return entry && entry[1] === 0 ? entry[0] : null;
}

export function parsePointResponse(json: unknown, stationId: string): Observation {
  const records = pointSchema.parse(json);
  const key = Object.keys(records).sort().at(-1);
  if (key === undefined) throw new Error(`AMeDAS ${stationId} has no records`);
  const [, year, month, day, hour, minute] = recordKey.exec(key)!;
  const record = records[key];
  return {
    id: stationId,
    observedAt: `${year}-${month}-${day}T${hour}:${minute}:00+09:00`,
    precipitation1h: valueOf(record.precipitation1h),
    precipitation24h: valueOf(record.precipitation24h),
  };
}

async function get(url: URL, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`AMeDAS ${response.status}`);
  return response;
}

export async function fetchObservations(stationIds: readonly string[], signal: AbortSignal): Promise<Observation[]> {
  const latestTime = parseLatestTime(await (await get(new URL("latest_time.txt", AMEDAS_BASE), signal)).text());
  return Promise.all(
    stationIds.map(async (id) => parsePointResponse(await (await get(pointFileUrl(id, latestTime), signal)).json(), id)),
  );
}
