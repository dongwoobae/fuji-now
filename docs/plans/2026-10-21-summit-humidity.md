# 정상 700hPa 습도로 정상 하층 자르기 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정상 격자의 700hPa 상대습도가 50% 미만이면 정상 하층 항(0.8 × 정상 하층)을 10(구름 걸림 경계)에서 잘라, 정상 아래 사면에 깔린 구름만으로 "안 보임"이 나오지 않게 한다.

**Architecture:** Open-Meteo 요청에 `relative_humidity_700hPa`를 더해 파서 → 등급(`estimateGrade`) → 기록 행(`weather_hourly`·`forecast`의 새 nullable 열)으로 흘린다. 판정은 `lib/visibility.ts` 한 곳에서 하고, 그 공식을 SQL로 따로 쓴 월별 보정표(`lib/db/calibrate.ts`)에도 같은 상한을 넣는다. 백필은 이미 있는 행의 빈 습도만 채운다.

**Tech Stack:** TypeScript, zod 3, drizzle-orm 0.45(neon-http, PGlite 테스트), drizzle-kit 0.31, vitest, Cloudflare Workers(vinext).

**Spec:** `docs/specs/2026-09-29-five-lakes-mvp-design.md` — "예보 기록과 실측"의 가시성 등급 절과 "보정 (2026-10-21)", "백필", 테이블 절, "테스트".

## Global Constraints

- 습도 경계 `summitDryHumidity: 50`. 습도 < 50이면 자른다. 정확히 50이면 자르지 않는다.
- 상한 값은 `GRADE_RULES.cloudyCover`(10)를 그대로 쓴다. 자르는 것은 정상 하층 항뿐이다. 호수 하층·정상 중층·강수 경로는 그대로다.
- 습도 `null`(값 없음)이면 자르지 않는다. 2026-10-21 전 공식과 같다.
- 습도 필드는 정상 인자에만 둔다. 호수와 공용인 `CloudLayers`에 넣지 않는다.
- 파서는 습도를 "네 값이 하나라도 null이면 시각을 건너뛴다" 조건에 넣지 않는다. 응답에 습도 배열이 아예 없어도 실패하지 않는다.
- DB 열 이름 `humidity_700hpa`, `smallint`, NULL 허용. TS 필드 이름 `humidity700`.
- 매시 기록 작업의 충돌 처리(`onConflictDoNothing`)는 그대로 둔다. 백필만 비어 있는 습도를 채운다.
- 스냅샷 형식(`snapshot:v5`)은 바꾸지 않는다.
- 커밋·주석·문서에는 날짜만 적고, 리뷰나 점검 같은 과정은 적지 않는다. `Co-Authored-By` 트레일러를 붙이지 않는다.
- 주석은 코드로 알 수 없는 이유·제약만 쓴다. 다른 파일의 수치를 옮겨 적지 않는다.
- 모든 명령은 저장소 루트(`C:\Users\servi\projects\fuji-now`)에서 실행한다. 브랜치 `feat/summit-humidity`.

---

### Task 1: 판정 공식에 정상 습도 상한 넣기

**Files:**
- Modify: `lib/visibility.ts`
- Modify: `lib/visibility.test.ts`
- Modify (타입 맞추기, 습도는 일단 `null`): `lib/weather.ts` `gradeHours`, `lib/db/regrade.ts` `changedGrades`, `lib/db/report-agreement.ts` `ReportPair`·`queryReportPairs`
- Modify (테스트 타입 맞추기): `lib/weather.test.ts`, `lib/db/regrade.test.ts`, `lib/db/report-agreement.test.ts`
- Modify: `app/page.tsx` "전망 5단계 보는 법" 문장, `README.md` "현재 상태"의 등급 줄

**Interfaces:**
- Produces: `export type SummitLayers = CloudLayers & { humidity700: number | null }`, `GRADE_RULES.summitDryHumidity`(50), `estimateGrade(lake: CloudLayers & { precipitation: number }, summit: SummitLayers): VisibilityGrade`

- [ ] **Step 1: 실패하는 테스트 쓰기**

`lib/visibility.test.ts`를 아래처럼 바꾼다. 정상 인자는 모두 `top()`으로 만든다(습도 `null` 기본).

