# FUJI NOW 후지 5호 카메라 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ChatGPT Sites에서 만든 첫 버전을 내 Cloudflare workers.dev로 옮기고, 후지 5호별 YouTube 라이브와 기상청 MSM 기상을 한 페이지에 보여준다.

**Architecture:** 5분 주기 예약 작업이 YouTube Data API와 Open-Meteo를 한 번씩 호출해 결과를 KV 키 하나(`snapshot:v1`)에 스냅샷으로 저장한다. 페이지(vinext 서버 컴포넌트)는 그 스냅샷만 읽어서 그리고, 브라우저 코드는 플레이어 열기와 "N분 전" 계산에만 쓴다. 판정·합치기 로직은 외부 호출과 KV에 의존하지 않는 순수 함수로 두고 vitest로 테스트한다.

**Tech Stack:** vinext(Next.js App Router 호환, Vite) · @cloudflare/vite-plugin · Cloudflare Workers(Cron Trigger, KV) · wrangler · zod 3 · vitest · pnpm

**Spec:** `docs/specs/2026-09-29-five-lakes-mvp-design.md`

## Global Constraints

- `pnpm-workspace.yaml`의 `minimumReleaseAge: 10080`을 유지한다. 공개 7일 이내 패키지는 설치하지 않는다.
- KV 키는 하나(`snapshot:v1`), 바인딩 이름은 `SNAPSHOT_KV`, 만료는 1일(86400초)이다. 직전 값을 이어받는 기간은 최대 1시간이다.
- 예약 작업은 `*/5 * * * *`로 돌고, 외부 호출은 각각 10초에 끊는다.
- YouTube: 썸네일을 쓰지 않는다. 플레이어는 최소 200×200px이다. 플레이어 위에는 아무것도 겹치지 않는다. 임베드 도메인은 `youtube-nocookie.com`이다.
- `YOUTUBE_API_KEY`는 커밋하지 않고, 로그와 에러 메시지에도 넣지 않는다. 로컬에서는 `.env.local`(git 제외), 운영에서는 `wrangler secret`으로 둔다.
- 화면 문구는 한국어로 쓰고, 시각은 일본 시간(Asia/Tokyo)으로 표시한다.
- 역후지 기준은 풍속 1.2m/s 이하면 "잔잔함", 초과면 "물결 있음"이다. 옆에 "참고" 표시를 붙인다.
- 확인 지연 경고는 20분이 넘으면 띄운다.
- `pnpm deploy`는 pnpm 내장 명령이다. 배포 스크립트는 반드시 `pnpm run deploy`로 실행한다.
- 주석은 코드로 알 수 없는 이유·외부 제약·위험만 쓴다. 커밋 메시지에 AI나 리뷰 과정을 적지 않고, `Co-Authored-By`를 붙이지 않는다.
- 배포, KV 네임스페이스 생성, secret 등록은 외부에 영향을 주는 작업이다. 해당 단계에서 사용자 승인을 받은 뒤에 실행한다.

---

## 파일 구조

| 경로 | 책임 |
|---|---|
| `worker/index.ts` | 워커 진입점. `fetch` → vinext, `scheduled` → 스냅샷 작업 |
| `worker/snapshot-job.ts` | 예약 작업: 읽기 → 두 외부 호출 → 합치기 → 쓰기 → 로그 |
| `lib/lakes.ts` | 호수 목록(좌표·후보 영상 ID·대체 링크) |
| `lib/snapshot/schema.ts` | 스냅샷 zod 스키마·타입·상수, `parseSnapshot` |
| `lib/snapshot/store.ts` | `readSnapshot` / `writeSnapshot` (KV) |
| `lib/snapshot/build.ts` | `buildSnapshot`: 새 결과와 직전 스냅샷 합치기 |
| `lib/youtube.ts` | videos.list 응답 검사·후보 분류·카메라 선택·호출 |
| `lib/weather.ts` | Open-Meteo URL·응답 검사·좌표 대조·변환·호출 |
| `lib/view.ts` | 화면 도우미(신선도·야간·바람 표시·시간 형식) |
| `lib/__fixtures__/*.json` | 실제 응답에서 만든 테스트 데이터 |
| `components/lake-card.tsx` | 호수 카드(서버 컴포넌트) |
| `components/lake-player.tsx` | 누르면 열리는 플레이어(클라이언트) |
| `components/freshness.tsx` | "N분 전 확인"·확인 지연(클라이언트) |
| `components/site-footer.tsx` | 출처·약관·정책 링크 |
| `app/page.tsx` | 메인 화면 |
| `app/privacy/page.tsx` | 개인정보처리방침 |

---

# 1단계: 배포 이전

### Task 1: 도구 버전 올리기

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: 없음
- Produces: wrangler 4.136.1, @cloudflare/vite-plugin 1.57.1, vinext 1.0.0-beta.11, vite 8.3.0, @vitejs/plugin-rsc 0.5.35

- [ ] **Step 1: 버전 올리기**

Run:
```bash
pnpm up wrangler@4.136.1 @cloudflare/vite-plugin@1.57.1 vinext@1.0.0-beta.11 vite@8.3.0 @vitejs/plugin-rsc@0.5.35
```
Expected: `Done in ...`. 설치 목록에 위 다섯 버전이 보인다. `minimumReleaseAge` 경고가 뜨더라도 설치 대상에서 걸러진 것이 아니면 괜찮다.

- [ ] **Step 2: 설치된 버전 확인**

Run:
```bash
node -e "for(const p of ['wrangler','@cloudflare/vite-plugin','vinext','vite','@vitejs/plugin-rsc'])console.log(p,require('./node_modules/'+p+'/package.json').version)"
```
Expected:
```
wrangler 4.136.1
@cloudflare/vite-plugin 1.57.1
vinext 1.0.0-beta.11
vite 8.3.0
@vitejs/plugin-rsc 0.5.35
```

- [ ] **Step 3: 빌드 확인**

Run: `pnpm build`
Expected: `Build complete.`

Run: `node -e "console.log(require('./dist/server/wrangler.json').legacy_env)"`
Expected: `undefined`

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: vinext·wrangler 도구 버전을 올린다

@cloudflare/vite-plugin 1.37.1이 만드는 설정의 legacy_env를 최신 wrangler가
거부하고, wrangler 4.92.0은 로컬에서 예약 작업을 부를 때 DataCloneError를 낸다.
minimumReleaseAge 안에서 서로 맞는 조합으로 올린다."
```

---

### Task 2: AI 사진 판정과 D1 제거

**Files:**
- Delete: `app/api/analyze/route.ts`, `app/api/observations/route.ts`, `db/index.ts`, `db/schema.ts`, `drizzle/` 전체, `drizzle.config.ts`
- Modify: `app/page.tsx`, `package.json`(`db:generate` 스크립트, `drizzle-orm`·`drizzle-kit` 의존성), `pnpm-lock.yaml`, `README.md`

**Interfaces:**
- Consumes: 없음
- Produces: 기상 패널과 카메라 링크만 남은 `app/page.tsx`. `/api/weather`는 그대로 둔다.

- [ ] **Step 1: 파일 삭제**

```bash
git rm -r app/api/analyze app/api/observations db drizzle drizzle.config.ts
```

- [ ] **Step 2: 의존성과 스크립트 제거**

```bash
pnpm remove drizzle-orm drizzle-kit
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));delete p.scripts['db:generate'];fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
```

- [ ] **Step 3: `app/page.tsx`에서 업로드·판정·기록 패널 제거**

`app/page.tsx` 전체를 아래로 바꾼다.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Camera, Cloud, ExternalLink, Mountain, RefreshCw } from 'lucide-react';

type Weather = { current: { time: string; temperature_2m: number; relative_humidity_2m: number; precipitation: number; cloud_cover: number; wind_speed_10m: number }; hourly: { time: string[]; cloud_cover: number[]; precipitation_probability: number[] } };

export default function Home() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [loadingWeather, setLoadingWeather] = useState(false);

  async function loadWeather() {
    setLoadingWeather(true); setWeatherError('');
    try {
      const response = await fetch('/api/weather');
      if (!response.ok) throw new Error();
      setWeather(await response.json());
    } catch { setWeatherError('기상 자료를 불러오지 못했습니다. 다시 시도해주세요.'); }
    finally { setLoadingWeather(false); }
  }
  useEffect(() => { loadWeather(); }, []);

  const hours = weather?.hourly.time.map((time, i) => ({ time, cloud: weather.hourly.cloud_cover[i], rain: weather.hourly.precipitation_probability[i] })).filter(row => new Date(row.time).getTime() >= Date.now() - 60 * 60 * 1000).slice(0, 8) || [];

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Mountain size={23} strokeWidth={1.8}/></span><div><strong>FUJI NOW</strong><small>후지산 관측 노트</small></div></div><span className="region">JAPAN · KAWAGUCHIKO</span></header>
    <section className="intro"><div><p className="eyebrow">LAKE KAWAGUCHI · LIVE CONDITIONS</p><h1>지금, 후지산이<br/>보일까?</h1><p className="subcopy">가와구치코의 기상과 카메라를 확인하세요.</p></div><div className="time-badge">관측 기준 <strong>일본 현지 시각</strong><span>예보는 참고용</span></div></section>
    <div className="columns"><div className="main-column">
      <section className="panel weather-panel"><div className="section-heading"><div><p className="eyebrow">WEATHER / 가와구치코</p><h2>현재 기상</h2></div><button className="icon-button" onClick={loadWeather} disabled={loadingWeather} aria-label="기상 새로고침"><RefreshCw size={18} className={loadingWeather ? 'spin' : ''}/></button></div>
        {weatherError ? <div className="notice">{weatherError}</div> : weather ? <><div className="weather-hero"><div><span className="main-number">{Math.round(weather.current.temperature_2m)}<sup>°C</sup></span><p>관측 모델 시각 {weather.current.time.slice(11,16)} JST</p></div><Cloud size={73} strokeWidth={1.1} className="hero-icon"/></div><div className="metric-grid"><div><span>운량</span><strong>{weather.current.cloud_cover}%</strong></div><div><span>강수</span><strong>{weather.current.precipitation} mm</strong></div><div><span>습도</span><strong>{weather.current.relative_humidity_2m}%</strong></div><div><span>바람</span><strong>{weather.current.wind_speed_10m} km/h</strong></div></div></> : <div className="loading">기상 자료를 불러오는 중...</div>}
      </section>
      <section className="panel outlook"><div className="section-heading"><div><p className="eyebrow">HOURLY OUTLOOK</p><h2>앞으로의 운량</h2></div><span className="muted">수치예보 · 후지산 가시성 아님</span></div>{hours.length ? <div className="hour-list">{hours.map(row => <div className="hour" key={row.time}><span>{row.time.slice(11,16)}</span><div className="bar-track"><div className="bar-fill" style={{width: `${row.cloud}%`}}/></div><strong>{row.cloud}%</strong><small>강수 {row.rain}%</small></div>)}</div> : <p className="muted">기상 자료를 기다리는 중입니다.</p>}</section>
    </div><div className="side-column">
      <section className="panel camera-panel"><div className="section-heading"><div><p className="eyebrow">CAMERA SOURCES</p><h2>실제 화면 확인</h2></div><Camera size={21}/></div><p>카메라 운영 사이트에서 최신 화면을 직접 확인하세요.</p><div className="camera-links"><a href="https://www.fujisan-climb.jp/en/livecamera/" target="_blank" rel="noopener noreferrer">후지산 공식 라이브카메라 목록 <ExternalLink size={15}/></a><a href="https://www.fujigoko.tv/" target="_blank" rel="noopener noreferrer">Fujigoko.TV 카메라 <ExternalLink size={15}/></a></div></section>
    </div></div>
    <footer>기상 자료: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> (CC BY 4.0) · 기상 수치는 관측값이 아닌 모델 기반 현재값입니다.</footer>
  </main>;
}
```

- [ ] **Step 4: README에서 AI 판정·D1 설명 제거**

`README.md`에서 다음을 고친다.
- "현재 상태"의 하위 항목 `  - 사진을 올리면 Gemini로 가시성을 판정하는 기능과 판정 기록(D1). 서버에 \`GEMINI_API_KEY\`가 없으면 비활성 상태다.` 줄을 지운다.
- "진행 중인 방향"의 `- 사진 AI 판정과 D1은 제거한다. 카메라 영상 분석은 제공자의 허가를 받은 뒤에 다시 검토한다.`를 `- 카메라 영상 AI 분석은 제공자의 허가를 받은 뒤에 다시 검토한다.`로 바꾼다.
- "구조" 표에서 `app/api/analyze`, `app/api/observations` 행과 `db/`, `drizzle/` 행을 지운다.

- [ ] **Step 5: 남은 참조 확인**

Run:
```bash
rg -n "drizzle|/api/analyze|/api/observations|GEMINI|from ['\"]@/db|db/schema" --glob "!node_modules" --glob "!pnpm-lock.yaml" --glob "!dist" --glob "!docs/**" .
```
Expected: 결과 없음

