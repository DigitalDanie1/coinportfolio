# 코인 포트폴리오

관심 종목의 시세·차트·뉴스를 자동으로 갱신하고, 보유 수량·Thesis·Conviction은 브라우저에만 저장하는 개인용 포트폴리오 트래커입니다.

**배포:** [coinportfolio-smoky.vercel.app](https://coinportfolio-smoky.vercel.app) · Vercel Serverless Functions (`/api/*.mjs`)

## 특징

- **자동 시세 갱신** — 시세·차트·옵션 현재가·PERP 시장 정보를 1분 간격, 뉴스는 15분 간격으로 갱신. 숨긴 탭은 새 요청을 멈추고 돌아왔을 때 갱신.
- **실패 시 안전** — 갱신 실패 시 30초→최대 5분으로 재시도 간격을 늘리며, 이전 값과 "저장 데이터" 표시를 유지. `지금 갱신`으로 즉시 재시도 가능.
- **로컬 우선 데이터** — 보유 수량·평단·Thesis·Conviction·시나리오·회고는 브라우저 `localStorage`(`coin-portfolio-v2`)에만 저장. 서버는 상태를 갖지 않음(공개 시세 캐시 제외).
- **정확한 종목 식별** — 같은 티커를 쓰는 밈코인·동명 토큰을 임의로 선택하지 않고, 모호할 때만 사용자에게 확인을 요청.
- **DEX 페어 지원** — CoinGecko/CoinPaprika에 없는 토큰은 DEX Screener 페어(체인·풀·토큰 주소)로 직접 연결.
- **JSON 백업** — `자동 연결` 패널에서 전체 데이터를 JSON으로 내보내거나 다른 기기에서 불러오기.

## 데이터 소스

| 데이터 | 제공자 / 동작 |
|---|---|
| 코인 ID·공식 명칭·티커 | CoinGecko 목록의 정확한 프로젝트 식별, 필요 시 CoinPaprika |
| 시세·24시간 변동·마켓캡·로고·7일 차트 | CoinGecko, 장애 시 CoinPaprika 대체(일별 시계열, 출처 표시) |
| DEX 전용 토큰 시세·차트 | DEX Screener(지정한 체인·풀·토큰 주소), 7일 캔들은 GeckoTerminal, 미제공 시 연결 이후 관측 기록 |
| USD 상장 주식 가격·차트 | Yahoo Finance 공개 차트 응답(전일 대비 변동률). 비공식 엔드포인트로 응답이 제한될 수 있음 |
| 뉴스 | Google News RSS, 종목별 최근 7일 최대 8개 기사. 로드 시 모든 종목을 한 번에(최대 40개씩 묶어) 요청 |
| 옵션 현재가·승수·IV·Greeks | Deribit 공개 API. 거래소·기초자산·만기·행사가·Call/Put이 정확히 일치하는 계약만. USD 프리미엄은 현물 index_price로 환산 |
| PERP 마크 가격·시간당 펀딩 | Hyperliquid 공개 시장 API |
| PERP 계좌 포지션·수량·진입가·증거금·레버리지·청산가·미실현 손익 | `자동 연결`에 입력한 Hyperliquid 공개 계좌 주소를 읽기 전용 API로 조회 |
| 시장 심리·BTC 동향·환율 | Fear & Greed Index, CoinGecko BTC, 환율 API |

시세를 어디서도 찾지 못한 종목(예: 상장 전 자산)은 "거래소 상장 전 · 공개 시세 없음"처럼 원인을 표시하고, 종목 식별이 애매한 경우는 후보 목록에서 직접 고르도록 안내합니다.

## 프라이버시

- Thesis·Conviction·시나리오·회고는 자동 동기화 응답으로 절대 덮어쓰지 않으며, 뉴스·시세 API 요청에도 포함되지 않습니다.
- 시세·뉴스·차트 API에는 종목 식별 정보(이름/티커/ID)만 전송하고 수량·진입가·평단은 전송하지 않습니다.
- Hyperliquid 계좌 연결은 입력한 **공개 주소만** 조회 API에 전달합니다. 서명·주문 권한은 사용하지 않으며, 비밀키를 입력하는 화면 자체가 없습니다.
- 계좌 조회 결과(`private:` 캐시)는 디스크에 저장하지 않습니다. 공개 시장 데이터만 캐시됩니다.

## 로컬 개발

배포본은 Vercel Serverless Functions로 동작하지만, 로컬에서는 `server.mjs`(동일한 `lib/data-service.mjs`를 사용하는 단일 HTTP 서버)로 실행합니다.

```sh
node server.mjs        # 또는 ./start.command
```

- Node.js 20.11 이상 필요, 별도 패키지 설치 없음.
- `127.0.0.1:8787`에서만 수신(Origin·Host 검증).
- `http://127.0.0.1:8787`로 열면 `file://`로 연 기존 페이지와 저장소 출처가 달라 보유 기록이 자동으로 옮겨지지 않습니다.

## 테스트

```sh
node tests/position-tools.test.cjs   # 테이블 렌더링, 저장/불러오기, 포지션 폼
node --test tests/data-service.test.mjs  # 종목 식별, 캐시/백오프, 뉴스 배칭, DEX/옵션/계좌 어댑터
node tests/auto-sync.test.cjs        # 자동 동기화 오케스트레이션, 계좌 병합, 오프라인 유지
node tests/farming-pairs.test.cjs    # Farming 페어 계산과 검증
```

자동 동기화·Thesis/Conviction 보호·옵션 통화 환산·계좌 포지션 병합·캐시/백오프·뉴스 파싱·배칭을 검증합니다. 로컬 API의 실제 시세·뉴스·옵션·PERP 수신과 화면 동작은 브라우저로 별도 확인했습니다.

## 파일 구조

```
index.html              메인 페이지(레이아웃 + 인라인 스크립트)
position-tools.js       테이블 렌더링, 포지션 폼, 저장/불러오기
auto-sync.js            자동 갱신 주기, 뉴스, 계좌 병합, 백업 export/import UI
journal-view.js         Thesis/Conviction 저널 뷰
dex-imports.js          검증된 DEX 페어 1회성 마이그레이션
farming-pairs.js        DEX PERP Farming 페어 작업공간
sector-chart.js / compare-chart.js / bubble-chart.js   분석 탭(섹터/비교/버블)
refinement.css           비주얼 테마 · 반응형 레이아웃
server.mjs               로컬 개발용 HTTP 서버(Vercel 없이 실행)
lib/data-service.mjs      제공자 어댑터, 종목 식별, 캐시, 오류 시 저장 데이터 유지 — server.mjs와 api/*가 공유
api/*.mjs                 Vercel Serverless Functions (markets, chart, news, options, perps, pulse, dexsearch, account/hyperliquid, health)
tests/                     node:test / node:assert 기반 테스트
.data/public-cache.json   로컬 개발 시 공개 시장 데이터 캐시(계좌 조회 결과는 저장 안 함)
```

## 참고 문서

[CoinPaprika 시계열 API](https://docs.coinpaprika.com/api-reference/tickers/get-historical-ticks-for-a-specific-coin) · [Deribit 시장 데이터](https://docs.deribit.com/api-reference/market-data/public-get_book_summary_by_currency) · [Hyperliquid PERP API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals) · [DEX Screener API](https://docs.dexscreener.com/api/reference) · [TradingView Advanced Chart](https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/)

## 종목 연결이 더 필요한 경우

- 같은 티커를 쓰는 밈코인은 임의로 선택하지 않습니다. `자동 연결`의 `종목 식별 필요`에서 정확한 프로젝트를 한 번 선택하면 이후 자동 갱신됩니다. 검색 결과가 없는 토큰은 컨트랙트 주소 또는 정확한 식별자가 필요합니다.
- Hyperliquid 외 거래소의 보유 수량·진입가, 주식 계좌, 실제 옵션 보유 포지션은 계좌 연결 기능이 아직 없어 수동으로 기록합니다. 옵션의 공개 시세 연동과 개인 계좌의 보유 포지션 수집은 서로 다른 기능입니다.
- Farming의 누적 수수료·확정 보상·미확정 포인트는 해당 계좌/프로토콜 소스가 없으면 `미입력`/`미연결`로 남깁니다. Hyperliquid 연결 포지션의 손익은 거래소가 제공한 미실현 손익 그대로이며, 수수료·보상·포인트를 추정하거나 합산하지 않습니다.
- 자동 시세가 없는 옵션은 기존 수동 기록을 유지하며 상태만 표시합니다. 자동 만기 정산은 하지 않습니다.
- Farming·옵션은 현물 자산 합계에 포함하지 않습니다. 연결 계좌의 종료된 포지션은 숨기되 Thesis·Conviction은 기록에 보관합니다.

## 시나리오 · 차트 · DEX 작업공간

- 상단 **나의 시장 시나리오**는 여러 자산의 예상 흐름·목표·조정 구간·무효화 조건을 자유롭게 쓰는 칸입니다. 입력 즉시 저장되며 자동 시세·계좌 동기화가 내용을 바꾸지 않습니다.
- 표의 작은 차트를 클릭하면 큰 차트 창이 열립니다. 확인된 거래소 페어는 TradingView 위젯에, 확인된 토큰 컨트랙트는 DEX Screener 페어에 연결합니다. 위젯이 막히면 외부 링크로 열 수 있습니다. 종목 식별이 불확실하면 다른 코인의 차트를 임의로 띄우지 않습니다.
- `dex-imports.js`는 검증된 DEX 페어를 최초 1회만 적용하는 마이그레이션입니다(`appliedImports`로 재적용 방지). 이후 삭제한 종목은 새로고침해도 되살아나지 않습니다(`removedDefaults`로 추적).
- `farming-pairs.js`(DEX PERP Farming 작업공간)는 같은 기초자산의 롱/숏 거래소 페어를 기록합니다. 순수량·수량 차이·포인트당 비용을 계산하며, 서로 다른 프로그램의 포인트를 합산하거나 수익으로 환산하지 않고, 거래 주문을 실행하지도 않습니다.

## 백업

`자동 연결` 패널의 **데이터 백업**에서:

- **JSON으로 내보내기** — 보유 종목·Thesis·Conviction·시나리오·회고를 포함한 전체 상태를 `coin-portfolio-backup-YYYY-MM-DD.json`으로 다운로드.
- **JSON 파일 불러오기** — 다른 기기에서 내보낸 파일을 선택하면 항목 수 요약을 보여주고, 확인 후 현재 데이터를 교체합니다.

서버로는 전송되지 않는 클라이언트 전용 기능입니다.

### 거래소 두 곳을 눌러 페어 만들기

DEX PERP 상단의 10개 심볼은 외부 사이트 링크가 아닌 선택 버튼입니다. 첫 클릭으로 거래소를 선택하고 다른 미연결 거래소를 누르면 별도 입력 없이 페어가 생성·저장됩니다. 첫 거래소는 Long, 두 번째는 Short로 시작하며 최대 5개의 활성 페어를 구성합니다. 종목·수량은 이후 `종목·수량 설정`에서 입력합니다. 같은 버튼을 다시 누르거나 선택 취소로 첫 선택을 취소할 수 있습니다.

이미 연결된 거래소는 다른 페어에 중복 사용되지 않습니다. 연결된 심볼을 단독 클릭하면 기존 페어 설정이 열립니다. `페어 해제`는 해당 기록을 `archived: true`로 보관해 거래소를 재선택할 수 있게 합니다. 해제한 기록은 하단 보관함에서 확인하며 백업에도 포함됩니다. 기존 사용자 페어는 유지하고, 예전의 기본 3페어 자동 재생성은 중단했습니다. 새 브라우저는 빈 5개 슬롯으로 시작합니다. Long/Short 전환은 수동 기록에만 적용하며 계좌에 연결된 실제 방향은 변경하지 않습니다. 주문은 실행하지 않습니다.

페어 목록은 넓은 화면에서 3열(5페어는 2행), 중간 화면에서 2열, 모바일에서 1열 카드로 표시합니다. 기본 카드에는 거래소·수량·순수량·사용 지갑을 표시하고 포인트·비용·전략과 페어 해제는 펼침 영역에 둡니다. 각 거래소의 `사용 지갑`은 이름 또는 주소를 자유 입력하며 즉시 로컬 저장됩니다. 이 메모는 계좌 연결이나 주문을 실행하지 않습니다. Long/Short 전환 시 거래소와 함께 이동하고, 페어 보관 및 JSON 백업에도 유지됩니다. 자동 갱신은 지갑 입력 중인 카드 DOM을 교체하지 않습니다.

파밍 목록에 TitanX(https://waitlist.titanx.cc/)와 Derpetual(https://www.derpetual.com/)을 추가했습니다. 공식 사이트의 favicon을 사용하며 기존과 동일하게 심볼 선택으로 페어를 구성합니다. 총 12개 거래소 / 최대 6페어이며, 여섯 번째 페어에도 별도 색상이 적용됩니다. 기존 페어와 지갑 기록은 유지됩니다. 목록 추가는 계좌·포인트 API 자동 연결을 의미하지 않습니다.

### 카테고리별 상승·하락 요약

개별 비교 화면의 종목 나열을 카테고리 카드로 바꿨습니다. 각 카드에서 선택 기간(24시간 / 7일)의 최대 상승·최대 하락 종목, 상승·하락·보합 개수, 데이터 집계 범위를 표시합니다. 전체 종목은 펼쳐서 상승률 높은 순 또는 하락률 큰 순으로 확인합니다. 실제 양수/음수 종목이 없으면 해당 방향의 종목 없음으로 표시하며 미수신·지연 데이터는 순위에서 제외합니다. 이 순위는 저장된 관심 목록 기준이며 전체 시장 순위가 아닙니다.

순위는 공급자의 기간별 변동률 필드를 사용하고 부분 수집 가격 기록에서 임의로 7일 변동률을 만들지 않습니다. 비교 차트는 수신된 시계열의 첫 값을 0%로 환산하므로 별도로 구분하고, 타임스탬프가 없는 배열에는 달력 날짜를 붙이지 않습니다. 검증: `node tests/compare-chart.test.cjs`.

비교 차트에는 `종합 · 전체 종목`, `내가 선택한 종목`, `카테고리별 차트` 세 가지 보기가 있습니다. 종합은 수신된 모든 종목 시계열을 겹쳐 표시하고, 직접 선택한 종목은 별도 선택 상태를 사용합니다. 카테고리별 보기는 각 카테고리의 다중 티커 차트를 그리드로 표시합니다. 각 차트 범례의 티커 버튼과 모두 보기/숨김은 해당 차트에만 적용됩니다. 티커 색은 세 보기에서 일치하며, 갱신 중에도 보기와 선택을 유지합니다(페이지를 새로고침하면 기본값). 미수신 시계열은 그리지 않고 지연 데이터는 점선으로 표시합니다. 종목이 많은 차트는 겹치는 끝점 라벨 대신 전체 티커 범례를 사용합니다. 정규화 수신 기록 비교이며, 기록 기간 차이를 명시합니다.