```ts
import { describe, expect, it } from "vitest";
import { estimateGrade, GRADE_RULES as r, type SummitLayers } from "./visibility";

const clearSky = { low: 0, mid: 0, high: 0 };
const lake = (overrides: Partial<{ low: number; mid: number; high: number; precipitation: number }> = {}) => ({
  ...clearSky,
  precipitation: 0,
  ...overrides,
});
const top = (overrides: Partial<SummitLayers> = {}): SummitLayers => ({ ...clearSky, humidity700: null, ...overrides });

describe("estimateGrade", () => {
  it("is perfect under a clear sky", () => {
    expect(estimateGrade(lake(), top())).toBe("perfect");
  });

  it("drops to clear on thin cloud or a hazy high layer", () => {
    expect(estimateGrade(lake({ low: r.clearCover }), top())).toBe("clear");
    expect(estimateGrade(lake(), top({ high: r.clearHighCover }))).toBe("clear");
  });

  it("uses the cloudiest of lake low, summit low and summit mid", () => {
    expect(estimateGrade(lake({ low: r.cloudyCover }), top())).toBe("cloudy");
    expect(estimateGrade(lake(), top({ low: 100 }))).toBe("bad");
    expect(estimateGrade(lake({ low: 15 }), top({ mid: 80 }))).toBe("obscured");
  });

  it("weighs summit cloud below lake cloud", () => {
    expect(estimateGrade(lake({ low: 35 }), top())).toBe("obscured");
    expect(estimateGrade(lake(), top({ low: 35 }))).toBe("cloudy");
    expect(estimateGrade(lake(), top({ low: 70 }))).toBe("obscured");
    expect(estimateGrade(lake(), top({ low: 75 }))).toBe("bad");
    expect(estimateGrade(lake(), top({ mid: 40 }))).toBe("cloudy");
  });

  it("never reaches bad from summit mid cloud alone", () => {
    expect(estimateGrade(lake(), top({ mid: 100 }))).toBe("obscured");
  });

  it("caps the summit low term at the cloudy line when the summit level is dry", () => {
    const dry = r.summitDryHumidity - 1;
    // 2026-10-21 11시: 호수 하층 11, 정상 하층 77, 700hPa 습도 36
    expect(estimateGrade(lake({ low: 11 }), top({ low: 77, humidity700: 36 }))).toBe("cloudy");
    expect(estimateGrade(lake(), top({ low: 100, humidity700: 0 }))).toBe("cloudy");
    // 상한보다 작은 정상 하층 항은 그대로다
    expect(estimateGrade(lake(), top({ low: 7, humidity700: dry }))).toBe("clear");
    // 자르는 것은 정상 하층뿐이다
    expect(estimateGrade(lake({ low: 35 }), top({ low: 100, humidity700: dry }))).toBe("obscured");
    expect(estimateGrade(lake(), top({ mid: 100, humidity700: dry }))).toBe("obscured");
    expect(estimateGrade(lake({ precipitation: r.badPrecipitation }), top({ humidity700: dry }))).toBe("bad");
  });

  it("does not cap when the summit level is humid or the humidity is missing", () => {
    expect(estimateGrade(lake(), top({ low: 77, humidity700: r.summitDryHumidity }))).toBe("bad");
    expect(estimateGrade(lake(), top({ low: 77, humidity700: null }))).toBe("bad");
  });

  it("ignores mid cloud over the lake, which sits above the line of sight", () => {
    expect(estimateGrade(lake({ mid: 100 }), top())).toBe("perfect");
  });

  it("lets precipitation at the lake override clear clouds", () => {
    expect(estimateGrade(lake({ precipitation: r.obscuredPrecipitation }), top())).toBe("obscured");
    expect(estimateGrade(lake({ precipitation: r.badPrecipitation }), top())).toBe("bad");
  });

  it("keeps each step just below its threshold", () => {
    expect(estimateGrade(lake({ low: r.clearCover - 1 }), top())).toBe("perfect");
    expect(estimateGrade(lake({ low: r.cloudyCover - 1 }), top())).toBe("clear");
    expect(estimateGrade(lake({ low: r.obscuredCover - 1 }), top())).toBe("cloudy");
    expect(estimateGrade(lake({ low: r.badCover - 1 }), top())).toBe("obscured");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run lib/visibility.test.ts`
Expected: FAIL — "caps the summit low term …"에서 `bad`가 나온다(아직 자르지 않음).

- [ ] **Step 3: 구현**

`lib/visibility.ts`의 타입·기준·함수를 아래로 바꾼다(위 `GRADE_DESCRIPTION`까지는 그대로).

```ts
export type CloudLayers = { low: number; mid: number; high: number };
// 700hPa(약 3km) 상대습도(%). 값이 없는 시각은 null이고, 그때는 자르지 않는다.
export type SummitLayers = CloudLayers & { humidity700: number | null };

// 정상 가중치와 obscuredCover·clearCover는 2026-10-20 사람 실측과 대조해 정했다. summitDryHumidity는 2026-10-21에 정했다.
// 근거와 한계는 설계 문서의 "보정 (2026-10-20)"과 "보정 (2026-10-21)".
// pnpm calibrate가 지금 값으로 실측 대조표를 낸다. 기준을 바꾸면 pnpm regrade로 DB의 과거 등급을 다시 계산한다.
// lib/db/calibrate.ts의 SQL이 가림 공식을 따로 쓰므로 공식을 바꾸면 거기도 고친다.
export const GRADE_RULES = {
  summitLowWeight: 0.8,
  summitMidWeight: 0.5,
  summitDryHumidity: 50,
  badCover: 60,
  badPrecipitation: 1,
  obscuredCover: 30,
  obscuredPrecipitation: 0.5,
  cloudyCover: 10,
  clearCover: 5,
  clearHighCover: 60,
} as const;

// 정상은 3,776m라 하층(3km까지)과 중층(3~8km) 구름이 모두 가린다. 호수에서 정상까지의 시선은 호수 쪽에서 하층을, 정상 쪽에서 하층·중층을 지난다.
// 정상 격자 값을 그대로 쓰면 실측보다 가림이 컸다. 그래서 줄여 넣고, 중층만으로는 "안 보임"에 닿지 않는다.
// 700hPa가 건조하면 정상 하층 구름은 정상보다 낮은 사면에 깔린 것이라 호수에서 산을 다 가리지 못했다. 그때는 "구름 걸림"까지만 센다.
// 상층 구름은 산을 가리지 않지만 하늘이 흐려 선명도가 떨어지므로 "완벽"만 막는다.
export function estimateGrade(lake: CloudLayers & { precipitation: number }, summit: SummitLayers): VisibilityGrade {
  const r = GRADE_RULES;
  const summitLow = r.summitLowWeight * summit.low;
  const dry = summit.humidity700 !== null && summit.humidity700 < r.summitDryHumidity;
  const cover = Math.max(lake.low, dry ? Math.min(summitLow, r.cloudyCover) : summitLow, r.summitMidWeight * summit.mid);
  if (lake.precipitation >= r.badPrecipitation || cover >= r.badCover) return "bad";
  if (lake.precipitation >= r.obscuredPrecipitation || cover >= r.obscuredCover) return "obscured";
  if (cover >= r.cloudyCover) return "cloudy";
  if (cover >= r.clearCover || summit.high >= r.clearHighCover) return "clear";
  return "perfect";
}
```

