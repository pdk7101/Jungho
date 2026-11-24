# 토스증권 공식 잔고 자동 조회 — 휴대폰 우선, 노트북 공용

## 동작과 제한 (2026-11-24)

- 기존 주식 프로그램: https://pdk7101.github.io/Jungho/
- **휴대폰**: 같은 웹 주소에서 ‘토스증권 공식 계좌 자동 조회’를 펼치고 개인 서버 주소 + 조회암호를 최초 1회 등록합니다. 재방문하면 자동으로 토스 공식 API의 보유종목·평가액을 가져옵니다.
- **노트북**: 같은 주소에서 동일한 개인 서버 주소와 **별도 조회암호**를 한 번 입력합니다. 이후에는 해당 브라우저에서 재방문 자동 조회합니다.
- 두 기기는 같은 토스 계좌를 직접 조회합니다. **휴대폰·노트북 사이에 분배금과 기존 수동 보유메모를 동기화하지는 않습니다.** 이들은 종전대로 브라우저별 저장입니다.
- **실제 토스 Client ID/Client Secret은 휴대폰·노트북 웹페이지, GitHub 파일, Cloudflare KRX Worker에 절대 넣지 않습니다.** 본인만 운영하는 서버의 비밀 환경변수에서만 읽습니다.
- **주문 기능 없음**: 서버는 토스 API `POST /oauth2/token`, `GET /api/v1/accounts`, `GET /api/v1/holdings`, `GET /api/v1/exchange-rate`만 호출합니다. 주문 API 호출이 없습니다.
- **토스 IP 제한:** 토스증권 WTS의 Open API 설정에서 서버의 **고정 공인 IPv4**를 허용 IP에 등록해야 합니다. 일반 Cloudflare Worker는 인터넷으로 나가는 IP가 고정되어 있다고 보장할 수 없으므로 기존 KRX Worker에 토스 인증키를 추가하는 식으로는 해결하지 않습니다.
- **데이터 차이:** 공식 보유잔고 응답은 국내 KRW와 미국 USD를 **별도로** 합산합니다. 토스 공식 표시 환율(USD→KRW)을 읽은 경우에만 원화 참고 환산을 계산합니다. 이 값은 토스 앱의 예상 수수료/세금과 환전 방식이 다를 수 있으며 **토스 앱과 같은 원 단위 잔고를 보장하지 않습니다**. 환율이 없으면 원화 전체 합계를 만들지 않습니다.

