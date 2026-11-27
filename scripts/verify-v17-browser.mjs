import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=path.resolve('v17-validation-bundle/preview');
const checks={
 'index.html':`const $=id=>document.getElementById(id);
 if(!$('v17-auto-status')||!$('v17-unified-panel')||!$('v17-unified-payout'))throw Error('integrated dashboard missing');
 if(!$('portfolio-sync-panel')||$('dashboard-settings').open)throw Error('sync or collapsed settings missing');
 if(!window.ISA_ACCOUNT_SUMMARY||!window.ISA_SHARED_QUOTES)throw Error('existing modules not initialized');
 if(!$('v17-auto-sync').textContent.includes('투자기록'))throw Error('automatic status missing');
 if(document.documentElement.scrollWidth>window.innerWidth+2)throw Error('mobile horizontal overflow');`,
 'registry-preview-v17.html':`const $=id=>document.getElementById(id);
 if(!$('counts').textContent.includes('15/100'))throw Error('initial render');
 $('account').value='toss-us';$('account').dispatchEvent(new Event('change'));
 $('symbol').value='QQQM';$('name').value='Synthetic test';
 $('registration').requestSubmit();
 if(!$('counts').textContent.includes('16/100'))throw Error('registration');
 const card=[...document.querySelectorAll('article')].find(x=>x.textContent.includes('QQQM'));
 if(!card)throw Error('new card missing');
 const fields=card.querySelectorAll('form input');
 fields[0].value='1.5';fields[1].value='10000';fields[2].value='200';
 card.querySelector('form').requestSubmit();
 if(!$('new-totals').textContent.includes('15,000원'))throw Error('basis total');
 if(!$('combined-totals').textContent.includes('전체 합산 보류'))throw Error('unconfirmed totals');
 if(document.documentElement.scrollWidth>window.innerWidth+2)throw Error('mobile horizontal overflow');`,
 'portfolio-recovery-preview-v17.html':`const $=id=>document.getElementById(id);
 if($('read').disabled)throw Error('backup page not initialized');
 $('read').click();
 if(!$('local-status').textContent.includes('0/18'))throw Error('empty isolated records');
 if(document.documentElement.scrollWidth>window.innerWidth+2)throw Error('mobile horizontal overflow');`
};
const server=createServer(async(req,res)=>{
 try{
  const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1);
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep))throw Error('path');
  let body=await fs.readFile(file,'utf8');
  const type=/\\.(mjs|js)$/.test(name)?'text/javascript':name.endsWith('.json')?'application/json':'text/html';
  if(Object.hasOwn(checks,name))body=body.replace('</body>',`<script>window.addEventListener('load',()=>{try{${checks[name]}document.body.setAttribute('data-smoke','PASS')}catch(e){document.body.setAttribute('data-smoke','FAIL:'+String(e.message))}});</script></body>`);
  res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'});res.end(body);
 }catch(_){res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 for(const file of Object.keys(checks)){
  const chrome=spawn(process.env.CHROME_BIN||'google-chrome',['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--window-size=390,844','--virtual-time-budget=6000','--dump-dom','http://127.0.0.1:'+server.address().port+'/'+file],{stdio:['ignore','pipe','ignore']});
  let html='';chrome.stdout.on('data',b=>html+=b.toString());
  const timeout=setTimeout(()=>chrome.kill('SIGKILL'),30000);
  const exit=await new Promise((resolve,reject)=>{chrome.on('error',reject);chrome.on('close',resolve)}).finally(()=>clearTimeout(timeout));
  assert.equal(exit,0,file+' chrome exit');
  assert.ok(html.includes('data-smoke="PASS"'),file+' '+(html.match(/data-smoke="[^"]+"/)?.[0]||'no smoke result'));
  console.log('PASS: mobile-sized browser',file);
 }
}finally{server.close();}
