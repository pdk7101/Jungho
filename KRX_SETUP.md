# 국내 ETF 공식 시세 연결 안내

이 프로그램은 **한국거래소(KRX) ETF 일별매매정보 OPEN API**만으로 국내 6종목의 확정 종가, 거래량, 5·20일 이동평균선, NAV·시가총액 및 최근 중요 변화를 산출합니다.

## 연결에 필요한 작업 (최초 1회)

1. [한국거래소 KRX OPEN API](https://openapi.krx.co.kr/contents/OPP/MAIN/main/index.cmd)에서 본인 계정으로 인증키를 신청하고 관리자의 승인을 받습니다.
2. `서비스 이용 → 증권상품 → ETF 일별매매정보`도 별도로 이용 신청하고 승인을 받습니다. 인증키만으로는 데이터를 읽을 수 없습니다.
3. 개인 GitHub 저장소 `pdk7101/Jungho`의 **Settings → Secrets and variables → Actions → New repository secret**에서 이름이 `KRX_AUTH_KEY`인 저장소 Secret을 등록합니다. 인증키를 코드·채팅·공개 파일에 쓰지 마세요.
4. GitHub **Actions → Free ISA ETF daily update and GitHub Pages deploy → Run workflow**를 실행합니다. 첫 수집은 최근 40거래일 이상 공식 일봉을 검증합니다. 이후 정기 실행으로 누적됩니다.
5. [프로그램 열기](https://pdk7101.github.io/Jungho/) 후 마지막 수집 시각과 확정 일봉 기준일을 확인합니다.

## 자료 출처와 표시 기준

- 공식 원본: [KRX ETF 일별매매정보 개발명세](https://openapi.krx.co.kr/contents/OPP/USES/service/OPPUSES003_S2.cmd?BO_ID=nrEpCLaZpoLCTzPUMxuF)
- **확정 종가**는 *거래소가 게시한 완료 거래일의 가격*입니다. 장중 호가·실시간 체결가와 다릅니다.
- 국내 ETF 장중 실시간 시세는 인증된 증권사 API가 연결되지 않아 표시하지 않습니다. 보류/중지/매수 신호를 임의 추정하지 않습니다.
- **중요 변화**는 7일 이내의 최신 공식 확정 거래일에 새로 발생한 위험·기회 신호만 나타납니다. 과거 변화 기록을 반복 표시하지 않습니다.
- 매수·중지·보류 로직, 사용자 수량·평단, 분배금 입력, 미국 주식 데이터 및 주문 설정은 변경하지 않습니다.
- 가격 자동 조회는 주문 실행을 의미하지 않으며, 실제 지정가·자동매수 상태는 키움증권에서 확인해야 합니다.

공식 KRX API가 인증 실패하거나 데이터를 제공하지 않으면 프로그램은 해당 종목을 **KRX 공식 종가 확인 보류**로 표시합니다. 인증·갱신 오류를 고친 뒤 다시 실행해야 합니다.

**참고:** KRX 데이터 재배포·이용 범위는 본인의 API 이용 승인과 약관에 따릅니다. 공개 GitHub Pages에서 데이터 표시가 허용되는지도 이용 조건을 확인해야 합니다.
