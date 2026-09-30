# FUJI NOW — 후지 5호 카메라 MVP 설계

작성 2026-09-29. 외부 서비스의 약관·한도·응답 형식은 이날 공식 문서와 실제 호출로 확인한 값이다. 다시 쓸 때는 재확인한다.

## 목적

후지 5호(야마나카코·가와구치코·사이코·쇼지코·모토스코)에서 지금 후지산이 어떤지를 한 페이지로 보여준다.

- 1차 사용자는 개발자 본인이다. 2026-10-29부터 여행하면서 폰으로 쓴다.
- 장기적으로는 도쿄 여행자가 참고하는 공개 서비스로 키운다. 이번 MVP의 선택도 그 길을 막지 않아야 한다.
- **예보(운량 등 모델 값)와 지금 모습(카메라)을 섞지 않고 나눠서 보여준다.**

## 범위

**1단계: 배포 이전 (ChatGPT Sites → 내 Cloudflare workers.dev)**

- 도구 버전을 올린다(아래 "도구 버전").
- Sites 연동 코드를 걷어낸다: `build/`(Sites 플러그인·커넥터 미리보기), `.openai/hosting.json`, `lib/connector*`, `components/connector-error.tsx`, `app/chatgpt-auth.ts`, `examples/`, `scripts/`의 Sites·Codex 실행 환경용 스크립트. 이 코드에서만 쓰는 의존성(`json-rpc-2.0`, `raw-body`)도 같이 뺀다.
- AI 사진 판정을 코드까지 삭제한다: `app/api/analyze`, `app/api/observations`, 화면의 업로드·기록 패널.
- D1을 삭제한다: `db/`, `drizzle/`, `drizzle.config.ts`와 관련 의존성.
- 워커 진입점을 `worker/index.ts`로 새로 만든다. `fetch`는 vinext 핸들러에 넘기고 `scheduled`는 예약 작업을 부른다. vite 설정과 `wrangler.jsonc`가 이 파일을 가리키게 한다(지금 진입점 `build/sites-worker.ts`는 `build/`와 함께 지운다).
- `wrangler.jsonc`를 추가하고, 패키지 이름(`site-creator-vinext-starter`)을 바꾼다.
- `package.json` 스크립트를 정리한다.
  - `dev`·`build`는 Sites 실행 스크립트(`scripts/run-framework.mjs`)를 거치지 않게 바꾼다.
  - `start`는 `scripts/sites-env.mjs` 없이 빌드 결과를 로컬 wrangler로 띄우도록 바꾼다(예약 작업 확인에 쓴다).
  - `deploy`를 추가한다.
  - 지워지는 파일이나 D1을 가리키는 `install:ci`와 `db:generate`는 지운다.
- 바인딩 타입은 `wrangler types`로 생성한다. 지금의 `cloudflare-env.d.ts`(`DB`·`BUCKET` 선언)는 이것으로 교체한다.
- README의 실행·배포 설명과 "현재 상태"를 바뀐 배포 방식에 맞게 고친다. KV 네임스페이스·secret·예약 작업을 누가 어떻게 만들고, 사이트를 내릴 때 어떤 순서로 지우는지도 적는다. 설정에서 바인딩을 지워도 실제 자원은 남기 때문이다.
- 배포는 로컬에서 직접 한다. GitHub 푸시 자동 배포는 하지 않는다.
- 완료 기준: workers.dev 주소에서 기존 기상 화면이 폰으로 열린다.

**2단계: 5호 카메라 + 호수별 기상**

- 5분 주기 예약 작업이 YouTube 방송 여부와 기상을 받아 KV에 스냅샷 하나로 저장한다.
- 화면: 다섯 호수 비교 표 + 호수 카드 5개(기상 + 누르면 재생되는 YouTube 플레이어).
- 정책 페이지 `/privacy`를 추가한다.

**범위 밖**: 층별 운량, 습도, AI 판정, 자체 도메인, 안 쓰는 shadcn 컴포넌트 정리, 다국어, 끊긴 후보 알림, 카메라 제공자 허가 문의.

## 결정과 근거

