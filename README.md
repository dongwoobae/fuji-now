# FUJI NOW

후지 5호(야마나카코·가와구치코·사이코·쇼지코·모토스코)에서 **지금 후지산이 보이는지**를 한 화면으로 확인하는 웹사이트다. 여행 당일 여러 라이브카메라와 기상예보를 일일이 열어 대조하던 일을 대신한다.

예보(모델이 계산한 운량 등)와 지금 모습(카메라)을 섞지 않고 나눠서 보여주는 것을 원칙으로 한다.

## 현재 상태

- 개발자 본인의 Cloudflare 계정에 Workers로 배포한다. 주소: https://fuji-now.dongwoobae.workers.dev
- 예전 ChatGPT Sites 주소(https://fuji-now.dongwoobae.chatgpt.site)는 옛 버전 그대로 남아 있고, 이 저장소와 연결되지 않는다.
- 지금 코드에 있는 기능
  - 가와구치코 좌표의 현재 기상과 앞으로의 운량 (Open-Meteo)
  - 카메라 운영 사이트로 가는 원본 링크

## 진행 중인 방향

- 후지 5호별 YouTube 라이브 카메라와 호수별 기상(기상청 MSM 모델, Open-Meteo 제공)을 보여준다.
- 라이브가 끝나거나 재시작된 경우를 가려내기 위해, 서버가 YouTube Data API로 방송 여부를 주기적으로 확인한다.
- 카메라 영상 AI 분석은 제공자의 허가를 받은 뒤에 다시 검토한다.

## 로컬 실행

Node.js 22.13 이상과 pnpm이 필요하다.

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

## 배포

```sh
pnpm exec wrangler login   # 처음 한 번
pnpm run deploy            # `pnpm deploy`는 pnpm 내장 명령이라 다르게 동작한다
```

## 구조

| 경로 | 내용 |
|---|---|
| `worker/index.ts` | 워커 진입점 |
| `wrangler.jsonc` | 워커 이름·계정·진입점 설정 |
| `app/page.tsx` | 메인 화면 |
| `app/api/weather` | Open-Meteo 기상 조회 |

## 외부 데이터 이용 시 주의

- 카메라 영상과 이미지의 권리는 각 운영자에게 있다. YouTube 영상은 임베드 플레이어로만 보여주고, 허가 없이 프레임이나 이미지를 자동으로 수집하지 않는다.
- Open-Meteo 데이터는 CC BY 4.0이라 출처를 표기해야 한다. 무료 API는 비상업용에만 쓸 수 있다.
