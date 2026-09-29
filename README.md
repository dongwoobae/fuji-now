# FUJI NOW

후지 5호(야마나카코·가와구치코·사이코·쇼지코·모토스코)에서 **지금 후지산이 보이는지**를 한 화면으로 확인하는 웹사이트다. 여행 당일 여러 라이브카메라와 기상예보를 일일이 열어 대조하던 일을 대신한다.

예보(모델이 계산한 운량 등)와 지금 모습(카메라)을 섞지 않고 나눠서 보여주는 것을 원칙으로 한다.

## 현재 상태

- ChatGPT Sites에서 만든 첫 버전이다. 공개 주소는 https://fuji-now.dongwoobae.chatgpt.site
- 이 저장소는 Sites 쪽 코드를 한 번 복사해 온 것이다. **여기에 푸시해도 위 주소에는 반영되지 않는다.**
- 지금 코드에 있는 기능
  - 가와구치코 좌표의 현재 기상과 앞으로의 운량 (Open-Meteo)
  - 카메라 운영 사이트로 가는 원본 링크
  - 사진을 올리면 Gemini로 가시성을 판정하는 기능과 판정 기록(D1). 서버에 `GEMINI_API_KEY`가 없으면 비활성 상태다.

## 진행 중인 방향

- 배포를 내 Cloudflare Workers(workers.dev)로 옮기고, Sites 전용 코드를 걷어낸다.
- 후지 5호별 YouTube 라이브 카메라와 호수별 기상(기상청 MSM 모델, Open-Meteo 제공)을 보여준다.
- 라이브가 끝나거나 재시작된 경우를 가려내기 위해, 서버가 YouTube Data API로 방송 여부를 주기적으로 확인한다.
- 사진 AI 판정과 D1은 제거한다. 카메라 영상 분석은 제공자의 허가를 받은 뒤에 다시 검토한다.

## 로컬 실행

Node.js 22.13 이상과 pnpm이 필요하다.

```sh
pnpm install
pnpm dev      # http://localhost:5173
pnpm build
```

- 서버 비밀값(API 키)은 `.env*` 파일에 두고 커밋하지 않는다. `.gitignore`가 `.env*`를 제외한다.
- `pnpm-workspace.yaml`은 공개된 지 7일이 안 된 패키지를 설치하지 않도록 설정되어 있다. 새 버전이 설치되지 않으면 이 설정 때문일 수 있다.

## 구조

| 경로 | 내용 |
|---|---|
| `app/page.tsx` | 메인 화면 |
| `app/api/weather` | Open-Meteo 기상 조회 |
| `app/api/analyze`, `app/api/observations` | 사진 AI 판정과 기록 (제거 예정) |
| `db/`, `drizzle/` | D1 스키마와 마이그레이션 (제거 예정) |
| `build/`, `scripts/`, `.openai/` | Sites 빌드·실행 환경용 파일 (제거 예정) |

## 외부 데이터 이용 시 주의

- 카메라 영상과 이미지의 권리는 각 운영자에게 있다. YouTube 영상은 임베드 플레이어로만 보여주고, 허가 없이 프레임이나 이미지를 자동으로 수집하지 않는다.
- Open-Meteo 데이터는 CC BY 4.0이라 출처를 표기해야 한다. 무료 API는 비상업용에만 쓸 수 있다.
