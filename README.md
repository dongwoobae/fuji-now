# FUJI NOW

후지 5호(야마나카코·가와구치코·사이코·쇼지코·모토스코)에서 **지금 후지산이 보이는지**를 한 화면으로 확인하는 웹사이트다. 여행 당일 여러 라이브카메라와 기상예보를 일일이 열어 대조하던 일을 대신한다.

예보(모델이 계산한 운량 등)와 지금 모습(카메라)을 섞지 않고 나눠서 보여주는 것을 원칙으로 한다.

## 현재 상태

- 개발자 본인의 Cloudflare 계정에 Workers로 배포한다. 주소: https://fujinow.dwoobae.com (Workers Custom Domain). workers.dev 주소는 끈다.
- 예전 ChatGPT Sites 주소(https://fuji-now.dongwoobae.chatgpt.site)는 옛 버전 그대로 남아 있고, 이 저장소와 연결되지 않는다.
- 후지 5호 비교 표와 호수 카드를 보여준다. 호수마다 기상청 MSM 운량·기온·강수량·풍속, 앞으로 8시간 하층 운량, 누르면 재생되는 YouTube 라이브 카메라가 있다. 방송 중인 카메라가 여럿이면 최대 3대까지 번호로 골라 본다. 여섯 번째 명소 카드는 주레이토 5층탑 같은 호수 밖 전망 명소 카메라다.
- 5분마다 예약 작업이 YouTube Data API로 방송 여부를, Open-Meteo로 기상 예보를, 기상청 AMeDAS로 관측 강수를 받아 KV 스냅샷 하나(`snapshot:v5`)에 저장한다. 페이지는 그 스냅샷만 읽는다.
- 시각마다 후지산이 보이는 정도를 5단계(완벽·잘 보임·구름 걸림·거의 가려짐·안 보임)로 추정해 보여준다. 호수와 정상 격자의 하층·중층·상층 운량과 강수로 매긴다. 단계 이름은 FujiView 연구를 따랐다.
- 매시 정각에 MSM 값과 리드타임별 예보를 Neon Postgres에 쌓는다. 나중에 월별 통계("8월은 안 보이는 날이 절반 이상")를 내기 위해서다. 2018-08부터의 과거 값은 `pnpm backfill`로 채운다.
- `/stats`에서 월 × 호수별로 "보인 날" 비율과 5단계 비율을 본다. 하루 한 번 Neon에서 집계해 KV(`stats:v1`)에 넣고, 페이지는 그 키만 읽는다.
- 운영자가 눈으로 본 후지산을 `/report`에 남긴다. 같은 시간대에 실측이 있으면 통계는 모델 추정 대신 실측을 쓴다.

## 로컬 실행

Node.js 22.13 이상과 pnpm이 필요하다.

```sh
pnpm install
pnpm dev          # http://localhost:5173
pnpm build
pnpm start        # 빌드 결과를 로컬 wrangler로 실행 (http://127.0.0.1:8799)
pnpm typecheck
pnpm lint
pnpm test
```

- 서버 비밀값(API 키)은 `.env.local`에 두고 커밋하지 않는다. `.gitignore`가 `.env*`를 제외한다. 로컬 wrangler는 `.dev.vars`가 없으면 `.env`와 `.env.local`을 읽는다.
- `pnpm-workspace.yaml`은 공개된 지 7일이 안 된 패키지를 설치하지 않도록 설정되어 있다. 새 버전이 설치되지 않으면 이 설정 때문일 수 있다.
- 바인딩을 바꾸면 `pnpm cf-typegen`으로 `worker-configuration.d.ts`를 다시 만든다.
- Neon 연결 문자열은 `.env.local`의 `DATABASE_URL`에 둔다. 스키마를 고치면 `pnpm db:generate`로 `drizzle/`에 마이그레이션을 만들고, `pnpm db:migrate`로 적용한다. main에 병합하면 CI가 배포 직전에 적용한다.
- 등급 기준값과 "보인 날" 규칙을 고를 때는 `pnpm calibrate`를 실행한다. 후보 조합마다 월별 보인 날 비율과 참고 곡선과의 차이를 표로 출력한다(DB를 바꾸지 않는다).
- 등급 기준(`lib/visibility.ts`의 `GRADE_RULES`)을 바꿨으면 배포한 뒤 `pnpm regrade`로 DB의 과거 등급을 다시 매기고, `pnpm stats:refresh`로 통계를 다시 집계한다.
- 통계를 바로 다시 집계하려면 `pnpm stats:refresh`를 실행한다. `.env.local`의 `DATABASE_URL`로 Neon에서 집계해 운영 KV에 바로 쓰고, 월별 "5호 전체" 보인 날 비율을 터미널에 출력한다. wrangler 로그인이 필요하다.
- 과거 MSM 값을 채우려면 `pnpm backfill`(기본 2018-08-01 ~ 어제)을 로컬에서 한 번 실행한다. `.env.local`의 `DATABASE_URL`을 쓴다. 끊기면 출력된 명령으로 이어서 실행한다. 이미 있는 시각은 건너뛴다.
- 실측 페이지를 로컬에서 쓰려면 `.dev.vars`에 `REPORT_CODE`와 `DATABASE_URL`을 둔다. `pnpm start`(빌드 결과)는 `dist/server/.dev.vars`를 읽는다.
- Open-Meteo 요청 형식을 바꾸면 `node scripts/capture-open-meteo-fixture.mjs`로 테스트 데이터를 다시 받는다. 지금 파일의 일부는 임시 값이다(`lib/__fixtures__/README.md`).
- 로컬 KV는 처음에 비어 있어 "준비 중"이 보인다. 개발 서버를 띄운 뒤 `curl "http://localhost:5173/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*"`로 예약 작업을 한 번 돌리면 채워진다. 빌드 결과(`pnpm start`)에서는 포트 8799로 같은 경로를 부른다.

## 배포

main에 병합하면 GitHub Actions(`.github/workflows/ci.yml`)가 lint·typecheck·test·build를 거쳐 배포한다. PR에서는 배포만 빼고 같은 검사와 빌드가 돈다. 문서(`docs/**`, `*.md`)만 바뀐 커밋에서는 돌지 않는다.

배포에는 GitHub Secret `CLOUDFLARE_API_TOKEN`과 `DATABASE_URL`(배포 전 마이그레이션)이 필요하다. Cloudflare 대시보드에서 "Edit Cloudflare Workers" 템플릿으로 만들고, 범위를 이 계정과 dwoobae.com 존으로 좁힌다. `YOUTUBE_API_KEY`·`DATABASE_URL`·`REPORT_CODE`는 워커 secret이라 배포해도 유지된다.

로컬에서 직접 배포하는 것은 CI 검사를 거치지 않는 비상 경로다.

```sh
pnpm exec wrangler login   # 처음 한 번
pnpm run deploy            # `pnpm deploy`는 pnpm 내장 명령이라 다르게 동작한다
```

## 카메라 후보 바꾸기

`lib/lakes.ts`에서 호수 카드는 `LAKES`의 `candidates`, 명소 카드는 `SPOTS`의 `candidates`가 후보 목록이다. 항목은 영상 ID와 화면에 보일 장소 이름(`label`)이다. 앞에 있을수록 우선하고, 방송 중인 것을 앞에서부터 3대까지 보여준다. 방송이 새 ID로 재시작되면 옛 ID는 `ended`나 `missing`이 되어 다음 후보가 올라온다. 후보가 모두 꺼지면 그 카드는 "방송 없음"으로 보인다. 예약 작업 로그의 `notLive`에서 끊긴 후보를 확인할 수 있다. 새 ID를 목록에 넣고 다시 배포한다.

## 운영 자원

| 자원 | 만드는 방법 | 확인 |
|---|---|---|
| 워커 `fuji-now` | main 병합(GitHub Actions) 또는 `pnpm run deploy` | `pnpm exec wrangler deployments list` |
| 도메인 `fujinow.dwoobae.com` | `wrangler.jsonc`의 `routes`(`custom_domain`). 배포할 때 DNS 레코드와 인증서가 함께 만들어진다 | `curl -I https://fujinow.dwoobae.com/` |
| KV `fuji-now-snapshot` (바인딩 `SNAPSHOT_KV`) | `pnpm exec wrangler kv namespace create fuji-now-snapshot` → ID를 `wrangler.jsonc`에 적는다 | `pnpm exec wrangler kv key get snapshot:v5 --binding SNAPSHOT_KV --remote` |
| Neon 프로젝트 `rapid-smoke-03243240` (브랜치 `production`, 싱가포르) | Neon 콘솔에서 만든다. 테이블은 `pnpm db:migrate` | `pnpm db:studio`, 또는 `wrangler tail`의 `"event":"record"` 로그 |
| secret `DATABASE_URL` | Neon 콘솔 Connect의 pooled 연결 문자열을 `wrangler secret put DATABASE_URL`, `gh secret set DATABASE_URL -R dongwoobae/fuji-now`, `.env.local`에 넣는다 | `pnpm exec wrangler secret list` |
| secret `REPORT_CODE` | 길고 무작위인 문자열(예: `openssl rand -base64 32`)을 `wrangler secret put REPORT_CODE`로 넣는다. 바꾸면 기존 로그인이 모두 풀린다 | `/report`에서 로그인 |
| secret `YOUTUBE_API_KEY` | `.env.local`에서 읽어 `wrangler secret put YOUTUBE_API_KEY`로 넘긴다 | `pnpm exec wrangler secret list` |
| GitHub Secret `CLOUDFLARE_API_TOKEN` | Cloudflare 대시보드에서 만들어 `gh secret set CLOUDFLARE_API_TOKEN -R dongwoobae/fuji-now`로 넣는다 | `gh secret list -R dongwoobae/fuji-now` |
| 예약 작업 `*/5 * * * *` | `wrangler.jsonc`의 `triggers.crons`. 배포할 때 함께 등록된다 | `pnpm exec wrangler tail fuji-now` |

`wrangler.jsonc`에서 바인딩을 지워도 실제 자원은 남는다. 사이트를 내릴 때는 아래 순서로 지운다.

1. `pnpm exec wrangler delete fuji-now` — 워커와 예약 작업, secret이 함께 지워진다. 그 뒤 대시보드의 dwoobae.com DNS에 `fujinow` 레코드가 남았는지 확인한다.
2. `pnpm exec wrangler kv namespace delete --binding SNAPSHOT_KV`
3. 기록을 보관할 필요가 없으면 Neon 콘솔에서 프로젝트를 지우고, GitHub Secret `DATABASE_URL`을 지운다.
4. Google Cloud 콘솔에서 fuji-now용 API 키를 폐기한다.
5. Cloudflare 대시보드에서 fuji-now 배포용 API 토큰을 폐기하고, GitHub Secret을 지운다.

## 구조

| 경로 | 내용 |
|---|---|
| `.github/workflows/ci.yml` | PR·main 검사와 main 배포 |
| `worker/index.ts` | 워커 진입점. `fetch`는 vinext, `scheduled`는 스냅샷 작업 |
| `worker/snapshot-job.ts` | 5분 주기 작업: 방송 여부·기상 조회 → 스냅샷 저장 |
| `worker/record-job.ts` | 매시 첫 실행: 73시간 예보 조회 → Neon에 기록 |
| `lib/visibility.ts` | 5단계 등급 정의·기준값·실측 우선 규칙 |
| `lib/record.ts` | 예보 응답을 기록 행으로 나누기 |
| `lib/db/`, `drizzle/`, `drizzle.config.ts` | Neon 스키마·클라이언트·쿼리, 마이그레이션 |
| `lib/report.ts`, `app/report/` | 실측 기록 페이지(운영자 전용)와 입력 검사·쿠키 확인 |
| `lib/backfill.ts`, `scripts/backfill.ts` | 과거 예보로 `weather_hourly` 채우기 |
| `lib/stats.ts`, `lib/db/stats.ts`, `worker/stats-job.ts`, `app/stats/` | 월별 통계 집계(하루 한 번)와 화면. 수동 집계는 `scripts/stats-refresh.ts` |
| `scripts/` | 마이그레이션 적용, 백필, 통계 수동 집계, 등급 기준 보정표, 과거 등급 재계산, Open-Meteo 테스트 데이터 받기 |
| `wrangler.jsonc` | 워커 이름·계정·진입점·KV·예약 작업·도메인 설정 |
| `lib/lakes.ts` | 호수 목록(좌표·후보 영상 ID·대체 링크), 정상 지점 |
| `lib/snapshot/` | 스냅샷 스키마·합치기·KV 읽기/쓰기 |
| `lib/youtube.ts`, `lib/weather.ts`, `lib/amedas.ts` | 외부 API 호출과 응답 검사 |
| `lib/view.ts` | 화면 표시 계산 |
| `app/page.tsx`, `components/` | 화면 |
| `app/privacy/page.tsx` | 개인정보처리방침 |
| `docs/specs/` | 설계 문서 |

## 외부 데이터 이용 시 주의

- 카메라 영상과 이미지의 권리는 각 운영자에게 있다. YouTube 영상은 임베드 플레이어로만 보여주고, 허가 없이 프레임이나 이미지를 자동으로 수집하지 않는다.
- Open-Meteo 데이터는 CC BY 4.0이라 출처를 표기해야 한다. 무료 API는 비상업용에만 쓸 수 있다.
- 기상청 AMeDAS 관측은 공공데이터 이용규약에 따라 「出典：気象庁ホームページ」를 표기한다. 기상청 웹사이트가 쓰는 JSON이라 형식이 바뀔 수 있고, 그러면 관측 줄만 사라진다.
- YouTube API Services 정책에 따라 API로 받은 데이터는 30일 안에 지우거나 새로 받는다. 스냅샷은 5분마다 새로 쓰고, 이어받는 값은 1시간을 넘기지 않으며, KV 만료는 1일이다. 테스트 데이터(`lib/__fixtures__/youtube-videos.json`)는 구조만 실제이고 내용 값은 바꿔 두었다.
