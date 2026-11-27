// Isolated, local-only preview of user-exported CSV. No network/storage/write.
// The selected date is an operator assertion, NOT a verified exchange date.
// KRX same-day stock screen can display after-market prices: never use for signals.
function parseCSV(text){
 if(typeof text!=='string'||text.length>8_000_000)throw Error('CSV 크기 또는 형식 확인');
 text=text.replace(/^\uFEFF/,'');
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 const finish=()=>{row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';closed=false};
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=c;continue}
  if(c===','){row.push(cell);cell='';closed=false}
  else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;finish()}
  else if(closed)throw Error('CSV 따옴표 뒤 형식 오류');
  else if(c==='"'){if(cell)throw Error('CSV 따옴표 오류');quoted=true}
  else cell+=c;
  if(rows.length>30000||row.length>100)throw Error('CSV 범위 초과');
 }
 if(quoted)throw Error('CSV 따옴표 미종료');
 if(cell||row.length||closed)finish();
 return rows;
}
const codeOf=s=>String(s??'').trim().toUpperCase();
const validCode=s=>/^[0-9][0-9A-Z]{5}$/.test(s);
const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
function priceOf(s){
 s=String(s??'').trim();
 if(!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)$/.test(s))return null;
 const n=Number(s.replace(/,/g,''));
 return Number.isSafeInteger(n)&&n>0?n:null;
}
export function previewKRCloseFiles({files,symbols,selectedDate,now=new Date()}){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if(!validDate(selectedDate)||selectedDate>today||[0,6].includes(new Date(selectedDate+'T00:00:00Z').getUTCDay()))throw Error('조회일 확인');
 if(!Array.isArray(files)||!files.length||files.length>4||!Array.isArray(symbols)||symbols.length>100)throw Error('파일 또는 종목 범위 확인');
 const target=[...new Set(symbols.map(codeOf))];
 if(target.some(s=>!validCode(s)))throw Error('종목코드 확인');
 const found=new Map(),bad=new Set(),wanted=new Set(target);
 for(const file of files){
  const [header,...rows]=parseCSV(file);
  if(!header)throw Error('빈 CSV');
  const h=header.map(s=>s.trim());
  const i=h.indexOf('종목코드'),p=h.indexOf('종가'),d=h.findIndex(s=>['기준일','거래일','일자','조회일','날짜'].includes(s));
  if(i<0||p<0||h.filter(x=>x==='종목코드').length!==1||h.filter(x=>x==='종가').length!==1)throw Error('종목코드/종가 열 확인');
  for(const row of rows){
   if(row.length!==h.length)throw Error('CSV 열 개수 불일치');
   const symbol=codeOf(row[i]);
   if(!wanted.has(symbol))continue;
   const close=priceOf(row[p]);
   const rawDate=d>=0?String(row[d]).trim():null;
   const rowDate=rawDate&&/^\d{8}$/.test(rawDate)?rawDate.slice(0,4)+'-'+rawDate.slice(4,6)+'-'+rawDate.slice(6):rawDate;
   if(!close||(d>=0&&rowDate!==selectedDate)||found.has(symbol)){bad.add(symbol);found.delete(symbol);continue}
   if(!bad.has(symbol))found.set(symbol,{symbol,close,selectedDate,rowDate:rowDate||null,currency:'KRW',source:'사용자 제공 CSV',officialConfirmed:false,regularSessionConfirmed:false,signalEligible:false});
  }
 }
 const items=target.map(symbol=>found.get(symbol)||{symbol,error:bad.has(symbol)?'duplicate_or_invalid':'missing',close:null,signalEligible:false});
 return {selectedDate,officialConfirmed:false,regularSessionConfirmed:false,signalEligible:false,items,matched:found.size,requested:target.length};
}
export function decodeKRCloseCSV(bytes){
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}
 catch{return new TextDecoder('euc-kr',{fatal:true}).decode(bytes)}
}
