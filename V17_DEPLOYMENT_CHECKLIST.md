# v17 격리 운영 검증 체크리스트 (배포 승인 전)
## 1. GitHub 검증
- Actions > V17 isolated development verification > architecture-v17 최신 commit 실행 결과 확인.
- 기존 v16 회귀와 v17 검증이 모두 성공해야 다음 단계. 실패 항목 우선 수정. main 병합 금지.
- 실제 SHA-256, SQLite, sandbox Node 테스트 결과를 확인한다. 로직 모의 테스트 성공은 실제 Cloudflare 성공을 의미하지 않는다.

## 2. 현재 미국 시세 문제 확인 (기존 운영 유지)
- 기존 Finnhub Worker 코드 버전, Cron 실행 결과, D1 DB 바인딩을 확인한다. 화면의 토큰 및 계좌 정보는 공유하지 않는다.
- 브라우저가 닫혀 있어도 Cron 로그에서 실행 성공을 확인한다. 현재 Worker가 예약 수집을 실제 지원하는지 확인한다.
- 신규 개발 Worker는 격리 DB에 연결해야 한다. 기존 운영 DB는 건드리지 않는다. 동일 Finnhub 키로 두 수집기를 동시에 실행하지 않는다. 기존 수집기 중단 또는 별도 허용 한도 확인 전 실 API 수집을 시작하지 않는다.
- 개발용 VIEW_TOKEN과 별도 REGISTRY_WRITE_TOKEN 사용. 코드/저장소/채팅에 비밀키를 기록하지 않는다. 무료 플랜 조건을 유지하며 유료 전환하지 않는다.

## 3. 장중/장마감 확인
- 기존 5개 미국 티커를 기준으로 체결 시각, 수신 시각, 데이터 출처, 실제 응답과 누락 건을 기록한다.
- 노트북 완전 OFF, 휴대폰 조회는 공급원 호출 없이 캐시만 조회하는지 확인. 장중 정상 시세 및 429/지연/만료 표시 확인.
- 신규 티커 등록 후 예약 수집 목록과 읽기 응답에서 같은 티커가 확인되는지 검증.
- v17 Finnhub 후보는 정규장 중 시세를 수집하며 마감 후에는 만료된다. 이것을 확정 종가라고 표시하지 않는다. 기존 미국 일봉 경로의 실제 배포 및 최신 거래일 자료 생성 확인이 별도로 필요하다. 확정 종가 연결 및 거래일 판별 검증 없이 장마감 문제 해결 완료로 표시하지 않는다.
- 휴장, 조기마감, 다음 거래일 전까지의 종가 유지 확인.

## 4. 복구 및 출시 조건
- sandbox 저장/복구/롤백은 운영 18개 키와 완전히 분리한다. 기존 동기화가 연결된 상태에서 실기기 기록 복구를 실행하지 않는다.
- 실제 백업 내보내기 및 기기 내 검증 완료 후 구형 sync 정지/이전/재연결 절차 별도 테스트.
- 국내 신규 종목 KRX 필터, 미국 확정 종가, 공통 환율, 전체 포트폴리오 평가 연결 및 기기 간 동일 결과 확인 전 운영 버전 병합 금지.

## 5. 격리 검증용 묶음과 실제 운영 순서 (2026-11-27)
- Actions의 V17 isolated development verification 성공 실행에서 v17-validation-bundle artifact를 받는다. preview 폴더는 개발 화면 및 필요한 모듈만 포함하고 us-quotes.json은 가격·환율 없는 합성 파일이다. workers 폴더는 배포 후보 소스만 포함한다. manifest SHA-256은 파일 대조용이며 서명은 아니다. 비밀키·실제 계좌·운영 KRX 자료는 포함하지 않는다. GitHub Actions의 브라우저 스모크 테스트는 격리 합성 데이터만 사용한다.
- 기존 Cloudflare 대시보드에서 Workers & Pages의 현재 미국 시세 Worker와 D1 연결 상태, 무료 플랜, Cron 실행 로그를 확인한다. 화면에 비밀값/API 키/토큰/계좌번호가 보이면 가리고 공유한다. 기존 Worker 삭제, Cron 변경, D1 초기화, 유료 전환 금지.
- 운영 페이지는 main의 기존 GitHub Pages 그대로 유지한다. 현재 묶음은 다운로드 검증용이지 배포된 URL이 아니다. 기존 주소와 같은 origin에서만 기존 localStorage를 읽을 수 있으며 다른 호스트/로컬 주소에서는 읽을 수 없다. Worker CORS는 기존 GitHub Pages origin으로 제한되어 있다. 검증 시 해당 origin의 격리 테스트 경로 배포 승인이 별도로 필요하다.
- 첫 실제 클라우드 실험은 별도 개발 Worker 및 별도 D1(무료 한도 확인)으로 수행. DB binding 이름 DB. FINNHUB_API_KEY는 기존 운영 수집기와 병행 사용하지 않는다. VIEW_TOKEN, REGISTRY_WRITE_TOKEN, POSITION_RECORD_TOKEN은 서로 다른 비밀값. US_DAILY_AUTHORIZED는 공급원 권한 확인 전 설정하지 않는다. KRX_DYNAMIC_ENABLED는 개발 KRX Worker에서 실응답 및 이용 승인 확인 전 설정하지 않는다. 최초에는 실제 투자기록 없이 합성 신규 종목 등록/기록 저장/조회/충돌만 확인한다.
- 증권사 허용 IP 및 키움 ISA 등록 조건은 독립적인 미해결 과제다. 기존 무료 Workers/GitHub Actions에서 고정 출구 IP를 보장하지 못하므로 잔고 자동 조회를 출시 완료 조건으로 착각하지 않는다. 직접 입력·동기화·시세 조회는 별도로 검증하고, 실제 사용자 데이터 이관/운영 전환은 명시적 승인 후 진행한다.
- 미국 신규 종목 일봉 자동화 공급원 허용, 국내 당일 종가, 배당 중복 확인, 양방향 실기기 동기화는 아직 미완료. 개발 코드 및 합성 검증 결과를 실제 시세 수집/운영 성공으로 표시하지 않는다.

## 6. 실제 격리 Worker 연결 점검
- 사용자 화면에서 jungho-v17 D1 및 동명 Worker 생성, DB 바인딩 및 세 별도 Secret 등록 확인. Cron/FINNHUB_API_KEY 추가하지 않음.
- Chrome DevTools 붙여넣기 경고를 우회하지 않는다. 개발 Worker 전용 https://jungho-v17.pdk7101.workers.dev/connection-test 경로의 암호 입력폼으로 GET /watchlist, /quotes, 선택 GET /position-records를 확인한다. 해당 페이지용 같은 origin GET만 추가 허용하며 기존 토큰 인증, 운영 origin 정책과 POST 제한 유지.
- 결과는 HTTP 상태 및 개수만 표시한다. 비밀값 저장·출력 금지. DB 테이블 초기화 가능하지만 보유기록 쓰기나 시세 공급원 호출 없음. 시세 0건은 미수집 상태로 정상일 수 있다. 실제 저장·두 기기 검증은 후속 단계. main 및 기존 운영 Worker 변경 없음.