- [ ] **Step 6: 검사와 빌드**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`
Expected: 오류 없이 `Build complete.`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: AI 사진 판정과 D1 기록을 제거한다

방문자 사진 업로드 판정은 여행자가 쓰지 않는 흐름이고, 서버 키 없이 비활성
상태였다. 판정 API·기록 API·D1 스키마와 의존성을 함께 지운다."
```

---

### Task 3: Sites 연동 제거, 워커 진입점과 wrangler 설정

**Files:**
- Delete: `build/` 전체, `scripts/` 전체, `.openai/hosting.json`, `lib/connector-context.ts`, `lib/connector-contract.mts`, `lib/connector-errors.mts`, `lib/connector-preview.d.ts`, `lib/connectors.ts`, `components/connector-error.tsx`, `app/chatgpt-auth.ts`, `examples/` 전체, `cloudflare-env.d.ts`
- Create: `worker/index.ts`, `wrangler.jsonc`, `worker-configuration.d.ts`(생성물)
- Modify: `vite.config.ts`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `README.md`

**Interfaces:**
- Consumes: Task 1의 도구 버전
- Produces:
  - `worker/index.ts`: `export default { fetch(request, env, ctx) }`. `scheduled`는 Task 9에서 추가한다.
  - `package.json` scripts: `dev`, `build`, `start`, `deploy`, `lint`, `typecheck`, `cf-typegen`
  - 전역 `Env` 타입(`worker-configuration.d.ts`)

- [ ] **Step 1: Sites 전용 파일 삭제**

```bash
git rm -r build scripts .openai examples lib/connector-context.ts lib/connector-contract.mts lib/connector-errors.mts lib/connector-preview.d.ts lib/connectors.ts components/connector-error.tsx app/chatgpt-auth.ts cloudflare-env.d.ts
pnpm remove json-rpc-2.0 raw-body
```

- [ ] **Step 2: 워커 진입점 작성**

Create `worker/index.ts`:
```ts
import handler from "vinext/server/fetch-handler";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 3: `wrangler.jsonc` 작성**

Create `wrangler.jsonc`:
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "fuji-now",
  "account_id": "1dafd4cb9889ab12c13852360fadf60f",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-09-15",
  "compatibility_flags": ["nodejs_compat"]
}
```

- [ ] **Step 4: `vite.config.ts` 교체**

`vite.config.ts` 전체를 아래로 바꾼다.
```ts
import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({ viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] } }),
  ],
});
```

- [ ] **Step 5: `package.json` 이름과 스크립트 교체**

```bash
node -e "
const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));
p.name='fuji-now';
p.scripts={
  dev:'vinext dev --port 5173',
  build:'vinext build',
  start:'wrangler dev --config dist/server/wrangler.json --local --ip 127.0.0.1 --port 8799 --test-scheduled',
  deploy:'vinext build && wrangler deploy --config dist/server/wrangler.json',
  lint:'eslint . --ignore-pattern dist --ignore-pattern .next',
  typecheck:'tsc --noEmit',
  'cf-typegen':'wrangler types --include-runtime=false'
};
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
```

- [ ] **Step 6: `pnpm-workspace.yaml`에서 Sites 전용 설정 제거**

`pnpm-workspace.yaml` 전체를 아래로 바꾼다. `minimumReleaseAge`는 유지한다.
```yaml
minimumReleaseAge: 10080
minimumReleaseAgeIgnoreMissingTime: false
trustLockfile: false
strictDepBuilds: true
allowBuilds:
  esbuild: true
  fsevents: true
  sharp: true
  unrs-resolver: true
  workerd: true
enableGlobalVirtualStore: false
packageImportMethod: auto
verifyDepsBeforeRun: false
optimisticRepeatInstall: false
overrides:
  miniflare>sharp: 0.35.4
```

Run: `pnpm install`
Expected: `Done in ...`. 저장소 위치가 바뀌어서 다시 링크될 수 있다. 로컬의 `.sites-runtime/`은 git 제외 대상이라 지워도 된다.

- [ ] **Step 7: 바인딩 타입 생성**

Run: `pnpm cf-typegen`
Expected: `worker-configuration.d.ts`가 생기고 `interface Env`가 선언된다. `.env.local`에 `YOUTUBE_API_KEY`가 있으면 그 이름도 타입에 들어간다.

- [ ] **Step 8: README의 실행 방법과 구조 표 고치기**

`README.md`의 "로컬 실행" 절에서 코드 블록과 그 아래 항목을 아래로 바꾼다.

````markdown
```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm build
pnpm start        # 빌드 결과를 로컬 wrangler로 실행 (http://127.0.0.1:8799)
pnpm typecheck
pnpm lint
```

- 서버 비밀값(API 키)은 `.env.local`에 두고 커밋하지 않는다. `.gitignore`가 `.env*`를 제외한다. 로컬 wrangler는 `.dev.vars`가 없으면 `.env`와 `.env.local`을 읽는다.
- `pnpm-workspace.yaml`은 공개된 지 7일이 안 된 패키지를 설치하지 않도록 설정되어 있다. 새 버전이 설치되지 않으면 이 설정 때문일 수 있다.
- 바인딩을 바꾸면 `pnpm cf-typegen`으로 `worker-configuration.d.ts`를 다시 만든다.
````

"구조" 표의 `build/`, `scripts/`, `.openai/` 행을 지우고 아래 두 행을 맨 위에 넣는다.

```markdown
| `worker/index.ts` | 워커 진입점 |
| `wrangler.jsonc` | 워커 이름·계정·진입점 설정 |
```

- [ ] **Step 9: 남은 참조 확인**

Run:
```bash
rg -n "sites-worker|sites-vite-plugin|connector|chatgpt-auth|hosting.json|run-framework|sites-env|SITES_|install:ci|제거 예정" --glob "!node_modules" --glob "!pnpm-lock.yaml" --glob "!dist" --glob "!docs/**" .
```
Expected: `.gitignore`의 `/.sites-runtime/` 줄 외에는 결과가 없다. 남은 것이 있으면 이 Task에서 고친다.

- [ ] **Step 10: 검사, 빌드, 로컬 실행**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 오류 없이 `Build complete.`

Run:
```bash
node -e "const c=require('./dist/server/wrangler.json');console.log(c.name,c.main,JSON.stringify(c.assets||null))"
```
Expected: `fuji-now`, 빌드된 `index.js`, 그리고 `assets` 설정(클라이언트 자산 디렉터리)이 보인다. `assets`가 `null`이면 배포 때 정적 파일이 빠지므로 멈추고 원인을 찾는다.

Run: `pnpm dev`를 백그라운드로 띄운 뒤 `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/`과 `curl -s http://localhost:5173/api/weather | head -c 200`
Expected: `200`, Open-Meteo JSON의 앞부분

Run: `pnpm start`를 백그라운드로 띄운 뒤 `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8799/`
Expected: `200`. 확인 뒤 두 서버를 끈다.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "build: Sites 연동을 걷어내고 직접 배포할 워커 설정을 둔다

Sites 빌드 플러그인·커넥터 미리보기·실행 스크립트·인증 헬퍼를 지우고,
worker/index.ts를 진입점으로 하는 wrangler.jsonc와 dev·build·start·deploy
스크립트를 둔다. 바인딩 타입은 wrangler types로 생성한다."
```

---

### Task 4: 첫 배포와 README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 3의 `pnpm run deploy`
- Produces: `https://fuji-now.<계정 workers.dev 서브도메인>.workers.dev`

- [ ] **Step 1: 사용자 승인**

배포는 외부에 공개되는 작업이다. "workers.dev에 `fuji-now` 워커를 처음 배포한다"고 알리고 승인을 받는다.

- [ ] **Step 2: 배포**

Run: `pnpm run deploy`
Expected: 업로드가 끝나고 `https://fuji-now.<subdomain>.workers.dev` 주소가 출력된다. 계정에 workers.dev 서브도메인이 없다는 오류가 나면 멈추고 사용자에게 알린다(대시보드에서 등록해야 한다).

- [ ] **Step 3: 배포 확인**

Run: `curl -s -o /dev/null -w '%{http_code}\n' https://fuji-now.<subdomain>.workers.dev/` 와 `curl -s https://fuji-now.<subdomain>.workers.dev/api/weather | head -c 200`
Expected: `200`, Open-Meteo JSON의 앞부분. 사용자에게 폰에서 열어 보도록 주소를 알린다.

- [ ] **Step 4: README에 배포 주소와 방법 적기**

`README.md`를 고친다.
- "현재 상태"의 첫 두 줄(Sites 주소, "여기에 푸시해도 위 주소에는 반영되지 않는다")을 아래 두 줄로 바꾼다.
  ```markdown
  - 개발자 본인의 Cloudflare 계정에 Workers로 배포한다. 주소: https://fuji-now.<Step 2 출력의 서브도메인>.workers.dev
  - 예전 ChatGPT Sites 주소(https://fuji-now.dongwoobae.chatgpt.site)는 옛 버전 그대로 남아 있고, 이 저장소와 연결되지 않는다.
  ```
- "진행 중인 방향"의 `- 배포를 내 Cloudflare Workers(workers.dev)로 옮기고, Sites 전용 코드를 걷어낸다.` 줄을 지운다.
- "로컬 실행" 절 바로 뒤에 아래 절을 넣는다.
  ````markdown
  ## 배포

  ```sh
  pnpm exec wrangler login   # 처음 한 번
  pnpm run deploy            # `pnpm deploy`는 pnpm 내장 명령이라 다르게 동작한다
  ```
  ````

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README를 workers.dev 배포 기준으로 고친다"
```

---

# 2단계: 5호 카메라와 호수별 기상

### Task 5: 테스트 환경, 호수 목록, 스냅샷 스키마

**Files:**
- Create: `vitest.config.ts`, `lib/lakes.ts`, `lib/snapshot/schema.ts`, `lib/snapshot/schema.test.ts`
- Modify: `package.json`(vitest, `test` 스크립트), `pnpm-lock.yaml`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `lib/lakes.ts`: `LAKE_IDS`, `type LakeId`, `type Lake = { id; name; latitude; longitude; candidates: string[]; fallback: { label; url } }`, `LAKES: readonly Lake[]`, `SUN_REFERENCE_LAKE: LakeId`
  - `lib/snapshot/schema.ts`: `SNAPSHOT_KEY`, `SNAPSHOT_TTL_SECONDS`, `CARRY_MAX_MS`, `type CandidateStatus`, `type Camera`, `type LakeWeather`, `type LakeSnapshot`, `type Snapshot`, `parseSnapshot(raw: unknown): Snapshot | null`

- [ ] **Step 1: vitest 설치와 설정**

Run: `pnpm add -D vitest`
Expected: 7일 정책 안의 버전이 설치된다.

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts", "worker/**/*.test.ts"],
    environment: "node",
  },
});
```

Run:
```bash
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.scripts.test='vitest run';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"
```

- [ ] **Step 2: 호수 목록 작성**

좌표는 호수 중심 근사값이다. 2026-09-29에 이 좌표로 Open-Meteo MSM을 호출해, 응답 좌표가 모두 0.03° 안에 드는 것을 확인했다.

Create `lib/lakes.ts`:
```ts
export const LAKE_IDS = ["yamanakako", "kawaguchiko", "saiko", "shojiko", "motosuko"] as const;
export type LakeId = (typeof LAKE_IDS)[number];

export type Lake = {
  id: LakeId;
  name: string;
  latitude: number;
  longitude: number;
  candidates: string[];
  fallback: { label: string; url: string };
};

export const LAKES: readonly Lake[] = [
  {
    id: "yamanakako",
    name: "야마나카코",
    latitude: 35.417,
    longitude: 138.875,
    candidates: ["F2NbYrc-gBU"],
    fallback: { label: "山中湖村 絶景ライブカメラ", url: "https://lake-yamanakako.com/zekkei" },
  },
  {
    id: "kawaguchiko",
    name: "가와구치코",
    latitude: 35.504,
    longitude: 138.761,
    candidates: ["bdUbACCWmoY", "1cnReFAU04k"],
    fallback: { label: "富士河口湖町 ライブカメラ", url: "https://www.town.fujikawaguchiko.lg.jp/ka/info.php?if_id=6" },
  },
  {
    id: "saiko",
    name: "사이코",
    latitude: 35.499,
    longitude: 138.685,
    candidates: [],
    fallback: { label: "西湖いやしの里根場 ライブカメラ", url: "https://www.town.fujikawaguchiko.lg.jp/ka/info.php?if_id=1649" },
  },
  {
    id: "shojiko",
    name: "쇼지코",
    latitude: 35.47,
    longitude: 138.61,
    candidates: ["so_3HK9HIdg"],
    fallback: { label: "UTY 精進湖ライブカメラ", url: "https://www.uty.co.jp/livecam/shojiko.php" },
  },
  {
    id: "motosuko",
    name: "모토스코",
    latitude: 35.463,
    longitude: 138.588,
    candidates: ["_qdu714QT1E", "JGyGoXlKZmw"],
    fallback: { label: "ふじやま.TV ライブカメラ一覧", url: "https://fujiyama.tv/live/" },
  },
];

export const SUN_REFERENCE_LAKE: LakeId = "kawaguchiko";
```

