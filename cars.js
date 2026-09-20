/* cars.js — машины, оборудование, ЭКГ, учёт, отчёты, задачи, месячные */
let curCar=null,carTab='eq',curKit=null,repCtx=null,repModeV=null;
function carsView(){let h='';
if(isBoss()){const tasks=DB.tasks.filter(t=>!t.done);
if(tasks.length)h+=`<div class="card"><b>📌 Задачи в работе</b><table>`+tasks.map(t=>`<tr><td>${esc(t.text)}<br><small>создана ${new Date(t.ts).toLocaleDateString('ru-RU')}</small></td><td><button class="btn sec mini" onclick="doneTask(${t.id})">✔ готово</button></td></tr>`).join('')+'</table></div>';
h+=`<button class="btn" onclick="openCarDlg(null)">+ Машина</button><button class="btn sec" onclick="ecgDlg()">⚙️ Реестр ЭКГ</button>`}
DB.cars.forEach(c=>{const df=c.equip.filter(e=>e.status==='def').length;
const rep=DB.reports.filter(r=>r.kind!=='monthly'&&r.carId===c.id).slice(-1)[0];
const resp=DB.users.filter(u=>(u.cars||[]).includes(c.id)).map(u=>u.name).join(', ');
h+=`<div class="card"><b>🚑 ${esc(c.name)}</b> · оборуд.: ${c.equip.length}${df?` <span class="badge bExp">дефекты: ${df}</span>`:''} · укладок: ${c.kits.length}<br><small>ответственный: ${esc(resp||'—')} · последний отчёт: ${rep?new Date(rep.ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'}</small><br>
<button class="btn sec mini" onclick="curCar=${c.id};carTab='eq';curKit=null;render()">Открыть</button>
${isBoss()?`<button class="btn sec mini" onclick="openCarDlg(${c.id})">✏️</button><button class="btn del" onclick="delCar(${c.id})">🗑</button>`:''}</div>`});
return h}
function openCarDlg(id){const c=id?DB.cars.find(x=>x.id===id):null;
openDlg(`<h3>${c?'Машина':'Новая машина'}</h3><label>Название / номер</label><input id="cName" value="${c?esc(c.name):''}">
<p><button class="btn" onclick="saveCarDlg(${id||'null'})">Сохранить</button><button class="btn sec" onclick="closeDlg()">Отмена</button></p>`)}
function saveCarDlg(id){const n=cName.value.trim();if(!n)return alert('Введите название');
if(id)DB.cars.find(x=>x.id===id).name=n;else DB.cars.push({id:uid(),name:n,equip:[],kits:[]});
save();closeDlg();render()}
function delCar(id){if(confirm('Удалить машину со всем содержимым?')){DB.cars=DB.cars.filter(c=>c.id!==id);DB.users.forEach(u=>u.cars=(u.cars||[]).filter(x=>x!==id));if(curCar===id)curCar=null;save();render()}}
function ecgDlg(){openDlg(`<h3>Реестр ЭКГ</h3><label>Номера, по одному в строку</label><textarea id="ecgTa">${DB.ecg.join('\n')}</textarea>
<p><button class="btn" onclick="DB.ecg=document.getElementById('ecgTa').value.split(/\\n+/).map(s=>s.trim()).filter(Boolean);save();closeDlg();render()">Сохранить</button><button class="btn sec" onclick="closeDlg()">Отмена</button></p>`)}
function carView(){const c=DB.cars.find(x=>x.id===curCar);if(!c){curCar=null;return carsView()}
let h=`<button class="btn sec" onclick="curCar=null;render()">← Машины</button><h3>🚑 ${esc(c.name)}</h3>
<button class="btn sec ${carTab==='eq'?'on':''}" onclick="carTab='eq';curKit=null;render()">Оборудование</button>
<button class="btn sec ${carTab==='kt'?'on':''}" onclick="carTab='kt';curKit=null;render()">Укладки</button>
<button class="btn sec ${carTab==='rp'?'on':''}" onclick="carTab='rp';render()">Отчёты</button>
<button class="btn" onclick="openRep(${c.id})">📨 Отчёт по смене</button>
<button class="btn sec" onclick="openMonthly('car',${c.id})">📋 Месячная</button>`;
if(carTab==='eq'){h+=isBoss()?`<button class="btn" onclick="openEquipDlg(null)">+ Оборудование</button><button class="btn sec" onclick="openImport({kind:'equip',id:${c.id}})">📥 Импорт</button>`:'';
h+='<table><tr><th>Инв. №</th><th>Наименование</th><th>Статус</th><th>Заряд/кислород</th><th>Пометка</th><th></th></tr>';
c.equip.forEach(e=>{h+=`<tr class="${e.status==='def'?'exp':e.status==='miss'?'warn':''}"><td>${esc(e.ovm||'—')}</td><td>${esc(e.name)}</td>
<td>${isBoss()?`<select onchange="setEq(${c.id},${e.id},'status',this.value)"><option value="ok" ${e.status==='ok'?'selected':''}>исправен</option><option value="def" ${e.status==='def'?'selected':''}>дефект</option><option value="miss" ${e.status==='miss'?'selected':''}>отсутствует</option></select>`:(e.status==='ok'?'<span class="badge bOk">исправен</span>':e.status==='def'?'<span class="badge bExp">дефект</span>':'<span class="badge bWarn">нет</span>')}</td>
<td><input style="width:90px" value="${esc(e.charge||'')}" onchange="setEq(${c.id},${e.id},'charge',this.value)" placeholder="заряд"></td>
<td><input value="${esc(e.defect||'')}" onchange="setEq(${c.id},${e.id},'defect',this.value)" placeholder="пометка"></td>
<td>${isBoss()?`<button class="btn sec mini" onclick="openEquipDlg(${e.id})">✏️</button><button class="btn del" onclick="delEq(${e.id})">🗑</button>`:''}</td></tr>`});
h+='</table>'}
else if(carTab==='kt'){if(curKit)return h+kitView(c);
h+=isBoss()?`<button class="btn" onclick="openKitDlg(null)">+ Укладка</button>`:'';
c.kits.forEach(k=>{const bad=k.items.filter(i=>i.expiry&&daysLeft(i.expiry)<=S().warnDays).length;
h+=`<div class="card"><b>🧰 ${esc(k.name)}</b> · ${k.items.length} поз.${bad?` <span class="badge bSoon">⚠ ${bad}</span>`:''}<br>
<button class="btn sec mini" onclick="curKit=${k.id};render()">Открыть</button>
${isBoss()?`<button class="btn sec mini" onclick="openKitDlg(${k.id})">✏️</button><button class="btn del" onclick="delKit(${k.id})">🗑</button>`:''}</div>`});
if(!c.kits.length)h+='<p style="color:var(--mut)">Укладок нет.</p>'}
else{const reps=DB.reports.filter(r=>r.carId===c.id).slice(-20).reverse();
h+=reps.length?'<table>'+reps.map(r=>`<tr><td><span class="badge ${r.status==='green'?'bG':r.status==='yellow'?'bY':'bR'}">${r.status==='green'?'без зам.':r.status==='yellow'?'с замеч.':r.kind==='monthly'?'месячная':'КРАСНЫЙ'}</span> ${new Date(r.ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · ${esc(r.user)}${r.kind==='monthly'?' · месячная':''}<br><small>сумка №${esc(r.bagNum||'—')}, ЭКГ №${esc(r.ecgNum||'—')}${r.remarks?' · '+esc(r.remarks):''}${r.viewed?' · просмотрен':''}</small></td>
${isBoss()&&!r.viewed&&r.kind!=='monthly'?`<td><button class="btn sec mini" onclick="viewReport(${r.id})">👁 просмотреть</button></td>`:''}</tr>`).join('')+'</table>':'<p>Отчётов нет</p>'}
return h}
function kitView(c){const k=c.kits.find(x=>x.id===curKit);if(!k){curKit=null;return carView(c)}
let h=`<button class="btn sec" onclick="curKit=null;render()">← Укладки</button><h4>🧰 ${esc(k.name)}</h4>
<button class="btn" onclick="openItemDlgCtx({kind:'kit',id:${c.id},kitId:${k.id}})">+ Позиция</button>
${isBoss()?`<button class="btn sec" onclick="openImport({kind:'kit',id:${c.id},kitId:${k.id}})">📥 Импорт</button>`:''}
<table><tr><th>Наименование</th><th>Норма</th><th>Срок</th><th>Статус</th><th></th></tr>`;
k.items.forEach((it,i)=>{h+=`<tr class="${rowCls(it.expiry)}"><td>${esc(it.name)}<br><small>${esc(it.spec||'')}</small></td><td>${it.qty} ${esc(it.unit)}</td>
<td><input type="date" style="width:140px" value="${it.expiry||''}" onchange="setExpKit(${k.id},${i},this.value)"></td><td>${badgeExp(it.expiry)}</td>
<td><button class="btn sec mini" onclick="openItemDlgCtx({kind:'kit',id:${c.id},kitId:${k.id},idx:${i}})">✏️</button>
<button class="btn sec mini" onclick="openScan(p=>{const it=DB.cars.find(x=>x.id===${c.id}).kits.find(k=>k.id===${k.id}).items[${i}];if(p.expiry)it.expiry=p.expiry;if(p.batch)it.batch=p.batch;save();render()})">📷</button>
<button class="btn del" onclick="delItemKit(${k.id},${i})">🗑</button></td></tr>`});
return h+'</table>'}
function setExpKit(kid,i,v){DB.cars.find(x=>x.id===curCar).kits.find(k=>k.id===kid).items[i].expiry=v;save();render()}
function delItemKit(kid,i){const k=DB.cars.find(x=>x.id===curCar).kits.find(k=>k.id===kid);if(confirm('Удалить?')){k.items.splice(i,1);save();render()}}
function openKitDlg(id){const k=id?DB.cars.find(x=>x.id===curCar).kits.find(x=>x.id===id):null;
openDlg(`<h3>${k?'Укладка':'Новая укладка'}</h3><label>Название</label><input id="kName" value="${k?esc(k.name):''}">
<p><button class="btn" onclick="saveKitDlg(${id||'null'})">Сохранить</button><button class="btn sec" onclick="closeDlg()">Отмена</button></p>`)}
function saveKitDlg(id){const n=kName.value.trim();if(!n)return alert('Введите название');const c=DB.cars.find(x=>x.id===curCar);
if(id)c.kits.find(x=>x.id===id).name=n;else c.kits.push({id:uid(),name:n,items:[]});save();closeDlg();render()}
function delKit(id){if(confirm('Удалить укладку?')){const c=DB.cars.find(x=>x.id===curCar);c.kits=c.kits.filter(k=>k.id!==id);curKit=null;save();render()}}
function openEquipDlg(id){const c=DB.cars.find(x=>x.id===curCar);const e=id?c.equip.find(x=>x.id===id):{};
openDlg(`<h3>Оборудование</h3><label>Инвентарный номер (ОВМ/ОС/ОБМ)</label><input id="eOvm" value="${esc(e.ovm||'')}">
<label>Наименование</label><input id="eName" value="${esc(e.name||'')}">
<div class="row"><div><label>Статус</label><select id="eStat"><option value="ok" ${e.status==='ok'||!e.status?'selected':''}>исправен</option><option value="def" ${e.status==='def'?'selected':''}>дефект</option><option value="miss" ${e.status==='miss'?'selected':''}>отсутствует</option></select></div>
<div><label>Заряд / кислород</label><input id="eCharge" value="${esc(e.charge||'')}"></div></div>
<label>Пометка / дефект</label><input id="eDef" value="${esc(e.defect||'')}">
<p><button class="btn" onclick="saveEquipDlg(${id||'null'})">Сохранить</button><button class="btn sec" onclick="closeDlg()">Отмена</button></p>`)}
function saveEquipDlg(id){const c=DB.cars.find(x=>x.id===curCar);
const o={ovm:eOvm.value.trim(),name:eName.value.trim(),status:eStat.value,charge:eCharge.value.trim(),defect:eDef.value.trim()};
if(!o.name)return alert('Введите наименование');
if(id)Object.assign(c.equip.find(x=>x.id===id),o);else c.equip.push({id:uid(),qty:1,...o});save();closeDlg();render()}
function delEq(id){const c=DB.cars.find(x=>x.id===curCar);if(confirm('Удалить?')){c.equip=c.equip.filter(e=>e.id!==id);save();render()}}
function setEq(carId,eqId,f,v){DB.cars.find(x=>x.id===carId).equip.find(e=>e.id===eqId)[f]=v;save();render()}
/* ===== ОТЧЁТ СМЕНЫ ===== */
function openRep(carId){const c=DB.cars.find(x=>x.id===carId);repCtx={carId};repModeV=null;
const last=DB.reports.filter(r=>r.carId===carId&&r.kind!=='monthly'&&r.equip).slice(-1)[0]||{equip:[]};
const u=me();const myBag=DB.bags.find(b=>(u.bags||[]).includes(b.id))||DB.bags[0];
openDlg(`<h3>📨 Отчёт по смене · ${esc(c.name)}</h3>
<p style="color:var(--mut)">Дата и время: <b>${new Date().toLocaleString('ru-RU')}</b> · Сотрудник: <b>${esc(u.name)}</b> (ставятся автоматически)</p>
<div class="row"><div><label>№ бригады</label><input id="rpBrig" inputmode="numeric"></div>
<div><label>Рабочая сумка</label><select id="rpBag">${DB.bags.map(b=>`<option value="${esc(b.name)}" ${myBag&&b.id===myBag.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div>
<div><label>ЭКГ №</label><select id="rpEcg">${DB.ecg.map(n=>`<option>${esc(n)}</option>`).join('')}</select></div></div>
<label>Заряд ЭКГ</label><input id="rpEcgCh" placeholder="напр. 100%">
<p style="color:var(--mut)">Отметки по оборудованию (значения подставлены из прошлого отчёта):</p>
<div class="prev"><table><tr><th>Инв. №</th><th>Наименование</th><th>Статус</th><th>Заряд/кислород</th></tr>`+
c.equip.map(e=>{const pe=last.equip.find(x=>x.ovm===e.ovm&&x.ovm)||{};
return `<tr><td>${esc(e.ovm||'—')}</td><td>${esc(e.name)}</td>
<td><select id="re_${e.id}"><option value="ok" ${(pe.status||e.status||'ok')==='ok'?'selected':''}>исправен</option><option value="def" ${pe.status==='def'?'selected':''}>дефект</option><option value="miss" ${pe.status==='miss'?'selected':''}>отсутствует</option></select></td>
<td><input id="rc_${e.id}" style="width:90px" value="${esc(pe.charge||e.charge||'')}"></td></tr>`}).join('')+`</table></div>
<p id="rpIssues"></p>
<label>Примечания (свободная форма)</label><textarea id="rpRem"></textarea>
<p><button class="btn wide" onclick="repMode('ok')">✅ Проверил, без замечаний</button>
<button class="btn sec wide" onclick="repMode('rem')">⚠ Проверил, есть замечания</button></p>
<p id="rpStat"></p>
<p><button class="btn wide" id="rpSave" hidden onclick="submitRep()">💾 Сохранить и отправить отчёт</button>
<button class="btn sec" onclick="closeDlg()">Отмена</button></p>`);
calcIssues()}
function calcIssues(){const c=DB.cars.find(x=>x.id===repCtx.carId);const exp=[];
c.kits.forEach(k=>k.items.forEach(it=>{if(it.expiry&&daysLeft(it.expiry)<=S().warnDays)exp.push(k.name+': '+it.name)}));
const el=document.getElementById('rpIssues');if(el)el.innerHTML=exp.length?`<span class="badge bExp">авто: просрочки/истечения ${exp.length}</span><br><small>${exp.map(esc).join('; ')}</small>`:'<span class="badge bOk">авто: просрочек нет</span>';
return exp}
function repMode(m){repModeV=m;const box=document.getElementById('rpRem');
if(m==='rem'){box.focus()}
const exp=calcIssues();const defSel=[...document.querySelectorAll('[id^=re_]')].filter(s=>s.value!=='ok').length;
const st=(exp.length>0||(m==='rem'&&defSel>=3))?'red':(m==='rem'?'yellow':'green');
document.getElementById('rpStat').innerHTML='Отчёт будет: '+`<span class="badge ${st==='green'?'bG':st==='yellow'?'bY':'bR'}">${st==='green'?'🟢 без замечаний':st==='yellow'?'🟡 с замечаниями':'🔴 красный'}</span>`;
document.getElementById('rpSave').hidden=false}
function submitRep(){if(repModeV==='rem'&&!rpRem.value.trim())return alert('Опишите замечания');
const c=DB.cars.find(x=>x.id===repCtx.carId);const u=me();
const equip=c.equip.map(e=>({id:e.id,ovm:e.ovm,name:e.name,status:(document.getElementById('re_'+e.id)||{}).value||'ok',charge:(document.getElementById('rc_'+e.id)||{}).value||''}));
const exp=calcIssues();const defSel=equip.filter(e=>e.status!=='ok').length;
const st=(exp.length>0||(repModeV==='rem'&&defSel>=3))?'red':(repModeV==='rem'?'yellow':'green');
DB.reports.push({id:uid(),ts:Date.now(),date:todayStr(),kind:'shift',carId:c.id,car:c.name,userId:u.id,user:u.name,
brigade:rpBrig.value.trim(),bagNum:rpBag.value,ecgNum:rpEcg.value,ecgCharge:rpEcgCh.value.trim(),
status:st,remarks:rpRem.value.trim(),equip,expired:exp,defects:equip.filter(e=>e.status!=='ok').map(e=>e.name),viewed:false});
equip.forEach(e=>{const eq=c.equip.find(x=>x.id===e.id);if(eq){eq.status=e.status;eq.charge=e.charge}});
save();closeDlg();render();alert('Отчёт отправлен руководителю ✔')}
function viewReport(id){const r=DB.reports.find(x=>x.id===id);r.viewed=true;r.viewedBy=me().name;r.viewTs=Date.now();
r.defects.forEach(d=>DB.tasks.push({id:uid(),ts:Date.now(),text:`${r.car}: дефект/отсутствует — ${d}`,carId:r.carId,done:false}));
r.expired.forEach(d=>DB.tasks.push({id:uid(),ts:Date.now(),text:`${r.car}: заменить — ${d}`,carId:r.carId,done:false}));
if(r.remarks)DB.tasks.push({id:uid(),ts:Date.now(),text:`${r.car}: замечание смены — ${r.remarks}`,carId:r.carId,done:false});
save();render();alert('Задачи созданы: '+(r.defects.length+r.expired.length+(r.remarks?1:0)))}
function doneTask(id){const t=DB.tasks.find(x=>x.id===id);t.done=true;t.doneTs=Date.now();save();render()}
/* ===== МЕСЯЧНАЯ ПРОВЕРКА ===== */
function openMonthly(kind,id){const obj=kind==='bag'?DB.bags.find(x=>x.id===id):DB.cars.find(x=>x.id===id);
const mk=todayStr().slice(0,7);
if(DB.monthly.some(m=>m.kind===kind&&m.objId===id&&m.month===mk))return alert('За этот месяц проверка уже отправлена');
const issues=[];
if(kind==='bag'){obj.items.forEach(it=>{if(it.expiry&&daysLeft(it.expiry)<=S().warnDays)issues.push(it.name)});issues.push(...missingOfType(obj).map(s=>'нет: '+s.name))}
else{obj.equip.forEach(e=>{if(e.status!=='ok')issues.push(e.name+' ('+e.status+')')});obj.kits.forEach(k=>k.items.forEach(it=>{if(it.expiry&&daysLeft(it.expiry)<=S().warnDays)issues.push(k.name+': '+it.name)}))}
openDlg(`<h3>📋 Месячная проверка · ${esc(obj.name)}</h3>
<p style="color:var(--mut)">Месяц: <b>${mk}</b> · Ответственный: <b>${esc(me().name)}</b></p>
<p>${issues.length?'<span class="badge bWarn">авто-находки: '+issues.length+'</span><br><small>'+issues.map(esc).join('; ')+'</small>':'<span class="badge bOk">авто-находок нет</span>'}</p>
<label>Замечания (свободная форма, можно пусто)</label><textarea id="moRem"></textarea>
<p><button class="btn wide" onclick="submitMonthly('${kind}',${id},false)">✅ Проверил, без замечаний</button>
<button class="btn sec wide" onclick="submitMonthly('${kind}',${id},true)">⚠ Проверил, есть замечания</button></p>`)}
function submitMonthly(kind,id,withRem){if(withRem&&!moRem.value.trim())return alert('Опишите замечания');
const obj=kind==='bag'?DB.bags.find(x=>x.id===id):DB.cars.find(x=>x.id===id);const u=me();const mk=todayStr().slice(0,7);
DB.monthly.push({id:uid(),month:mk,kind,objId:id,objName:obj.name,userId:u.id,ts:Date.now(),remarks:moRem.value.trim()});
DB.reports.push({id:uid(),ts:Date.now(),date:todayStr(),kind:'monthly',carId:kind==='car'?id:null,car:obj.name,userId:u.id,user:u.name,
bagNum:'',ecgNum:'',status:withRem?'yellow':'green',remarks:moRem.value.trim(),defects:[],expired:[],viewed:false});
save();closeDlg();render();alert('Месячный отчёт отправлен руководителю ✔')}
/* ===== УЧЁТНЫЕ КОМПЛЕКТЫ ===== */
function uchetView(){let h=isBoss()?`<button class="btn" onclick="openUchetDlg(null)">+ Комплект</button>`:'';
if(!DB.uchet.length)h+='<p style="color:var(--mut)">Учётных комплектов нет. Создает руководитель/админ; сотрудники отмечают «взял/вернул».</p>';
DB.uchet.forEach(k=>{const bad=k.items.filter(i=>i.expiry&&daysLeft(i.expiry)<=S().warnDays).length;
h+=`<div class="card"><b>🔐 ${esc(k.name)}</b> · ${k.items.length} поз.${bad?` <span class="badge bExp">⚠ ${bad}</span>`:''}<br>
<button class="btn sec mini" onclick="openUchet(${k.id})">Открыть</button>
${isBoss()?`<button class="btn sec mini" onclick="openUchetDlg(${k.id})">✏️</button><button class="btn del" onclick="delUchet(${k.id})">🗑</button>`:''}</div>`});
return h}
let curUchet=null;
function openUchet(id){curUchet=id;const k=DB.uchet.find(x=>x.id===id);
let h=`<button class="btn sec" onclick="curUchet=null;render()">← Учёт</button><h3>🔐 ${esc(k.name)}</h3>
${isBoss()?`<button class="btn" onclick="openItemDlgCtx({kind:'uchet',id:${k.id}})">+ Позиция</button><button class="btn sec" onclick="openImport({kind:'uchet',id:${k.id}})">📥 Импорт</button>`:''}
<table><tr><th>Наименование</th><th>Кол-во</th><th>Срок</th><th>Статус</th><th></th></tr>`;
k.items.forEach((it,i)=>{h+=`<tr class="${rowCls(it.expiry)}"><td>${esc(it.name)}</td><td>${it.qty} ${esc(it.unit)}</td>
<td>${isBoss()?`<input type="date" style="width:140px" value="${it.expiry||''}" onchange="DB.uchet.find(x=>x.id===${k.id}).items[${i}].expiry=this.value;save();render()">`:esc(it.expiry||'—')}</td>
<td>${badgeExp(it.expiry)}</td>
<td>${isBoss()?`<button class="btn sec mini" onclick="openItemDlgCtx({kind:'uchet',id:${k.id},idx:${i}})">✏️</button><button class="btn del" onclick="delItemUchet(${k.id},${i})">🗑</button>`:''}</td></tr>`});
h+='</table><p><button class="btn" onclick="uchetLog('+k.id+',\'took\')">✋ Взял</button><button class="btn sec" onclick="uchetLog('+k.id+',\'ret\')">↩ Вернул</button></p>';
h+='<b>Журнал (зеркало бумажного)</b><table>'+k.log.slice(-15).reverse().map(l=>`<tr><td>${new Date(l.ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · <b>${l.action==='took'?'взял':'вернул'}</b> · ${esc(l.user)}</td></tr>`).join('')+'</table>';
return h}
function uchetLog(id,act){const k=DB.uchet.find(x=>x.id===id);k.log=k.log||[];k.log.push({id:uid(),ts:Date.now(),userId:me().id,user:me().name,action:act});save();render()}
function openUchetDlg(id){const k=id?DB.uchet.find(x=>x.id===id):null;
openDlg(`<h3>${k?'Комплект':'Новый комплект'}</h3><label>Название</label><input id="uName" value="${k?esc(k.name):''}">
<p><button class="btn" onclick="saveUchetDlg(${id||'null'})">Сохранить</button><button class="btn sec" onclick="closeDlg()">Отмена</button></p>`)}
function saveUchetDlg(id){const n=uName.value.trim();if(!n)return alert('Введите название');
if(id)DB.uchet.find(x=>x.id===id).name=n;else DB.uchet.push({id:uid(),name:n,items:[],log:[]});save();closeDlg();render()}
function delUchet(id){if(confirm('Удалить комплект с журналом?')){DB.uchet=DB.uchet.filter(k=>k.id!==id);curUchet=null;save();render()}}
function delItemUchet(kid,i){const k=DB.uchet.find(x=>x.id===kid);if(confirm('Удалить?')){k.items.splice(i,1);save();render()}}
