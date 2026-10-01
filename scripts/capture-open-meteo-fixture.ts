// 테스트 데이터는 실제 응답을 저장해서 쓴다(설계 문서 "테스트" 절). 요청 형식을 바꾸면 이 스크립트로 다시 받는다.
// 실행: pnpm exec tsx scripts/capture-open-meteo-fixture.ts
import { writeFile } from "node:fs/promises";
import { FORECAST_POINTS } from "../lib/lakes";
import { buildWeatherUrl } from "../lib/weather";

const response = await fetch(buildWeatherUrl(FORECAST_POINTS));
if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
const body = (await response.json()) as unknown[];
await writeFile(new URL("../lib/__fixtures__/open-meteo-msm.json", import.meta.url), `${JSON.stringify(body)}\n`);
console.log(`saved ${body.length} locations`);
