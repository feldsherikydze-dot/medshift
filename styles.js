:root{--ac:#0b5394;--bg:#f4f6f8;--card:#fff;--tx:#111;--mut:#666;--bd:#ddd;--fs:14px;--vh:1vh;--kb:0px;--sab:env(safe-area-inset-bottom,0px)}
body.dark{--bg:#12161c;--card:#1c232c;--tx:#e8e8e8;--mut:#9aa5b1;--bd:#2a3340}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{font-family:system-ui;margin:0;background:var(--bg);color:var(--tx);overflow-x:hidden;-webkit-text-size-adjust:100%;font-size:var(--fs)}
header{background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(0,0,0,.10)),var(--ac);color:#fff;padding:8px 12px;font-size:calc(var(--fs) + 2px);display:flex;align-items:flex-start;justify-content:space-between;gap:8px;flex-wrap:wrap;box-shadow:0 2px 10px rgba(0,0,0,.20)}
@supports(padding-top:env(safe-area-inset-top)){header{padding-top:calc(8px + env(safe-area-inset-top))}}
.hdr-left{display:flex;align-items:center;gap:8px;flex:1 1 auto;min-width:0}
.hdr-user{font-size:calc(var(--fs) - 2px);opacity:.95;white-space:normal;text-align:right;line-height:1.2;max-width:52%}
nav{display:flex;background:var(--card);border-bottom:1px solid var(--bd);position:sticky;top:0;z-index:10;overflow-x:auto;-webkit-overflow-scrolling:touch;box-shadow:0 1px 0 var(--bd)}
nav button{flex:1 0 auto;padding:10px 6px;border:0;background:none;font-size:calc(var(--fs) - 3px);color:var(--tx);white-space:nowrap;min-width:0;position:relative}
nav button.on{font-weight:700;color:var(--ac)}
nav button.on::after{content:'';position:absolute;left:20%;right:20%;bottom:4px;height:3px;border-radius:3px;background:var(--ac)}
main{padding:8px 8px calc(80px + var(--sab) + var(--kb,0px));max-width:900px;margin:0 auto;width:100%}
main h3{margin:10px 2px 8px}
.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:10px;margin-bottom:8px;overflow:hidden;word-wrap:break-word;box-shadow:0 1px 2px rgba(0,0,0,.06),0 4px 12px rgba(0,0,0,.05);transition:transform .06s}
.card.clickable{cursor:pointer}
.card.clickable:active{transform:scale(.985)}
body.dark .card{box-shadow:0 1px 2px rgba(0,0,0,.45),0 4px 14px rgba(0,0,0,.28)}
table{width:100%;border-collapse:collapse;font-size:calc(var(--fs) - 1px);table-layout:fixed}
td,th{padding:5px 4px;border-bottom:1px solid var(--bd);text-align:left;vertical-align:middle;word-wrap:break-word;overflow-wrap:break-word;overflow:hidden;text-overflow:ellipsis}
tbody tr:nth-child(even):not(.exp):not(.soon){background:rgba(127,179,255,.06)}
body.dark tbody tr:nth-child(even):not(.exp):not(.soon){background:rgba(255,255,255,.035)}
.badge{border-radius:999px;padding:3px 8px;font-size:calc(var(--fs) - 3px);white-space:nowrap;display:inline-block;font-weight:600}
.bExp{background:#ffd2d2;color:#7a1010}.bSoon{background:#ffe0c2;color:#8a4b00}
.bWarn{background:#fff3c2;color:#7a6000}.bOk{background:#d9f2d9;color:#1b5e20}
.bG{background:#2e7d32;color:#fff}.bY{background:#f9a825;color:#332}.bR{background:#c62828;color:#fff}
tr.exp{background:#ffe3e3}tr.soon{background:#ffedd9}
tr.highlight{animation:hlPulse 1.5s ease-in-out 3}
@keyframes hlPulse{0%,100%{background:transparent}50%{background:#fff3c2}}
.btn{background:var(--ac);color:#fff;border:0;border-radius:10px;padding:8px 12px;font-size:var(--fs);margin:3px 3px 3px 0;white-space:nowrap;max-width:100%;box-shadow:0 2px 6px rgba(0,0,0,.16);transition:transform .06s}
button{touch-action:manipulation}
.btn:active{transform:scale(.96)}
.btn.sec{background:transparent;color:var(--ac);border:1px solid var(--ac);box-shadow:none}
.btn.del{background:transparent;color:#c62828;border:1px solid #c62828;padding:4px 8px;margin:0;box-shadow:none}
.btn.mini{padding:4px 8px;margin:0;font-size:calc(var(--fs) - 2px)}
.btn.wide{width:100%;padding:12px;margin:4px 0}
input,select,textarea{padding:8px;border:1px solid var(--bd);border-radius:8px;font-size:var(--fs);width:100%;box-sizing:border-box;background:var(--card);color:var(--tx);min-width:0}
input:focus,select:focus,textarea:focus{outline:2px solid var(--ac);outline-offset:1px}
textarea{min-height:60px;resize:vertical}
input[type=date]{width:130px!important;flex:none!important}
label{font-size:calc(var(--fs) - 2px);color:var(--mut);display:block;margin-top:4px}
.row{display:flex;gap:6px;flex-wrap:wrap}
.row>*{flex:1 1 45%;min-width:0}
.prev{max-height:200px;overflow:auto;border:1px solid var(--bd);border-radius:8px;margin:6px 0;padding:4px;-webkit-overflow-scrolling:touch}
.loginwrap{max-width:400px;margin:20px auto;padding:0 8px}
.loginwrap .card{border-radius:18px;padding:18px 14px;box-shadow:0 10px 34px rgba(0,0,0,.14);text-align:center}
body.dark .loginwrap .card{box-shadow:0 10px 34px rgba(0,0,0,.5)}
.loginwrap h2{margin:4px 0 2px;font-size:calc(var(--fs) + 10px);letter-spacing:.5px}
.bigbtn{display:block;width:100%;margin:4px 0;padding:12px;border-radius:12px;border:1px solid var(--bd);background:var(--card);color:var(--tx);font-size:calc(var(--fs) + 1px);text-align:left;word-wrap:break-word}
.chatbox{height:260px;overflow:auto;background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:6px;margin:6px 0;-webkit-overflow-scrolling:touch}
.msg{margin:3px 0;padding:5px 7px;border-radius:10px;background:var(--bg);font-size:calc(var(--fs) - 1px);word-wrap:break-word;overflow-wrap:break-word;margin-right:14%}
.msg b{color:var(--ac)}
.msg small{color:var(--mut)}
.msg.mine{background:var(--ac);color:#fff;margin-right:0;margin-left:16%}
.msg.mine b{color:#fff}
.msg.mine small{color:rgba(255,255,255,.75)}
.msg.sys{background:transparent;border:1px dashed var(--bd);color:var(--mut);text-align:center;margin-left:8%;margin-right:8%;font-size:calc(var(--fs) - 2px)}
.chatIn{display:flex;align-items:flex-end;gap:6px;margin:8px 0;flex-wrap:nowrap}
.chatIn textarea{flex:1 1 auto;min-width:0;resize:none;min-height:38px;max-height:100px;padding:8px;line-height:1.3;font-family:inherit;font-size:16px;box-sizing:border-box}
.chatIn .btn{flex:0 0 auto;margin:0;padding:8px 16px}
.wgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.wgrid .card{margin-bottom:0}
.wgrid .span2{grid-column:span 2}
.clockWeather{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;padding:10px;background:linear-gradient(135deg,rgba(255,255,255,.10),rgba(0,0,0,.03)),var(--card);border:1px solid var(--bd);border-radius:16px;margin-bottom:8px;box-shadow:0 4px 14px rgba(0,0,0,.08)}
.clockWeather:active{opacity:.85}
body.dark .clockWeather{background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(0,0,0,.18)),var(--card)}
.cwLeft{display:flex;flex-direction:column;line-height:1.3}
.cwTime{font-size:calc(var(--fs) + 6px);font-weight:700;color:var(--tx);letter-spacing:.5px}
.cwDate{font-size:calc(var(--fs) - 2px);color:var(--mut)}
.cwRight{text-align:right;white-space:nowrap}
.cwTemp{font-size:calc(var(--fs) + 4px);font-weight:600}
.cwDesc{font-size:calc(var(--fs) - 3px);color:var(--mut)}
.cwSeason{text-align:center;flex:0 0 auto;line-height:1.3;padding:0 4px;font-size:var(--fs);white-space:normal;max-width:52%;overflow:visible}
.seasonBox{line-height:1.25}
.seasonIcons{font-size:calc(var(--fs) + 7px);letter-spacing:3px;animation:seasonFloat 3.2s ease-in-out infinite}
.seasonName{font-weight:700;font-size:calc(var(--fs) + 2px);color:var(--tx);margin-top:2px;position:relative}
.seasonSoul{font-size:calc(var(--fs) - 3px);color:var(--mut);font-style:italic;margin-top:1px}
.seasonHoliday{margin-top:3px;font-size:calc(var(--fs) - 1px);font-weight:700;color:var(--ac)}
.seasonBday{margin-top:2px;font-size:calc(var(--fs) - 2px);font-weight:700;color:#d81b60}
body.dark .seasonBday{color:#ff8ab0}
@keyframes seasonFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
.sdSide{display:inline-block;margin:0 16px;font-size:calc(var(--fs) + 3px);animation:decoFloat 4s ease-in-out infinite;pointer-events:none}
.sdSide.r{animation-delay:2s}
@keyframes decoFloat{0%,100%{transform:translateY(0) rotate(-8deg)}50%{transform:translateY(-4px) rotate(8deg)}}
.sdTop{position:absolute;top:-22px;font-size:calc(var(--fs) - 2px);animation:decoFloat 4.5s ease-in-out infinite;pointer-events:none;filter:drop-shadow(0 1px 1px rgba(0,0,0,.18))}
.sdTop.tL{left:10%}
.sdTop.tR{right:10%;animation-delay:2.25s}
.forecastGrid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:8px}
.fcDay{text-align:center;padding:6px 2px;background:var(--bg);border-radius:6px;font-size:calc(var(--fs) - 3px)}
.fcDay.today{background:var(--ac);color:#fff}
.fcDay .fcTemp{font-weight:700;font-size:calc(var(--fs) - 1px);margin-top:2px}
.cal{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;font-size:calc(var(--fs) - 4px)}
.cal div{padding:2px 0;text-align:center;border-radius:4px}
.cal .td{background:var(--ac);color:#fff;font-weight:700}
.cal .hd{color:var(--mut);font-weight:600}
.thumbs{display:flex;flex-wrap:wrap;gap:6px}
.thumbs img{width:100px;height:100px;object-fit:cover;border-radius:8px;border:1px solid var(--bd);cursor:pointer}
.toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:rgba(28,28,30,.92);color:#fff;padding:8px 16px;border-radius:12px;font-size:calc(var(--fs) - 1px);opacity:0;pointer-events:none;transition:opacity .3s;z-index:99;max-width:92%;text-align:center;word-wrap:break-word;box-shadow:0 6px 20px rgba(0,0,0,.35);backdrop-filter:blur(6px)}
.toast.show{opacity:1}
body.dark .toast{background:rgba(238,238,240,.94);color:#14181d}
#dlg{margin:4px auto;max-height:calc(100vh - 8px);overflow:auto;width:calc(100% - 8px);border-radius:16px;border:1px solid var(--bd);background:var(--card);color:var(--tx);box-shadow:0 12px 40px rgba(0,0,0,.28);animation:dlgIn .16s ease}
#dlg h3{margin-top:2px;color:var(--tx)}
#dlg h4,#dlg label,#dlg p,#dlg td,#dlg th{color:var(--tx)}
#dlg small{color:var(--mut)}
#dlg input,#dlg select,#dlg textarea{background:var(--card);color:var(--tx);border-color:var(--bd)}
#dlg option{background:var(--card);color:var(--tx)}
#dlg::backdrop{background:rgba(0,0,0,.25)}
@keyframes dlgIn{from{transform:scale(.97);opacity:.6}to{transform:scale(1);opacity:1}}
.photoDlgBody{display:flex;flex-direction:column;height:min(85vh,calc(100vh - 32px))}
.photoViewport{flex:1;min-height:0;overflow:hidden;position:relative;background:#000;border-radius:8px;touch-action:none;cursor:grab}
.photoViewport.grabbing{cursor:grabbing}
.photoViewport img{position:absolute;top:50%;left:50%;transform-origin:center center;user-select:none;-webkit-user-drag:none;pointer-events:none}
.photoZoomBar{flex-shrink:0;display:flex;align-items:center;gap:4px;margin-top:6px;justify-content:center;flex-wrap:wrap}
.photoZoomBar .btn{margin:0;padding:6px 10px;font-size:calc(var(--fs) + 1px);min-width:36px}
.photoZoomBar span{font-size:calc(var(--fs) - 3px);color:var(--mut);min-width:40px;text-align:center}
.photoBtns{flex-shrink:0;display:flex;gap:6px;margin-top:6px}
.photoBtns .btn{flex:1;margin:0}
.reportDetail p{margin:3px 0;font-size:calc(var(--fs) - 1px);word-wrap:break-word;color:var(--tx)}
.reportDetail b{color:var(--ac)}
.reportDetail .rdSection{margin-top:8px;padding-top:6px;border-top:1px solid var(--bd)}
.reportDetail .rdDefect{color:#c62828;font-size:calc(var(--fs) - 2px);word-wrap:break-word}
body.dark .reportDetail .rdDefect{color:#ff8a80}
.col-name{width:40%}.col-spec{width:20%}.col-qty{width:12%}.col-exp{width:18%}.col-act{width:10%}
.col-ovm{width:15%}.col-eqname{width:30%}.col-status{width:18%}.col-notes{width:18%}.col-mark{width:19%}
.editMode input,.editMode select{border-color:var(--ac);background:#fffde7}
body.dark .editMode input,body.dark .editMode select{background:#2a2a1a}
.tplHeader{display:flex;align-items:center;justify-content:space-between;padding:10px;cursor:pointer;border-radius:8px;margin-bottom:4px;background:var(--bg);transition:background .15s;flex-wrap:nowrap;gap:6px}
.tplHeader:hover{opacity:.85}
.tplHeader b{font-size:calc(var(--fs) + 1px);flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tplHeader .tplCount{font-size:calc(var(--fs) - 2px);color:var(--mut);flex:0 0 auto;min-width:64px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.tplHeader .tplDel{flex:0 0 auto;margin-left:6px}
.tplBody{display:none;padding:4px 0}
.tplBody.open{display:block}
.tplBody table{table-layout:fixed;width:100%}
.tplBody thead th:nth-child(3),.tplBody tbody td:nth-child(3){width:20%;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tplBody thead th:nth-child(4),.tplBody tbody td:nth-child(4){width:12%;text-align:center}
.tplBody tbody td:nth-child(3) input{text-align:right}
.tplBody tbody tr:nth-child(even){background:rgba(127,179,255,.12)}
body.dark .tplBody tbody tr:nth-child(even){background:rgba(255,255,255,.06)}
.searchBox{margin:6px 0;position:relative}
.searchBox input{padding-right:30px}
.searchClear{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:var(--mut);font-size:16px;cursor:pointer;padding:0}
.drugResults{max-height:150px;overflow:auto;border:1px solid var(--bd);border-radius:8px;margin-top:4px;background:var(--card);color:var(--tx)}
.drugItem{padding:6px 8px;cursor:pointer;border-bottom:1px solid var(--bd);font-size:calc(var(--fs) - 1px);color:var(--tx)}
.drugItem:hover,.drugItem:active{background:var(--bg)}
.drugItem:last-child{border-bottom:0}
.drugItem .diName{font-weight:600;color:var(--ac)}
.drugItem .diSpec{color:var(--mut);font-size:calc(var(--fs) - 2px)}
.bgRow{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.bgRow .btn{margin:0}
.btn.on{outline:2px solid var(--ac);outline-offset:1px}
.tplDrugs{margin:8px 0 4px;padding-top:6px;border-top:1px dashed var(--bd)}
.tplDrugs>.searchBox{margin-top:4px}
.refSearch{position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0}
.refCard{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:12px;margin-bottom:8px}
.refCard h4{margin:0 0 6px;color:var(--ac)}
.refRow{display:flex;gap:8px;margin-bottom:4px;font-size:calc(var(--fs) - 1px)}
.refLabel{color:var(--mut);min-width:80px;flex-shrink:0}
.refVal{font-weight:500}
.refRx{background:var(--bg);border-radius:8px;padding:8px 10px;margin-top:8px;font-family:'Courier New',monospace;font-size:calc(var(--fs) - 1px);white-space:pre-wrap;word-break:break-word;border-left:3px solid var(--ac);color:var(--tx)}
body.dark .refRx{background:#0f1318;color:#e8e8e8}
.refAnalogs{margin-top:6px;font-size:calc(var(--fs) - 2px);color:var(--mut)}
.refAnalogs span{display:inline-block;background:var(--bg);border-radius:4px;padding:2px 6px;margin:2px 2px 0 0;border:1px solid var(--bd);color:var(--tx)}
body.dark .refAnalogs span{background:#1a2129;color:#e8e8e8}
.schedCard{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:10px;margin-bottom:8px}
.schedCard .scDate{font-weight:700;color:var(--ac);font-size:calc(var(--fs) + 1px)}
.schedCard .scLine{font-size:calc(var(--fs) - 1px);margin-top:2px}
.schedCard .scActions{margin-top:6px;display:flex;gap:6px}
.schedTabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}
.schedTabs .btn{margin:0}
.shiftEmpty{color:var(--mut);padding:8px;text-align:center;font-size:calc(var(--fs) - 1px)}
.empCard{padding:6px 0;border-bottom:1px dashed var(--bd)}
.empCard:last-of-type{border-bottom:0}
.erHead{display:flex;align-items:center;gap:6px;min-width:0}
.erHead>b{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.erHead>span[style*="nowrap"]{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
.erBtns{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;padding-left:16px}
.erBtns .btn{margin:0}
.msLogo{width:64px;height:64px;display:block;margin:0 auto 6px;filter:drop-shadow(0 4px 10px rgba(0,0,0,.25))}
.msLeaves{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:6;overflow:hidden}
.msLeaf{position:absolute;left:0;top:0;will-change:transform;user-select:none;line-height:1;opacity:.95;filter:drop-shadow(0 1px 1px rgba(0,0,0,.18))}
#msBg{position:fixed;left:0;top:0;right:0;bottom:0;z-index:-1;pointer-events:none;background-size:cover;background-position:center}
body.dark #msBg{filter:brightness(.55) saturate(.85)}
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}
@media(max-width:480px){
  header{padding:6px 10px}
  .hdr-user{max-width:48%}
  nav button{padding:8px 4px}
  main{padding:6px 6px calc(80px + var(--sab) + var(--kb,0px))}
  .card{padding:8px;border-radius:8px}
  .btn{padding:7px 10px;margin:2px}
  .btn.mini{padding:3px 6px}
  .bigbtn{padding:10px}
  .wgrid{grid-template-columns:1fr}
  .wgrid .span2{grid-column:span 1}
  .clockWeather{padding:8px;gap:6px}
  .cwSeason{max-width:46%}
  .seasonIcons{font-size:calc(var(--fs) + 5px)}
  .forecastGrid{grid-template-columns:repeat(4,1fr)}
  .thumbs img{width:80px;height:80px}
  .chatbox{height:220px}
  .msg{padding:4px 6px}
  .row>*{flex:1 1 100%}
  #dlg{width:calc(100% - 4px);margin:2px auto}
  .loginwrap{margin:10px auto}
  .col-name{width:35%}.col-spec{width:18%}.col-qty{width:12%}.col-exp{width:22%}.col-act{width:13%}
  .col-ovm{width:12%}.col-eqname{width:28%}.col-status{width:20%}.col-notes{width:20%}.col-mark{width:20%}
  input[type=date]{width:110px!important}
  .refLabel{min-width:60px}
}
@media(min-width:481px) and (max-width:768px){
  main{padding:10px 10px calc(80px + var(--sab) + var(--kb,0px))}
  .wgrid{grid-template-columns:1fr 1fr}
}
@media(min-width:769px){
  main{padding:12px 12px calc(80px + var(--sab) + var(--kb,0px))}
  td,th{padding:6px 4px}
  .btn{padding:9px 14px}
  .thumbs img{width:110px;height:110px}
  .chatbox{height:280px}
  #dlg{width:min(680px,95%);margin:8px auto}
}