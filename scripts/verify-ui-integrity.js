/** Regression guard for duplicate UI, stale official-data labels and missing components.
 * No personal account, API token, live quotes, or external API are read. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html');
const boundary=html.indexOf('<script>\n(function(){');
assert.ok(boundary>0,'main application inline script present');
const markup=html.slice(0,boundary);
const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
assert.ok(ids.length>=90,'existing page controls and payout panels retained');
assert.equal(new Set(ids).size,ids.length,'every static HTML id must be unique');
const srcs=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(x=>x[1].split('?')[0]);
assert.ok(srcs.length>=13,'Korean, US, dividends and account components retained');
assert.equal(srcs.length,new Set(srcs).size,'no duplicated external script tags');
for(const src of srcs){
 assert.ok(src.startsWith('./')&&fs.existsSync(new URL('../'+src.slice(2),import.meta.url)),
  'referenced script exists in repository: '+src);
}
const inline=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.ok(inline.length>=10,'existing inline functionality not removed');
for(const [i,item] of inline.entries())assert.doesNotThrow(()=>new vm.Script(item[1],{filename:'index-inline-'+i}),
 'inline script parse error at '+i);
const required=[
 'id="account-summary"','id="account-dividend-total"','id="account-show-editor"','id="account-broker-compare"',
 'id="positions"','id="kr-div-symbol"','id="kr-div-records"',
 'id="us-cards"','id="us-krw-editor"','id="us-live-secret"',
 'id="krx-private-connect"','id="krx-private-remember"',
 'id="funds"','id="plan"','id="etf-flow-list"'
];
for(const control of required)assert.ok(markup.includes(control),'existing control must remain: '+control);
assert.ok(markup.includes('계좌·분배금 기록은 이 브라우저에만 저장')&&
 markup.includes('id="account-summary-recalc"')&&
 markup.includes('↻ 전체 최신정보 조회')&&
 markup.includes('id="account-live-state"')&&
 markup.includes('id="account-connect-broker"')&&
 markup.includes('<details id="account-details"'),
 'one-tap automated overview flags per-browser Toss connection and hides legacy manual calculation details');
assert.ok(markup.includes('공식 확정 종가')&&html.includes('KRX 공식 확정 일봉 기준 주문 준비'),
 'dated Korean completed closes must be labeled correctly');
assert.ok(!html.includes('비공식 게시 일봉 기준')&&
 !html.includes('비공식 시가총액 및 NAV를 이용한 근삿값')&&
 !html.includes('네이버 직접 조회')&&
 !html.includes('참고 확정 일봉: '),
 'remove obsolete or duplicated official-quote and NAV descriptions');
assert.ok(!html.includes('.change-mini{'),
 'unused duplicated per-card change styles must not reappear');
const toss=read('portfolio-totals.js'),account=read('account-summary.js');
assert.ok(toss.includes("priceMode='broker-manual'")&&
 toss.includes("before[account]!=='manual'")&&
 account.includes("brokerNote.textContent='토스 앱 직접 입력")&&
 account.includes("$('account-show-editor')?.addEventListener"),
 'broker direct prices stay separate from mixed-date estimates and manual account values remain authoritative');
const insights=read('insights.js');
assert.ok(insights.includes('중요 변화 · 이번 일봉에서 새로 발생한 신호')&&
 insights.includes('const important=allowed.filter'),
 'important material changes still deduplicated');
assert.ok(!insights.includes("querySelectorAll('#funds .change-mini')"),
 'obsolete duplicated card-cleanup logic removed');
assert.ok(insights.includes('목표 계산용 주당 월 분배금 기록'),
 'SOL per-share payout projections distinguished from actual receipts');
const workflow=read('.github/workflows/pages.yml');
assert.ok(workflow.includes('private-krx-client.js')&&
 !workflow.includes('cp private-krx-etf-worker.js'),
 'public website carries only client and no private Worker code');
const quotes=JSON.parse(read('quotes.json')),metrics=JSON.parse(read('metrics.json'));
assert.ok(quotes.items.every(x=>!x.ok)&&metrics.items.every(x=>!x.ok),
 'public static site cannot redistribute KRX prices or NAV');
console.log('PASS: unique UI ids / JS imports, script syntax, preserved holdings and dividend panels, deduplicated official-data labels, private KRX publication');