호출부는 타입만 맞춘다. 습도는 Task 2·4에서 실제 값으로 바꾼다.

`lib/weather.ts` `gradeHours`의 정상 인자:
```ts
                { low: top.lowCloudCover, mid: top.midCloudCover, high: top.highCloudCover, humidity700: null },
```

`lib/db/regrade.ts` `changedGrades`의 정상 인자:
```ts
          { low: top.low, mid: top.mid, high: top.high, humidity700: null },
```

`lib/db/report-agreement.ts`: import에 `type SummitLayers`를 더하고 `ReportPair.summit`을 `SummitLayers`로, `queryReportPairs`의 정상 값을 `{ low: r.summit_low, mid: r.summit_mid, high: r.summit_high, humidity700: null }`로 바꾼다. 쓰지 않게 된 `CloudLayers` import가 있으면 지운다(lake 타입에 쓰이면 둔다).

테스트 타입 맞추기:
- `lib/weather.test.ts` "grades each lake hour …"의 정상 인자에 `humidity700: null`을 더한다.
- `lib/db/regrade.test.ts` `changedGrades` 기대값 계산의 정상 인자에 `humidity700: null`을 더한다.
- `lib/db/report-agreement.test.ts`: `queryReportPairs` 기대값의 `summit`에 `humidity700: null`, `pair()`의 `summit: clearSky`를 `summit: { ...clearSky, humidity700: null }`로 바꾼다.

화면·README 문장:
- `app/page.tsx` "전망 5단계 보는 법": `호수와 후지산 정상 격자의 하층·중층 운량, 호수의 강수 예보로 매긴 모델 추정입니다.` → `호수와 후지산 정상 격자의 하층·중층 운량, 정상 높이의 습도, 호수의 강수 예보로 매긴 모델 추정입니다.`
- `README.md` "현재 상태": `호수와 정상 격자의 하층·중층·상층 운량과 강수로 매긴다.` → `호수와 정상 격자의 하층·중층·상층 운량, 정상 높이(700hPa) 습도, 강수로 매긴다.`

- [ ] **Step 4: 통과 확인**

