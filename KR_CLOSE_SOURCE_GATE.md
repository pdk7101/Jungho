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