| 주제 | 결정 | 근거 / 기각한 대안 |
|---|---|---|
| 배포 | 내 Cloudflare 계정, workers.dev | Sites는 GitHub와 연동되지 않아 로컬 변경이 배포되지 않는다. 자체 도메인은 나중에 붙인다(그때 주소가 바뀐다). |
| AI 사진 판정 | 코드까지 삭제 | 여행자는 사진을 올리지 않는다. 앞으로의 판정은 서버가 허가받은 카메라를 분석하는 형태가 된다. 필요하면 git 이력에서 되살린다. |
| 카메라 소스 | YouTube 라이브 임베드만 사용 | YouTube 약관은 임베드 표시를 허용하고, 허가 없는 다운로드·스크래퍼 접근을 금지한다. 프레임을 떠서 분석하는 것은 허가를 받은 뒤에 한다. |
| 썸네일 | 쓰지 않는다 | 라이브 썸네일(`hqdefault_live.jpg`)은 채널이 올린 대표 이미지였다(맑은 날·겨울 사진). 지금 화면으로 오해하게 만든다. |
| 방송 여부 확인 | 5분 주기 예약 작업 + KV (A안) | B안(방문할 때 확인하고 Cache API에 저장)은 workers.dev에서 Cache API가 동작하는지 문서로 확인하지 못했다. 캐시가 안 되면 할당량이 트래픽에 비례한다. C안(브라우저에서만 처리)은 끝난 라이브가 다시보기로 재생되는 것을 잡지 못한다. |
| 재생 | 누를 때만 플레이어를 띄우고, 동시 재생은 제한하지 않는다 | 정책이 막는 것은 **자동재생** 여러 개다. 누르기 전에는 Google과 통신하지 않는다. |
| 기상 | Open-Meteo `jma_msm` | 좌표별 운량을 무료로 주는 기상청 직접 경로를 확인하지 못했다. MSM은 기상청 모델이라 출처를 정확히 표기할 수 있다. |
| 호수 카드 지표 | 운량·기온·강수량·풍속(역후지 참고), 상단에 일출·일몰 | 층별 운량·습도는 이번에 넣지 않는다. |
| 역후지 표시 | 풍속 1.2m/s 이하면 "잔잔함", 초과면 "물결 있음", 옆에 "참고" 표시 | 1.2m/s는 호세이대 논문 요약에서 가져온 값으로 원문 PDF를 확인하지 못했다. 논문은 호숫가 관측값이고 MSM은 5km 격자의 모델 값이라 그대로 비교할 수 없다. |
| 정책 페이지 | 동의 팝업 없이 푸터 상시 링크 + "이용하면 동의한 것으로 본다" 문구 | 사이트가 개인정보를 수집·저장하지 않는다. |
| 운영 API 키 | fuji-now 전용 YouTube API 키 | 지금 로컬 `.env.local`의 키는 ycc-website 운영 키다. 할당량을 함께 쓰고, 한쪽에서 키를 교체하면 둘 다 멈춘다. |

## 외부 제약 (2026-09-29 확인)