- [ ] **Step 3: 대체 링크가 살아 있는지 확인**

Run:
```bash
for u in https://lake-yamanakako.com/zekkei "https://www.town.fujikawaguchiko.lg.jp/ka/info.php?if_id=6" "https://www.town.fujikawaguchiko.lg.jp/ka/info.php?if_id=1649" https://www.uty.co.jp/livecam/shojiko.php https://fujiyama.tv/live/; do echo "$(curl -s -o /dev/null -L -w '%{http_code}' "$u") $u"; done
```
Expected: 다섯 줄 모두 `200`. 200이 아닌 주소는 같은 호수의 다른 공식 카메라 페이지로 바꾸고, 바꾼 이유를 커밋 메시지에 적는다.

- [ ] **Step 4: 스키마 테스트 작성**

Create `lib/snapshot/schema.test.ts`:
```ts
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
```

- [ ] **Step 5: 테스트가 실패하는지 확인**

Run: `pnpm test`
Expected: FAIL. `./schema`를 찾을 수 없다는 오류.

- [ ] **Step 6: 스키마 구현**

Create `lib/snapshot/schema.ts`:
```ts
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
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm test && pnpm typecheck`
Expected: `5 passed`, 타입 오류 없음

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml lib/lakes.ts lib/snapshot/schema.ts lib/snapshot/schema.test.ts
git commit -m "feat: 호수 목록과 스냅샷 스키마를 둔다"
```

---

### Task 6: YouTube 방송 판정

**Files:**
- Create: `lib/__fixtures__/youtube-videos.json`, `lib/youtube.ts`, `lib/youtube.test.ts`

**Interfaces:**
- Consumes: `CandidateStatus`, `Camera` (Task 5)
- Produces (`lib/youtube.ts`):
  - `type VideoItem = { id: string; snippet: { title: string; channelTitle: string; liveBroadcastContent: string }; status: { embeddable: boolean } }`
  - `parseVideosResponse(json: unknown): VideoItem[]` — 형식이 다르면 throw
  - `classifyCandidate(videoId: string, items: VideoItem[]): CandidateStatus`
  - `selectLakeCamera(candidateIds: string[], items: VideoItem[]): { camera: Camera | null; candidates: { videoId: string; status: CandidateStatus }[] }`
  - `fetchVideos(ids: string[], apiKey: string, signal: AbortSignal): Promise<VideoItem[]>`

- [ ] **Step 1: 테스트 데이터 만들기**

실제 videos.list 응답을 받아 필드 구조만 남기고 내용 값을 바꿔 저장한다. API로 받은 데이터는 30일 보관 조건이 있어서 git에 원문을 남기지 않는다. 요청에는 삭제된 옛 쇼지코 ID(`qdVvly6pVhA`)를 넣어서, 응답에 없는 ID도 테스트 데이터에 반영되게 한다.

Run:
```bash
mkdir -p lib/__fixtures__
set -a && . ./.env.local && set +a
curl -s "https://www.googleapis.com/youtube/v3/videos?part=snippet,status,liveStreamingDetails&id=F2NbYrc-gBU,bdUbACCWmoY,qdVvly6pVhA&key=$YOUTUBE_API_KEY" | node -e '
const fs=require("fs");const r=JSON.parse(fs.readFileSync(0,"utf8"));
if(!Array.isArray(r.items)){console.error("unexpected response",Object.keys(r));process.exit(1)}
const out={kind:r.kind,items:r.items.map((v,i)=>({kind:v.kind,id:v.id,
 snippet:{title:`fixture title ${i+1}`,channelTitle:`fixture channel ${i+1}`,liveBroadcastContent:v.snippet.liveBroadcastContent},
 status:{privacyStatus:v.status.privacyStatus,embeddable:v.status.embeddable},
 ...(v.liveStreamingDetails?{liveStreamingDetails:{actualStartTime:"2026-01-01T00:00:00Z"}}:{})}))};
fs.writeFileSync("lib/__fixtures__/youtube-videos.json",JSON.stringify(out,null,2)+"\n");
console.log(out.items.map(i=>i.id+" "+i.snippet.liveBroadcastContent).join("\n"))'
```
Expected: 두 줄(`F2NbYrc-gBU ...`, `bdUbACCWmoY ...`). `qdVvly6pVhA`는 응답에 없다. 출력과 파일 어디에도 API 키가 없어야 한다.

Run: `rg -n "key=|AIza" lib/__fixtures__/youtube-videos.json`
Expected: 결과 없음

- [ ] **Step 2: 테스트 작성**

Create `lib/youtube.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/youtube-videos.json";
import { classifyCandidate, parseVideosResponse, selectLakeCamera, type VideoItem } from "./youtube";

const items = parseVideosResponse(fixture);
const base = items[0];
const video = (id: string, liveBroadcastContent: string, embeddable = true): VideoItem => ({
  ...base,
  id,
  snippet: { ...base.snippet, liveBroadcastContent },
  status: { ...base.status, embeddable },
});

describe("parseVideosResponse", () => {
  it("parses the recorded videos.list response", () => {
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => typeof item.snippet.liveBroadcastContent === "string")).toBe(true);
  });

  it("does not include ids the API left out", () => {
    expect(items.some((item) => item.id === "qdVvly6pVhA")).toBe(false);
  });

  it("throws when items is missing", () => {
    expect(() => parseVideosResponse({ kind: "youtube#videoListResponse" })).toThrow();
  });
});

describe("classifyCandidate", () => {
  it("is missing when the id is absent from the response", () => {
    expect(classifyCandidate("qdVvly6pVhA", items)).toBe("missing");
  });

  it("is not_embeddable even while live", () => {
    expect(classifyCandidate("a", [video("a", "live", false)])).toBe("not_embeddable");
  });

  it("maps live, upcoming and none", () => {
    expect(classifyCandidate("a", [video("a", "live")])).toBe("live");
    expect(classifyCandidate("a", [video("a", "upcoming")])).toBe("upcoming");
    expect(classifyCandidate("a", [video("a", "none")])).toBe("ended");
  });
});

