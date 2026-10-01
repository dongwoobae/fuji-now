# 테스트 데이터

외부 API의 실제 응답을 저장해서 쓴다. 형식을 추측해서 만들지 않는다(설계 문서 "테스트" 절).

## 임시 데이터: `open-meteo-msm.json`

2026-10-01에 중층·상층 운량과 후지산 정상 지점을 요청에 더했다. 작업 환경에서 Open-Meteo에 접속할 수 없어서, 이 파일은 실제 응답을 바탕으로 만든 **임시 데이터**다.

- 실제 값: 2026-09-30에 받은 호수 5곳 응답의 기존 필드(`current`, `daily`, `cloud_cover_low`, `precipitation`)
- 지어낸 값: `cloud_cover_mid`, `cloud_cover_high`, 그리고 여섯 번째 지점(정상). 정상 지점은 가와구치코 응답을 복사한 뒤 좌표·표고·운량을 바꿨다.

Open-Meteo에 접속할 수 있는 곳에서 `node scripts/capture-open-meteo-fixture.mjs`를 실행해 실제 응답으로 바꾸고, 이 절을 지운다. 테스트는 기대값을 파일 내용에서 계산하므로 바꿔도 그대로 돈다.