Run: `pnpm exec vitest run lib/visibility.test.ts && pnpm typecheck && pnpm test`
Expected: 모두 PASS. 다른 테스트의 등급 기대값은 습도가 모두 `null`이라 바뀌지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add lib/visibility.ts lib/visibility.test.ts lib/weather.ts lib/weather.test.ts lib/db/regrade.ts lib/db/regrade.test.ts lib/db/report-agreement.ts lib/db/report-agreement.test.ts app/page.tsx README.md
git commit -m "feat: 정상 700hPa 습도가 50% 미만이면 정상 하층만으로는 \"구름 걸림\"을 넘지 않게 한다"
```

---

### Task 2: Open-Meteo에서 700hPa 습도 받기

**Files:**
- Modify: `lib/weather.ts` (`locationSchema`, `msmUrl`, `PointHour`, `parseForecastPoints`, `gradeHours`)
- Modify: `lib/weather.test.ts`, `lib/backfill.test.ts` (요청 형식 단언)
- Replace: `lib/__fixtures__/open-meteo-msm.json` (다시 받기)
- Modify: `lib/__fixtures__/README.md` (받은 날)

**Interfaces:**
- Consumes: `SummitLayers` (Task 1)
- Produces: `PointHour.humidity700: number | null`. `GradedHour`는 `PointHour & { grade }`라 같이 갖는다.

- [ ] **Step 1: 테스트 데이터 다시 받기**

Run: `pnpm exec tsx scripts/capture-open-meteo-fixture.ts`

그 전에 Step 3의 `msmUrl` 변경(요청 변수 추가)만 먼저 넣어야 새 변수가 들어온다. 순서: `msmUrl`의 hourly 문자열을 바꾸고 → 위 명령 → `node -e "const a=require('./lib/__fixtures__/open-meteo-msm.json');console.log(a.length, a.map(l=>l.hourly.relative_humidity_700hPa.length))"`로 여섯 지점 모두 배열이 있는지 본다.
Expected: `saved 6 locations`, 배열 길이 6개가 `hourly.time` 길이(9)와 같다.

`lib/__fixtures__/README.md`의 `마지막으로 받은 날은 2026-10-01이다.` → `마지막으로 받은 날은 <받은 날짜>이다.`

- [ ] **Step 2: 실패하는 테스트 쓰기**

`lib/weather.test.ts`:
- `buildWeatherUrl` 테스트의 hourly 단언을 `"cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,relative_humidity_700hPa"`로 바꾼다.
- "grades each lake hour …"의 정상 인자를 `humidity700: summit.relative_humidity_700hPa[h]`로 바꾼다(Task 1의 `null` 자리).
- 아래 네 테스트를 `parseWeatherResponse` describe 안에 더한다.

```ts
  it("keeps hours whose 700hPa humidity is missing", () => {
    const patched = structuredClone(fixture) as unknown as Array<{ hourly: Record<string, Array<number | null>> }>;
    patched[FORECAST_POINTS.length - 1].hourly.relative_humidity_700hPa[0] = null;
    const summit = parseForecastPoints(patched, FORECAST_POINTS).find((forecast) => forecast.id === SUMMIT.id);
    expect(summit?.hourly).toHaveLength(fixture[0].hourly.time.length);
    expect(summit?.hourly[0].humidity700).toBeNull();
  });

  it("treats a response without the humidity series as missing humidity", () => {
    const patched = structuredClone(fixture) as unknown as Array<{ hourly: Record<string, unknown> }>;
    for (const location of patched) delete location.hourly.relative_humidity_700hPa;
    const forecasts = parseForecastPoints(patched, FORECAST_POINTS);
    expect(forecasts[0].hourly).toHaveLength(fixture[0].hourly.time.length);
    expect(forecasts.every((forecast) => forecast.hourly.every((hour) => hour.humidity700 === null))).toBe(true);
  });

  it("fails when the humidity series has a different length", () => {
    const patched = structuredClone(fixture) as unknown as Array<{ hourly: Record<string, Array<number | null>> }>;
    patched[0].hourly.relative_humidity_700hPa.pop();
    expect(() => parseForecastPoints(patched, FORECAST_POINTS)).toThrow(/differ in length/);
  });

  it("grades with the summit 700hPa humidity of the same hour", () => {
    const patched = structuredClone(fixture) as unknown as Array<{ hourly: Record<string, Array<number | null>> }>;
    const lake = patched[0].hourly;
    const summit = patched[FORECAST_POINTS.length - 1].hourly;
    for (const h of [0, 1]) {
      for (const key of ["cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "precipitation"]) lake[key][h] = 0;
      summit.cloud_cover_low[h] = 77;
      summit.cloud_cover_mid[h] = 0;
      summit.cloud_cover_high[h] = 0;
    }
    summit.relative_humidity_700hPa[0] = 36;
    summit.relative_humidity_700hPa[1] = 60;
    const graded = gradeHours(parseForecastPoints(patched, FORECAST_POINTS)).get("yamanakako");
    expect(graded?.[0].grade).toBe("cloudy");
    expect(graded?.[1].grade).toBe("bad");
  });
```

`lib/backfill.test.ts` `buildHistoryUrl`의 hourly 단언도 같은 문자열로 바꾼다.

- [ ] **Step 3: 실패 확인**

Run: `pnpm exec vitest run lib/weather.test.ts lib/backfill.test.ts`
Expected: FAIL. `humidity700`이 `undefined`이거나 길이 검사가 없어 실패한다. "grades with the summit …"은 `bad`, `bad`가 나온다. (`msmUrl`은 Step 1에서 바꿨으므로 URL 단언은 이미 통과할 수 있다.)

- [ ] **Step 4: 구현**

`lib/weather.ts`:

```ts
  hourly: z.object({
    time: z.array(localTime),
    cloud_cover_low: hourlyValues,
    cloud_cover_mid: hourlyValues,
    cloud_cover_high: hourlyValues,
    precipitation: hourlyValues,
    // 이 배열이 빠진 응답도 받는다. 습도가 없으면 정상 하층을 자르지 않을 뿐 등급은 매길 수 있다.
    relative_humidity_700hPa: hourlyValues.optional(),
  }),
```

```ts
  url.searchParams.set("hourly", "cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,relative_humidity_700hPa");
```

```ts
export type PointHour = {
  time: string;
  lowCloudCover: number;
  midCloudCover: number;
  highCloudCover: number;
  precipitation: number;
  humidity700: number | null;
  daylight: boolean;
};
```

`parseForecastPoints` 안:

```ts
    const { time, cloud_cover_low: low, cloud_cover_mid: mid, cloud_cover_high: high, precipitation, relative_humidity_700hPa: humidity } =
      location.hourly;
    if ([low, mid, high, precipitation, ...(humidity ? [humidity] : [])].some((values) => values.length !== time.length)) {
      throw new Error(`Open-Meteo hourly arrays differ in length for ${point.id}`);
    }
    const hourly: PointHour[] = [];
    time.forEach((hour, h) => {
      const [l, m, hi, p] = [low[h], mid[h], high[h], precipitation[h]];
      if (l === null || m === null || hi === null || p === null) return;
      hourly.push({
        time: toJstIso(hour),
        lowCloudCover: l,
        midCloudCover: m,
        highCloudCover: hi,
        precipitation: p,
        humidity700: humidity?.[h] ?? null,
        daylight: daylightOf(hour, location.daily),
      });
    });
```

`gradeHours`의 정상 인자를 `humidity700: top.humidity700`로 바꾼다.

- [ ] **Step 5: 통과 확인**

Run: `pnpm typecheck && pnpm test`
Expected: PASS. `lib/record.ts`는 `PointHour`를 펼쳐 쓰지 않으므로 아직 습도를 저장하지 않는다(Task 3).

- [ ] **Step 6: 커밋**

```bash
git add lib/weather.ts lib/weather.test.ts lib/backfill.test.ts lib/__fixtures__/open-meteo-msm.json lib/__fixtures__/README.md
git commit -m "feat: MSM 700hPa 상대습도를 받아 같은 시각의 정상 등급에 쓴다"
```

---

### Task 3: 습도 열 추가와 매시 기록

**Files:**
- Modify: `lib/db/schema.ts` (`layers`)
- Create: `drizzle/0002_summit_humidity.sql`, `drizzle/meta/0002_snapshot.json`, `drizzle/meta/_journal.json` 갱신 (drizzle-kit이 만든다)
- Modify: `lib/record.ts` (`valuesOf`)
- Modify: `lib/record.test.ts`

**Interfaces:**
- Consumes: `PointHour.humidity700` (Task 2)
- Produces: `weatherHourly.humidity700`, `forecast.humidity700` (drizzle 열, DB `humidity_700hpa smallint null`). `WeatherHourlyRow`·`ForecastRow`에 선택 필드 `humidity700?: number | null`.

- [ ] **Step 1: 실패하는 테스트 쓰기**

`lib/record.test.ts` "stores raw layers …"의 `toMatchObject`에 한 줄을 더한다.

```ts
      humidity700: fixture[1].hourly.relative_humidity_700hPa[0],
```

그리고 describe 안에 더한다.

```ts
  it("stores a missing 700hPa humidity as null", () => {
    const patched = structuredClone(fixture) as unknown as Array<{ hourly: Record<string, Array<number | null>> }>;
    patched[FORECAST_POINTS.length - 1].hourly.relative_humidity_700hPa[0] = null;
    const summit = buildRecordRows(parseForecastPoints(patched, FORECAST_POINTS), NOW).actual.find((row) => row.point === SUMMIT.id);
    expect(summit?.humidity700).toBeNull();
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run lib/record.test.ts`
Expected: FAIL — 행에 `humidity700`이 없다.

- [ ] **Step 3: 스키마와 마이그레이션**

`lib/db/schema.ts`의 `layers`에서 `precipitation` 다음 줄에 넣는다.

```ts
  // 700hPa 상대습도(%). 값이 없는 시각은 null이다(설계 문서 "보정 (2026-10-21)").
  humidity700: smallint("humidity_700hpa"),
```

Run: `pnpm db:generate --name summit_humidity`
Expected: `drizzle/0002_summit_humidity.sql`이 생기고 내용이 아래 두 줄이다(순서는 다를 수 있다). 다른 문장이 있으면 멈추고 원인을 본다.

```sql
ALTER TABLE "forecast" ADD COLUMN "humidity_700hpa" smallint;--> statement-breakpoint
ALTER TABLE "weather_hourly" ADD COLUMN "humidity_700hpa" smallint;
```

Run: `pnpm db:check`
Expected: 충돌 없음.

- [ ] **Step 4: 기록 행에 넣기**

`lib/record.ts` `valuesOf`에서 `precipitation` 다음 줄:

```ts
    humidity700: hour.humidity700 === null ? null : Math.round(hour.humidity700),
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm typecheck && pnpm test`
Expected: PASS. PGlite를 쓰는 테스트(`lib/db/*.test.ts`)가 새 마이그레이션까지 적용한다.

- [ ] **Step 6: 커밋**

```bash
git add lib/db/schema.ts drizzle lib/record.ts lib/record.test.ts
git commit -m "feat: weather_hourly·forecast에 700hPa 습도 열을 더하고 매시 기록에 남긴다"
```

---

### Task 4: 백필이 빈 습도만 채우게 하기

**Files:**
- Create: `lib/db/backfill.ts`
- Create: `lib/db/backfill.test.ts`
- Modify: `scripts/backfill.ts`
- Modify: `README.md` (로컬 실행의 `pnpm backfill` 줄, 구조 표의 백필 행)

**Interfaces:**
- Consumes: `weatherHourly.humidity700` (Task 3), `Db` (`lib/db/client.ts`)
- Produces: `writeBackfillRows(db: Db, rows: readonly WeatherHourlyRow[]): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 쓰기**

`lib/db/backfill.test.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import { writeBackfillRows } from "./backfill";
import type { Db } from "./client";
import * as schema from "./schema";
import { weatherHourly, type WeatherHourlyRow } from "./schema";

// 쿼리 빌더는 드라이버와 상관없이 같고 타입만 드라이버마다 다르다.
const pglite = drizzle(new PGlite(), { schema });
const db = pglite as unknown as Db;

const row = (point: string, jst: string, overrides: Partial<WeatherHourlyRow> = {}): WeatherHourlyRow => ({
  point,
  time: new Date(`${jst}:00+09:00`),
  lowCloudCover: 0,
  midCloudCover: 0,
  highCloudCover: 0,
  precipitation: 0,
  humidity700: null,
  grade: point === "summit" ? null : "perfect",
  daylight: true,
  fetchedAt: new Date("2026-10-21T00:00:00Z"),
  source: "backfill",
  ...overrides,
});

beforeAll(async () => {
  await migrate(pglite, { migrationsFolder: "drizzle" });
  await db.insert(weatherHourly).values([
    // 습도 열을 더하기 전에 매시 기록이 쓴 행
    row("summit", "2026-10-21T11:00", { lowCloudCover: 77, source: "live" }),
    row("kawaguchiko", "2026-10-21T11:00", { lowCloudCover: 11, grade: "bad", source: "live" }),
    // 이미 습도가 있는 행
    row("summit", "2026-10-21T12:00", { lowCloudCover: 74, humidity700: 40, source: "live" }),
  ]);
});

describe("writeBackfillRows", () => {
  it("fills only missing humidity on existing rows and inserts new hours", async () => {
    await writeBackfillRows(db, [
      row("summit", "2026-10-21T11:00", { lowCloudCover: 70, humidity700: 36 }),
      row("kawaguchiko", "2026-10-21T11:00", { lowCloudCover: 30, grade: "obscured", humidity700: 70 }),
      row("summit", "2026-10-21T12:00", { humidity700: 90 }),
      row("summit", "2026-10-21T13:00", { lowCloudCover: 82, humidity700: 43 }),
    ]);
    const after = await db.select().from(weatherHourly).orderBy(asc(weatherHourly.time), asc(weatherHourly.point));
    const at = (point: string, jst: string) => after.find((r) => r.point === point && r.time.getTime() === Date.parse(`${jst}:00+09:00`));
    expect(at("summit", "2026-10-21T11:00")).toMatchObject({ lowCloudCover: 77, source: "live", humidity700: 36 });
    expect(at("kawaguchiko", "2026-10-21T11:00")).toMatchObject({ lowCloudCover: 11, grade: "bad", source: "live", humidity700: 70 });
    expect(at("summit", "2026-10-21T12:00")).toMatchObject({ lowCloudCover: 74, humidity700: 40 });
    expect(at("summit", "2026-10-21T13:00")).toMatchObject({ lowCloudCover: 82, source: "backfill", humidity700: 43 });
  });

  it("keeps humidity empty and other columns untouched when the history has no humidity", async () => {
    const time = new Date("2018-08-01T10:00:00+09:00");
    await writeBackfillRows(db, [row("summit", "2018-08-01T10:00")]);
    await writeBackfillRows(db, [row("summit", "2018-08-01T10:00", { lowCloudCover: 50 })]);
    const [summit] = await db.select().from(weatherHourly).where(eq(weatherHourly.time, time));
    expect(summit).toMatchObject({ lowCloudCover: 0, humidity700: null });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run lib/db/backfill.test.ts`
Expected: FAIL — `./backfill` 모듈이 없다.

- [ ] **Step 3: 구현**

`lib/db/backfill.ts`:

```ts
import { and, isNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import { weatherHourly, type WeatherHourlyRow } from "./schema";

// 한 insert의 매개변수 수(행 수 × weather_hourly 열 수)가 Postgres 한도(65,535)보다 충분히 작게.
const INSERT_CHUNK = 2_000;

// 이미 있는 행은 운량·등급·출처를 두고 비어 있는 700hPa 습도만 채운다. 매시 기록(live)이 먼저 쓴 값을 덮지 않고,
// 습도 열을 더하기 전에 쌓인 행에 습도를 넣기 위해서다(설계 문서 "백필").
export async function writeBackfillRows(db: Db, rows: readonly WeatherHourlyRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db
      .insert(weatherHourly)
      .values(rows.slice(i, i + INSERT_CHUNK))
      .onConflictDoUpdate({
        target: [weatherHourly.point, weatherHourly.time],
        set: { humidity700: sql`excluded.humidity_700hpa` },
        setWhere: and(isNull(weatherHourly.humidity700), sql`excluded.humidity_700hpa is not null`),
      });
  }
}
```

`scripts/backfill.ts`:
- 3번째 줄 주석 `// 이미 있는 시각은 건너뛰므로(ON CONFLICT DO NOTHING) 중간에 끊기면 같은 명령을 다시 실행하면 된다.` → `// 이미 있는 시각은 비어 있는 700hPa 습도만 채우고 나머지 열은 두므로 중간에 끊기면 같은 명령을 다시 실행하면 된다.`
- `import { weatherHourly } from "../lib/db/schema";`를 지우고 `import { writeBackfillRows } from "../lib/db/backfill";`를 더한다.
- `INSERT_CHUNK` 상수와 그 주석을 지운다.
- 마이그레이션 확인:
  ```ts
  // 0001·0002 마이그레이션(source·humidity_700hpa 열) 전에 돌리면 첫 달에서 실패하므로 미리 확인한다.
  try {
    await db.execute(sql`select source, humidity_700hpa from weather_hourly limit 0`);
  ```
- 달마다 쓰는 부분:
  ```ts
      const rows = buildBackfillRows(parseForecastPoints(await response.json(), FORECAST_POINTS), new Date());
      await writeBackfillRows(db, rows);
  ```
- 끝 로그 `(이미 있던 시각은 건너뜀)` → `(이미 있던 시각은 빈 습도만 채움)`.

`README.md`:
- 로컬 실행의 백필 줄 `이미 있는 시각은 건너뛴다.` → `이미 있는 시각은 비어 있는 700hPa 습도만 채우고 나머지는 그대로 둔다.`
- 구조 표 `| \`lib/backfill.ts\`, \`scripts/backfill.ts\` | 과거 예보로 \`weather_hourly\` 채우기 |` → `| \`lib/backfill.ts\`, \`lib/db/backfill.ts\`, \`scripts/backfill.ts\` | 과거 예보로 \`weather_hourly\` 채우기 |`

- [ ] **Step 4: 통과 확인**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/db/backfill.ts lib/db/backfill.test.ts scripts/backfill.ts README.md
git commit -m "feat: 백필이 이미 있는 행의 빈 700hPa 습도만 채운다"
```

---

### Task 5: regrade와 실측 대조가 정상 습도를 읽게 하기

**Files:**
- Modify: `lib/db/regrade.ts` (`layerRowSchema`, `changedGrades`, `readLayerRows`, 머리 주석)
- Modify: `lib/db/regrade.test.ts`
- Modify: `lib/db/report-agreement.ts` (`pairRowSchema`, `queryReportPairs`, `formatAgreement` 설명 줄)
- Modify: `lib/db/report-agreement.test.ts`

**Interfaces:**
- Consumes: `humidity_700hpa` 열 (Task 3), `SummitLayers` (Task 1)
- Produces: `LayerRow.humidity: number | null`

- [ ] **Step 1: 실패하는 테스트 쓰기**

`lib/db/regrade.test.ts`:
- `changedGrades` describe의 `row()`에 `humidity: null`을 더하고, 아래 테스트를 더한다.

```ts
  it("caps the summit low cloud when the summit row is dry", () => {
    const withHumidity = (base: LayerRow, humidity: number | null): LayerRow => ({ ...base, humidity });
    expect(changedGrades([withHumidity(row("summit", 77, null), 36), row("kawaguchiko", 11, "bad")])).toEqual([
      { point: "kawaguchiko", time: "2018-08-01T01:00:00Z", lead: null, grade: "cloudy" },
    ]);
    // 습도는 정상 행의 것을 본다
    expect(changedGrades([row("summit", 77, null), withHumidity(row("kawaguchiko", 11, "bad"), 36)])).toEqual([]);
  });
```

- "regrade against the database" describe의 "matches forecast rows …"와 "reports the Japan-date span …" 사이에 더한다(같은 8월 안이라 날짜 범위 단언은 바뀌지 않는다).

```ts
  it("reads the summit 700hPa humidity and regrades with it", async () => {
    const at = new Date("2018-08-15T10:00:00+09:00");
    await db.insert(weatherHourly).values([
      { point: "summit", time: at, ...layers(77), humidity700: 36, grade: null, source: "backfill" },
      { point: "kawaguchiko", time: at, ...layers(11), grade: "bad", source: "backfill" },
    ]);
    const rows = await readLayerRows(db, "weather_hourly", "2018-08-15", "2018-08-15");
    expect(rows.find((r) => r.point === "summit")?.humidity).toBe(36);
    expect(changedGrades(rows)).toEqual([{ point: "kawaguchiko", time: "2018-08-15T01:00:00Z", lead: null, grade: "cloudy" }]);
  });
```

`lib/db/report-agreement.test.ts`:
- `beforeAll`의 `hour("summit", "2026-10-08T15:00", 35, { highCloudCover: 4 })` → `hour("summit", "2026-10-08T15:00", 35, { highCloudCover: 4, humidity700: 36 })`
- `queryReportPairs` 기대값의 `summit`을 `{ low: 35, mid: 0, high: 4, humidity700: 36 }`로 바꾼다(Task 1의 `null` 자리).

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run lib/db/regrade.test.ts lib/db/report-agreement.test.ts`
Expected: FAIL — regrade는 `humidity`가 스키마에 없어 `undefined`이고 상한이 걸리지 않는다. 실측 대조는 `humidity700: null`이 나온다.

- [ ] **Step 3: 구현**

`lib/db/regrade.ts`:
- 머리 주석 첫 줄 `// 등급 기준(GRADE_RULES)을 바꾼 뒤 DB에 남은 원시 운량으로 과거 등급을 다시 매긴다.` → `// 등급 기준(GRADE_RULES)을 바꾼 뒤 DB에 남은 원시 운량과 정상 습도로 과거 등급을 다시 매긴다.`
- `layerRowSchema`의 `precip` 다음:
  ```ts
  humidity: z.coerce.number().nullable(),
  ```
- `changedGrades`의 정상 인자: `{ low: top.low, mid: top.mid, high: top.high, humidity700: top.humidity }`
- `readLayerRows`의 select: `low_cloud_cover as low, mid_cloud_cover as mid, high_cloud_cover as high, precipitation as precip, humidity_700hpa as humidity,`

`lib/db/report-agreement.ts`:
- `pairRowSchema`에 `summit_humidity: z.coerce.number().nullable(),`
- select 끝: `s.low_cloud_cover as summit_low, s.mid_cloud_cover as summit_mid, s.high_cloud_cover as summit_high, s.humidity_700hpa as summit_humidity`
- 정상 값: `{ low: r.summit_low, mid: r.summit_mid, high: r.summit_high, humidity700: r.summit_humidity }`
- `formatAgreement` 설명 줄 `human_report를 같은 정시의 호수·정상 운량과 짝지어` → `human_report를 같은 정시의 호수·정상 운량(정상은 700hPa 습도 포함)과 짝지어`

- [ ] **Step 4: 통과 확인**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/db/regrade.ts lib/db/regrade.test.ts lib/db/report-agreement.ts lib/db/report-agreement.test.ts
git commit -m "feat: 과거 등급 재계산과 실측 대조가 정상 700hPa 습도를 함께 읽는다"
```

---

### Task 6: 월별 보정표 SQL에 같은 상한 넣기

**Files:**
- Modify: `lib/db/calibrate.ts` (`queryCalibration` SQL, `formatCalibration` 범례)
- Modify: `lib/db/calibrate.test.ts`

**Interfaces:**
- Consumes: `GRADE_RULES.summitDryHumidity`, `GRADE_RULES.cloudyCover` (Task 1), `humidity_700hpa` 열 (Task 3)

- [ ] **Step 1: 실패하는 테스트 쓰기**

`lib/db/calibrate.test.ts`:
- import에 `GRADE_RULES`를 더한다: `import { GRADE_RULES } from "../visibility";`
- `beforeAll`의 insert 배열 끝에 더한다.

```ts
    // 9월 1일: 정상 하층 77은 같고, 10시는 700hPa가 건조해서 10에서 잘리고 11시는 경계값이라 61.6 그대로다
    { ...row("summit", "10:00", 77), time: new Date("2025-09-01T10:00:00+09:00"), humidity700: GRADE_RULES.summitDryHumidity - 14 },
    { ...row("summit", "11:00", 77), time: new Date("2025-09-01T11:00:00+09:00"), humidity700: GRADE_RULES.summitDryHumidity },
    { ...row("kawaguchiko", "10:00", 0), time: new Date("2025-09-01T10:00:00+09:00") },
    { ...row("kawaguchiko", "11:00", 0), time: new Date("2025-09-01T11:00:00+09:00") },
```

- 기존 단언 `expect(rows).toHaveLength(CALIBRATION_THRESHOLDS.length);` → `expect(rows).toHaveLength(CALIBRATION_THRESHOLDS.length * 2);` (8월·9월 두 달이 된다. 이 단언이 바뀌는 것은 의도다.)
- `queryCalibration` describe에 더한다.

```ts
  it("caps the summit low cloud at the cloudy line when the summit level is dry", async () => {
    const rows = await queryCalibration(db);
    const at = (threshold: number) => rows.find((r) => r.threshold === threshold && r.month === 9);
    // 낮 2시간 중 가림: 10시 10(잘림), 11시 61.6
    expect(at(60)).toEqual({ threshold: 60, month: 9, days: 1, any1: 1, min3: 0, half: 1, morning: 0 });
    expect(at(10)).toEqual({ threshold: 10, month: 9, days: 1, any1: 0, min3: 0, half: 0, morning: 0 });
  });
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm exec vitest run lib/db/calibrate.test.ts`
Expected: FAIL — `at(60)`의 `any1`이 0이다(10시도 61.6으로 잡힌다).

- [ ] **Step 3: 구현**

`lib/db/calibrate.ts` `queryCalibration`의 `greatest(…)`:

```ts
        greatest(
          w.low_cloud_cover,
          case
            when s.humidity_700hpa < ${GRADE_RULES.summitDryHumidity}
              then least(${GRADE_RULES.summitLowWeight}::numeric * s.low_cloud_cover, ${GRADE_RULES.cloudyCover}::numeric)
            else ${GRADE_RULES.summitLowWeight}::numeric * s.low_cloud_cover
          end,
          ${GRADE_RULES.summitMidWeight}::numeric * s.mid_cloud_cover
        ) as cover,
```

습도가 NULL이면 `null < 50`이 참이 아니므로 `else`로 가서 자르지 않는다. `estimateGrade`의 `null` 처리와 같다.

`formatCalibration` 범례의 `cover<` 줄:

```ts
    `${"cover<".padEnd(8)}: 가림 = max(호수 하층, ${GRADE_RULES.summitLowWeight}×정상 하층(700hPa 습도 < ${GRADE_RULES.summitDryHumidity}이면 최대 ${GRADE_RULES.cloudyCover}), ${GRADE_RULES.summitMidWeight}×정상 중층) 운량(%)이 이 값보다 작고 호수 강수 < ${GRADE_RULES.obscuredPrecipitation}mm면 알아볼 수 있는 시각`,
```

`formatCalibration` 테스트는 표 너비만 보므로 범례 변경에 영향이 없다.

- [ ] **Step 4: 통과 확인**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/db/calibrate.ts lib/db/calibrate.test.ts
git commit -m "feat: 월별 보정표 SQL에도 정상 700hPa 습도 상한을 넣는다"
```

---

### Task 7: 전체 검사, 역추적, PR

**Files:**
- Modify: 역추적에서 나온 곳(있으면)

- [ ] **Step 1: 전체 검사**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: 모두 통과. 실패하면 출력 그대로 보고하고 고친다.

- [ ] **Step 2: 로컬 대조(읽기 전용)**

운영 DB에는 아직 `humidity_700hpa` 열이 없으므로 `pnpm calibrate`는 이 단계에서 돌리지 않는다(Task 8에서 돈다).

- [ ] **Step 3: 역추적**

아래를 실행하고 출력을 PR 본문과 보고에 붙인다. 모든 결과가 (a) 이 브랜치에서 고침, (b) 날짜가 붙은 기록, (c) 무관 중 하나여야 한다.

```bash
grep -rn "estimateGrade\|CloudLayers\|SummitLayers" lib worker app scripts --include=*.ts --include=*.tsx
grep -rn "cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation" lib scripts docs README.md
grep -rn "ON CONFLICT DO NOTHING\|onConflictDoNothing\|이미 있는 시각은 건너" lib scripts worker docs README.md
grep -rn "하층·중층 운량\|운량과 강수로\|원시 운량으로" app lib docs README.md
grep -rn "2026-10-01이다" lib/__fixtures__/README.md
```

- [ ] **Step 4: 계획 문서 처리 확인**

이 계획은 병합할 때 `git rm`한다(Task 8 Step 1). PR이 열려 있는 동안은 둔다.

- [ ] **Step 5: 푸시와 PR**

```bash
git push -u origin feat/summit-humidity
gh pr create --base main --title "feat: 정상 700hPa 습도가 낮으면 정상 하층만으로는 \"구름 걸림\"을 넘지 않게 한다" --body-file <작성한 본문 파일>
```

본문에는 무엇이 바뀌었는지, 근거(설계 문서 "보정 (2026-10-21)"), 병합 뒤 운영 순서(Task 8), 역추적 출력을 적는다. 리뷰·점검 같은 과정은 적지 않는다.

---

### Task 8: 병합 뒤 운영 (운영자 로컬)

CI가 main 병합 때 `pnpm db:migrate`(0002) 뒤 배포한다. 아래는 운영자가 로컬에서 돌린다. `stats:refresh`는 wrangler 로그인이 필요하다(`pnpm exec wrangler login`).

- [ ] **Step 1: 계획 문서 지우기** — 병합 직전에 이 브랜치에서 `git rm docs/plans/2026-10-21-summit-humidity.md` 후 커밋한다.
- [ ] **Step 2: 습도 채우기** — `pnpm backfill 2025-12-11`. 끝에 `완료` 줄을 확인한다. 과거 예보 API가 최근 날짜에 500을 주면 끝일을 앞당긴다(README).
- [ ] **Step 3: 등급 다시 매기기** — `pnpm regrade`. 반드시 Step 2 뒤에 돌린다.
- [ ] **Step 4: 통계 다시 집계** — `pnpm stats:refresh`.
- [ ] **Step 5: 대조** — `pnpm calibrate`. 실측 대조표에서 10-21 11시가 들어갔는지 본다. 그 시각 행이 과거 예보 API에 아직 없어 습도가 비어 있으면 Step 6에서 채운다.
- [ ] **Step 6: 배포일까지의 행 다시 채우기** — 배포일이 과거 예보 API에 들어온 뒤(며칠 걸릴 수 있다) `pnpm backfill <2026-10-21 또는 그 앞 날짜> <배포일>` → `pnpm regrade` → `pnpm stats:refresh`.
- [ ] **Step 7: 운영 화면 확인** — 다음 5분 스냅샷 뒤 https://fujinow.dwoobae.com 에서 정상 700hPa가 건조한 시각의 등급이 "구름 걸림" 이하로 막히는지 본다. 습도를 직접 볼 화면은 없으므로 `wrangler tail`의 `"event":"record"` 로그나 Neon에서 `humidity_700hpa`가 채워지는지 확인한다.