공식 사양:
- [토스증권 Open API 홈페이지](https://home.tossinvest.com/ko/open-api)
- [공식 OpenAPI 스키마](https://openapi.tossinvest.com/openapi-docs/latest/openapi.json)
- [토스 Open API 인증/허용 IP 설명](https://developers.tossinvest.com/docs/auth)

## 준비물

1. 토스증권 Open API 발급 완료 (Client ID, Client Secret). **이 파일이나 GitHub에 값 입력 금지**
2. 외부 접속이 가능한 **고정 공인 IPv4를 가진 본인 전용 VPS 또는 정적 egress 서버** (서비스 이용료가 발생할 수 있음)
3. 서버에 연결할 본인 도메인 + HTTPS. 권장 Caddy 리버스 프록시.
4. 본인만 아는 64자 이상의 랜덤 조회 암호(`TOSS_VIEW_TOKEN`), 토스 Client Secret과 서로 다르게 생성.

### 스마트폰만으로 가능한가?

서버 세팅을 완료하고 나면 **일상적인 조회·종목 분석은 스마트폰만으로 가능합니다**. 최초 서버 개설, 도메인/HTTPS, 토스 Open API 설정은 PC에서 하는 편이 편리하며, 웹호스팅 업체가 관리자 화면을 지원하면 모바일에서 설정할 수도 있습니다. `workers.dev` 주소만 발급받았다고 토스의 고정 출구 IP 요건이 충족되지는 않습니다.

## 서버 구성

1. 고정 공인 IPv4 VPS에서 Node.js 22 이상 설치.
2. 이 저장소의 `toss-bridge/toss-readonly-server.mjs` 파일을 **VPS**로 복사합니다.
3. 아래 세 환경변수를 VPS의 비공개 구성에 추가합니다. 절대 웹 소스, 채팅, 공개 저장소에 값 입력 금지:

   ```text
   TOSS_CLIENT_ID=<토스 WTS에서 발급한 본인 Client ID>
   TOSS_CLIENT_SECRET=<토스 WTS에서 발급한 본인 Client Secret>
   TOSS_VIEW_TOKEN=<별도로 만든 64자 이상 임의 문자열>
   ```

   예: Linux VPS에 `/etc/jungho-toss.env`를 root 전용(파일 권한 600)으로 작성한 뒤 Systemd의 `EnvironmentFile`에서만 참조합니다. 실제 파일은 **절대 GitHub에 업로드하지 않습니다**.

4. 서비스는 VPS에서 `127.0.0.1:8788`에만 바인드합니다. 외부에 8788 포트 직접 개방 금지.
5. HTTPS가 있는 리버스 프록시(Caddy/nginx)로 `https://본인도메인` → `127.0.0.1:8788`을 연결합니다. 인증서와 방화벽을 반드시 확인합니다.
6. 토스증권 WTS **설정 → Open API → 허용 IP 관리**에 **VPS의 고정 공인 IPv4**를 등록합니다. 집/휴대폰의 IP나 Cloudflare UI 주소가 아닙니다.

Systemd 서비스 예시(서버 경로는 실제 환경에 맞게 수정):

```ini
[Unit]
Description=Personal Toss read-only bridge
After=network-online.target

[Service]
Type=simple
User=tossbridge
WorkingDirectory=/opt/jungho
EnvironmentFile=/etc/jungho-toss.env
ExecStart=/usr/bin/node /opt/jungho/toss-bridge/toss-readonly-server.mjs
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

Caddy HTTPS 예시 (`toss.example.com`은 본인 DNS 도메인으로 교체):

```caddy
toss.example.com {
    reverse_proxy 127.0.0.1:8788
}
```

**CORS 허용 주소는 코드에 이미 https://pdk7101.github.io 로 제한**했습니다. 하지만 CORS만으로 보안이 되는 것은 아니므로 `TOSS_VIEW_TOKEN`과 HTTPS가 반드시 필요합니다. 공용 기기에는 토큰을 저장하지 않습니다.

## 스마트폰 연결

1. https://pdk7101.github.io/Jungho/ 을 열고 새로고침.
2. **토스증권 공식 계좌 자동 조회 · 휴대폰/노트북 공용**을 펼칩니다.
3. **내 전용 조회 서버 HTTPS 주소**: 서버의 실제 URL (예: `https://toss.example.com`).
4. **개인 조회 암호**: VPS 환경변수 `TOSS_VIEW_TOKEN` (토스 공식 API Client Secret이 아님).
5. 개인 휴대폰이면 **이 개인 기기에 조회 암호 기억** 체크 후 **공식 계좌 연결**.
6. `토스 공식 보유잔고 N종목` 메시지와 실제 보유 수량·평단·평가액을 확인합니다. 페이지 재방문 시 자동 조회됩니다.
7. 노트북에서는 같은 웹 주소, 같은 서버 URL과 같은 조회암호를 **노트북 브라우저에 최초 한 번** 등록합니다. 키움 KRX 조회 기능과 별도로 운영됩니다.

**중요:** 자동 조회가 실패했다고 이전 사진 합계를 실제 최신 잔고라고 표시하지 않습니다. 마지막에 사용자가 저장한 수동 계좌액/참고 계산으로 되돌아가며 날짜와 출처를 구분합니다. 보유 수량·배당금 수동 기록은 덮어쓰지 않습니다.

## 보안 및 장애 진단

- `401`: 개인 조회암호가 서버 `TOSS_VIEW_TOKEN`과 다름
- `403`: 다른 사이트에서 접근. URL은 반드시 `pdk7101.github.io/Jungho/`
- `502`: 서버 비밀키, 토스 WTS IP 허용, 토스 API 이용/점검/응답 형식을 확인
- `429`: 공식 API 호출 제한
- 환율 미제공: **원화 총합 보류**하고 국내 KRW·미국 USD 별도 표시
- VPS가 꺼지거나 공인 IP가 변경됨: 자동 조회 불가
- HTTPS 인증서 오류: 임시 HTTP로 낮추지 말고 인증서/도메인 설정 해결
- 사용자 기기 분실: VPS의 `TOSS_VIEW_TOKEN`을 교체하고 토스 공식 Client Secret도 필요하면 재발급

현재 GitHub 저장소에는 서버의 **예시 소스만** 있습니다. 이 파일을 GitHub Pages에 업로드하지 않으며, VPS 개설 및 실토스 계좌 통신은 별도로 진행해야 합니다.

토스 Open API 응답에는 **해외 옵션·채권이 포함되지 않는다는 제한**이 있으므로, 해당 자산을 보유한 경우 토스 전체 자산과 차이가 발생할 수 있습니다.
