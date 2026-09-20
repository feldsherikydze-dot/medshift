/* packs.js — справочник, типы сумок, экземпляры сумок, позиции */
DB.meds=DB.meds||(window.SEED||[]).map(s=>({id:0,group:s[0],num:+s[1],name:s[2],spec:s[3],unit:s[4],qty:+s[5],gtin:''}));
DB.meds.forEach(m=>{if(!m.id)m.id=uid()});save();
let bagsTab='bags',curBag=null,curType=null,refMode=false,refQ='',editCtx=null,showMissBag=false;

function bagsView(){
if(refMode)return refView();
if(curBag)return bagView();
if(curType)return typeView();
let h=`<button class="btn" onclick="openBagDlg(null)">+ Сумка</button>
<button class="btn sec" onclick="curType=-1;render()">📑 Типы сумок</button>
<button class="btn sec" onclick="refMode=true;render()">📚 Справочник</button>`;
if(!DB.bags.length)h+='<p style="color:var(--mut)">Сумок пока нет. Создайте из типа или залейте перечень импортом.</p>';
DB.bags.forEach(b=>{const bad=b.items.filter(i=>i.expiry&&daysLeft(i.expiry)<=S().warnDays).length;
const resp=DB.users.filter(u=>(u.bags||[]).includes(b.id)).map(u=>u.name).join(', ');
h+=`<div class="card"><b>👜 ${esc(b.name)}</b> · тип: ${esc((DB.bagTypes.find(t=>t.id===b.typeId)||{}).name||'—')} · ${b.items.length} поз.${bad?` <span class="badge bSoon">⚠ ${bad}</span>`:''}<br><small>Ответственный: ${esc(resp||'не назначен')}</small><br>
<button class="btn sec mini" onclick="curBag=${b.id};showMissBag=false;render()">Открыть</button>
<button class="btn sec mini" onclick="openBagDlg(${b.id})">✏️</button>
<button class="btn del" onclick="delBag(${b.id})">🗑</button></div>`});
return h}
function openBagDlg(id){const b=id?DB.bags.find(x=>x.id===id):null;
openDlg(`<h3>${b?'Сумка':'Новая сумка'}</h3>
<label>Название / номер</label><input id="bName" value="${b?esc(b.name):''}">
<label>Тип (перечень)</label><select id="bType">${DB.bagTypes.map(t=>`<option value="${t.id}" ${b&&b.typeId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select>
${b?'':`<label class="chk"><input type="checkbox" id="bFill" checked> заполнить перечнем типа</label>`}
<p><button class="btn" onclick="saveBagDlg(${id||'null'})">Сохранить</button><button class="btn sec" onclick="closeDlg()">Отмена</button></p>`)}
function saveBagDlg(id){const n=bName.value.trim();if(!n)return alert('Введите название');const t=+bType.value;
if(id){const b=DB.bags.find(x=>x.id===id);b.name=n;if(b.typeId!==t){b.typeId=t}}
else{const items=(document.getElementById('bFill')||{}).checked?(DB.bagTypes.find(x=>x.id===t)||{items:[]}).items.map(i=>({...i,expiry:'',batch:'',gtin:''})):[];
DB.bags.push({id:uid(),name:n,typeId:t,items})}
save();closeDlg();render()}
function delBag(id){if(confirm('Удалить сумку со всеми сроками?')){DB.bags=DB.bags.filter(b=>b.id!==id);DB.users.forEach(u=>u.bags=(u.bags||[]).filter(x=>x!==id));if(curBag===id)curBag=null;save();render()}}
function missingOfType(b){const t=DB.bagTypes.find(x=>x.id===b.typeId);if(!t)return[];
return t.items.filter(ti=>!b.items.some(it=>(ti.num&&it.num===ti.num&&it.group===ti.group)||it.name===ti.name))}
function bagView(){const b=DB.bags.find(x=>x.id===curBag);if(!b){curBag=null;return bagsView()}
let h=`<button class="btn sec" onclick="curBag=null;render()">← Сумки</button>
<h3>👜 ${esc(b.name)}</h3>
<button class="btn" onclick="openItemDlgCtx({kind:'bag',id:${b.id}})">+ Позиция</button>
<button class="btn sec" onclick="openImport({kind:'bag',id:${b.id}})">📥 Импорт</button>
<button class="btn sec" onclick="showMissBag=!showMissBag;render()">✅ Комплектность</button>
<button class="btn sec" onclick="openMonthly('bag',${b.id})">📋 Месячная проверка</button>`;
if(showMissBag){const ms=missingOfType(b);h+=ms.length?`<div class="miss"><b>Нет ${ms.length} поз. типа:</b><br>`+ms.map(s=>`№${s.group==='t'?'Т'+s.num:s.num} ${esc(s.name)}`).join('<br>')+'</div>':'<div class="miss">✅ Комплектность по типу полная</div>'}
h+='<table><tr><th>№</th><th>Наименование</th><th>Норма</th><th>Срок</th><th>Статус</th><th></th></tr>';
b.items.forEach((it,i)=>{h+=`<tr class="${rowCls(it.expiry)}"><td>${it.group?(it.group==='t'?'Т'+it.num:it.num):'—'}</td>
<td>${esc(it.name)}<br><small>${esc(it.spec||'')}${it.batch?' · сер. '+esc(it.batch):''}</small></td><td>${it.qty} ${esc(it.unit)}</td>
<td><input type="date" style="width:145px" value="${it.expiry||''}" onchange="setExpBag(${i},this.value)"></td><td>${badgeExp(it.expiry)}</td>
<td><button class="btn sec mini" onclick="openItemDlgCtx({kind:'bag',id:${b.id},idx:${i}})">✏️</button>
<button class="btn sec mini" onclick="openScan(p=>applyScanBag(${i},p))">📷</button>
<button class="btn del" onclick="delItemBag(${i})">🗑</button></td></tr>`});
return h+'</table>'}
function setExpBag(i,v){DB.bags.find(x=>x.id===curBag).items[i].expiry=v;save();render()}
function delItemBag(i){const b=DB.bags.find(x=>x.id===curBag);if(confirm('Удалить позицию?')){b.items.splice(i,1);save();render()}}
function applyScanBag(i,p){const it=DB.bags.find(x=>x.id===curBag).items[i];
if(p.expiry)it.expiry=p.expiry;if(p.batch)it.batch=p.batch;
if(p.gtin){it.gtin=p.gtin;const m=DB.meds.find(x=>x.gtin===p.gtin);if(m){it.medId=m.id;it.name=m.name;it.spec=m.spec;it.group=m.group;it.num=m.num}}
save();render()}
/* ===== ТИПЫ ===== */
function typeView(){if(curType===-1){let h=`<button class="btn sec" onclick="curType=null;render()">← Сумки</button>
<button class="btn" onclick="openTypeDlg(null)">+ Тип сумки</button>`;
DB.bagTypes.forEach(t=>{h+=`<div class="card"><b>📑 ${esc(t.name)}</b> · ${t.items.length} поз.<br>
<button class="btn sec mini" onclick="curType=${t.id};render()">Открыть</button>
<button class="btn sec mini" onclick="openTypeDlg(${t.id})">✏️</button>
${t.std?'':`<button class="btn del" onclick="delType(${t.id})">🗑</button>`}</div>`});
return h}
const t=DB.bagTypes.find(x=>x.id===curType);if(!t){curType=-1;return typeView()}
let h=`<button class="btn sec" onclick="curType=-1;render()">← Типы</button><h3>📑 ${esc(t.name)}</h3>
<button class="btn" onclick="openItemDlgCtx({kind:'type',id:${t.id}})">+ Позиция</button>
<button class="btn sec" onclick="openImport({kind:'type',id:${t.id}})">📥 Импорт перечня</button>
<button class="btn sec" onclick="openBagDlg(null)">👜 Создать сумку из типа</button>
<table><tr><th>№</th><th>Наименование</th><th>Форма</th><th>Норма</th><th></th></tr>`;
t.items.forEach((it,i)=>{h+=`<tr><td>${it.group?(it.group==='t'?'Т'+it.num:it.num):'—'}</td><td>${esc(it.name)}</td><td>${esc(it.spec||'')}</td><td>${it.qty} ${esc(it.unit)}</td>
<td><button class="btn sec mini" onclick="openItemDlgCtx({kind:'type',id:${t.id},idx:${i}})">✏️</button><button class="btn del" onclick="delItemType(${i})">🗑</button></td></tr>`});
return h+'</table>'}
function openTypeDlg(id){const t=id?DB.bagTypes.find(x=>x.id===id):null;
openDlg(`<h3>${t?'Тип сумки':'Новый тип'}</h3><label>Название типа</label><input id="tName" value="${t?esc(t.name):''}">
<p><button class="btn" onclick="saveTypeDlg(${id||'null'})">Сохранить</button><button class="btn sec" onclick="closeDlg()">Отмена</button></p>`)}
function saveTypeDlg(id){const n=tName.value.trim();if(!n)return alert('Введите название');
if(id){DB.bagTypes.find(x=>x.id===id).name=n}else DB.bagTypes.push({id:uid(),name:n,std:false,items:[]});
save();closeDlg();render()}
function delType(id){if(confirm('Удалить тип? Созданные сумки останутся со своими позициями.')){DB.bagTypes=DB.bagTypes.filter(t=>t.id!==id);curType=-1;save();render()}}
function delItemType(i){const t=DB.bagTypes.find(x=>x.id===curType);if(confirm('Удалить?')){t.items.splice(i,1);save();render()}}
/* ===== СПРАВОЧНИК ===== */
function refView(){const q=refQ.toLowerCase();const list=DB.meds.filter(m=>!q||m.name.toLowerCase().includes(q)||(m.spec||'').toLowerCase().includes(q));
let h=`<button class="btn sec" onclick="refMode=false;render()">← Сумки</button>
<button class="btn" onclick="openMedDlg(null)">+ Добавить</button>
<button class="btn sec" onclick="openImport({kind:'ref'})">📥 Импорт</button>
<input placeholder="Поиск…" value="${esc(refQ)}" oninput="refQ=this.value;render()">
<table><tr><th>№</th><th>Название</th><th>Форма</th><th>Норма</th><th></th></tr>`;
list.forEach(m=>{h+=`<tr><td>${m.group?(m.group==='t'?'Т'+m.num:m.num):'—'}</td><td>${esc(m.name)}</td><td>${esc(m.spec||'')}</td><td>${m.qty} ${esc(m.unit)}</td>
<td><button class="btn sec mini" onclick="openMedDlg(${m.id})">✏️</button><button class="btn del" onclick="delMed(${m.id})">🗑</button></td></tr>`});
return h+'</table>'}
function openMedDlg(id){const m=id?DB.meds.find(x=>x.id===id):{};
openDlg(`<h3>Позиция справочника</h3><label>Название</label><input id="mName" value="${esc(m.name||'')}">
<label>Форма / дозировка</label><input id="mSpec" value="${esc(m.spec||'')}">
<div class="row"><div><label>Ед.</label><input id="mUnit" value="${esc(m.unit||'')}"></div><div><label>Норма</label><input id="mQty" type="number" value="${m.qty||1}"></div></div>
<label>GTIN (Честный знак)</label><input id="mGtin" value="${esc(m.gtin||'')}">
<p><button class="btn" onclick="saveMedDlg(${id||'null'})">Сохранить</button><button class="btn sec" onclick="closeDlg()">Отмена</button></p>`)}
function saveMedDlg(id){const o={name:mName.value.trim(),spec:mSpec.value.trim(),unit:mUnit.value.trim()||'шт',qty:+mQty.value||1,gtin:mGtin.value.trim()};
if(!o.name)return alert('Введите название');
if(id)Object.assign(DB.meds.find(x=>x.id===id),o);else DB.meds.push({id:uid(),group:'',num:null,...o});
save();closeDlg();render()}
function delMed(id){if(confirm('Удалить из справочника?')){DB.meds=DB.meds.filter(m=>m.id!==id);save();render()}}
/* ===== УНИВЕРСАЛЬНЫЙ ДИАЛОГ ПОЗИЦИИ ===== */
function ctxList(c){if(c.kind==='bag')return DB.bags.find(x=>x.id===c.id).items;
if(c.kind==='type')return DB.bagTypes.find(x=>x.id===c.id).items;
if(c.kind==='kit')return DB.cars.find(x=>x.id===c.id).kits.find(k=>k.id===c.kitId).items;
if(c.kind==='uchet')return DB.uchet.find(x=>x.id===c.id).items;return[]}
function openItemDlgCtx(c){editCtx=c;const it=c.idx==null?{}:ctxList(c)[c.idx];const noExp=c.kind==='type';
openDlg(`<h3>${c.idx==null?'Новая позиция':'Позиция'}</h3>
<div class="sugg"><label>Название (печатайте — автоподбор)</label><input id="iName" value="${esc(it.name||'')}" oninput="suggMed()" autocomplete="off"><ul id="iSugg" hidden></ul></div>
<label>Форма / дозировка</label><input id="iSpec" value="${esc(it.spec||'')}">
<div class="row"><div><label>Ед.</label><input id="iUnit" value="${esc(it.unit||'')}"></div><div><label>Норма/кол-во</label><input id="iQty" type="number" value="${it.qty||1}"></div></div>
${noExp?'':`<div class="row"><div><label>Срок годности</label><input id="iExp" type="date" value="${it.expiry||''}"></div><div><label>Серия</label><input id="iBatch" value="${esc(it.batch||'')}"></div></div>`}
<input id="iMedId" type="hidden" value="${it.medId||''}"><input id="iGtin" type="hidden" value="${it.gtin||''}">
<input id="iGroup" type="hidden" value="${it.group||''}"><input id="iNum" type="hidden" value="${it.num||''}">
${noExp?'':`<p><button class="btn sec" onclick="openScan(scanToItemDlg)">📷 Честный знак</button></p>`}
<p><button class="btn" onclick="saveItemDlg()">Сохранить</button><button class="btn sec" onclick="closeDlg()">Отмена</button></p>`)}
function suggMed(){const v=iName.value.toLowerCase();const ul=iSugg;if(!v){ul.hidden=true;return}
const list=DB.meds.filter(m=>m.name.toLowerCase().includes(v)||(m.spec||'').toLowerCase().includes(v)).slice(0,8);
ul.innerHTML=list.map(m=>`<li onclick="pickMedI(${m.id})">${m.group?(m.group==='t'?'Т'+m.num:m.num)+'. ':''}${esc(m.name)} <small>${esc(m.spec||'')}</small></li>`).join('');ul.hidden=!list.length}
function pickMedI(id){const m=DB.meds.find(x=>x.id===id);iName.value=m.name;iSpec.value=m.spec||'';iUnit.value=m.unit;iQty.value=m.qty;
iMedId.value=m.id;iGroup.value=m.group||'';iNum.value=m.num||'';iSugg.hidden=true}
function saveItemDlg(){const c=editCtx;const noExp=c.kind==='type';
const it={medId:+iMedId.value||null,group:iGroup.value,num:+iNum.value||null,name:iName.value.trim(),spec:iSpec.value.trim(),unit:iUnit.value.trim()||'шт',qty:+iQty.value||1};
if(!it.name)return alert('Введите название');
if(!noExp){it.expiry=iExp.value;it.batch=iBatch.value.trim();it.gtin=iGtin.value;
if(it.gtin&&it.medId){const m=DB.meds.find(x=>x.id===it.medId);if(m)m.gtin=it.gtin}}
const L=ctxList(c);if(c.idx==null)L.push(it);else L[c.idx]=Object.assign(L[c.idx],it);
save();closeDlg();render()}
function scanToItemDlg(p){if(p.expiry&&document.getElementById('iExp'))iExp.value=p.expiry;
if(p.batch&&document.getElementById('iBatch'))iBatch.value=p.batch;
if(p.gtin){iGtin.value=p.gtin;const m=DB.meds.find(x=>x.gtin===p.gtin);if(m)pickMedI(m.id)}}
