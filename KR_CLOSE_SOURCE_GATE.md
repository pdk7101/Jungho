# 국내 당일 종가 공급원 검증 — 2026-11-26 KST

판정: **미통과**. 실제 인증 API에서 기존 전 종목의 당일 정규장 종가를 받은 상태가 아니다. main/v16 및 Cloudflare 운영 설정은 변경하지 않음.

| 공급원 | 문서 확인 결과 | 판정 |
| --- | --- | --- |
| KRX OPEN API | 일별 자료, 기존 익영업일 08시 이후 수집 구조. ETF 전체 날짜별 자료. | 이력/공식 대조 유지, 당일 해결 불가 |
| 금융위원회 공공데이터 | 다음 영업일 오후 1시 이후 갱신이라고 상세 설명 명시 | 제외 |
| 토스/키움 공식 API | 허용 IP 인증 필요, 기존 노트북 없이 Cloudflare 무료 Worker 고정 송신 IP 보장 없음 | 기존 조건에서 미해결 |
| Twelve Data | 한국 거래소 EOD Pro 이상 | 제외 |
| EODHD | 무료 20회/일, 종목별 EOD, 사적 클라우드 사용 가능. 전체 거래소 Bulk 100회 및 유료 범위. | 제한적 보조 후보, 확장형 전체 수집 미통과 |
| GoogleFinance | 대부분 국제 거래소 미지원, 지연 및 종목 지원 불확실 | 전종목 공급원으로 미통과 |
| KRX 웹사이트 자동 수집 | 무단 자동수집 금지 약관 | 승인되지 않은 크롤링 제외 |

EODHD 공개 페이지: 6개 ISA ETF 모두 11월 26일 날짜 표시, 추가 4종목 중 228810.KO/003280.KO/321370.KQ 페이지 존재, 0229F0.KO 개별 페이지 조회 불가(미지원 단정 불가). 웹 페이지의 소수점 표시 가격 및 Prev. Close는 실제 당일 정규장 체결 종가로 인정하지 않는다. API 문서상 raw close와 adjusted_close는 별도이므로 반드시 raw close를 실제 증권사 종가와 대조. 데모 키는 일부 미국 종목 등에 한정, 한국 종목 인증 API 실증 미수행.

## 다음 통과 조건
- 무료 키로 기존 10개 고유 국내 종목의 해당 날짜 raw close 및 신규 ETF 후보 검증.
- 개인용 비공개 요청만, 원천 데이터 공개 저장 금지. 신규 결제 금지. 20회/일 예산에서 요청·실패·재시도를 모두 계수. 추가 등록은 재가입이 아닌 종목 ID로 처리하되 20종목 초과 당일 전체 자동 갱신은 불가. 100종목 당일 목표를 달성하는 공급원 미확정.
- 가입 자체가 불필요하다고 판단되거나 사용자 보류 시 운영 변경하지 않음. 공식 KRX 당일 CSV 수동 반영은 별도 선택지일 뿐 자동화 성공으로 간주하지 않음.
- 실제 API 키가 없으므로 외부 응답 검증 불가. v16 보존.

## 근거
- https://www.data.go.kr/data/15094806/openapi.do
- https://openapi.kiwoom.com/intro/serviceInfo
- https://developers.tossinvest.com/docs/auth
- https://developers.cloudflare.com/cloudflare-one/traffic-controls/egress-policies/
- https://twelvedata.com/exchanges
- https://eodhd.com/help/plans
- https://eodhd.com/help/ai-tools
- https://eodhd.com/financial-apis/api-limits
- https://eodhd.com/financial-apis/api-for-historical-data-and-volumes
- https://eodhd.com/financial-apis/quick-start-with-our-financial-data-apis
- https://support.google.com/docs/answer/3093281
- https://data.krx.co.kr/contents/MDC/INFO/informationController/MDCINFO003.cmd

