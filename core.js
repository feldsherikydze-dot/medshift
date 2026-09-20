const LS='medshift_v3',VER=3;
let DB=JSON.parse(localStorage.getItem(LS)||'null');
const S=()=>DB.settings;
function save(){localStorage.setItem(LS,JSON.stringify(DB))}
function uid(){return DB.seq++}
function esc(s){return(s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
if(!DB){
DB={seq:1,ver:VER,settings:{warnDays:10,city:'',accent:'#0b5394',dark:false}};
DB.users=[];
DB.session=null;
DB.bagTypes=[];
DB.bags=[];
DB.cars=[];
DB.ecg=[];
DB.uchet=[];
DB.reports=[];
DB.tasks=[];
DB.monthly=[];
DB.chat=[];
save();
}
function todayStr(){return new Date().toISOString().slice(0,10)}
function daysLeft(iso){const d=new Date(iso+'T00:00:00'),t=new Date();t.setHours(0,0,0,0);return Math.round((d-t)/864e5)}
function badgeExp(iso){if(!iso)return'<span class="badge bWarn">нет срока</span>';const d=daysLeft(iso);
if(d<0)return`<span class="badge bExp">просрочен ${-d} дн</span>`;if(d<=S().warnDays)return`<span class="badge bSoon">осталось ${d} дн</span>`;
if(d<=30)return`<span class="badge bWarn">${d} дн</span>`;return`<span class="badge bOk">${d} дн</span>`}
function rowCls(iso){if(!iso)return'';const d=daysLeft(iso);if(d<0)return'exp';if(d<=S().warnDays)return'soon';if(d<=30)return'warn';return''}
function myObjects(){const u=me();if(!u)return{bags:[],cars:[]};
return{bags:DB.bags.filter(b=>isBoss()||(u.bags||[]).includes(b.id)),cars:DB.cars.filter(c=>isBoss()||(u.cars||[]).includes(c.id))}}
function soonItems(){const r=[];const mo=myObjects();
mo.bags.forEach(b=>b.items.forEach(it=>{if(it.expiry&&daysLeft(it.expiry)<=S().warnDays)r.push({obj:b.name,it})}));
mo.cars.forEach(c=>c.kits.forEach(k=>k.items.forEach(it=>{if(it.expiry&&daysLeft(it.expiry)<=S().warnDays)r.push({obj:c.name+' / '+k.name,it})})));
return r}
function monthlyDue(){const u=me();if(!u)return[];const mk=todayStr().slice(0,7),d=new Date().getDate();if(d>5)return[];
const r=[];const mo=myObjects();
mo.bags.forEach(b=>{if(!DB.monthly.some(m=>m.kind==='bag'&&m.objId===b.id&&m.month===mk))r.push('сумка '+b.name)});
mo.cars.forEach(c=>{if(!DB.monthly.some(m=>m.kind==='car'&&m.objId===c.id&&m.month===mk))r.push('машина '+c.name)});
return r}
function alerts(){const a=[];const so=soonItems();
if(so.length)a.push({t:`⏰ Истекает/просрочено по вашим объектам: ${so.length} поз.`,l:'bSoon'});
DB.cars.forEach(c=>c.equip.forEach(e=>{if(e.status==='def'&&(isBoss()||(me()&&(me().cars||[]).includes(c.id))))a.push({t:`🔧 ${c.name}: дефект ${e.name}${e.defect?' ('+e.defect+')':''}`,l:'bExp'})}));
DB.uchet.forEach(k=>k.items.forEach(it=>{if(it.expiry&&daysLeft(it.expiry)<=S().warnDays)a.push({t:`🔐 Учёт ${k.name}: ${it.name} — срок!`,l:'bExp'})}));
const md=monthlyDue();if(md.length)a.push({t:`📋 Месячная проверка: ${md.join(', ')} — отметьте проверку`,l:'bWarn'});
if(isBoss()){const pend=DB.reports.filter(r=>!r.viewed).length;if(pend)a.push({t:`📨 Непросмотренных отчётов: ${pend}`,l:'bWarn'});
DB.tasks.forEach(t=>{if(!t.done&&(Date.now()-t.ts)/864e5>3)a.push({t:`📌 Задача висит >3 дней: ${t.text}`,l:'bWarn'})})}
return a}
function renderNav(){const tabs=me()?[['home','Главная'],['bags','Сумки'],['cars','Машины'],['uchet','Учёт'],['chat','Чат'],['set','Ещё']]:[];
nav.innerHTML=tabs.map(t=>`<button class="${tab===t[0]?'on':''}" onclick="go('${t[0]}')">${t[1]}</button>`).join('')}
function go(t){tab=t;renderNav();render()}
function render(){if(!me()){main.innerHTML=loginView();alarm.innerHTML='';return}
main.innerHTML=tab==='home'?homeView():tab==='bags'?bagsView():tab==='cars'?carsView():tab==='uchet'?uchetView():tab==='chat'?chatView():setView();
const a=alerts();alarm.innerHTML=a.length?`<span class="badge bExp">⚠ ${a.length}</span>`:'';
if(tab==='home')startClock()}
function loginView(){let h='<div class="loginwrap"><div class="card"><h2>МедСмена</h2><p style="color:var(--mut)">Вход по PIN-коду сотрудника</p>';
h+=DB.users.map(u=>`<button class="bigbtn" onclick="loginPick(${u.id})">👤 <b>${esc(u.name)}</b> · ${u.role==='admin'?'админ':u.role==='lead'?'руководитель':'сотрудник'}</button>`).join('');
if(loginFor)h+=`<p><input id="pinIn" type="password" placeholder="PIN-код" onkeydown="if(event.key==='Enter')loginDo()"></p><p><button class="btn wide" onclick="loginDo()">Войти</button></p>`;
h+=`<button class="btn sec wide" onclick="regView()">➕ Зарегистрироваться (я новый сотрудник)</button></div></div>`;return h}
function loginPick(id){const u=DB.users.find(x=>x.id===id);if(!u.pin){DB.session=id;save();go('home');return}loginFor=id;render();setTimeout(()=>{const e=document.getElementById('pinIn');e&&e.focus()},0)}
function loginDo(){const u=DB.users.find(x=>x.id===loginFor);const v=document.getElementById('pinIn').value;
if(v!==u.pin)return alert('Неверный PIN');DB.session=u.id;loginFor=null;save();go('home')}
function regView(){openDlg(`<h3>Анкета сотрудника</h3><label>ФИО</label><input id="rName">
<label>PIN-код для входа</label><input id="rPin" type="password" inputmode="numeric">
<label>Повторите PIN</label><input id="rPin2" type="password" inputmode="numeric">
<p style="font-size:13px;color:var(--mut)">Первый зарегистрированный становится администратором.</p>
<p><button class="btn" onclick="regDo()">Создать</button><button class="btn sec" onclick="closeDlg();render()">Отмена</button></p>`)}
function regDo(){const n=rName.value.trim();if(!n)return alert('Введите ФИО');
if(rPin.value!==rPin2.value)return alert('PIN не совпадает');
const role=DB.users.length?'user':'admin';
const u={id:uid(),name:n,pin:rPin.value,role,cars:[],bags:[],channel:'app'};DB.users.push(u);DB.session=u.id;save();closeDlg();go('home');
if(role==='admin')alert('Вы администратор: доступно управление людьми и всеми справочниками')}
let clockTimer=null;
function startClock(){clearInterval(clockTimer);tick();clockTimer=setInterval(tick,1000)}
function tick(){const e=document.getElementById('clk');if(!e)return;const d=new Date();
e.textContent=d.toLocaleTimeString('ru-RU')+'\n'+d.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}
function calGrid(){const n=new Date(),y=n.getFullYear(),mo=n.getMonth(),first=(new Date(y,mo,1).getDay()+6)%7,days=new Date(y,mo+1,0).getDate();
let h='<div class="cal">'+['пн','вт','ср','чт','пт','сб','вс'].map(d=>`<div class="hd">${d}</div>`).join('');
for(let i=0;i<first;i++)h+='<div></div>';for(let d=1;d<=days;d++)h+=`<div class="${d===n.getDate()?'td':''}">${d}</div>`;return h+'</div>'}
function wCode(c){return c===0?'☀️ ясно':c<=3?'⛅ облачно':c<=48?'🌫 туман':c<=67?'🌧 дождь':c<=77?'❄️ снег':c<=82?'🌦 ливень':'⛈ гроза'}
function loadWeather(){const el=document.getElementById('wgt');if(!el)return;const s=S();
if(!s.city){el.innerHTML='<small>город не задан</small>';return}
const g=s.geo;if(g&&g.city===s.city&&Date.now()-g.ts<18e5){el.innerHTML=`<div class="big">${wCode(g.code)} ${g.temp}°C</div><small>${esc(s.city)}</small>`;return}
el.innerHTML='…';fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(s.city)}&count=1&language=ru`).then(r=>r.json()).then(j=>{
if(!j.results||!j.results[0])throw 0;const c=j.results[0];
return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.latitude}&longitude=${c.longitude}&current_weather=true`).then(r=>r.json()).then(w=>{
s.geo={city:s.city,ts:Date.now(),temp:Math.round(w.current_weather.temperature),code:w.current_weather.weathercode};save();
el.innerHTML=`<div class="big">${wCode(s.geo.code)} ${s.geo.temp}°C</div><small>${esc(s.city)}</small>`})}).catch(()=>el.innerHTML='<small>нет связи</small>')}
function homeView(){const a=alerts();const reps=(isBoss()?DB.reports:DB.reports.filter(r=>r.userId===(me()||{}).id)).slice(-8).reverse();
let h='<div class="wgrid"><div class="wgt"><div class="big" id="clk"></div></div><div class="wgt" id="wgt"></div><div class="wgt" style="grid-column:span 2">'+calGrid()+'</div></div>';
loadWeather();
h+='<div class="card"><b>🔔 Тревоги</b>'+(a.length?'<table>'+a.map(x=>`<tr><td><span class="badge ${x.l}">!</span> ${x.t}</td></tr>`).join('')+'</table>':'<p>✅ Всё в порядке</p>')+'</div>';
h+='<div class="card"><b>📨 Отчёты</b>'+(reps.length?'<table>'+reps.map(r=>`<tr><td><span class="badge ${r.status==='green'?'bG':r.status==='yellow'?'bY':'bR'}">${r.status==='green'?'без замечаний':r.status==='yellow'?'с замечаниями':'красный'}</span> ${new Date(r.ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · ${esc(r.car)} · ${esc(r.user)}<br><small>сумка №${esc(r.bagNum||'—')}, ЭКГ №${esc(r.ecgNum||'—')}${r.remarks?' · '+esc(r.remarks):''}</small></td></tr>`).join('')+'</table>':'<p>Отчётов пока нет</p>')+'</div>';
return h}
function chatView(){const rooms=['общая',...DB.cars.map(c=>c.name)];if(!rooms.includes(room))room='общая';
const msgs=DB.chat.filter(m=>m.room===room).slice(-100);
let h=`<select onchange="room=this.value;render()">${rooms.map(r=>`<option ${r===room?'selected':''}>${esc(r)}</option>`).join('')}</select>
<div class="chatbox" id="cbox">${msgs.map(m=>`<div class="msg"><b>${esc(m.author)}</b> <small>${new Date(m.ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small><br>${esc(m.text)}</div>`).join('')||'<p style="color:var(--mut)">Сообщений нет</p>'}</div>
<div class="row"><input id="cIn" placeholder="Сообщение… (вы: ${esc((me()||{}).name||'')})" onkeydown="if(event.key==='Enter')sendMsg()"><button class="btn" style="width:auto" onclick="sendMsg()">➤</button></div>`;
setTimeout(()=>{const b=document.getElementById('cbox');if(b)b.scrollTop=b.scrollHeight},0);return h}
function sendMsg(){const v=document.getElementById('cIn').value.trim();if(!v)return;
DB.chat.push({id:uid(),ts:Date.now(),author:(me()||{}).name||'аноним',room,text:v});save();render()}
function setView(){const u=me();let h=`<div class="card"><h3>Мой профиль</h3>
<label>ФИО</label><input value="${esc(u.name)}" onchange="me().name=this.value;save()">
<label>Новый PIN (оставьте пустым — не менять)</label><input id="sPin" type="password" inputmode="numeric" onchange="if(this.value){me().pin=this.value;save();this.value=''}">
<label>Канал оповещений-дублёров</label><select onchange="me().channel=this.value;save()"><option value="app" ${u.channel==='app'?'selected':''}>Только приложение</option><option value="tg" ${u.channel==='tg'?'selected':''}>Telegram</option><option value="max" ${u.channel==='max'?'selected':''}>MAX</option></select>
<label>Мои ответственные машины</label>${DB.cars.map(c=>`<label class="chk"><input type="checkbox" ${(u.cars||[]).includes(c.id)?'checked':''} onchange="toggleResp('cars',${c.id},this.checked)"> ${esc(c.name)}</label>`).join('')||'<p style="color:var(--mut)">машин пока нет</p>'}
<label>Мои ответственные сумки</label>${DB.bags.map(b=>`<label class="chk"><input type="checkbox" ${(u.bags||[]).includes(b.id)?'checked':''} onchange="toggleResp('bags',${b.id},this.checked)"> ${esc(b.name)}</label>`).join('')||'<p style="color:var(--mut)">сумок пока нет</p>'}
</div>`;
h+=`<div class="card"><h3>Внешний вид и правила</h3>
<label>Город (погода)</label><input value="${esc(S().city)}" onchange="S().city=this.value;S().geo=null;save();render()">
<label>Предупреждать за дней</label><input type="number" value="${S().warnDays}" onchange="S().warnDays=+this.value||10;save()">
<div class="row"><div><label>Цвет темы</label><input type="color" value="${S().accent}" onchange="S().accent=this.value;save();applyTheme()"></div>
h+='<div class="card"><b>📨 Отчёты</b>'+(reps.length?'<table>'+reps.map(r=>`<tr><td><span class="badge ${r.status==='green'?'bG':r.status==='yellow'?'bY':'bR'}">${r.status==='green'?'без замечаний':r.status==='yellow'?'с замечаниями':'красный'}</span> ${new Date(r.ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} · ${esc(r.car)} · ${esc(r.user)}<br><small>сумка №${esc(r.bagNum||'—')}, ЭКГ №${esc(r.ecgNum||'—')}${r.remarks?' · '+esc(r.remarks):''}</small></td></tr>`).join('')+'</table>':'<p>Отчётов пока нет</p>')+'</div>';
<p><button class="btn sec" onclick="reqNotif()">🔔 Разрешить уведомления</button></p></div>`;
if(u.role==='admin'){h+=`<div class="card"><h3>👑 Админ-зона: сотрудники</h3><table><tr><th>ФИО</th><th>Роль</th><th>Канал</th><th></th></tr>`+
DB.users.map(x=>`<tr><td>${esc(x.name)}</td><td><select onchange="setRole(${x.id},this.value)" ${x.id===u.id?'disabled':''}><option value="user" ${x.role==='user'?'selected':''}>сотрудник</option><option value="lead" ${x.role==='lead'?'selected':''}>руководитель</option><option value="admin" ${x.role==='admin'?'selected':''}>админ</option></select></td><td>${x.channel}</td><td>${x.id!==u.id?`<button class="btn del" onclick="delUser(${x.id})">🗑</button>`:''}</td></tr>`).join('')+'</table></div>'}
h+=`<div class="card"><h3>Данные</h3>
<p><button class="btn sec" onclick="exportDB()">⬇️ Экспорт (backup)</button><label class="btn sec" style="display:inline-block">⬆️ Импорт<input type="file" hidden accept=".json" onchange="importDB(this)"></label></p>
<p><button class="btn sec" onclick="DB.session=null;save();go('home')">🚪 Выйти</button>
<button class="btn del" onclick="if(confirm('Полный сброс базы?')){localStorage.removeItem(LS);location.reload()}">Сброс</button></p>
<p style="font-size:12px;color:var(--mut)">v3 · локальный режим. Сервер синхронизации подключается отдельным модулем.</p></div>`;
return h}
function toggleResp(kind,id,on){const u=me();u[kind]=u[kind]||[];if(on){if(!u[kind].includes(id))u[kind].push(id)}else u[kind]=u[kind].filter(x=>x!==id);save()}
function setRole(id,r){DB.users.find(x=>x.id===id).role=r;save();render()}
function delUser(id){if(confirm('Удалить сотрудника?')){DB.users=DB.users.filter(x=>x.id!==id);save();render()}}
function reqNotif(){Notification.requestPermission().then(()=>alert(Notification.permission==='granted'?'Уведомления включены':'Разрешение не дано'))}
function checkAlarm(){if(!me())return;const a=alerts();alarm.innerHTML=a.length?`<span class="badge bExp">⚠ ${a.length}</span>`:'';
if(a.length&&Notification.permission==='granted'&&document.hidden){const ts=+localStorage.getItem('lastNotif')||0;
if(Date.now()-ts>36e5){localStorage.setItem('lastNotif',Date.now());new Notification('МедСмена',{body:a.slice(0,3).map(x=>x.t).join('\n')})}}}
setInterval(checkAlarm,60000);
addEventListener('storage',e=>{if(e.key===LS&&e.newValue){DB=JSON.parse(e.newValue);applyTheme();render()}});
function exportDB(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(DB)],{type:'application/json'}));a.download='medshift-'+todayStr()+'.json';a.click()}
function importDB(inp){const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{DB=JSON.parse(r.result);save();location.reload()}catch(e){alert('Ошибка файла')}};r.readAsText(f)}
applyTheme();go('home');
