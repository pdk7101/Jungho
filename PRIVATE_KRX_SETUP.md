# 개인 전용 KRX 공식 종가 연결 안내

## 현재 상태

KRX 연결 진단은 2026-11-24에 정상 확인되었습니다(6/6종목, 확인 거래일 2026-11-23). 하지만 **GitHub Actions의 `KRX_AUTH_KEY`를 공개 GitHub Pages의 JavaScript에서 직접 읽을 수는 없습니다.** 공개 사이트에 원본 종가를 저장해서도 안 됩니다.

이 저장소는 기존 매수 규칙·카드·그래프·분배금·미국 주식 기능을 그대로 유지하면서, **본인만 인증 가능한 별도 Cloudflare Worker**를 통하여 한국거래소의 ETF 확정 일봉을 조회하도록 추가했습니다. 본인 브라우저가 조회한 가격·NAV는 GitHub 저장소, Pages 정적 파일 또는 Cloudflare 영구 저장소에 보관하지 않습니다.

**중요:** KRX [공식 이용약관](https://openapi.krx.co.kr/contents/OPP/INFO/OPPINFO002.jsp) 제11조는 제공받은 정보를 제3자에게 제공하는 것을 제한합니다. 본인 전용 이용만 하세요. 특히 외부 클라우드 서버를 거치는 방식이 승인된 이용 범위에 해당하는지는 KRX에 확인한 후 사용하세요. 필요한 경우 로컬 전용 실행 방식으로 변경해야 합니다.

## 1. Cloudflare Worker 만들기

1. [Cloudflare 대시보드](https://dash.cloudflare.com/)에 로그인합니다.
2. `Workers & Pages`에서 **Create → Worker**를 선택하고 Hello World 템플릿으로 Worker를 만듭니다. 예: `my-private-krx`.
3. Worker의 **Edit code**에서 자동으로 만들어진 예제 코드를 모두 지우고 다음 파일의 전체 코드를 복사해 붙여넣습니다.

   [private-krx-etf-worker.js (개인용 KRX 서버 코드)](https://github.com/pdk7101/Jungho/blob/main/private-krx-etf-worker.js)

4. **Deploy**로 코드 반영을 마칩니다. Worker의 `https://...workers.dev` HTTPS 기본 주소를 확인합니다.

참고: [Cloudflare 공식 Worker 시작 안내](https://developers.cloudflare.com/learning-paths/workers/get-started/first-worker/).

## 2. Worker Secret 두 개 등록

Cloudflare에서 방금 만든 Worker를 선택하고 `Settings → Variables and Secrets → Add`로 이동합니다. 각 변수를 **Secret** 유형으로 등록하세요.

| Secret 이름 | 입력할 값 |
| --- | --- |
| `KRX_AUTH_KEY` | 한국거래소에서 발급받은 실제 공식 API 인증키 (GitHub에 등록한 것과 동일한 값) |
| `KRX_VIEW_TOKEN` | 본인만 아는 **별도의 새 임의 접근 암호**. 가능한 한 32자 이상 무작위 문자열 |

**KRX_VIEW_TOKEN은 KRX_AUTH_KEY와 다른 값이어야 합니다.**

본인이 Windows PowerShell에서 안전한 접근 암호를 생성하는 예제:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
([BitConverter]::ToString($bytes)).Replace("-", "")
```

이 명령은 64자리 16진수 임의 토큰을 만듭니다. **인증키와 접근 토큰은 GitHub 코드, 채팅, 사진, URL에 넣지 마세요.**

참고: [Cloudflare 공식 Secret 설정 방법](https://developers.cloudflare.com/workers/configuration/secrets/).

## 3. 원래 주식 프로그램에서 개인 연결

1. [내 ETF 6종목 프로그램](https://pdk7101.github.io/Jungho/)에 접속해 새로고침합니다.
2. 상단에 추가된 **내 전용 KRX 공식 종가 연결 (선택)**을 펼칩니다.
3. Worker HTTPS 기본 주소를 입력합니다. 끝에 `/api/krx-history`는 붙이지 않습니다.
4. 두 번째 입력칸에는 **KRX_VIEW_TOKEN**을 입력합니다. *KRX_AUTH_KEY를 입력하지 마세요.*
5. **연결 및 공식 확정 종가 조회**를 누릅니다.
6. 6종목의 검증된 공식 확정 일봉 40거래일이 모이면 기존 카드에 종가·5일선·20일선·매수판단이 표시됩니다. 장 마감 후 최신 거래일이 실제 조회돼야 다음 거래일 주문 준비가 가능합니다.

**접근 토큰 보관 (2026-11-24 변경):** 개인 기기에서는 **이 기기에 개인 접근 토큰 저장**을 체크한 채 연결하면 `KRX_VIEW_TOKEN`을 해당 브라우저의 로컬 저장소에 저장하여 **다음 방문에도 자동으로 연결·조회**합니다. 이미 세션으로 연결한 경우에도 사용자가 요청한 편의 설정을 반영하여 로컬 저장소로 이전합니다. **KRX_AUTH_KEY는 브라우저에 저장하지 않습니다.** 공용 기기에서는 체크를 해제하면 현재 탭 세션에만 접근 토큰을 보관합니다. 토큰을 영구 보관하면 해당 기기의 악성 스크립트·브라우저 확장 프로그램 또는 다른 사용자가 접근할 위험이 있으므로 개인 기기에서만 사용하세요. **개인 연결 해제**를 누르면 해당 브라우저에 저장된 개인 접근 토큰과 Worker 주소가 모두 삭제됩니다. 보유 수량·평단·분배금 기록은 별도 저장되어 그대로 유지됩니다.

**기기별 독립 저장:** 노트북과 휴대폰의 브라우저 저장소는 서로 공유되지 않습니다. 두 기기에서 각각 한 번 연결하면 그다음부터 해당 기기에서는 반복 입력이 필요 없습니다. 시크릿 모드, 브라우저 데이터 삭제, 기기 변경 시에는 다시 입력해야 합니다.

## 4. 문제 해결

| 화면 메시지 | 확인할 부분 |
| --- | --- |
| 401 / 접근 토큰 확인 실패 | Worker의 `KRX_VIEW_TOKEN`과 브라우저에 입력한 토큰 일치 여부 |
| 503 / KRX 인증키 미설정 | Worker의 `KRX_AUTH_KEY` Secret 등록 여부 |
| 502 / KRX 인증·이용 승인 | KRX 인증키 승인, ETF 일별매매정보의 별도 이용 승인, Worker에서 KRX API 연결 가능 여부 |
| 403 / 접근 경로 제한 | URL이 `https://pdk7101.github.io/Jungho/`인지 확인 (해당 출처에서만 접근 가능) |
| 일봉 40거래일 미달 | 휴장일, 일봉 수집 누락, KRX API 응답이나 호출 제한 확인 |
| 정상 호출, 카드 보류 | 공식 종가 기준일이 다음 거래일 준비에 필요한 완료 거래일과 일치하는지 확인 |

공식 데이터는 **실시간 체결가나 호가가 아니라 완료 거래일의 일별 종가**입니다. 장중 실시간 가격 서비스를 아직 연결하지 않았으므로 장중 신규 매수 판단을 임의로 확정하지 않습니다.

## 변경 범위

이번 연결에 추가된 파일은 `private-krx-etf-worker.js`, `private-krx-client.js`, `PRIVATE_KRX_SETUP.md`입니다. 기존 투자 판단 함수와 사용자 보유 기록, 미국 주식·분배금 계산 코드는 유지합니다. `index.html`, `insights.js`, GitHub Pages 배포 목록과 '당일 체결가 미연결' 안내만 개인 KRX 자료를 읽도록 최소한으로 연결했습니다.
