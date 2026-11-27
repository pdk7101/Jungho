/* Cache-bust client assets with each GitHub Pages deployment SHA. */
import fs from 'node:fs';
const file=process.argv[2]||'site/index.html';
const sha=(process.env.GITHUB_SHA||'').trim();
if(!/^[a-f0-9]{40}$/.test(sha))throw Error('GITHUB_SHA 40자리 값 확인 불가. 캐시 버전 없는 배포 중단');
const version=sha.slice(0,12);
let html=fs.readFileSync(file,'utf8');
const names=['live-prices.js','private-krx-client.js','insights.js','personal-us-live.js','us-dashboard.js','us-krw.js','us-signals.js','unattended-orders.js','portfolio-import.js','intraday-signals.js','portfolio-totals.js','personal-toss-client.js','account-summary.js','kr-dividends.js','portfolio-sync.js','dashboard-v17-extension.mjs','dashboard-unified-v17.mjs','dashboard-auto-v17.mjs'];
for(const name of names){
 const before='src="./'+name+'"';
 const previous=new RegExp('src="\\./'+name.replace('.','\\.')+'(?:\\?v=[A-Za-z0-9_-]+)?"','g');
 let found=0;
 html=html.replace(previous,()=>{found++;return 'src="./'+name+'?v='+version+'"';});
 if(found!==1)throw Error('스크립트 태그 누락/중복: '+name+' ('+found+')');
}
const payoutFile=file.replace(/index\.html$/, 'us-krw.js');
if(payoutFile===file)throw Error('분배금 버전 표기: 사이트 index 경로가 아닙니다');
let payout=fs.readFileSync(payoutFile,'utf8');
const payoutPlaceholder='PAYOUT_BUILD_PLACEHOLDER';
if(payout.split(payoutPlaceholder).length!==2)throw Error('분배금 화면 버전 치환 대상 누락/중복');
payout=payout.replace(payoutPlaceholder,version);
fs.writeFileSync(payoutFile,payout,'utf8');
html=html.replace('<!-- US_BUILD_VERSION -->','<small class="sub" id="us-ui-version">미국주식 화면 버전 '+version+'</small>');
fs.writeFileSync(file,html,'utf8');
console.log('Versioned '+names.length+' JS assets for GitHub Pages: '+version);