**YouTube**
- [약관](https://www.youtube.com/t/terms): 임베드 플레이어로 표시하는 것은 허용한다. 허가 없는 복제·다운로드와 자동화 수단(스크래퍼 등) 접근은 금지한다.
- [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
  - 한 화면에서 동시에 자동재생하는 플레이어는 하나까지다.
  - 플레이어 뷰포트는 200×200px 이상이어야 한다.
  - 플레이어 위(컨트롤 포함)에 어떤 요소도 겹치면 안 된다.
- [Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
  - 개인정보처리방침: 상시 접근 가능해야 하고, YouTube API Services를 쓴다는 사실을 알리고, Google 개인정보처리방침에 링크해야 한다.
  - YouTube 약관 링크를 표시하고, 이용하면 YouTube 약관에 동의하는 것이라고 명시해야 한다.
  - API로 받은 데이터는 30일 안에 삭제하거나 새로 받아야 한다.
- [Data API `videos.list`](https://developers.google.com/youtube/v3/docs/videos/list)
  - 호출 1회에 1 unit이 든다.
  - `snippet.liveBroadcastContent`는 `live`/`none`/`upcoming` 중 하나다.
  - `liveStreamingDetails.actualEndTime`은 방송이 끝난 뒤에만 채워진다.
  - `status.embeddable`이 true여도 정책이나 권리 주장 때문에 임베드 재생이 막힐 수 있다.
  - [`search.list`](https://developers.google.com/youtube/v3/docs/search/list)는 "Search Queries" 할당량에서 호출당 1 unit이 든다. 이 할당량의 크기는 확인하지 못했다. 이번 범위에서는 쓰지 않지만, 재시작된 라이브를 채널에서 자동으로 찾는 기능의 후보다.

**정지 이미지 카메라**
- [Fujiyama.TV](https://fujiyama.tv/live/): 「画像への直接リンクまたは画像のみの自動取得行為は許可していません」(이미지 직접 링크와 이미지만 자동으로 가져가는 행위는 허용하지 않음). 상업 이용은 연락해야 한다. 이 사이트에는 원본 페이지 링크만 둔다.

**Open-Meteo**
- [문서](https://open-meteo.com/en/docs): 좌표 여러 개를 쉼표로 이어 한 번에 요청할 수 있고, 응답은 배열로 온다.
  - 운량 층 구분: 하층 3km까지, 중층 3~8km, 상층 8km 이상.
- [JMA MSM](https://open-meteo.com/en/docs/jma-api): 약 5km 격자, 3시간마다 갱신, 4일 예보. 시정(visibility)과 강수확률은 없다.
- 실제 호출 결과(좌표 5개, `forecast_hours=9`, `daily=sunrise,sunset`)
  - HTTP 200, 응답 크기 5,025바이트.
  - `current`는 15분 간격이다.
  - 일출·일몰은 지점마다 온다.
  - 응답 좌표는 격자에 맞춰 조정된다.
- [이용 조건](https://open-meteo.com/en/terms)
  - 무료 API는 비상업용에만 쓸 수 있다. 구독이나 광고가 없는 개인 웹사이트는 비상업용으로 본다. 광고를 붙이면 유료 플랜이 필요하다.
  - 무료 한도는 하루 10,000회, 시간당 5,000회, 분당 600회 미만이다. 5분 주기면 하루 288회다.
  - 데이터 라이선스는 CC BY 4.0이라 출처를 표기해야 한다.

**Cloudflare 무료 플랜**
- [Workers](https://developers.cloudflare.com/workers/platform/limits/): 예약 작업은 계정당 5개, 예약 작업 CPU 10ms, 서브요청은 호출당 50개.
- [KV](https://developers.cloudflare.com/kv/platform/limits/): 하루 읽기 100,000회, 쓰기 1,000회. 같은 키에는 초당 1회만 쓸 수 있다.

## 카메라 후보 (2026-09-29 `videos.list`로 확인)

| 호수 | 순서 | 영상 ID | 채널 | 상태 |
|---|---|---|---|---|
| 야마나카코 | 1 | `F2NbYrc-gBU` | 【KTV】ケーブルテレビ河口湖 | live, 2025-12-02 시작 |
| 가와구치코 | 1 | `bdUbACCWmoY` | 【KTV】ケーブルテレビ河口湖 (大石公園) | live, 2022-04-21 시작 |
| 가와구치코 | 2 | `1cnReFAU04k` | 【KTV】ケーブルテレビ河口湖 | 같은 날 채널 라이브 목록에서 확인 |
| 사이코 | — | 없음 | — | KTV 채널에 사이코 라이브 없음 |
| 쇼지코 | 1 | `so_3HK9HIdg` | 【KTV】ケーブルテレビ河口湖 | live, 2023-12-31 시작. 옛 ID `qdVvly6pVhA`는 삭제됨 |
| 모토스코 | 1 | `_qdu714QT1E` | YBS山梨放送 (설명: 本栖湖の情報カメラ) | live |
| 모토스코 | 2 | `JGyGoXlKZmw` | フジヤマNAVI (富士本栖湖リゾート) | live. 호숫가가 아니라 꽃잔디 축제장 |

- 방송 중인 후보는 모두 `embeddable=true`였다.
- 방송 중인 후보가 없을 때 쓸 대체 링크(정지 이미지 카메라의 원본 페이지)는 호수마다 하나씩 둔다. 사이코는 富士河口湖町 西湖いやしの里根場 카메라 페이지다.

## 구조

### 구성 요소

- **호수 목록** (코드에 고정): 호수 id, 이름, 좌표, 후보 카메라(순서가 우선순위), 대체 링크. 후보를 고치려면 코드를 고치고 다시 배포한다.
- **스냅샷 만들기** (순수 함수): 후보 상태 분류, 카메라 선택, 기상 응답 변환, 직전 스냅샷과 합치기. 외부 호출과 KV에 의존하지 않는다.
- **스냅샷 읽기** (`readSnapshot()`, 서버 전용): KV에서 키를 읽고 zod로 검사한다. 읽기 실패·키 없음·검사 실패를 모두 "스냅샷 없음"으로 돌려준다. 페이지와 예약 작업이 **이 함수 하나를** 쓴다. 키 이름과 검사가 두 곳에 복제되지 않게 하기 위해서다.
- **예약 작업** (`worker/index.ts`의 `scheduled`): 외부 호출 → 스냅샷 만들기 → KV 쓰기.
- **페이지** `/` (서버 컴포넌트): `readSnapshot()`으로 읽어서 그린다. 바인딩은 `import { env } from "cloudflare:workers"`로 접근한다. 브라우저 쪽 코드는 플레이어 열고 닫기와 "N분 전" 계산에만 쓴다.
- **정책 페이지** `/privacy`.

### 스냅샷 (KV 키 하나, `snapshot:v1`)

```
writtenAt                    // KV에 쓴 시각. 기록용이며 화면의 신선도 판단에 쓰지 않는다
sunrise, sunset | null       // 오늘, 가와구치코 좌표 기준. 기상 호출에서 받는다
lakes[]:
  id
  camera { videoId, title, channelTitle } | null
  candidates[] { videoId, status }   // live | ended | upcoming | missing | not_embeddable
  cameraCheckedAt | null
  weather { time, temperature, cloudCover, precipitation, windSpeed,
            hourly[] { time, cloudCover, precipitation } } | null
  weatherCheckedAt | null
```

- **KV 키는 하나만 쓴다.** 호수별로 나누면 하루 쓰기가 5 × 288 = 1,440회로 무료 한도(1,000회)를 넘는다.
- 만료는 1일이다. 예약 작업이 멈추면 하루 뒤 지워진다.
- **직전 값을 이어받는 기간은 최대 1시간이다.** 한쪽 호출만 계속 실패하면 다른 쪽이 5분마다 키를 다시 쓰면서 만료가 계속 연장된다. 그러면 KV 만료만으로는 옛 값이 지워지지 않는다. 그래서 확인 시각이 1시간을 넘은 부분은 이어받지 않고 비운다. YouTube 데이터의 30일 조건을 지키고, 끝났을지 모르는 방송을 계속 띄우지 않기 위해서다.
  - YouTube 쪽: `camera`와 `cameraCheckedAt`은 `null`, `candidates`는 빈 배열로 둔다.
  - 기상 쪽: `weather`, `weatherCheckedAt`, `sunrise`, `sunset`을 `null`로 둔다.
- 처음 실행할 때 한쪽만 성공해도 쓴다. 실패한 쪽은 위와 같이 비운 상태로 쓴다.
- 스냅샷 형식을 바꾸면 키 버전을 올린다. 새 키가 채워지기 전까지 화면은 "준비 중"을 보여준다.

### 방송 판정

| 조건 | status |
|---|---|
| 응답에 해당 ID가 없음(삭제·비공개) | `missing` |
| `embeddable`이 false | `not_embeddable` |
| `liveBroadcastContent`가 `live` | `live` |
| `liveBroadcastContent`가 `upcoming` | `upcoming` |
| 그 밖의 경우(`none`, 대개 `actualEndTime`이 있음) | `ended` |

위에서부터 차례로 따진다. `live`인 첫 번째 후보를 그 호수의 카메라로 쓴다.

선택은 매 실행마다 후보 전체의 현재 상태로 새로 한다. 이전 선택은 기억하지 않는다. 그래서 1순위가 꺼져 2순위를 쓰다가 1순위가 **같은 ID로** 다시 방송하면 다음 실행에서 1순위로 돌아간다. **새 ID로** 재시작한 방송은 후보 목록에 없어서 잡지 못한다(알려진 한계).

### 예약 작업 흐름 (`*/5 * * * *`)

1. `readSnapshot()`으로 직전 스냅샷을 읽는다.
2. 두 호출을 동시에 보낸다. 각각 10초가 지나면 끊는다.
   - YouTube `videos.list` 1회: 모든 후보 ID, `part=snippet,status,liveStreamingDetails`
   - Open-Meteo 1회: 좌표 5개, `models=jma_msm`, `current`, `hourly`(`forecast_hours`로 필요한 시간만), `daily=sunrise,sunset`, `wind_speed_unit=ms`, `timezone=Asia/Tokyo`
3. 두 응답을 zod로 검사한다. 형식이 다르면 그 호출은 실패로 처리한다.
   - Open-Meteo는 여러 지점 요청의 응답 순서를 문서로 보장하지 않는다. 그래서 응답의 각 지점 좌표가 같은 순서의 요청 좌표와 위도·경도 모두 0.03° 안에 있는지 확인한다. 벗어나면 기상 호출 실패로 처리한다.
   - 응답 좌표는 MSM 격자(위도 0.05°, 경도 0.0625°)에 맞춰 옮겨져 온다. 2026-09-30 응답에서 가장 많이 옮겨진 것은 모토스코 경도 0.0255°였다. 쇼지코와 모토스코는 서로 바뀌면 요청 좌표와 경도가 0.037° 이상 어긋나므로, 기준을 그보다 느슨하게 잡으면 둘이 바뀐 것을 잡지 못한다. 0.03°는 경도 반 칸(0.03125°)보다 좁으므로, 호수를 추가하거나 좌표를 바꾸면 응답 좌표가 기준 안에 드는지 확인한다.
4. 스냅샷을 만든다. 실패한 쪽은 직전 값과 그때의 확인 시각을 가져온다. 단, 확인 시각이 1시간을 넘었으면 스냅샷 절의 규칙대로 비운다.
5. 두 호출이 모두 실패하면 KV에 쓰지 않는다. 그 밖에는 만료 1일로 쓴다.
6. 한 줄 로그를 남긴다: 방송 중·끊긴 후보 수, 실패한 호출.

5분마다 쓰면 KV 쓰기는 하루 288회, YouTube 할당량은 하루 288 unit이다.

### 화면

- **상단**: 브랜드, "N분 전 확인", 오늘 일출·일몰. "N분 전"은 모든 호수의 `cameraCheckedAt`·`weatherCheckedAt` 가운데 **가장 오래된 값**으로 계산한다. 한쪽만 갱신됐을 때 전체가 방금 확인된 것처럼 보이지 않게 하기 위해서다. 이 중 하나라도 `null`이면 시각 대신 "일부 확인 전"을 표시한다. `null`을 빼고 계산하면 확인하지 못한 부분이 가려지기 때문이다. 일출·일몰이 `null`이면 그 자리는 생략한다.
- **다섯 호수 비교 표**: 호수, 운량, 기온, 카메라 방송 여부(● 방송 중 / ○ 링크만). 행을 누르면 해당 카드로 이동한다.
- **호수 카드**: 동쪽부터 야마나카코 → 가와구치코 → 사이코 → 쇼지코 → 모토스코 순서다.
  - 현재 운량·기온·강수량·풍속(역후지 참고 표시)
  - 앞으로 8시간 운량 막대(기존 스타일)
  - 카메라 자리
- **카드 배치**
  - 넓은 화면은 3열(윗줄 3개, 아랫줄 2개 가운데 정렬), 중간 폭은 2열, 좁은 화면은 1열이다.
  - 전환 폭은 플레이어 폭이 약 356px(16:9에서 높이 200px) 이상 나오도록 정한다.
- **카메라 자리**
  - 누르기 전에는 호수 이름, 재생 버튼, 채널명만 보여준다.
  - 누르면 그 자리에 `youtube-nocookie.com` 임베드를 띄운다. 최소 높이는 200px이다.
  - 닫기 버튼과 "YouTube에서 보기" 링크는 플레이어 **바깥**에 둔다.
  - 재생은 카드마다 따로 한다.
- **푸터**
  - 기상 출처: 기상청 MSM, Open-Meteo 제공, CC BY 4.0
  - 영상 저작권은 각 채널에 있다는 안내
  - `/privacy` 링크, YouTube 약관 링크, "이용하면 동의한 것으로 본다" 문구
- **`/privacy` 내용**
  - 이 사이트는 개인정보를 수집·저장하지 않는다.
  - 카메라를 재생하면 YouTube(Google)가 정보를 처리한다.
  - 호스팅은 Cloudflare다.
  - YouTube API Services를 사용한다.
  - Google 개인정보처리방침과 YouTube 약관 링크.
  - 방문 분석 도구를 넣으면 이 페이지를 고친다.

### 상태 표시

| 상태 | 조건 | 표시 |
|---|---|---|
| 준비 중 | `readSnapshot()`이 "스냅샷 없음"을 돌려줌(KV 읽기 실패, 키 없음, zod 검사 실패) | "준비 중" + 호수별 대체 링크. 대체 링크는 코드에 고정된 값이라 KV 없이도 보여줄 수 있다 |
| 확인 전 | `cameraCheckedAt`이 `null`(한 번도 확인 못 했거나, 1시간 넘게 확인 못 해 비움) | "방송 확인 전" + 대체 링크 (예: API 키가 없을 때). "방송 없음"과 구분한다 |
| 기상 없음 | `weatherCheckedAt`이 `null` | 카드의 기상 자리에 "기상 정보 없음" |
| 방송 없음 | 확인했는데 `live`인 후보가 없음 | "지금 방송 중인 카메라가 없습니다" + 대체 링크 |
| 야간 | 일출·일몰이 있고, 지금이 일출 전 또는 일몰 뒤 | 카드에 "야간 — 화면이 어두울 수 있음". 일출·일몰이 `null`이면 표시하지 않는다 |
| 확인 지연 | 해당 확인 시각이 20분(주기 4회) 넘게 지남 | 상단 경고. "N분 전"은 브라우저에서 계산한다 |

오래된 값을 최신처럼 보이게 하지 않는 것이 원칙이다.

### 비밀값과 설정

- `YOUTUBE_API_KEY`
  - 운영: `wrangler secret`으로 넣는다.
  - 로컬: git에서 제외되는 파일에 둔다(`.gitignore`의 `.env*` 규칙).
  - 키는 YouTube Data API 전용으로 제한한다.
- KV 네임스페이스 하나(바인딩 이름 `SNAPSHOT_KV`)와 예약 작업 하나를 `wrangler.jsonc`에 선언한다. 타입은 `wrangler types`로 생성한다.

## 도구 버전

- `pnpm-workspace.yaml`의 `minimumReleaseAge: 10080`(공개 후 7일 동안 설치 금지)은 유지한다. Sites 전용인 `storeDir`·`cacheDir` 설정은 1단계에서 정리한다.
- 2026-09-29 기준으로 정책 안에서 서로 맞는 조합:

| 패키지 | 기존 | 올릴 버전 |
|---|---|---|
| wrangler | 4.92.0 | 4.136.1 |
| @cloudflare/vite-plugin | 1.37.1 | 1.57.1 |
| vinext | 1.0.0-beta.5 | 1.0.0-beta.11 |
| vite | 8.0.13 | 8.3.0 |
| @vitejs/plugin-rsc | 0.5.26 | 0.5.35 |

- 기존 조합에서 확인된 문제
  - vite 플러그인이 만드는 `dist/server/wrangler.json`에 `legacy_env` 필드가 들어가서 wrangler 4.143.0이 설정을 거부했다.
  - wrangler 4.92.0으로 빌드 결과를 로컬 실행하면 예약 작업을 부를 때 `DataCloneError`(ScheduledController 직렬화)가 났다.
- 올린 조합에서의 확인 결과
  - `legacy_env`가 없어졌다.
  - 빌드 결과를 wrangler로 로컬 실행했을 때 `/cdn-cgi/handler/scheduled`가 `scheduled` 핸들러를 실행했다.
  - 진입점 `default` export의 `scheduled`가 빌드 결과에 남는다.
- 워커 진입점에서는 핸들러가 아닌 값을 이름 있는 export로 내보내면 workerd가 거부한다.

## 테스트

- **단위 테스트** (vitest, 새로 추가): 스냅샷 만들기의 순수 함수를 테스트한다.
  - 후보 상태 분류와 카메라 선택
  - 한쪽 호출만 실패했을 때 직전 값 유지. 1시간이 넘으면 비움(`candidates`는 빈 배열, 나머지는 `null`)
  - 처음 실행에서 한쪽만 성공해도 씀(실패한 쪽은 비운 상태)
  - 두 호출이 모두 실패하면 쓰지 않음
  - 1순위가 꺼졌다가 같은 ID로 다시 켜지면 1순위로 돌아감
  - Open-Meteo 응답 좌표가 요청과 어긋나면(순서가 바뀜) 기상 호출 실패로 처리
  - `readSnapshot()`: KV 읽기 실패·키 없음·형식 불일치를 모두 "스냅샷 없음"으로 돌려줌
  - 상단 "N분 전"이 가장 오래된 확인 시각을 따름
  - 야간 판정, 확인 지연 판정, 바람 표시
- **테스트 데이터**: Open-Meteo와 YouTube의 **실제 응답을 저장해서** 쓴다. 형식을 추측해서 만들지 않는다.
  - YouTube 응답은 필드 구조만 실제 그대로 두고, 제목·채널명 같은 내용 값은 바꿔서 저장한다. 테스트 데이터는 git에 계속 남는데, API로 받은 데이터는 30일 안에 지우거나 새로 받아야 하기 때문이다.
- **로컬 통합 확인**: `pnpm dev` 또는 빌드 결과 `wrangler dev --test-scheduled`에서 `/cdn-cgi/handler/scheduled`로 예약 작업을 한 번 돌리고 페이지를 연다.
- **배포 후 확인**
  - `wrangler tail`로 운영 환경에서 예약 작업이 도는지 확인한다.
  - `wrangler kv key get`으로 저장된 스냅샷을 직접 확인한다.
  - 폰에서 workers.dev 주소를 연다.
  - 폭 320·768·1280px에서 배치를 확인한다.
- **자동 검사**: `tsc --noEmit`, `eslint`, 빌드.

## 알려진 한계

- 끊긴 후보를 알려주는 기능이 없다. 화면의 "방송 없음" 표시가 사실상의 알림이다. 스트림이 재시작되어 ID가 바뀌면 코드를 고쳐 다시 배포해야 한다.
- 사이코에는 YouTube 라이브가 없어서 대체 링크만 있다.
- 운량·풍속은 모델 값이다. 실제로 산이 보이는지는 카메라로 확인해야 한다.
- 다섯 호수를 한 장씩 모아 보는 "현재 화면" 그리드는 없다. 정지 이미지 제공자의 허가가 있어야 가능하다.
- 기존 Sites 주소(`fuji-now.dongwoobae.chatgpt.site`)는 옛 버전 그대로 남는다.
- Workers 무료 플랜은 요청이 하루 100,000회로 제한된다. 넘으면 Error 1027이 나고, KV 읽기 한도도 같은 크기다. 누구나 요청을 반복해 하루치 한도를 소진시킬 수 있다. 개인 MVP에서는 받아들이지만, 공개하기 전에는 유료 플랜이나 속도 제한이 필요하다(열린 결정 6).

## 열린 결정

1. fuji-now 전용 YouTube API 키를 만드는 시점. 배포 전을 권한다.
2. 기존 Sites 사이트를 내릴지 여부.
3. vinext 1.0.0 정식판으로 올리는 시점. 7일 정책 기간이 끝나는 2026-10-05 이후.
4. 정지 이미지 카메라 제공자(Fujiyama.TV, 사이코는 富士河口湖町·UTY)에 자동 수집·AI 분석 허가를 문의할지 여부. 5호 현재 화면 그리드와 AI 판정의 선행 조건이다.
5. 새 ID로 재시작한 라이브를 채널 단위로 자동 탐색할지 여부. `search.list`(`channelId`, `eventType=live`)로 채널의 현재 라이브를 찾고 제목으로 호수를 맞추는 방식이 후보다. Search Queries 할당량의 크기를 먼저 확인해야 하고, 제목 매칭은 채널이 제목을 바꾸면 깨진다.
6. 공개 전 요청 한도 대책: Workers 유료 플랜 또는 자체 도메인에서의 속도 제한.
