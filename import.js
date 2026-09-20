/* import.js — сканер, OCR, парсеры списков */
let scanCb=null,scanTimer=null,scanStream=null,h5=null,impTarget=null,impDrafts=[];
function openScan(cb){scanCb=cb;dlgScanShow();
if('BarcodeDetector' in window){scanVid.style.display='';_scanMsg('Наведите камеру на код DataMatrix');
navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(st=>{scanStream=st;scanVid.srcObject=st;
const bd=new BarcodeDetector({formats:['data_matrix','qr_code']});
scanTimer=setInterval(async()=>{try{const r=await bd.detect(scanVid);if(r.length){const p=parseGS1(r[0].rawValue);stopScan();scanCb&&scanCb(p)}}catch(e){}},400)})
.catch(()=>_scanMsg('Нет доступа к камере'));return}
scanVid.style.display='none';_scanMsg('Загрузка сканера…');
new Promise((res,rej)=>{if(window.Html5Qrcode)return res();const s=document.createElement('script');
s.src='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';s.onload=res;s.onerror=()=>rej(new Error('нет сети'));document.head.appendChild(s)})
.then(()=>{let w=document.getElementById('scanWrap');if(!w){w=document.createElement('div');w.id='scanWrap';scanVid.parentNode.insertBefore(w,scanVid.nextSibling)}
w.innerHTML='';h5=new Html5Qrcode('scanWrap');
return h5.start({facingMode:'environment'},{fps:10,qrbox:{width:220,height:220}},txt=>{const p=parseGS1(txt);stopScan();scanCb&&scanCb(p)},()=>{})})
.then(()=>_scanMsg('Наведите камеру на код DataMatrix')).catch(e=>_scanMsg('Сканер недоступен: '+e.message))}
function dlgScanShow(){openDlg(`<h3>Сканер</h3><video id="scanVid" autoplay playsinline style="width:100%;border-radius:10px"></video><p id="scanMsg" style="font-size:13px;color:var(--mut)"></p><p><button class="btn sec" onclick="stopScan()">Закрыть</button></p>`)}
function _scanMsg(t){const e=document.getElementById('scanMsg');if(e)e.textContent=t}
function stopScan(){clearInterval(scanTimer);if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null}
if(h5){try{h5.stop().then(()=>h5.clear())}catch(e){}h5=null}closeDlg()}
function parseGS1(v){v=v.replace(/^\]..?/,'');const L={'01':14,'17':6};const out={};let i=0;
while(i<v.length-1){const ai=v.slice(i,i+2);i+=2;let val;if(L[ai]){val=v.slice(i,i+L[ai]);i+=L[ai]}else{let j=v.indexOf('\x1d',i);val=j<0?v.slice(i):v.slice(i,j);i=j<0?v.length:j+1}out[ai]=val}
if(out['17'])out.expiry=expFrom17(out['17']);if(out['10'])out.batch=out['10'];if(out['01'])out.gtin=out['01'];return out}
function expFrom17(v){if(!/^\d{6}$/.test(v))return'';let yy=+v.slice(0,2),mm=+v.slice(2,4),dd=+v.slice(4,6);
let y=yy<50?2000+yy:1900+yy;if(mm<1||mm>12)mm=12;const last=new Date(y,mm,0).getDate();if(dd<1||dd>last)dd=last;
return y+'-'+String(mm).padStart(2,'0')+'-'+String(dd).padStart(2,'0')}
/* ===== OCR / файлы ===== */
function loadTess(){return new Promise((res,rej)=>{if(window.Tesseract)return res();const s=document.createElement('script');
s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=res;s.onerror=()=>rej(new Error('нет сети для OCR'));document.head.appendChild(s)})}
function ocrFile(f){if(!f)return;impMsgEl('Загрузка распознавания…');
loadTess().then(()=>Tesseract.recognize(f,'rus+eng',{logger:m=>{if(m.progress!==undefined)impMsgEl('Распознавание: '+Math.round(m.progress*100)+'%')}}))
.then(r=>{impText.value=r.data.text;doParse()}).catch(e=>impMsgEl('Ошибка OCR: '+e.message))}
function readTxt(f){if(!f)return;const r=new FileReader();r.onload=()=>{impText.value=r.result;doParse()};r.readAsText(f)}
function impMsgEl(t){const e=document.getElementById('impMsg');if(e)e.textContent=t}
/* ===== ПАРСЕРЫ ===== */
const UNITS='амп|ампул|ампула|фл|шт|пар|пары|бл|блистер|уп|упак|туб|тюба|туба|компл|комплект';
function normUnit(u){u=(u||'').toLowerCase().replace('.','');if(/^(амп|ампул|ампула)$/.test(u))return'амп';if(/^(фл|флак)$/.test(u))return'фл';
if(/^(бл|блистер)$/.test(u))return'блистер';if(/^(уп|упак)$/.test(u))return'уп';if(/^(туб|тюба|туба)$/.test(u))return'туба';
if(/^(пар|пары)$/.test(u))return'пар';if(/^(компл|комплект)$/.test(u))return'компл';return u||'шт'}
function parseItems(text){const out=[];text.split(/\r?\n/).forEach(raw=>{let line=raw.trim();if(!line)return;
line=line.replace(/^\s*\d{1,3}\s*[.)]\s*/,'');if(!line)return;let qty=1,unit='';
const m=line.match(new RegExp('^(.*?)\\s*[—-]?\\s*(\\d{1,4})\\s*('+UNITS+')\\.?$','i'));
if(m){line=m[1].trim();qty=+m[2];unit=normUnit(m[3])}
let name=line,spec='';const sm=line.match(/^(.*?)(\s(?:р-р|раствор|таб|табл|капс|пор|аэр|сусп|мазь|гель|конц|конт|система|шприц|перчатки|бинт|салфетка|пластырь|игла|катетер|жгут|контейнер|маска|настойка|туба|набор|шина|зажим|стилет|фильтр|чехол|одеяло|грелка|воронка|зонд|аспиратор|ларингоскоп|повязка|покрывало|ножницы|пинцет|стетоскоп|языкодержатель|иглодержатель|роторасширитель|переходник|устройство|комплект)\b[\s\S]*)$/i);
if(sm&&sm[1].trim().length>=3){name=sm[1].trim();spec=sm[2].trim()}
if(name)out.push({on:true,name,spec,qty,unit})});return out}
function parseEquip(text){const out=[];text.split(/\r?\n/).forEach(raw=>{let line=raw.trim();if(!line)return;
line=line.replace(/^\s*\d{1,3}\s*[.)]\s*/,'');if(!line)return;
const om=line.match(/((?:ОС|ОБМ|ОВМ|ос|обм|овм)\s?-\s?\d{3,6}|\b\d{4,6}(?:\s?,\s?\d{4,6})+\b|\b0\d{3,5}\b)/);
let ovm='';if(om){ovm=om[1].trim();line=line.replace(om[0],'').trim()}
line=line.replace(/\s*[—-]\s*$/,'').trim();
if(line)out.push({on:true,ovm:ovm.replace(/\s/g,''),name:line,status:'ok',charge:''})});return out}
function doParse(){const t=impText.value||'';
impDrafts=impTarget.kind==='equip'?parseEquip(t):parseItems(t);renderPrev()}
function renderPrev(){const d=document.getElementById('impPrev');if(!d)return;
if(!impDrafts.length){d.innerHTML='<p style="color:var(--mut)">Ничего не распознано — проверьте текст</p>';return}
if(impTarget.kind==='equip'){d.innerHTML='<table><tr><th></th><th>Инв. №</th><th>Наименование</th></tr>'+impDrafts.map((r,i)=>`<tr>
<td><input type="checkbox" style="width:auto" ${r.on?'checked':''} onchange="impDrafts[${i}].on=this.checked"></td>
<td><input style="width:110px" value="${esc(r.ovm)}" onchange="impDrafts[${i}].ovm=this.value"></td>
<td><input value="${esc(r.name)}" onchange="impDrafts[${i}].name=this.value"></td></tr>`).join('')+'</table>';return}
d.innerHTML='<table><tr><th></th><th>Название</th><th>Форма</th><th>Кол-во</th><th>Ед.</th></tr>'+impDrafts.map((r,i)=>`<tr>
<td><input type="checkbox" style="width:auto" ${r.on?'checked':''} onchange="impDrafts[${i}].on=this.checked"></td>
<td><input value="${esc(r.name)}" onchange="impDrafts[${i}].name=this.value"></td>
<td><input value="${esc(r.spec||'')}" onchange="impDrafts[${i}].spec=this.value"></td>
<td><input type="number" style="width:60px" value="${r.qty}" onchange="impDrafts[${i}].qty=+this.value||1"></td>
<td><input style="width:60px" value="${esc(r.unit)}" onchange="impDrafts[${i}].unit=this.value"></td></tr>`).join('')+'</table>'}
/* ===== ДИАЛОГ ИМПОРТА ===== */
function openImport(target){impTarget=target;impDrafts=[];
openDlg(`<h3>📥 Импорт списка</h3>
<p><label class="btn sec" style="display:inline-block">📷 Фото (OCR)<input type="file" hidden accept="image/*" onchange="ocrFile(this.files[0])"></label>
<label class="btn sec" style="display:inline-block">📄 Файл .txt/.csv<input type="file" hidden accept=".txt,.csv,text/plain" onchange="readTxt(this.files[0])"></label>
<button class="btn sec" onclick="doParse()">⚙️ Распарсить текст</button></p>
<p id="impMsg" style="font-size:13px;color:var(--mut)"></p>
<textarea id="impText" placeholder="Или вставьте текст списка сюда…"></textarea>
<div class="prev" id="impPrev"></div>
<p><button class="btn" onclick="commitImport()">➕ Добавить отмеченные</button><button class="btn sec" onclick="closeDlg()">Закрыть</button></p>`)}
function commitImport(){const rows=impDrafts.filter(r=>r.on);if(!rows.length)return alert('Нет отмеченных строк');
const t=impTarget;let n=0;
if(t.kind==='equip'){const c=DB.cars.find(x=>x.id===t.id);rows.forEach(r=>{c.equip.push({id:uid(),qty:1,ovm:r.ovm,name:r.name.trim(),status:'ok',charge:r.charge||'',defect:''});n++})}
else if(t.kind==='kit'){const k=DB.cars.find(x=>x.id===t.id).kits.find(k=>k.id===t.kitId);rows.forEach(r=>{k.items.push({name:r.name.trim(),spec:(r.spec||'').trim(),unit:r.unit,qty:r.qty,expiry:'',batch:'',gtin:''});n++})}
else if(t.kind==='bag'){const b=DB.bags.find(x=>x.id===t.id);rows.forEach(r=>{b.items.push({name:r.name.trim(),spec:(r.spec||'').trim(),unit:r.unit,qty:r.qty,expiry:'',batch:'',gtin:''});n++})}
else if(t.kind==='type'){const ty=DB.bagTypes.find(x=>x.id===t.id);rows.forEach(r=>{ty.items.push({name:r.name.trim(),spec:(r.spec||'').trim(),unit:r.unit,qty:r.qty});n++})}
else if(t.kind==='uchet'){const k=DB.uchet.find(x=>x.id===t.id);rows.forEach(r=>{k.items.push({name:r.name.trim(),spec:(r.spec||'').trim(),unit:r.unit,qty:r.qty,expiry:''});n++})}
else{rows.forEach(r=>{DB.meds.push({id:uid(),group:'',num:null,name:r.name.trim(),spec:(r.spec||'').trim(),unit:r.unit,qty:r.qty,gtin:''});n++})}
save();closeDlg();render();alert('Добавлено: '+n)}
