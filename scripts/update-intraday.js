/* Official-only rule: KRX's daily-bar API is NOT a real-time trade feed.
 * No Naver or unverified intraday prices are published as verified trades. */
import fs from 'node:fs/promises';
const now=new Date();
const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{
 timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
}).formatToParts(now).map(x=>[x.type,x.value]));
await fs.writeFile(new URL('../intraday-quotes.json',import.meta.url),
 JSON.stringify({fetchedAt:now.toISOString(),kstDate:p.year+p.month+p.day,
  source:'KRX 공식 확정 종가 전용 · 인증된 장중 시세 미연결',
  verified:false,items:[],reason:'장중 호가·체결가를 제공할 승인된 증권사 API가 연결되지 않았습니다.'},null,2)+'\n');
console.log('공식 장중 시세 미연결: 임의 가격을 게시하지 않습니다.');
