// 테스트 데이터는 실제 응답을 저장해서 쓴다(설계 문서 "테스트" 절). 요청 형식을 바꾸면 이 스크립트로 다시 받는다.
// 실행: node scripts/capture-open-meteo-fixture.mjs
import { writeFile } from "node:fs/promises";

// lib/lakes.ts의 FORECAST_POINTS와 같은 순서·좌표다. 바꾸면 함께 고친다.
const points = [
  [35.417, 138.875],
  [35.504, 138.761],
  [35.499, 138.685],
  [35.47, 138.61],
  [35.463, 138.588],
  [35.3606, 138.7274],
];

const url = new URL("https://api.open-meteo.com/v1/forecast");
url.searchParams.set("latitude", points.map(([lat]) => lat).join(","));
url.searchParams.set("longitude", points.map(([, lon]) => lon).join(","));
url.searchParams.set("models", "jma_msm");
url.searchParams.set("cell_selection", "nearest");
url.searchParams.set("current", "temperature_2m,cloud_cover,precipitation,wind_speed_10m");
url.searchParams.set("hourly", "cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation");
url.searchParams.set("daily", "sunrise,sunset");
url.searchParams.set("forecast_hours", "9");
url.searchParams.set("wind_speed_unit", "ms");
url.searchParams.set("timezone", "Asia/Tokyo");

const response = await fetch(url);
if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
const body = await response.json();
await writeFile(new URL("../lib/__fixtures__/open-meteo-msm.json", import.meta.url), `${JSON.stringify(body)}\n`);
console.log(`saved ${body.length} locations`);