## 2026-11-27 추가 조사 및 우선순위 변경
- 운영 화면의 11/27 국내 공식 종가 0/6, 공통 평가가격 10/10은 이전 기준일 자료임. 당일 종가 공급원 미해결로 PR #1 운영 병합 보류.
- EODHD 공식 Quick Start: 무료 계정, 결제카드 불필요, 20회/일 및 최근 1년 일봉. 공식 EOD 문서상 미국 주요 시장 외에는 마감 후 2~3시간 정도 갱신될 수 있음. 10개 고유 국내 코드 1회 조회 및 실패 대상 제한 재시도는 후보이나 100개 확대 요구에 부적합. ETF/알파벳 코드 및 당일 날짜의 실제 인증 응답과 원종가 대조 전 채택 금지. 새 유료 가입/공개 시세 파일 저장 금지.
- 한국투자증권 KIS 공식 REST API 추가 후보: 국내주식기간별시세 FHKST03010100, J=KRX (NX/UN 사용 안 함), D=일봉, FID_ORG_ADJ_PRC=1 원주가, 최대 100일/종목 호출. 계좌 Appkey/App secret 및 토큰 필요. 개인 고객의 무료 클라우드 접속 및 약관, 보유한 계좌 유무, ETF/신규 코드와 실제 당일 종가 지원 확인 필요. 고정 IP 불필요를 공식적으로 확정하지 않음. 토스·키움의 계좌 연결과는 별개로 시세만 조회하는 후보. 추가 계좌 개설/비용 승인 없이 진행하지 않음.
- 다음 실측: EODHD 무료 키가 있다면 10개 중 0229F0.KO 등 미확인 종목 포함 검증. 없다면 무료 등록 여부 결정. 이후 무료 할당량, 날짜, 원종가, 시장, 통화, 기존 KRX 대조 결과가 통과해야 별도 비공개 수집기를 도입. 키움 실제 잔고 유료 연결은 계속 보류. main 및 운영 Worker 미변경.
- 참고: https://eodhd.com/financial-apis/quick-start-with-our-financial-data-apis ; https://eodhd.com/financial-apis/api-for-historical-data-and-volumes ; https://apiportal.koreainvestment.com/intro ; https://github.com/koreainvestment/open-trading-api/tree/main/examples_llm/domestic_stock/inquire_daily_itemchartprice

## 2026-11-27 추가 대안 결정
- EODHD 20회/일은 사용자의 장중 반복 분석 및 종목 확대 요구에 부족하여 가입/채택 보류. Oracle 무료 VM도 사용자 관리 부담으로 제외.
- NAVER 공식 접근 정책은 허용되지 않은 자동 수집을 제한(https://policy.naver.com/policy/disclaimer.html). 허가되지 않은 내부 API/스크래핑 도입하지 않음.
- 기존 토스/키움은 허용 IP 인증 제약 유지(https://developers.tossinvest.com/docs/auth ; https://openapi.kiwoom.com/intro/serviceInfo). 새 고정 IP 서버 설치/비용 지출 없음.
- KIS 공식 REST 시세 우선 검증 후보, LS 공식 ETF t1901/t1903 차선 후보(LS 위탁계좌 필요). 양쪽 모두 실제 개인 무료 사용, 허용 IP 정책, Cloudflare 또는 기존 GitHub Actions 실행 가능 여부, 비공개 저장 권한 및 현재 국내 10종목 실제 원주가 검증 전 활성화하지 않음. 계좌 개설은 사용자 결정.
- 별도 계좌를 원하지 않을 때: KRX 전종목 시세 및 ETF 공식 파일을 사용자가 정상 다운로드한 경우에만 일괄 가져오기 후보(https://data.krx.co.kr/). 파일 실제 컬럼/인코딩 및 날짜 확인 후 보유 종목 코드 대조, 중복/오류 차단, 기존 기록 수정 없이 별도 참고가격, 공식 API 재수신 시 대조. 반자동이므로 완전 자동 수집 해결로 판정 금지. 아직 구현/실측 없음.
- 운영 PR #1 보류 유지. 기존 시세와 원금, 분배금, 계좌 및 동기화 데이터 미변경.

## 2026-11-27 계좌 추가 없이 비상 대안 준비
- 한국투자증권 계좌 없음, 신규 계좌/서버/유료 서비스 제외. 자동 당일 공급원은 아직 미확정.
- KRX 공식 전종목 시세 화면은 당일 '종가' 항목에 애프터마켓 주가를 20분 지연 표출할 수 있다고 명시(https://data.krx.co.kr/contents/MDC/MDI/outerLoader/index.cmd?screenId=MDCSTAT015). 따라서 사용자 정상 다운로드 파일이라도 당일 정규장 종가로 인정하지 않음.
- 개발 브랜치 kr-close-file-preview-v17.mjs: 사용자 CSV의 보유 코드 일괄 대조, 중복/오류/날짜 불일치/누락 검사, UTF-8/한국어 인코딩, 날짜 미포함 시 명시, 메모리 전용. 모든 결과 공식확정=false, 정규장확정=false, 신호사용=false. 실제 파일 미확보, 합성 데이터 검증만. UI/운영가격/계좌기록/분석 연결 없음. 기존 API의 공식 확정 일봉이 우선. 사용자가 파일을 받아야 하는 반자동 대안이므로 자동화 해결은 아님.