describe("selectLakeCamera", () => {
  it("picks the first live candidate in priority order", () => {
    const result = selectLakeCamera(["first", "second", "third"], [
      video("first", "none"),
      video("second", "live"),
      video("third", "live"),
    ]);
    expect(result.camera?.videoId).toBe("second");
    expect(result.candidates).toEqual([
      { videoId: "first", status: "ended" },
      { videoId: "second", status: "live" },
      { videoId: "third", status: "live" },
    ]);
  });

  it("returns to the first candidate once it is live again", () => {
    const result = selectLakeCamera(["first", "second"], [video("first", "live"), video("second", "live")]);
    expect(result.camera?.videoId).toBe("first");
  });

  it("copies title and channel of the chosen video", () => {
    const chosen = video("first", "live");
    expect(selectLakeCamera(["first"], [chosen]).camera).toEqual({
      videoId: "first",
      title: chosen.snippet.title,
      channelTitle: chosen.snippet.channelTitle,
    });
  });

  it("has no camera when nothing is live", () => {
    expect(selectLakeCamera(["first"], [video("first", "none")]).camera).toBeNull();
  });

  it("has no camera and no candidates for a lake without candidates", () => {
    expect(selectLakeCamera([], items)).toEqual({ camera: null, candidates: [] });
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm test lib/youtube.test.ts`
Expected: FAIL. `./youtube`를 찾을 수 없다는 오류.

- [ ] **Step 4: 구현**

Create `lib/youtube.ts`:
```ts
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

export function selectLakeCamera(candidateIds: string[], items: VideoItem[]) {
  const candidates = candidateIds.map((videoId) => ({ videoId, status: classifyCandidate(videoId, items) }));
  const liveId = candidates.find((candidate) => candidate.status === "live")?.videoId;
  const item = liveId === undefined ? undefined : items.find((candidate) => candidate.id === liveId);
  const camera: Camera | null = item
    ? { videoId: item.id, title: item.snippet.title, channelTitle: item.snippet.channelTitle }
    : null;
  return { camera, candidates };
}

export async function fetchVideos(ids: string[], apiKey: string, signal: AbortSignal): Promise<VideoItem[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,status,liveStreamingDetails");
  url.searchParams.set("id", ids.join(","));
  url.searchParams.set("key", apiKey);
  const response = await fetch(url, { signal });
  // URL에 키가 들어 있으므로 에러 메시지에는 상태 코드만 남긴다.
  if (!response.ok) throw new Error(`YouTube videos.list ${response.status}`);
  return parseVideosResponse(await response.json());
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm test && pnpm typecheck`
Expected: 모든 테스트 통과, 타입 오류 없음

- [ ] **Step 6: Commit**

```bash
git add lib/__fixtures__/youtube-videos.json lib/youtube.ts lib/youtube.test.ts
git commit -m "feat: YouTube 후보 영상의 방송 상태를 판정한다"
```

---

### Task 7: Open-Meteo 기상 변환과 좌표 대조

**Files:**
- Create: `lib/__fixtures__/open-meteo-msm.json`, `lib/weather.ts`, `lib/weather.test.ts`

**Interfaces:**
- Consumes: `Lake`, `LakeId`, `LAKES` (Task 5), `LakeWeather` (Task 5)
- Produces (`lib/weather.ts`):
  - `COORDINATE_TOLERANCE = 0.03`, `FORECAST_HOURS = 9`
  - `toJstIso(local: string): string` — `"2026-09-29T05:37"` → `"2026-09-29T05:37:00+09:00"`
  - `buildWeatherUrl(lakes: readonly Lake[]): URL`
  - `type WeatherResult = { byLake: Record<LakeId, LakeWeather>; sunrise: string; sunset: string }`
  - `parseWeatherResponse(json: unknown, lakes: readonly Lake[], sunLake: LakeId): WeatherResult` — 형식·개수·좌표가 맞지 않으면 throw
  - `fetchWeather(lakes: readonly Lake[], sunLake: LakeId, signal: AbortSignal): Promise<WeatherResult>`

- [ ] **Step 1: 테스트 데이터 만들기**

Run:
```bash
curl -s "https://api.open-meteo.com/v1/forecast?latitude=35.417,35.504,35.499,35.47,35.463&longitude=138.875,138.761,138.685,138.61,138.588&models=jma_msm&current=temperature_2m,cloud_cover,precipitation,wind_speed_10m&hourly=cloud_cover,precipitation&daily=sunrise,sunset&forecast_hours=9&wind_speed_unit=ms&timezone=Asia%2FTokyo" -o lib/__fixtures__/open-meteo-msm.json
node -e "const r=require('./lib/__fixtures__/open-meteo-msm.json');console.log(Array.isArray(r),r.length,r.map(l=>l.latitude+','+l.longitude).join(' '))"
```
Expected: `true 5`와 격자에 맞춰진 좌표 다섯 개. 요청 순서대로 야마나카코 → 가와구치코 → 사이코 → 쇼지코 → 모토스코다.

- [ ] **Step 2: 테스트 작성**

Create `lib/weather.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/open-meteo-msm.json";
import { LAKES } from "./lakes";
import { buildWeatherUrl, parseWeatherResponse, toJstIso } from "./weather";

describe("toJstIso", () => {
  it("adds seconds and the +09:00 offset", () => {
    expect(toJstIso("2026-09-29T05:37")).toBe("2026-09-29T05:37:00+09:00");
  });
});

describe("buildWeatherUrl", () => {
  it("requests every lake in order from the MSM model", () => {
    const url = buildWeatherUrl(LAKES);
    expect(url.searchParams.get("latitude")).toBe(LAKES.map((lake) => lake.latitude).join(","));
    expect(url.searchParams.get("longitude")).toBe(LAKES.map((lake) => lake.longitude).join(","));
    expect(url.searchParams.get("models")).toBe("jma_msm");
    expect(url.searchParams.get("wind_speed_unit")).toBe("ms");
    expect(url.searchParams.get("timezone")).toBe("Asia/Tokyo");
    expect(url.searchParams.get("daily")).toBe("sunrise,sunset");
  });
});

describe("parseWeatherResponse", () => {
  it("maps each location to its lake in request order", () => {
    const result = parseWeatherResponse(fixture, LAKES, "kawaguchiko");
    LAKES.forEach((lake, i) => {
      const location = fixture[i];
      const weather = result.byLake[lake.id];
      expect(weather.time).toBe(toJstIso(location.current.time));
      expect(weather.temperature).toBe(location.current.temperature_2m);
      expect(weather.cloudCover).toBe(location.current.cloud_cover);
      expect(weather.precipitation).toBe(location.current.precipitation);
      expect(weather.windSpeed).toBe(location.current.wind_speed_10m);
      expect(weather.hourly).toHaveLength(location.hourly.time.length);
      expect(weather.hourly[0]).toEqual({
        time: toJstIso(location.hourly.time[0]),
        cloudCover: location.hourly.cloud_cover[0],
        precipitation: location.hourly.precipitation[0],
      });
    });
  });

  it("takes today's sunrise and sunset from the reference lake", () => {
    const i = LAKES.findIndex((lake) => lake.id === "kawaguchiko");
    const result = parseWeatherResponse(fixture, LAKES, "kawaguchiko");
    expect(result.sunrise).toBe(toJstIso(fixture[i].daily.sunrise[0]));
    expect(result.sunset).toBe(toJstIso(fixture[i].daily.sunset[0]));
  });

  it("fails when the locations come back in a different order", () => {
    expect(() => parseWeatherResponse([...fixture].reverse(), LAKES, "kawaguchiko")).toThrow(/does not match/);
  });

  it("fails when shojiko and motosuko are swapped", () => {
    const s = LAKES.findIndex((lake) => lake.id === "shojiko");
    const m = LAKES.findIndex((lake) => lake.id === "motosuko");
    const swapped = [...fixture];
    [swapped[s], swapped[m]] = [swapped[m], swapped[s]];
    expect(() => parseWeatherResponse(swapped, LAKES, "kawaguchiko")).toThrow(/does not match/);
  });

  it("fails when a location is missing", () => {
    expect(() => parseWeatherResponse(fixture.slice(1), LAKES, "kawaguchiko")).toThrow();
  });

  it("fails on a single-object response", () => {
    expect(() => parseWeatherResponse(fixture[0], LAKES, "kawaguchiko")).toThrow();
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm test lib/weather.test.ts`
Expected: FAIL. `./weather`를 찾을 수 없다는 오류.

- [ ] **Step 4: 구현**

Create `lib/weather.ts`:
```ts
import { z } from "zod";
import type { Lake, LakeId } from "./lakes";
import type { LakeWeather } from "./snapshot/schema";

// MSM 격자는 위도 0.05°·경도 0.0625°다. 쇼지코·모토스코가 서로 바뀌면 요청 좌표와 경도가 0.037° 이상 어긋나므로 그보다 좁게 잡는다. 이 값은 경도 반 칸(0.03125°)보다 좁아서, 경도가 격자선 사이 한가운데에 가까운 호수를 추가하면 정상 응답도 실패한다.
export const COORDINATE_TOLERANCE = 0.03;
export const FORECAST_HOURS = 9;

const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  current: z.object({
    time: localTime,
    temperature_2m: z.number(),
    cloud_cover: z.number(),
    precipitation: z.number(),
    wind_speed_10m: z.number(),
  }),
  hourly: z.object({
    time: z.array(localTime),
    cloud_cover: z.array(z.number()),
    precipitation: z.array(z.number()),
  }),
  daily: z.object({
    time: z.array(z.string()),
    sunrise: z.array(localTime).min(1),
    sunset: z.array(localTime).min(1),
  }),
});

const weatherResponseSchema = z.array(locationSchema);

export type WeatherResult = { byLake: Record<LakeId, LakeWeather>; sunrise: string; sunset: string };

// Open-Meteo는 timezone을 지정하면 오프셋 없는 현지 시각을 준다. 일본은 서머타임이 없어 +09:00으로 고정할 수 있다.
export function toJstIso(local: string): string {
  return `${local}:00+09:00`;
}

export function buildWeatherUrl(lakes: readonly Lake[]): URL {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lakes.map((lake) => lake.latitude).join(","));
  url.searchParams.set("longitude", lakes.map((lake) => lake.longitude).join(","));
  url.searchParams.set("models", "jma_msm");
  url.searchParams.set("current", "temperature_2m,cloud_cover,precipitation,wind_speed_10m");
  url.searchParams.set("hourly", "cloud_cover,precipitation");
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("forecast_hours", String(FORECAST_HOURS));
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "Asia/Tokyo");
  return url;
}

export function parseWeatherResponse(json: unknown, lakes: readonly Lake[], sunLake: LakeId): WeatherResult {
  const locations = weatherResponseSchema.parse(json);
  if (locations.length !== lakes.length) {
    throw new Error(`Open-Meteo returned ${locations.length} locations for ${lakes.length} lakes`);
  }
  const byLake = {} as Record<LakeId, LakeWeather>;
  let sun: { sunrise: string; sunset: string } | null = null;
  for (const [i, lake] of lakes.entries()) {
    const location = locations[i];
    if (
      Math.abs(location.latitude - lake.latitude) > COORDINATE_TOLERANCE ||
      Math.abs(location.longitude - lake.longitude) > COORDINATE_TOLERANCE
    ) {
      throw new Error(`Open-Meteo location ${i} does not match ${lake.id}`);
    }
    const { time, cloud_cover: cloud, precipitation } = location.hourly;
    if (cloud.length !== time.length || precipitation.length !== time.length) {
      throw new Error(`Open-Meteo hourly arrays differ in length for ${lake.id}`);
    }
    byLake[lake.id] = {
      time: toJstIso(location.current.time),
      temperature: location.current.temperature_2m,
      cloudCover: location.current.cloud_cover,
      precipitation: location.current.precipitation,
      windSpeed: location.current.wind_speed_10m,
      hourly: time.map((hour, h) => ({ time: toJstIso(hour), cloudCover: cloud[h], precipitation: precipitation[h] })),
    };
    if (lake.id === sunLake) {
      sun = { sunrise: toJstIso(location.daily.sunrise[0]), sunset: toJstIso(location.daily.sunset[0]) };
    }
  }
  if (sun === null) throw new Error(`Sun reference lake ${sunLake} is not in the lake list`);
  return { byLake, ...sun };
}

export async function fetchWeather(lakes: readonly Lake[], sunLake: LakeId, signal: AbortSignal): Promise<WeatherResult> {
  const response = await fetch(buildWeatherUrl(lakes), { signal });
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
  return parseWeatherResponse(await response.json(), lakes, sunLake);
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm test && pnpm typecheck`
Expected: 모든 테스트 통과, 타입 오류 없음

- [ ] **Step 6: Commit**

```bash
git add lib/__fixtures__/open-meteo-msm.json lib/weather.ts lib/weather.test.ts
git commit -m "feat: 호수별 MSM 기상을 받고 응답 좌표를 요청과 대조한다

Open-Meteo는 여러 지점 요청의 응답 순서를 문서로 보장하지 않는다.
순서가 바뀌면 호수 기상이 서로 바뀌므로 좌표가 어긋나면 실패로 처리한다."
```

---

### Task 8: 스냅샷 합치기

**Files:**
- Create: `lib/snapshot/build.ts`, `lib/snapshot/build.test.ts`

**Interfaces:**
- Consumes: `LAKES`, `Lake`, `SUN_REFERENCE_LAKE` (Task 5), `Snapshot`, `CARRY_MAX_MS` (Task 5), `VideoItem`, `selectLakeCamera` (Task 6), `WeatherResult` (Task 7)
- Produces (`lib/snapshot/build.ts`):
  - `type SourceResult<T> = { ok: true; value: T } | { ok: false; error: string }`
  - `buildSnapshot(input: { lakes: readonly Lake[]; previous: Snapshot | null; videos: SourceResult<VideoItem[]>; weather: SourceResult<WeatherResult>; now: Date }): Snapshot | null` — 두 쪽 모두 실패하면 `null`(쓰지 않음)

- [ ] **Step 1: 테스트 작성**

Create `lib/snapshot/build.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { LAKES, SUN_REFERENCE_LAKE } from "../lakes";
import type { VideoItem } from "../youtube";
import type { WeatherResult } from "../weather";
import { buildSnapshot, type SourceResult } from "./build";

const NOW = new Date("2026-09-29T07:00:00.000Z");
const minutesBefore = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const liveItem = (id: string): VideoItem => ({
  id,
  snippet: { title: `title ${id}`, channelTitle: "channel", liveBroadcastContent: "live" },
  status: { embeddable: true },
});
const allLive: SourceResult<VideoItem[]> = { ok: true, value: LAKES.flatMap((lake) => lake.candidates).map(liveItem) };

const weatherOf = (temperature: number): SourceResult<WeatherResult> => ({
  ok: true,
  value: {
    sunrise: "2026-09-29T05:37:00+09:00",
    sunset: "2026-09-29T17:32:00+09:00",
    byLake: Object.fromEntries(
      LAKES.map((lake) => [
        lake.id,
        { time: "2026-09-29T16:00:00+09:00", temperature, cloudCover: 50, precipitation: 0, windSpeed: 1, hourly: [] },
      ]),
    ) as WeatherResult["byLake"],
  },
});
const failed = { ok: false, error: "boom" } as const;

const previousAt = (at: Date) =>
  buildSnapshot({ lakes: LAKES, previous: null, videos: allLive, weather: weatherOf(10), now: at });

const lake = (snapshot: ReturnType<typeof buildSnapshot>, id: string) => snapshot!.lakes.find((l) => l.id === id)!;

describe("buildSnapshot", () => {
  it("records both sources with the current time", () => {
    const snapshot = buildSnapshot({ lakes: LAKES, previous: null, videos: allLive, weather: weatherOf(12), now: NOW });
    expect(snapshot?.writtenAt).toBe(NOW.toISOString());
    expect(snapshot?.sunrise).toBe("2026-09-29T05:37:00+09:00");
    expect(lake(snapshot, "kawaguchiko").camera?.videoId).toBe("bdUbACCWmoY");
    expect(lake(snapshot, "kawaguchiko").cameraCheckedAt).toBe(NOW.toISOString());
    expect(lake(snapshot, "kawaguchiko").weather?.temperature).toBe(12);
    expect(lake(snapshot, "kawaguchiko").weatherCheckedAt).toBe(NOW.toISOString());
  });

  it("marks a lake without candidates as checked with no camera", () => {
    const snapshot = buildSnapshot({ lakes: LAKES, previous: null, videos: allLive, weather: weatherOf(12), now: NOW });
    expect(lake(snapshot, "saiko")).toMatchObject({ camera: null, candidates: [], cameraCheckedAt: NOW.toISOString() });
  });

  it("does not write when both sources fail", () => {
    expect(buildSnapshot({ lakes: LAKES, previous: previousAt(minutesBefore(5)), videos: failed, weather: failed, now: NOW })).toBeNull();
  });

  it("carries the previous camera for up to an hour when YouTube fails", () => {
    const previous = previousAt(minutesBefore(30));
    const snapshot = buildSnapshot({ lakes: LAKES, previous, videos: failed, weather: weatherOf(12), now: NOW });
    expect(lake(snapshot, "kawaguchiko").camera?.videoId).toBe("bdUbACCWmoY");
    expect(lake(snapshot, "kawaguchiko").cameraCheckedAt).toBe(minutesBefore(30).toISOString());
    expect(lake(snapshot, "kawaguchiko").weatherCheckedAt).toBe(NOW.toISOString());
  });

  it("clears the camera part once it is older than an hour", () => {
    const previous = previousAt(minutesBefore(61));
    const snapshot = buildSnapshot({ lakes: LAKES, previous, videos: failed, weather: weatherOf(12), now: NOW });
    expect(lake(snapshot, "kawaguchiko")).toMatchObject({ camera: null, candidates: [], cameraCheckedAt: null });
  });

  it("carries the previous weather and sun times for up to an hour when Open-Meteo fails", () => {
    const previous = previousAt(minutesBefore(30));
    const snapshot = buildSnapshot({ lakes: LAKES, previous, videos: allLive, weather: failed, now: NOW });
    expect(lake(snapshot, "yamanakako").weather?.temperature).toBe(10);
    expect(lake(snapshot, "yamanakako").weatherCheckedAt).toBe(minutesBefore(30).toISOString());
    expect(snapshot?.sunrise).toBe("2026-09-29T05:37:00+09:00");
  });

  it("clears weather and sun times once they are older than an hour", () => {
    const previous = previousAt(minutesBefore(61));
    const snapshot = buildSnapshot({ lakes: LAKES, previous, videos: allLive, weather: failed, now: NOW });
    expect(lake(snapshot, "yamanakako")).toMatchObject({ weather: null, weatherCheckedAt: null });
    expect(snapshot?.sunrise).toBeNull();
    expect(snapshot?.sunset).toBeNull();
  });

  it("writes on the first run even if only one source succeeds", () => {
    const snapshot = buildSnapshot({ lakes: LAKES, previous: null, videos: allLive, weather: failed, now: NOW });
    expect(snapshot).not.toBeNull();
    expect(lake(snapshot, "kawaguchiko")).toMatchObject({ weather: null, weatherCheckedAt: null });
    expect(snapshot?.sunrise).toBeNull();
  });

  it("treats a lake missing from the previous snapshot as never checked", () => {
    const previous = previousAt(minutesBefore(10))!;
    const withoutMotosu = { ...previous, lakes: previous.lakes.filter((l) => l.id !== "motosuko") };
    const snapshot = buildSnapshot({ lakes: LAKES, previous: withoutMotosu, videos: failed, weather: weatherOf(12), now: NOW });
    expect(lake(snapshot, "motosuko")).toMatchObject({ camera: null, candidates: [], cameraCheckedAt: null });
  });

  it("uses the sun reference lake constant", () => {
    expect(SUN_REFERENCE_LAKE).toBe("kawaguchiko");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test lib/snapshot/build.test.ts`
Expected: FAIL. `./build`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구현**

Create `lib/snapshot/build.ts`:
```ts
import { SUN_REFERENCE_LAKE, type Lake } from "../lakes";
import type { WeatherResult } from "../weather";
import { selectLakeCamera, type VideoItem } from "../youtube";
import { CARRY_MAX_MS, type LakeSnapshot, type Snapshot } from "./schema";

export type SourceResult<T> = { ok: true; value: T } | { ok: false; error: string };

type BuildInput = {
  lakes: readonly Lake[];
  previous: Snapshot | null;
  videos: SourceResult<VideoItem[]>;
  weather: SourceResult<WeatherResult>;
  now: Date;
};

export function buildSnapshot({ lakes, previous, videos, weather, now }: BuildInput): Snapshot | null {
  if (!videos.ok && !weather.ok) return null;
  const nowIso = now.toISOString();
  const carryable = (checkedAt: string | null): checkedAt is string =>
    checkedAt !== null && now.getTime() - Date.parse(checkedAt) <= CARRY_MAX_MS;

  const lakeSnapshots = lakes.map((lake): LakeSnapshot => {
    const prev = previous?.lakes.find((candidate) => candidate.id === lake.id) ?? null;

    let cameraPart: Pick<LakeSnapshot, "camera" | "candidates" | "cameraCheckedAt">;
    if (videos.ok) {
      cameraPart = { ...selectLakeCamera(lake.candidates, videos.value), cameraCheckedAt: nowIso };
    } else if (prev && carryable(prev.cameraCheckedAt)) {
      cameraPart = { camera: prev.camera, candidates: prev.candidates, cameraCheckedAt: prev.cameraCheckedAt };
    } else {
      cameraPart = { camera: null, candidates: [], cameraCheckedAt: null };
    }

    let weatherPart: Pick<LakeSnapshot, "weather" | "weatherCheckedAt">;
    if (weather.ok) {
      weatherPart = { weather: weather.value.byLake[lake.id], weatherCheckedAt: nowIso };
    } else if (prev && carryable(prev.weatherCheckedAt)) {
      weatherPart = { weather: prev.weather, weatherCheckedAt: prev.weatherCheckedAt };
    } else {
      weatherPart = { weather: null, weatherCheckedAt: null };
    }

    return { id: lake.id, ...cameraPart, ...weatherPart };
  });

  let sun: Pick<Snapshot, "sunrise" | "sunset">;
  if (weather.ok) {
    sun = { sunrise: weather.value.sunrise, sunset: weather.value.sunset };
  } else {
    const reference = previous?.lakes.find((candidate) => candidate.id === SUN_REFERENCE_LAKE);
    sun =
      previous && reference && carryable(reference.weatherCheckedAt)
        ? { sunrise: previous.sunrise, sunset: previous.sunset }
        : { sunrise: null, sunset: null };
  }

  return { writtenAt: nowIso, ...sun, lakes: lakeSnapshots };
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test && pnpm typecheck`
Expected: 모든 테스트 통과, 타입 오류 없음

- [ ] **Step 5: Commit**

```bash
git add lib/snapshot/build.ts lib/snapshot/build.test.ts
git commit -m "feat: 새 결과와 직전 스냅샷을 합친다

한쪽 호출이 실패하면 직전 값을 최대 1시간까지만 이어받는다. 그보다 오래되면
비워서, 끝났을지 모르는 방송이나 오래된 기상을 최신처럼 보여주지 않는다."
```

---

### Task 9: 스냅샷 저장소와 예약 작업

**Files:**
- Create: `lib/snapshot/store.ts`, `lib/snapshot/store.test.ts`, `worker/snapshot-job.ts`, `worker/snapshot-job.test.ts`
- Modify: `worker/index.ts`, `wrangler.jsonc`, `worker-configuration.d.ts`(재생성)

**Interfaces:**
- Consumes: `SNAPSHOT_KEY`, `SNAPSHOT_TTL_SECONDS`, `parseSnapshot`, `Snapshot` (Task 5), `fetchVideos` (Task 6), `fetchWeather` (Task 7), `buildSnapshot`, `SourceResult` (Task 8)
- Produces:
  - `lib/snapshot/store.ts`: `readSnapshot(kv: KVNamespace): Promise<Snapshot | null>`, `writeSnapshot(kv: KVNamespace, snapshot: Snapshot): Promise<void>`
  - `worker/snapshot-job.ts`: `type JobEnv = { SNAPSHOT_KV: KVNamespace; YOUTUBE_API_KEY?: string }`, `runSnapshotJob(env: JobEnv, now: Date): Promise<void>`
  - `Env.SNAPSHOT_KV` 바인딩, `*/5 * * * *` 예약 작업

- [ ] **Step 1: KV 바인딩과 예약 작업 선언 (로컬용)**

KV 네임스페이스 ID는 Task 13에서 실제로 만든 뒤 채운다. 그때까지 로컬 개발은 vite 플러그인이 KV를 흉내 내므로 자리표시 ID로 동작한다.

`wrangler.jsonc`에 두 항목을 추가한다:
```jsonc
  "kv_namespaces": [{ "binding": "SNAPSHOT_KV", "id": "00000000000000000000000000000000" }],
  "triggers": { "crons": ["*/5 * * * *"] }
```

Run: `pnpm cf-typegen && rg -n "SNAPSHOT_KV" worker-configuration.d.ts`
Expected: `SNAPSHOT_KV: KVNamespace;`가 보인다.

- [ ] **Step 2: 저장소 테스트 작성**

Create `lib/snapshot/store.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { SNAPSHOT_KEY, SNAPSHOT_TTL_SECONDS, type Snapshot } from "./schema";
import { readSnapshot, writeSnapshot } from "./store";

const snapshot: Snapshot = { writtenAt: "2026-09-29T07:00:00.000Z", sunrise: null, sunset: null, lakes: [] };

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
```

- [ ] **Step 3: 저장소 구현**

Create `lib/snapshot/store.ts`:
```ts
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
```

Run: `pnpm test lib/snapshot/store.test.ts`
Expected: `6 passed`

- [ ] **Step 4: 예약 작업 테스트 작성**

Create `worker/snapshot-job.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import weatherFixture from "../lib/__fixtures__/open-meteo-msm.json";
import { LAKES } from "../lib/lakes";
import { SNAPSHOT_KEY, type Snapshot } from "../lib/snapshot/schema";
import { runSnapshotJob } from "./snapshot-job";

const NOW = new Date("2026-09-29T07:00:00.000Z");
const API_KEY = "test-key-should-not-leak";

function fakeKv() {
  const data = new Map<string, string>();
  const kv = {
    async get(key: string, type?: string) {
      const value = data.get(key);
      if (value === undefined) return null;
      return type === "json" ? JSON.parse(value) : value;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
  } as unknown as KVNamespace;
  const stored = () => (data.has(SNAPSHOT_KEY) ? (JSON.parse(data.get(SNAPSHOT_KEY)!) as Snapshot) : null);
  return { kv, stored };
}

const youtubeBody = {
  items: LAKES.flatMap((lake) => lake.candidates).map((id) => ({
    id,
    snippet: { title: `title ${id}`, channelTitle: "channel", liveBroadcastContent: "live" },
    status: { embeddable: true },
  })),
};

function stubFetch(handlers: { youtube: () => Response; weather: () => Response }) {
  vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    if (url.hostname === "www.googleapis.com") return handlers.youtube();
    if (url.hostname === "api.open-meteo.com") return handlers.weather();
    throw new Error(`unexpected fetch ${url.hostname}`);
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runSnapshotJob", () => {
  it("writes a snapshot when both sources succeed", async () => {
    stubFetch({ youtube: () => Response.json(youtubeBody), weather: () => Response.json(weatherFixture) });
    const { kv, stored } = fakeKv();
    await runSnapshotJob({ SNAPSHOT_KV: kv, YOUTUBE_API_KEY: API_KEY }, NOW);
    const snapshot = stored();
    expect(snapshot?.lakes.map((lake) => lake.id)).toEqual(LAKES.map((lake) => lake.id));
    expect(snapshot?.lakes.every((lake) => lake.weatherCheckedAt === NOW.toISOString())).toBe(true);
    expect(snapshot?.lakes.find((lake) => lake.id === "yamanakako")?.camera?.videoId).toBe("F2NbYrc-gBU");
  });

  it("still writes weather when the API key is missing", async () => {
    stubFetch({ youtube: () => Response.json(youtubeBody), weather: () => Response.json(weatherFixture) });
    const { kv, stored } = fakeKv();
    await runSnapshotJob({ SNAPSHOT_KV: kv }, NOW);
    const lake = stored()?.lakes.find((l) => l.id === "kawaguchiko");
    expect(lake).toMatchObject({ camera: null, cameraCheckedAt: null, weatherCheckedAt: NOW.toISOString() });
  });

  it("does not write when both sources fail", async () => {
    stubFetch({ youtube: () => new Response("quota", { status: 403 }), weather: () => new Response("down", { status: 503 }) });
    const { kv, stored } = fakeKv();
    await runSnapshotJob({ SNAPSHOT_KV: kv, YOUTUBE_API_KEY: API_KEY }, NOW);
    expect(stored()).toBeNull();
  });

  it("never logs the API key", async () => {
    stubFetch({ youtube: () => new Response("quota", { status: 403 }), weather: () => Response.json(weatherFixture) });
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
    vi.spyOn(console, "error").mockImplementation((...args) => logs.push(args.join(" ")));
    await runSnapshotJob({ SNAPSHOT_KV: fakeKv().kv, YOUTUBE_API_KEY: API_KEY }, NOW);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.join("\n")).not.toContain(API_KEY);
  });
});
```

- [ ] **Step 5: 실패 확인**

Run: `pnpm test worker/snapshot-job.test.ts`
Expected: FAIL. `./snapshot-job`을 찾을 수 없다는 오류.

- [ ] **Step 6: 예약 작업 구현**

Create `worker/snapshot-job.ts`:
```ts
import { LAKES, SUN_REFERENCE_LAKE } from "../lib/lakes";
import { buildSnapshot, type SourceResult } from "../lib/snapshot/build";
import { readSnapshot, writeSnapshot } from "../lib/snapshot/store";
import { fetchWeather } from "../lib/weather";
import { fetchVideos } from "../lib/youtube";

const CALL_TIMEOUT_MS = 10_000;

export type JobEnv = { SNAPSHOT_KV: KVNamespace; YOUTUBE_API_KEY?: string };

async function settle<T>(run: () => Promise<T>): Promise<SourceResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function runSnapshotJob(env: JobEnv, now: Date): Promise<void> {
  const previous = await readSnapshot(env.SNAPSHOT_KV);
  const ids = LAKES.flatMap((lake) => lake.candidates);
  const apiKey = env.YOUTUBE_API_KEY;

  const [videos, weather] = await Promise.all([
    settle(() => {
      if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set");
      return fetchVideos(ids, apiKey, AbortSignal.timeout(CALL_TIMEOUT_MS));
    }),
    settle(() => fetchWeather(LAKES, SUN_REFERENCE_LAKE, AbortSignal.timeout(CALL_TIMEOUT_MS))),
  ]);

  const snapshot = buildSnapshot({ lakes: LAKES, previous, videos, weather, now });
  if (snapshot) await writeSnapshot(env.SNAPSHOT_KV, snapshot);

  const candidates = snapshot?.lakes.flatMap((lake) => lake.candidates) ?? [];
  console.log(
    JSON.stringify({
      event: "snapshot",
      written: snapshot !== null,
      youtube: videos.ok ? "ok" : videos.error,
      weather: weather.ok ? "ok" : weather.error,
      live: candidates.filter((candidate) => candidate.status === "live").length,
      notLive: candidates.filter((candidate) => candidate.status !== "live").map((c) => `${c.videoId}:${c.status}`),
    }),
  );
}
```

Modify `worker/index.ts` 전체:
```ts
import handler from "vinext/server/fetch-handler";
import { runSnapshotJob } from "./snapshot-job";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handler.fetch(request, env, ctx);
  },
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runSnapshotJob(env, new Date()));
  },
} satisfies ExportedHandler<Env>;
```

- [ ] **Step 7: 통과 확인**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: 모든 테스트 통과, 오류 없음

- [ ] **Step 8: 로컬에서 예약 작업 실행**

`.env.local`에 `YOUTUBE_API_KEY`가 있어야 한다.

Run: `pnpm dev`를 백그라운드로 띄우고 로그를 파일로 받는다. 그다음 `curl -s "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*"`
Expected: 응답 `ok`. 개발 서버 로그에 `{"event":"snapshot","written":true,"youtube":"ok","weather":"ok",...}` 한 줄이 찍힌다. 로그 어디에도 API 키가 없다. 확인 뒤 서버를 끈다.

Run: `pnpm build`를 한 뒤 `pnpm start`를 백그라운드로 띄우고 같은 요청을 `http://127.0.0.1:8799/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*`로 보낸다.
Expected: 같은 로그 한 줄. 확인 뒤 서버를 끈다.

- [ ] **Step 9: Commit**

```bash
git add lib/snapshot/store.ts lib/snapshot/store.test.ts worker/snapshot-job.ts worker/snapshot-job.test.ts worker/index.ts wrangler.jsonc worker-configuration.d.ts
git commit -m "feat: 5분마다 방송 여부와 기상을 KV 스냅샷으로 저장한다

KV 읽기가 실패하거나 형식이 맞지 않으면 스냅샷이 없는 것으로 다룬다.
두 호출이 모두 실패하면 쓰지 않아 만료가 연장되지 않게 한다."
```

---

### Task 10: 화면 도우미

**Files:**
- Create: `lib/view.ts`, `lib/view.test.ts`

**Interfaces:**
- Consumes: `Snapshot`, `LakeSnapshot`, `LakeWeather`, `Camera` (Task 5)
- Produces (`lib/view.ts`):
  - `STALE_AFTER_MS`, `CALM_WIND_MAX_MS`, `OUTLOOK_HOURS`
  - `type Freshness = { kind: "partial" } | { kind: "checked"; at: string }`, `freshnessOf(snapshot: Snapshot): Freshness`
  - `isStale(at: string, nowMs: number): boolean`
  - `isNight(now: Date, sunrise: string | null, sunset: string | null): boolean`
  - `windLabel(speed: number): "잔잔함" | "물결 있음"`
  - `upcomingHours(weather: LakeWeather, now: Date): LakeWeather["hourly"]`
  - `type CameraState = { kind: "unchecked" } | { kind: "offline" } | { kind: "live"; camera: Camera }`, `cameraStateOf(lake: LakeSnapshot | null): CameraState`
  - `formatJstTime(iso: string): string` — `"16:05"` 형식

- [ ] **Step 1: 테스트 작성**

Create `lib/view.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { LakeSnapshot, Snapshot } from "./snapshot/schema";
import { cameraStateOf, formatJstTime, freshnessOf, isNight, isStale, upcomingHours, windLabel } from "./view";

const lake = (patch: Partial<LakeSnapshot>): LakeSnapshot => ({
  id: "kawaguchiko",
  camera: null,
  candidates: [],
  cameraCheckedAt: "2026-09-29T07:00:00.000Z",
  weather: null,
  weatherCheckedAt: "2026-09-29T07:00:00.000Z",
  ...patch,
});
const snapshotOf = (lakes: LakeSnapshot[]): Snapshot => ({ writtenAt: "2026-09-29T07:00:00.000Z", sunrise: null, sunset: null, lakes });

describe("freshnessOf", () => {
  it("uses the oldest check time across lakes and sources", () => {
    const snapshot = snapshotOf([
      lake({ cameraCheckedAt: "2026-09-29T06:50:00.000Z" }),
      lake({ id: "saiko", weatherCheckedAt: "2026-09-29T06:40:00.000Z" }),
    ]);
    expect(freshnessOf(snapshot)).toEqual({ kind: "checked", at: "2026-09-29T06:40:00.000Z" });
  });

  it("is partial when any check time is missing", () => {
    expect(freshnessOf(snapshotOf([lake({}), lake({ id: "saiko", cameraCheckedAt: null })]))).toEqual({ kind: "partial" });
  });
});

describe("isStale", () => {
  it("is stale only after 20 minutes", () => {
    const at = "2026-09-29T07:00:00.000Z";
    expect(isStale(at, Date.parse("2026-09-29T07:20:00.000Z"))).toBe(false);
    expect(isStale(at, Date.parse("2026-09-29T07:20:01.000Z"))).toBe(true);
  });
});

describe("isNight", () => {
  const sunrise = "2026-09-29T05:37:00+09:00";
  const sunset = "2026-09-29T17:32:00+09:00";
  it("is night before sunrise and after sunset", () => {
    expect(isNight(new Date("2026-09-29T05:00:00+09:00"), sunrise, sunset)).toBe(true);
    expect(isNight(new Date("2026-09-29T12:00:00+09:00"), sunrise, sunset)).toBe(false);
    expect(isNight(new Date("2026-09-29T18:00:00+09:00"), sunrise, sunset)).toBe(true);
  });

  it("is never night when sun times are unknown", () => {
    expect(isNight(new Date("2026-09-29T23:00:00+09:00"), null, null)).toBe(false);
  });
});

describe("windLabel", () => {
  it("is calm up to 1.2 m/s", () => {
    expect(windLabel(1.2)).toBe("잔잔함");
    expect(windLabel(1.3)).toBe("물결 있음");
  });
});

describe("upcomingHours", () => {
  it("drops past hours and keeps at most eight", () => {
    const hourly = Array.from({ length: 10 }, (_, i) => ({
      time: `2026-09-29T${String(14 + i).padStart(2, "0")}:00:00+09:00`,
      cloudCover: i,
      precipitation: 0,
    }));
    const weather = { time: hourly[0].time, temperature: 10, cloudCover: 0, precipitation: 0, windSpeed: 1, hourly };
    const result = upcomingHours(weather, new Date("2026-09-29T15:30:00+09:00"));
    expect(result[0].time).toBe("2026-09-29T15:00:00+09:00");
    expect(result).toHaveLength(8);
  });
});

describe("cameraStateOf", () => {
  it("distinguishes unchecked, offline and live", () => {
    expect(cameraStateOf(null)).toEqual({ kind: "unchecked" });
    expect(cameraStateOf(lake({ cameraCheckedAt: null }))).toEqual({ kind: "unchecked" });
    expect(cameraStateOf(lake({ camera: null }))).toEqual({ kind: "offline" });
    const camera = { videoId: "abc", title: "t", channelTitle: "c" };
    expect(cameraStateOf(lake({ camera }))).toEqual({ kind: "live", camera });
  });
});

describe("formatJstTime", () => {
  it("formats in Japan time", () => {
    expect(formatJstTime("2026-09-29T07:05:00.000Z")).toBe("16:05");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test lib/view.test.ts`
Expected: FAIL. `./view`를 찾을 수 없다는 오류.

- [ ] **Step 3: 구현**

Create `lib/view.ts`:
```ts
import type { Camera, LakeSnapshot, LakeWeather, Snapshot } from "./snapshot/schema";

export const STALE_AFTER_MS = 20 * 60 * 1000;
export const CALM_WIND_MAX_MS = 1.2;
export const OUTLOOK_HOURS = 8;

export type Freshness = { kind: "partial" } | { kind: "checked"; at: string };

export function freshnessOf(snapshot: Snapshot): Freshness {
  let oldest: string | null = null;
  for (const lake of snapshot.lakes) {
    for (const at of [lake.cameraCheckedAt, lake.weatherCheckedAt]) {
      if (at === null) return { kind: "partial" };
      if (oldest === null || Date.parse(at) < Date.parse(oldest)) oldest = at;
    }
  }
  return oldest === null ? { kind: "partial" } : { kind: "checked", at: oldest };
}

export function isStale(at: string, nowMs: number): boolean {
  return nowMs - Date.parse(at) > STALE_AFTER_MS;
}

export function isNight(now: Date, sunrise: string | null, sunset: string | null): boolean {
  if (sunrise === null || sunset === null) return false;
  const t = now.getTime();
  return t < Date.parse(sunrise) || t > Date.parse(sunset);
}

export function windLabel(speed: number): "잔잔함" | "물결 있음" {
  return speed <= CALM_WIND_MAX_MS ? "잔잔함" : "물결 있음";
}

export function upcomingHours(weather: LakeWeather, now: Date): LakeWeather["hourly"] {
  const hourStart = now.getTime() - (now.getTime() % 3_600_000);
  return weather.hourly.filter((hour) => Date.parse(hour.time) >= hourStart).slice(0, OUTLOOK_HOURS);
}

export type CameraState = { kind: "unchecked" } | { kind: "offline" } | { kind: "live"; camera: Camera };

export function cameraStateOf(lake: LakeSnapshot | null): CameraState {
  if (lake === null || lake.cameraCheckedAt === null) return { kind: "unchecked" };
  return lake.camera ? { kind: "live", camera: lake.camera } : { kind: "offline" };
}

const jstTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatJstTime(iso: string): string {
  return jstTime.format(new Date(iso));
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test && pnpm typecheck`
Expected: 모든 테스트 통과, 타입 오류 없음

- [ ] **Step 5: Commit**

```bash
git add lib/view.ts lib/view.test.ts
git commit -m "feat: 신선도·야간·바람 표시를 계산하는 화면 도우미를 둔다"
```

---

### Task 11: 메인 화면

**Files:**
- Create: `components/lake-player.tsx`, `components/freshness.tsx`, `components/lake-card.tsx`
- Modify: `app/page.tsx`(전체 교체), `app/layout.tsx`, `app/globals.css`(전체 교체), `README.md`
- Delete: `app/api/weather/route.ts`

**Interfaces:**
- Consumes: `LAKES`, `Lake` (Task 5), `readSnapshot` (Task 9), `LakeSnapshot` (Task 5), `view.ts`의 함수 전부 (Task 10)
- Produces: `LakePlayer`, `Freshness`, `LakeCard` 컴포넌트. `app/layout.tsx`가 `.shell` 래퍼를 가진다(Task 12의 푸터가 여기에 붙는다).

- [ ] **Step 1: 플레이어 컴포넌트**

Create `components/lake-player.tsx`:
```tsx
"use client";

import { ExternalLink, Play, X } from "lucide-react";
import { useState } from "react";

type Props = { videoId: string; lakeName: string; channelTitle: string };

export function LakePlayer({ videoId, lakeName, channelTitle }: Props) {
  const [open, setOpen] = useState(false);
  const id = encodeURIComponent(videoId);

  return (
    <div>
      {open ? (
        <div className="player">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1`}
            title={`${lakeName} 라이브 카메라`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <button type="button" className="player-facade" onClick={() => setOpen(true)}>
          <Play size={28} aria-hidden />
          <strong>라이브 보기</strong>
          <span>{channelTitle}</span>
        </button>
      )}
      <div className="player-actions">
        {open && (
          <button type="button" onClick={() => setOpen(false)}>
            <X size={14} aria-hidden /> 닫기
          </button>
        )}
        <a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noopener noreferrer">
          YouTube에서 보기 <ExternalLink size={14} aria-hidden />
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 신선도 컴포넌트**

서버가 그린 HTML에는 확인 시각을 그대로 넣는다. 브라우저에서 불러온 뒤 "N분 전"으로 바꾸고 30초마다 다시 계산한다. 서버 렌더와 클라이언트 첫 렌더를 같게 해서 hydration 불일치를 피하기 위해서다.

Create `components/freshness.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { formatJstTime, isStale } from "@/lib/view";

export function Freshness({ at }: { at: string | null }) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  if (at === null) return <span className="freshness warn">일부 확인 전</span>;
  if (nowMs === null) return <span className="freshness">{formatJstTime(at)} 확인</span>;
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(at)) / 60_000));
  const stale = isStale(at, nowMs);
  return (
    <span className={stale ? "freshness warn" : "freshness"}>
      {minutes}분 전 확인{stale ? " · 확인 지연" : ""}
    </span>
  );
}
```

- [ ] **Step 3: 호수 카드**

Create `components/lake-card.tsx`:
```tsx
import { ExternalLink } from "lucide-react";
import type { Lake } from "@/lib/lakes";
import type { LakeSnapshot } from "@/lib/snapshot/schema";
import { cameraStateOf, formatJstTime, upcomingHours, windLabel } from "@/lib/view";
import { LakePlayer } from "./lake-player";

type Props = { lake: Lake; data: LakeSnapshot | null; night: boolean; now: Date };

export function LakeCard({ lake, data, night, now }: Props) {
  const camera = cameraStateOf(data);
  const weather = data?.weather ?? null;

  return (
    <article className="panel lake-card" id={`lake-${lake.id}`}>
      <header className="lake-head">
        <h2>{lake.name}</h2>
        {night && <span className="tag">야간 — 화면이 어두울 수 있음</span>}
      </header>

      {weather ? (
        <>
          <div className="lake-metrics">
            <div><span>운량</span><strong>{weather.cloudCover}%</strong></div>
            <div><span>기온</span><strong>{Math.round(weather.temperature)}°</strong></div>
            <div><span>강수</span><strong>{weather.precipitation}mm</strong></div>
            <div>
              <span>바람</span>
              <strong>{weather.windSpeed.toFixed(1)}m/s</strong>
              <small>{windLabel(weather.windSpeed)} · 참고</small>
            </div>
          </div>
          <div className="hour-list">
            {upcomingHours(weather, now).map((hour) => (
              <div className="hour" key={hour.time}>
                <span>{formatJstTime(hour.time)}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${hour.cloudCover}%` }} /></div>
                <strong>{hour.cloudCover}%</strong>
                <small>{hour.precipitation}mm</small>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">기상 정보 없음</p>
      )}

      {camera.kind === "live" ? (
        <LakePlayer videoId={camera.camera.videoId} lakeName={lake.name} channelTitle={camera.camera.channelTitle} />
      ) : (
        <div className="camera-empty">
          <p>{camera.kind === "unchecked" ? "방송 확인 전입니다." : "지금 방송 중인 카메라가 없습니다."}</p>
          <a href={lake.fallback.url} target="_blank" rel="noopener noreferrer">
            {lake.fallback.label} <ExternalLink size={14} aria-hidden />
          </a>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 4: 메인 페이지 교체**

`app/page.tsx` 전체를 아래로 바꾼다.
```tsx
import { env } from "cloudflare:workers";
import { ExternalLink, Mountain } from "lucide-react";
import { Freshness } from "@/components/freshness";
import { LakeCard } from "@/components/lake-card";
import { LAKES } from "@/lib/lakes";
import { readSnapshot } from "@/lib/snapshot/store";
import { cameraStateOf, formatJstTime, freshnessOf, isNight } from "@/lib/view";

export const dynamic = "force-dynamic";

const CAMERA_LABEL = { live: "● 방송 중", offline: "○ 링크만", unchecked: "확인 전" } as const;

export default async function Home() {
  const snapshot = await readSnapshot(env.SNAPSHOT_KV);
  const now = new Date();
  const byId = new Map(snapshot?.lakes.map((lake) => [lake.id, lake]) ?? []);
  const freshness = snapshot ? freshnessOf(snapshot) : null;
  const night = snapshot ? isNight(now, snapshot.sunrise, snapshot.sunset) : false;

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Mountain size={23} strokeWidth={1.8} aria-hidden /></span>
          <div><strong>FUJI NOW</strong><small>후지 5호 라이브</small></div>
        </div>
        {freshness && <Freshness at={freshness.kind === "checked" ? freshness.at : null} />}
      </header>

      <section className="intro">
        <h1>지금, 후지산이<br />보일까?</h1>
        <p className="subcopy">
          후지 5호의 라이브 카메라와 기상청 MSM 예보를 나눠서 보여줍니다. 운량은 예보 모델 값이니, 실제로 보이는지는 카메라로 확인하세요.
        </p>
        {snapshot?.sunrise && snapshot.sunset && (
          <p className="sun">
            일출 {formatJstTime(snapshot.sunrise)} · 일몰 {formatJstTime(snapshot.sunset)} <span>(가와구치코 기준)</span>
          </p>
        )}
      </section>

      {snapshot === null ? (
        <section className="panel">
          <h2>준비 중</h2>
          <p className="muted">카메라와 기상 정보를 아직 불러오지 못했습니다. 아래 원본 카메라 페이지에서 직접 확인하세요.</p>
          <ul className="fallback-list">
            {LAKES.map((lake) => (
              <li key={lake.id}>
                <a href={lake.fallback.url} target="_blank" rel="noopener noreferrer">
                  {lake.name} — {lake.fallback.label} <ExternalLink size={14} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <section className="panel compare-wrap">
            <table className="compare-table">
              <thead>
                <tr><th>호수</th><th>운량</th><th>기온</th><th>카메라</th></tr>
              </thead>
              <tbody>
                {LAKES.map((lake) => {
                  const data = byId.get(lake.id) ?? null;
                  const weather = data?.weather ?? null;
                  return (
                    <tr key={lake.id}>
                      <td><a href={`#lake-${lake.id}`}>{lake.name}</a></td>
                      <td>{weather ? `${weather.cloudCover}%` : "—"}</td>
                      <td>{weather ? `${Math.round(weather.temperature)}°` : "—"}</td>
                      <td>{CAMERA_LABEL[cameraStateOf(data).kind]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <div className="lake-grid">
            {LAKES.map((lake) => (
              <LakeCard key={lake.id} lake={lake} data={byId.get(lake.id) ?? null} night={night} now={now} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 5: 레이아웃 교체**

`app/layout.tsx` 전체를 아래로 바꾼다.
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FUJI NOW | 후지 5호 후지산 라이브",
  description: "후지 5호의 라이브 카메라와 기상청 MSM 예보로 지금 후지산이 보이는지 확인합니다.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: 스타일 교체**

카드 폭 기준: 플레이어는 16:9에서 높이 200px을 넘으려면 폭이 356px 이상이어야 한다. 카드 안쪽 여백이 16px이므로 카드 폭은 388px 이상이어야 한다. 그래서 2열은 뷰포트 880px 이상(본문 800px), 3열은 1290px 이상(본문 1210px)에서 쓴다.

`app/globals.css` 전체를 아래로 바꾼다.
```css
@import "tailwindcss";

:root { font-family: Arial, "Noto Sans KR", sans-serif; color: #163341; background: #eaf1f2; }
* { box-sizing: border-box; }
body { margin: 0; }
button { font: inherit; cursor: pointer; }
a { color: inherit; }

.shell { max-width: 1320px; margin: auto; padding: 0 40px 32px; }
.topbar { min-height: 92px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #c6d5d9; }
.brand { display: flex; align-items: center; gap: 12px; }
.brand-mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: #133f50; color: #fff; }
.brand strong { display: block; font-size: 18px; letter-spacing: .08em; }
.brand small { display: block; color: #667e87; font-size: 12px; margin-top: 3px; }
.freshness { font-size: 13px; font-weight: 700; color: #527985; }
.freshness.warn { color: #a4541f; }

.intro { padding: 40px 0 28px; }
.intro h1 { margin: 0 0 12px; font-size: clamp(32px, 4.5vw, 54px); line-height: 1.16; letter-spacing: -.055em; }
.subcopy { margin: 0; max-width: 720px; color: #58717b; font-size: 16px; line-height: 1.6; }
.sun { margin: 14px 0 0; font-weight: 700; color: #234858; }
.sun span { font-weight: 400; font-size: 13px; color: #718a91; }

.panel { background: #fff; border: 1px solid #d6e2e4; border-radius: 20px; padding: 24px; box-shadow: 0 8px 30px #23485808; }
.panel h2 { margin: 0; font-size: 22px; letter-spacing: -.04em; }
.muted { color: #718a91; font-size: 13px; }

.compare-wrap { overflow-x: auto; }
.compare-table { width: 100%; border-collapse: collapse; font-size: 15px; }
.compare-table th { text-align: left; font-size: 12px; letter-spacing: .08em; color: #527985; padding: 0 10px 10px; }
.compare-table td { border-top: 1px solid #edf2f2; padding: 12px 10px; }
.compare-table a { font-weight: 700; text-decoration: none; }

.lake-grid { display: grid; grid-template-columns: 1fr; gap: 20px; margin-top: 20px; }
.lake-card { padding: 16px; display: flex; flex-direction: column; gap: 14px; scroll-margin-top: 16px; }
.lake-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.tag { font-size: 12px; background: #eef2f6; color: #3c566b; border-radius: 999px; padding: 4px 10px; }
.lake-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.lake-metrics div { background: #f6f9f9; border-radius: 12px; padding: 10px; }
.lake-metrics span, .lake-metrics strong, .lake-metrics small { display: block; }
.lake-metrics span { color: #6c858e; font-size: 12px; }
.lake-metrics strong { margin-top: 6px; font-size: 16px; }
.lake-metrics small { margin-top: 4px; color: #729098; font-size: 11px; }
.hour-list { display: grid; }
.hour { display: grid; grid-template-columns: 46px 1fr 40px 52px; gap: 10px; align-items: center; border-top: 1px solid #edf2f2; padding: 6px 0; font-size: 13px; }
.hour strong, .hour small { text-align: right; }
.hour small { color: #729098; font-size: 12px; }
.bar-track { height: 8px; background: #e8f1f2; border-radius: 10px; overflow: hidden; }
.bar-fill { height: 100%; background: #78a9b5; border-radius: 10px; }

.player, .player-facade { width: 100%; aspect-ratio: 16 / 9; min-height: 200px; border-radius: 12px; overflow: hidden; }
.player iframe { display: block; width: 100%; height: 100%; border: 0; }
.player-facade { border: 1px solid #cbdde0; background: #133f50; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
.player-facade span { font-size: 12px; color: #b9d3db; }
.player-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px; font-size: 13px; }
.player-actions a, .player-actions button { display: inline-flex; align-items: center; gap: 4px; border: 0; background: none; padding: 0; color: #194c60; }
.camera-empty { border: 1px dashed #b8cfd4; border-radius: 12px; padding: 16px; min-height: 120px; display: flex; flex-direction: column; justify-content: center; gap: 8px; font-size: 14px; color: #58717b; }
.camera-empty p { margin: 0; }
.camera-empty a, .fallback-list a { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: #194c60; }
.fallback-list { margin: 12px 0 0; padding-left: 18px; line-height: 2; }

.site-footer { margin-top: 30px; color: #738990; font-size: 12px; line-height: 1.7; }
.site-footer p { margin: 0; }
.site-footer a, .prose a { text-decoration: underline; }
.prose { max-width: 720px; padding: 32px 0; font-size: 15px; line-height: 1.75; }
.prose h1 { font-size: 28px; letter-spacing: -.04em; }
.prose h2 { margin-top: 28px; font-size: 18px; }

@media (min-width: 880px) {
  .lake-grid { grid-template-columns: repeat(4, 1fr); }
  .lake-card { grid-column: span 2; }
  .lake-card:nth-child(5) { grid-column: 2 / span 2; }
}
@media (min-width: 1290px) {
  .lake-grid { grid-template-columns: repeat(6, 1fr); }
  .lake-card:nth-child(4) { grid-column: 2 / span 2; }
  .lake-card:nth-child(5) { grid-column: 4 / span 2; }
}
@media (max-width: 800px) {
  .shell { padding: 0 20px 24px; }
}
@media (max-width: 500px) {
  .topbar { min-height: 72px; }
  .panel { padding: 18px; }
  .lake-card { padding: 14px; }
  .lake-metrics { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 7: 쓰지 않게 된 기상 API 제거와 README 갱신**

```bash
git rm app/api/weather/route.ts
```

`README.md`를 고친다.
- "현재 상태"의 `- 지금 코드에 있는 기능` 줄과 그 하위 항목을 아래 두 줄로 바꾼다.
  ```markdown
  - 후지 5호 비교 표와 호수 카드를 보여준다. 호수마다 기상청 MSM 운량·기온·강수량·풍속, 앞으로 8시간 운량, 누르면 재생되는 YouTube 라이브 카메라가 있다.
  - 5분마다 예약 작업이 YouTube Data API로 방송 여부를, Open-Meteo로 기상을 받아 KV 스냅샷 하나(`snapshot:v1`)에 저장한다. 페이지는 그 스냅샷만 읽는다.
  ```
- "진행 중인 방향" 절을 통째로 지운다. 남은 항목(카메라 영상 AI 분석은 허가 뒤에 검토)은 "외부 데이터 이용 시 주의"의 자동 수집 금지 문장과 같은 내용이다.
- "구조" 표 전체를 아래로 바꾼다.
  ```markdown
  | 경로 | 내용 |
  |---|---|
  | `worker/index.ts` | 워커 진입점. `fetch`는 vinext, `scheduled`는 스냅샷 작업 |
  | `worker/snapshot-job.ts` | 5분 주기 작업: 방송 여부·기상 조회 → 스냅샷 저장 |
  | `wrangler.jsonc` | 워커 이름·계정·진입점·KV·예약 작업 설정 |
  | `lib/lakes.ts` | 호수 목록(좌표·후보 영상 ID·대체 링크) |
  | `lib/snapshot/` | 스냅샷 스키마·합치기·KV 읽기/쓰기 |
  | `lib/youtube.ts`, `lib/weather.ts` | 외부 API 호출과 응답 검사 |
  | `lib/view.ts` | 화면 표시 계산 |
  | `app/page.tsx`, `components/` | 화면 |
  | `docs/specs/` | 설계 문서 |
  ```

Run:
```bash
rg -n "/api/weather|weather-hero|metric-grid|time-badge|camera-links|진행 중인 방향" --glob "!node_modules" --glob "!dist" --glob "!docs/**" .
```
Expected: 결과 없음

- [ ] **Step 8: 검사와 빌드**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: 모두 통과. 빌드 출력에서 `/`가 정적 페이지로 분류되지 않았는지 확인한다(`dynamic = "force-dynamic"`).

- [ ] **Step 9: 로컬 화면 확인**

1. `pnpm dev`를 백그라운드로 띄운다.
2. 예약 작업 전: `curl -s http://localhost:5173/ | grep -o "준비 중" | head -1` → `준비 중`
3. 예약 작업 실행: `curl -s "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*"` → `ok`
4. 다시 요청: `curl -s http://localhost:5173/ | grep -oE "야마나카코|라이브 보기|방송 중인 카메라가 없습니다|분 전 확인|확인$" | sort | uniq -c` → 호수 이름과 `라이브 보기`가 보이고, 사이코 카드에는 "지금 방송 중인 카메라가 없습니다"가 있다.
5. 화면 크기별 확인: worldengco 저장소에 설치된 Playwright를 빌려 폭 320·768·1280·1440px 스크린샷을 찍는다.
   ```bash
   for w in 320 768 1280 1440; do pnpm --dir ../worldengco-website exec playwright screenshot --viewport-size="$w,1400" --full-page http://localhost:5173/ "$TMP/fuji-$w.png"; done
   ```
   찍은 이미지를 열어 다음을 확인한다: 320·768은 1열, 1280은 2열, 1440은 3+2(아랫줄 가운데). 재생 버튼 영역 높이가 200px 이상. 가로 스크롤 없음. Playwright를 쓸 수 없으면 사용자에게 브라우저에서 이 네 폭을 확인해 달라고 요청한다.
6. 브라우저에서 "라이브 보기"를 눌러 플레이어가 그 자리에서 재생되고, 닫기와 "YouTube에서 보기"가 플레이어 바깥에 있는지 확인한다.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: 5호 비교 표와 호수 카드로 메인 화면을 바꾼다

페이지는 KV 스냅샷만 읽는다. 카메라는 누를 때만 youtube-nocookie 플레이어를
띄우고, 썸네일은 채널 대표 이미지라 지금 모습으로 오해를 부르므로 쓰지 않는다."
```

---

### Task 12: 개인정보처리방침과 푸터

**Files:**
- Create: `components/site-footer.tsx`, `app/privacy/page.tsx`
- Modify: `app/layout.tsx`, `README.md`

**Interfaces:**
- Consumes: `.shell` 래퍼가 있는 `app/layout.tsx` (Task 11)
- Produces: 모든 페이지 하단의 `SiteFooter`, `/privacy`

- [ ] **Step 1: 푸터**

Create `components/site-footer.tsx`:
```tsx
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>
        기상: 기상청 MSM 모델, <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> 제공
        (CC BY 4.0). 수치는 관측값이 아닌 예보 모델 값입니다.
      </p>
      <p>카메라 영상의 저작권은 각 채널에 있습니다. 이 사이트는 YouTube API Services를 사용합니다.</p>
      <p>
        이 사이트를 이용하면{" "}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 서비스 약관</a>과{" "}
        <Link href="/privacy">개인정보처리방침</Link>에 동의한 것으로 봅니다.
      </p>
    </footer>
  );
}
```

`app/layout.tsx`에서 `.shell` 안에 푸터를 붙인다:
```tsx
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

export const metadata: Metadata = {
  title: "FUJI NOW | 후지 5호 후지산 라이브",
  description: "후지 5호의 라이브 카메라와 기상청 MSM 예보로 지금 후지산이 보이는지 확인합니다.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <div className="shell">
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: 개인정보처리방침 페이지**

Create `app/privacy/page.tsx`:
```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "개인정보처리방침 | FUJI NOW" };

export default function PrivacyPage() {
  return (
    <main className="prose">
      <h1>개인정보처리방침</h1>

      <h2>수집하는 정보</h2>
      <p>FUJI NOW는 방문자의 개인정보를 수집하거나 저장하지 않습니다. 회원가입, 입력 양식, 방문 분석 도구가 없습니다.</p>

      <h2>제3자 서비스</h2>
      <ul>
        <li>
          카메라 영상은 YouTube 임베드 플레이어로 재생합니다. 재생 버튼을 누르기 전에는 YouTube에 연결하지 않습니다. 누른 뒤에는
          YouTube(Google)가 자체 정책에 따라 쿠키와 시청 정보를 처리할 수 있습니다. 플레이어는 개인정보 보호 강화 모드
          (youtube-nocookie.com)로 불러옵니다.
        </li>
        <li>사이트는 Cloudflare Workers에서 운영합니다. Cloudflare는 요청을 처리하는 과정에서 IP 주소 등 접속 정보를 다룹니다.</li>
      </ul>

      <h2>YouTube API Services</h2>
      <p>
        이 사이트는 카메라가 지금 방송 중인지 확인하려고 YouTube API Services를 사용합니다. 서버가 공개 영상의 방송 상태만
        조회하며, 방문자 정보는 보내지 않습니다. 자세한 내용은{" "}
        <a href="http://www.google.com/policies/privacy" target="_blank" rel="noopener noreferrer">Google 개인정보처리방침</a>과{" "}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 서비스 약관</a>을
        참고하세요.
      </p>

      <h2>변경</h2>
      <p>방문 분석 도구처럼 정보를 처리하는 기능을 추가하면 이 문서를 먼저 고칩니다.</p>
    </main>
  );
}
```

- [ ] **Step 3: README 구조 표에 정책 페이지 추가**

`README.md` "구조" 표의 `app/page.tsx`, `components/` 행 바로 아래에 넣는다.
```markdown
| `app/privacy/page.tsx` | 개인정보처리방침 |
```

- [ ] **Step 4: 검사와 확인**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: 모두 통과

Run: `pnpm dev`를 백그라운드로 띄운 뒤
```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/privacy
curl -s http://localhost:5173/ | grep -o "YouTube API Services를 사용합니다" | head -1
curl -s http://localhost:5173/privacy | grep -o "google.com/policies/privacy" | head -1
```
Expected: `200`, 문구 한 줄, 링크 한 줄

- [ ] **Step 5: Commit**

```bash
git add components/site-footer.tsx app/privacy/page.tsx app/layout.tsx README.md
git commit -m "feat: 개인정보처리방침과 출처·약관 푸터를 둔다

YouTube API Services를 쓰는 서비스는 개인정보처리방침과 YouTube 약관 링크를
상시 보여야 한다. 사이트는 개인정보를 수집하지 않으므로 동의 팝업 없이
푸터 링크와 이용 시 동의 문구로 둔다."
```

---

### Task 13: 운영 배포와 확인

**Files:**
- Modify: `wrangler.jsonc`(KV ID), `README.md`

**Interfaces:**
- Consumes: Task 9~12 전부
- Produces: 운영 워커(예약 작업·KV·secret 포함), 갱신된 README

- [ ] **Step 1: 사용자 확인 — API 키**

사용자에게 묻는다: "운영에 넣을 YouTube API 키를 fuji-now 전용으로 새로 만들까요, 아니면 지금 `.env.local`의 ycc-website 키를 그대로 쓸까요?" 설계 문서는 전용 키를 권한다. 전용 키를 만들기로 하면 사용자가 키를 발급해 `.env.local`을 바꿀 때까지 기다린다.

어느 키든 Google Cloud 콘솔에서 "API 제한"을 YouTube Data API v3 하나로 걸어 두도록 사용자에게 요청한다. 서버에서 호출하므로 HTTP 리퍼러 제한은 걸면 안 된다(걸면 호출이 거부된다). 사용자가 설정했다고 답한 뒤 다음 단계로 간다.

- [ ] **Step 2: 사용자 승인 — KV 생성, secret 등록, 배포**

"Cloudflare 계정에 KV 네임스페이스 `SNAPSHOT_KV`를 만들고, `YOUTUBE_API_KEY` secret을 등록하고, 예약 작업이 포함된 워커를 배포한다"고 알리고 승인을 받는다.

- [ ] **Step 3: KV 네임스페이스 생성**

Run: `pnpm exec wrangler kv namespace create SNAPSHOT_KV`
Expected: 새 네임스페이스의 `id`가 출력된다. `wrangler.jsonc`의 자리표시 ID `00000000000000000000000000000000`를 이 값으로 바꾼다.

- [ ] **Step 4: secret 등록**

키가 화면과 셸 기록에 남지 않도록 파일에서 읽어 넘긴다.

Run:
```bash
node -e "const m=require('fs').readFileSync('.env.local','utf8').match(/^YOUTUBE_API_KEY=(.+)$/m);if(!m){console.error('YOUTUBE_API_KEY not found');process.exit(1)}process.stdout.write(m[1].trim())" | pnpm exec wrangler secret put YOUTUBE_API_KEY
```
Expected: `Success! Uploaded secret YOUTUBE_API_KEY`. 워커가 아직 이 계정에 없으면 wrangler가 새로 만들지 묻는다. Task 4에서 이미 배포했다면 묻지 않는다.

- [ ] **Step 5: 배포**

Run: `pnpm run deploy`
Expected: 업로드 완료. 출력에 `schedule: */5 * * * *`가 보인다.

- [ ] **Step 6: 운영에서 예약 작업 확인**

Run: `pnpm exec wrangler tail fuji-now --format pretty`를 백그라운드로 띄우고, 다음 5분 경계가 지날 때까지 기다린다.
Expected: `{"event":"snapshot","written":true,"youtube":"ok","weather":"ok",...}` 로그가 찍힌다. API 키는 어디에도 없다. 확인 뒤 tail을 끈다.

Run: `pnpm exec wrangler kv key get snapshot:v1 --binding SNAPSHOT_KV --remote | head -c 400`
Expected: `{"writtenAt":"...","sunrise":"...` 로 시작하는 JSON

- [ ] **Step 7: 운영 화면 확인**

Run: `curl -s https://fuji-now.<subdomain>.workers.dev/ | grep -oE "야마나카코|라이브 보기|준비 중" | sort | uniq -c`
Expected: 호수 이름과 `라이브 보기`가 보이고, `준비 중`은 없다. 사용자에게 폰에서 열어 보고, 카메라 하나를 재생해 보도록 주소를 알린다.

- [ ] **Step 8: README에 운영 자원과 후보 관리 방법 적기**

`README.md`의 "배포" 절 바로 뒤에 아래 두 절을 넣는다.

```markdown
## 카메라 후보 바꾸기

`lib/lakes.ts`의 `candidates`가 호수별 후보 영상 ID 목록이다. 앞에 있을수록 우선한다. 방송이 새 ID로 재시작되면 옛 ID는 `ended`나 `missing`이 되고, 그 호수는 "방송 없음"으로 보인다. 예약 작업 로그의 `notLive`에서 끊긴 후보를 확인할 수 있다. 새 ID를 목록에 넣고 다시 배포한다.

## 운영 자원

| 자원 | 만드는 방법 | 확인 |
|---|---|---|
| 워커 `fuji-now` | `pnpm run deploy` | `pnpm exec wrangler deployments list` |
| KV `SNAPSHOT_KV` | `pnpm exec wrangler kv namespace create SNAPSHOT_KV` → ID를 `wrangler.jsonc`에 적는다 | `pnpm exec wrangler kv key get snapshot:v1 --binding SNAPSHOT_KV --remote` |
| secret `YOUTUBE_API_KEY` | `.env.local`에서 읽어 `wrangler secret put YOUTUBE_API_KEY`로 넘긴다 | `pnpm exec wrangler secret list` |
| 예약 작업 `*/5 * * * *` | `wrangler.jsonc`의 `triggers.crons`. 배포할 때 함께 등록된다 | `pnpm exec wrangler tail fuji-now` |

`wrangler.jsonc`에서 바인딩을 지워도 실제 자원은 남는다. 사이트를 내릴 때는 아래 순서로 지운다.

1. `pnpm exec wrangler delete fuji-now` — 워커와 예약 작업, secret이 함께 지워진다.
2. `pnpm exec wrangler kv namespace delete --binding SNAPSHOT_KV`
3. Google Cloud 콘솔에서 fuji-now용 API 키를 폐기한다(전용 키를 만든 경우).
```

"외부 데이터 이용 시 주의" 절 끝에 한 줄을 넣는다.
```markdown
- YouTube API Services 정책에 따라 API로 받은 데이터는 30일 안에 지우거나 새로 받는다. 스냅샷은 5분마다 새로 쓰고, 이어받는 값은 1시간을 넘기지 않으며, KV 만료는 1일이다. 테스트 데이터(`lib/__fixtures__/youtube-videos.json`)는 구조만 실제이고 내용 값은 바꿔 두었다.
```

- [ ] **Step 9: 참조 확인**

Run:
```bash
rg -n "api/weather|제거 예정|진행 중인 방향|chatgpt.site" README.md docs/specs
```
Expected: 설계 문서의 기록(기존 Sites 주소가 남는다는 알려진 한계)과 README의 "예전 ChatGPT Sites 주소" 줄 외에는 결과가 없다.

- [ ] **Step 10: Commit**

```bash
git add wrangler.jsonc README.md
git commit -m "chore: 운영 KV를 연결하고 README에 운영 자원과 폐기 절차를 적는다"
git push
```
