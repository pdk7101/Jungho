// Build only explicit v17 preview assets. No production data, credentials or live deployment.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
const dest=path.resolve('v17-validation-bundle');
const staticFiles=['index.html','live-prices.js','private-krx-client.js','insights.js','personal-us-live.js','us-dashboard.js','us-krw.js','us-signals.js','unattended-orders.js','portfolio-import.js','intraday-signals.js','portfolio-totals.js','personal-toss-client.js','account-summary.js','kr-dividends.js','portfolio-sync.js','dashboard-v17-extension.mjs','dashboard-unified-v17.mjs','dashboard-auto-v17.mjs','payout-unified-v17.mjs','registry-preview-v17.html','portfolio-recovery-preview-v17.html','registry-ui-page.mjs','registry-ui-preview.mjs','instrument-registry.mjs','legacy-registry-preview.mjs','registry-cloud-client-v17.mjs','registry-krx-client-v17.mjs','registry-valuation-v17.mjs','registry-position-client-v17.mjs','registry-consolidated-v17.mjs','portfolio-recovery-page-v17.mjs','portfolio-recovery-v17.mjs','scripts/us-close-calendar.mjs'];
const workers=['private-us-scheduled-worker-v17.js','private-krx-etf-worker.js','private-portfolio-sync-worker.js'];
await fs.rm(dest,{recursive:true,force:true});
const manifest=[];
async function write(relative,body){
 const target=path.join(dest,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,body);
 manifest.push({path:relative,sha256:createHash('sha256').update(body).digest('hex')});
}
for(const name of staticFiles){
 const body=await fs.readFile(new URL(name,root),'utf8');
 for(const match of body.matchAll(/(?:from\s+['"]|src=["'])(\.[^'"]+)['"]/g)){
  const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1]));
  if(!staticFiles.includes(dependency))throw Error('Missing preview dependency '+name+' -> '+dependency);
 }
 await write('preview/'+name,body);
}
await write('preview/us-quotes.json',JSON.stringify({market:'US',currency:'USD',isRealtime:false,fx:{ok:false},items:[],sourceNote:'Isolated preview fixture. No market price or account data.'})+'\n');
for(const name of ['quotes.json','intraday-quotes.json','metrics.json','metric-history.json'])await write('preview/'+name,JSON.stringify({ok:false,items:[],rows:[],sourceNote:'Synthetic empty fixture; no production prices or account data.'})+'\n');
execFileSync(process.execPath,['scripts/stamp-assets.js',path.join(dest,'preview/index.html')],{env:{...process.env,GITHUB_SHA:process.env.GITHUB_SHA||'0'.repeat(40)},stdio:'inherit'});
for(const name of ['preview/index.html','preview/us-krw.js']){const item=manifest.find(x=>x.path===name);item.sha256=createHash('sha256').update(await fs.readFile(path.join(dest,name))).digest('hex');}
for(const name of workers)await write('workers/'+name,await fs.readFile(new URL(name,root)));
await write('DEPLOYMENT.md',await fs.readFile(new URL('V17_DEPLOYMENT_CHECKLIST.md',root)));
await fs.writeFile(path.join(dest,'manifest.json'),JSON.stringify({schema:'v17-validation-bundle',commit:process.env.GITHUB_SHA||null,files:manifest},null,2)+'\n');
console.log('PASS: isolated preview bundle, explicit dependencies, no production account or quote files');
