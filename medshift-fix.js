(function () {
  console.log('МедСмена: исправления загружены');

  /* =========================================
     1. CSS FIX: тёмная тема, диалоги, справочник
     ========================================= */
  var css = `
#dlg{
  background:var(--card);
  color:var(--tx);
  border-color:var(--bd);
}

#dlg h3,
#dlg h4,
#dlg label,
#dlg p,
#dlg td,
#dlg th{
  color:var(--tx);
}

#dlg small{
  color:var(--mut);
}

#dlg input,
#dlg select,
#dlg textarea{
  background:var(--card);
  color:var(--tx);
  border-color:var(--bd);
}

#dlg option{
  background:var(--card);
  color:var(--tx);
}

.refRx{
  background:var(--bg);
  color:var(--tx);
  border-left:3px solid var(--ac);
}

.refAnalogs{
  color:var(--mut);
}

.refAnalogs span{
  background:var(--bg);
  color:var(--tx);
  border:1px solid var(--bd);
}

.drugResults{
  background:var(--card);
  color:var(--tx);
}

.drugItem{
  color:var(--tx);
}

.reportDetail,
.reportDetail p{
  color:var(--tx);
}

.reportDetail b{
  color:var(--ac);
}

.reportDetail .rdDefect{
  color:#c62828;
}

body.dark .reportDetail .rdDefect{
  color:#ff8a80;
}

body.dark .refRx{
  background:#0f1318;
  color:#e8e8e8;
}

body.dark .refAnalogs span{
  background:#1a2129;
  color:#e8e8e8;
}
`;

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  function fixText(s) {
    return String(s)
      .split('НД/НС').join('НС/ЛС')
      .split('наркотических средств и психотропных веществ').join('НС/ЛС');
  }

  if (window.DB && !DB.shiftGrid) {
    DB.shiftGrid = [];
  }

  /* =========================================
     2. Замена текста в диалогах
     ========================================= */
  if (window.openDlg) {
    var _openDlg = window.openDlg;
    window.openDlg = function (h) {
      if (typeof h === 'string') h = fixText(h);
      _openDlg(h);
    };
  }

  /* =========================================
     3. НО/СЛ: создание комплекта из любого шаблона
     ========================================= */
  window.getTplById = function (id) {
    if (id === 'bag') {
      return (window.DB && DB.bagTypes && DB.bagTypes[0]) ? DB.bagTypes[0] : { name: 'Шаблон сумки', items: [] };
    }

    var ki = parseInt(String(id).replace('kit_', ''), 10);
    return (window.DB && DB.kitTemplates && DB.kitTemplates[ki]) ? DB.kitTemplates[ki] : { name: 'Шаблон', items: [] };
  };

  window.createPotentBagFromTpl = function (tplId) {
    var tpl = window.getTplById ? getTplById(tplId) : null;

    if (!tpl || !(tpl.items || []).length) {
      return toast('Шаблон пуст или не найден');
    }

    askText('Название комплекта НО/СЛ', '⚕ НО/СЛ', function (n) {
      if (!n.trim()) return;

      DB.potents = DB.potents || [];

      DB.potents.push({
        id: uid(),
        name: n.trim(),
        items: tpl.items.filter(function (i) {
          return i.name && i.name !== 'Новая позиция';
        }).map(function (i) {
          return {
            name: i.name,
            spec: i.spec || '',
            unit: i.unit || 'шт',
            qty: i.qty || 1,
            expiry: '',
            potent: true
          };
        })
      });

      save();

      curPot = true;
      curTpl = false;
      curPotKit = DB.potents[DB.potents.length - 1].id;

      render();
      toast('Комплект НО/СЛ создан');
    });
  };

  window.createPotentBag = function () {
    if (window.openTplId) {
      return createPotentBagFromTpl(openTplId);
    }

    var kt = (DB.kitTemplates || []).find(function (k) {
      return k.name.indexOf('Сильнодействующие') >= 0 || k.name.indexOf('НО/СЛ') >= 0;
    });

    if (!kt) {
      curPot = false;
      curTpl = true;
      render();
      return toast('Откройте шаблон и нажмите «Создать комплект НО/СЛ из этого шаблона»');
    }

    var ki = (DB.kitTemplates || []).indexOf(kt);
    createPotentBagFromTpl('kit_' + ki);
  };

  if (window.tplView) {
    var _tplView = window.tplView;
    window.tplView = function () {
      var h = _tplView();
      h = h.replace(/<p style="margin-top:6px"><button class="btn mini" onclick="createPotentBag\(\)">[\s\S]*?<\/button><\/p>/g, '');
      return fixText(h);
    };
  }

  function injectTplPotentButtons() {
    if (!window.curTpl || !window.openTplId) return;
    if (!window.me || !me()) return;

    var body = document.getElementById('tpl_' + openTplId);
    if (!body || !body.classList.contains('open')) return;
    if (body.querySelector('.ms-potent-create')) return;

    var p = document.createElement('p');
    p.style.marginTop = '6px';

    var btn = document.createElement('button');
    btn.className = 'btn mini ms-potent-create';
    btn.textContent = '📦 Создать комплект НО/СЛ из этого шаблона';

    btn.onclick = function () {
      createPotentBagFromTpl(openTplId);
    };

    p.appendChild(btn);
    body.appendChild(p);
  }

  /* =========================================
     4. Отчёты: статусы, печать, скачивание
     ========================================= */
  window.expiredItemText = function (d) {
    if (typeof d === 'string') return d;

    if (d && d.item) {
      var place = d.type === 'kit'
        ? ((d.carName || '') + ' / ' + (d.kitName || ''))
        : (d.name || '');

      return place + ': ' + (d.item.name || '') + ' (' + (d.item.expiry || 'нет срока') + ')';
    }

    return 'неизвестная позиция';
  };

  window.reportStatus = function (r) {
    if (!r) return { cls: 'bY', label: '—' };

    if (r.resolved) {
      return { cls: 'bG', label: '✅ исправлен' };
    }

    if (r.status === 'green') {
      return { cls: 'bG', label: 'без замечаний' };
    }

    if (r.status === 'yellow') {
      return { cls: 'bY', label: 'с замечаниями' };
    }

    return { cls: 'bR', label: 'КРАСНЫЙ' };
  };

  window.reportBadge = function (r) {
    var s = reportStatus(r);
    return '<span class="badge ' + s.cls + '">' + s.label + '</span>';
  };

  window.reportsView = function () {
    var h = '<h3>📨 Отчёты</h3>';
    h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Просмотр доступен всем. Удалять и менять статус может только руководитель или админ.</p>';

    var reps = (DB.reports || []).slice().reverse();

    if (!reps.length) {
      return h + '<p>Отчётов пока нет</p>';
    }

    h += '<table>';

    reps.forEach(function (r) {
      h += '<tr>';
      h += '<td>' + reportBadge(r) + ' <b>' + esc(r.car || '') + '</b> · ' + esc(r.user || '') + '<br>';
      h += '<small>' + new Date(r.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

      if (r.remarks) {
        h += ' · ' + esc(r.remarks);
      }

      if (r.potentBag) {
        h += ' · ⚕ ' + esc(r.potentBag);
      }

      h += '</small></td>';

      h += '<td style="width:1%;white-space:nowrap">';
      h += '<button class="btn sec mini" onclick="viewReport(' + r.id + ')">👁</button>';

      if (isBoss()) {
        h += ' <button class="btn del" onclick="delReport(' + r.id + ')">🗑</button>';
      }

      h += '</td></tr>';
    });

    h += '</table>';

    return h;
  };

  window.resolveReport = function (id) {
    if (!isBoss()) return;

    var r = DB.reports.find(function (x) { return x.id === id; });
    if (!r) return;

    r.resolved = true;
    r.viewed = true;
    r.resolvedBy = (me() || {}).name || '';
    r.resolvedTs = Date.now();

    save();
    closeDlg();
    render();

    toast('Отчёт отмечен как исправленный');
  };

  window.unresolveReport = function (id) {
    if (!isBoss()) return;

    var r = DB.reports.find(function (x) { return x.id === id; });
    if (!r) return;

    r.resolved = false;
    delete r.resolvedBy;
    delete r.resolvedTs;

    save();
    closeDlg();
    render();

    toast('Отчёт возвращён в работу');
  };

  window.reportText = function (r) {
    var s = reportStatus(r);
    var L = [];

    L.push('ОТЧЁТ ПО СМЕНЕ');
    L.push('');
    L.push('Статус: ' + s.label);
    L.push('Дата: ' + new Date(r.ts).toLocaleString('ru-RU'));
    L.push('Машина: ' + (r.car || ''));
    L.push('Сотрудник: ' + (r.user || ''));
    L.push('Бригада: ' + (r.brigade || '—'));
    L.push('Рабочая сумка: ' + (r.bagNum || '—'));
    L.push('ЭКГ №: ' + (r.ecgNum || '—') + ' · заряд: ' + (r.ecgCharge || '—'));

    if (r.potentBag) {
      L.push('Комплекты НО/СЛ: ' + r.potentBag);
    }

    if (r.defects && r.defects.length) {
      L.push('');
      L.push('Дефекты оборудования:');
      r.defects.forEach(function (d) {
        L.push('- ' + d);
      });
    }

    if (r.expired && r.expired.length) {
      L.push('');
      L.push('Просроченные / истекающие позиции:');
      r.expired.forEach(function (d) {
        L.push('- ' + expiredItemText(d));
      });
    }

    if (r.remarks) {
      L.push('');
      L.push('Примечания:');
      L.push(r.remarks);
    }

    if (r.resolved) {
      L.push('');
      L.push('Отчёт отмечен как исправленный:');
      L.push(new Date(r.resolvedTs).toLocaleString('ru-RU') + ' · ' + (r.resolvedBy || ''));
    }

    return L.join('\n');
  };

  window.downloadReport = function (id) {
    var r = DB.reports.find(function (x) { return x.id === id; });
    if (!r) return;

    var text = reportText(r);
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');

    a.href = URL.createObjectURL(blob);
    a.download = 'otchet-' + String(r.car || '').replace(/\s+/g, '_') + '-' + new Date(r.ts).toISOString().slice(0, 10) + '.txt';
    a.click();

    toast('Отчёт сохранён в файл');
  };

  window.reportPrintHtml = function (r) {
    var s = reportStatus(r);

    var h = '';
    h += '<h1>Отчёт по смене</h1>';
    h += '<p><b>Статус:</b> ' + s.label + '</p>';
    h += '<p><b>Дата:</b> ' + new Date(r.ts).toLocaleString('ru-RU') + '</p>';
    h += '<p><b>Машина:</b> ' + esc(r.car || '') + '</p>';
    h += '<p><b>Сотрудник:</b> ' + esc(r.user || '') + '</p>';
    h += '<p><b>Бригада:</b> ' + esc(r.brigade || '—') + '</p>';
    h += '<p><b>Рабочая сумка:</b> ' + esc(r.bagNum || '—') + '</p>';
    h += '<p><b>ЭКГ №:</b> ' + esc(r.ecgNum || '—') + ' · заряд: ' + esc(r.ecgCharge || '—') + '</p>';

    if (r.potentBag) {
      h += '<p><b>Комплекты НО/СЛ:</b> ' + esc(r.potentBag) + '</p>';
    }

    if (r.defects && r.defects.length) {
      h += '<div class="section"><b>Дефекты оборудования:</b><ul>';
      r.defects.forEach(function (d) {
        h += '<li>' + esc(d) + '</li>';
      });
      h += '</ul></div>';
    }

    if (r.expired && r.expired.length) {
      h += '<div class="section"><b>Просроченные / истекающие позиции:</b><ul>';
      r.expired.forEach(function (d) {
        h += '<li>' + esc(expiredItemText(d)) + '</li>';
      });
      h += '</ul></div>';
    }

    if (r.remarks) {
      h += '<div class="section"><b>Примечания:</b><p>' + esc(r.remarks) + '</p></div>';
    }

    if (r.resolved) {
      h += '<div class="section"><b>Отчёт отмечен как исправленный:</b><p>' + new Date(r.resolvedTs).toLocaleString('ru-RU') + ' · ' + esc(r.resolvedBy || '') + '</p></div>';
    }

    return h;
  };

  window.printReport = function (id) {
    var r = DB.reports.find(function (x) { return x.id === id; });
    if (!r) return;

    var w = window.open('', '_blank');

    if (!w) {
      return toast('Браузер заблокировал окно печати');
    }

    var html = '';
    html += '<html lang="ru"><head><meta charset="utf-8">';
    html += '<title>Отчёт по смене</title>';
    html += '<style>';
    html += 'body{font-family:system-ui,Arial,sans-serif;padding:16px;color:#111}';
    html += 'h1{font-size:22px;margin:0 0 12px}';
    html += 'p{margin:6px 0}';
    html += '.section{margin-top:14px;padding-top:10px;border-top:1px solid #ccc}';
    html += 'ul{margin:6px 0;padding-left:20px}';
    html += 'li{margin:3px 0}';
    html += '</style>';
    html += '</head><body>';
    html += reportPrintHtml(r);
    html += '</body></html>';

    w.document.write(html);
    w.document.close();

    setTimeout(function () {
      w.print();
    }, 300);
  };

  /* =========================================
     5. Новый submitRep: НО/СЛ + нормальные сроки
     ========================================= */
  if (window.submitRep) {
    window.submitRep = function (mode) {
      if (mode === 'rem' && !document.getElementById('rpRem').value.trim()) {
        return toast('Опишите замечания');
      }

      var c = DB.cars.find(function (x) { return x.id === repCar; });
      var u = me();

      var expList = soonList();

      var hasExpired = expList.some(function (x) {
        return x.item && x.item.expiry && daysLeft(x.item.expiry) < 0;
      });

      var exp = expList.map(function (x) {
        var place = x.type === 'kit'
          ? ((x.carName || '') + ' / ' + (x.kitName || ''))
          : (x.name || '');

        var itemName = x.item && x.item.name ? x.item.name : 'позиция';
        var itemExp = x.item && x.item.expiry ? x.item.expiry : 'нет срока';

        return place + ': ' + itemName + ' (' + itemExp + ')';
      });

      var defs = [];
      var equip = [];

      (c.equip || []).forEach(function (e) {
        var st = (document.getElementById('re_' + e.id) || {}).value || 'ok';
        var df = (document.getElementById('rd_' + e.id) || {}).value || '';

        e.status = st;
        e.defect = df;

        if (st !== 'ok') {
          defs.push(e.name + (df ? ' (' + df + ')' : ''));
        }

        equip.push({
          ovm: e.ovm,
          name: e.name,
          status: st,
          charge: e.charge,
          defect: df
        });
      });

      var body = document.getElementById('dlgBody') || window.dlgBody;
      var pboxes = body ? body.querySelectorAll('input[data-pot]:checked') : [];
      var pbSel = [];

      for (var pi = 0; pi < pboxes.length; pi++) {
        pbSel.push(+pboxes[pi].getAttribute('data-pot'));
      }

      var potBag = (DB.potents || [])
        .filter(function (k) {
          return pbSel.indexOf(k.id) >= 0;
        })
        .map(function (k) {
          return k.name;
        })
        .join(', ');

      var st = hasExpired
        ? 'red'
        : ((expList.length > 0 || mode === 'rem' || defs.length > 0) ? 'yellow' : 'green');

      DB.reports.push({
        id: uid(),
        ts: Date.now(),
        kind: 'shift',
        carId: c.id,
        car: c.name,
        userId: u.id,
        user: u.name,
        brigade: document.getElementById('rpBrig').value.trim(),
        bagNum: document.getElementById('rpBag').value,
        ecgNum: document.getElementById('rpEcg').value,
        ecgCharge: document.getElementById('rpEcgCh').value.trim(),
        potentBag: potBag,
        status: st,
        remarks: document.getElementById('rpRem').value.trim(),
        expired: exp,
        defects: defs,
        equip: equip,
        viewed: false,
        resolved: false
      });

      save();
      closeDlg();
      render();

      toast('Отчёт отправлен: ' + (
        st === 'green' ? '🟢 без замечаний' :
        st === 'yellow' ? '🟡 с замечаниями' :
        '🔴 красный'
      ));
    };
  }

  /* =========================================
     6. Новый viewReport
     ========================================= */
  if (window.viewReport) {
    window.viewReport = function (id) {
      var r = DB.reports.find(function (x) { return x.id === id; });
      if (!r) return;

      r.viewed = true;
      save();

      var h = '<div class="reportDetail">';
      h += '<h3>📨 Отчёт · ' + esc(r.car || '') + '</h3>';

      h += '<p><b>Статус:</b> ' + reportBadge(r) + '</p>';
      h += '<p><b>Дата:</b> ' + new Date(r.ts).toLocaleString('ru-RU') + '</p>';
      h += '<p><b>Сотрудник:</b> ' + esc(r.user || '') + '</p>';

      if (r.resolved) {
        h += '<p><b>Исправлен:</b> ' + new Date(r.resolvedTs).toLocaleString('ru-RU') + ' · ' + esc(r.resolvedBy || '') + '</p>';
      }

      h += '<div class="rdSection">';
      h += '<p><b>Бригада:</b> ' + esc(r.brigade || '—') + '</p>';
      h += '<p><b>Сумка:</b> ' + esc(r.bagNum || '—') + '</p>';
      h += '<p><b>ЭКГ №:</b> ' + esc(r.ecgNum || '—') + ' · заряд: ' + esc(r.ecgCharge || '—') + '</p>';

      if (r.potentBag) {
        h += '<p><b>⚕ Комплекты НО/СЛ:</b> ' + esc(r.potentBag) + '</p>';
      }

      h += '</div>';

      if (r.defects && r.defects.length) {
        h += '<div class="rdSection"><b>Дефекты оборудования:</b>';
        r.defects.forEach(function (d) {
          h += '<p class="rdDefect">• ' + esc(d) + '</p>';
        });
        h += '</div>';
      }

      if (r.expired && r.expired.length) {
        h += '<div class="rdSection"><b>Просроченные / истекающие позиции:</b>';
        r.expired.forEach(function (d) {
          h += '<p class="rdDefect">• ' + esc(expiredItemText(d)) + '</p>';
        });
        h += '</div>';
      }

      if (r.remarks) {
        h += '<div class="rdSection"><b>Примечания:</b><p>' + esc(r.remarks) + '</p></div>';
      }

      if (isBoss()) {
        h += '<div class="rdSection">';

        if (!r.resolved && r.status !== 'green') {
          h += '<button class="btn wide" onclick="resolveReport(' + r.id + ')">✅ Отметить исправленным</button>';
        }

        if (r.resolved) {
          h += '<button class="btn sec wide" onclick="unresolveReport(' + r.id + ')">↩ Вернуть в работу</button>';
        }

        h += '</div>';
      }

      h += '<div class="rdSection">';
      h += '<button class="btn sec wide" onclick="printReport(' + r.id + ')">🖨 Печать</button>';
      h += '<button class="btn sec wide" onclick="downloadReport(' + r.id + ')">⬇ Скачать</button>';
      h += '</div>';

      h += '<p style="margin-top:12px"><button class="btn sec wide" onclick="closeDlg()">Закрыть</button></p>';
      h += '</div>';

      openDlg(h);
    };
  }

  if (window.delReport) {
    var _delReport = window.delReport;
    window.delReport = function (id) {
      if (!isBoss()) {
        return toast('Удаление доступно только руководителю или админу');
      }
      _delReport(id);
    };
  }

  /* =========================================
     7. Вкладка "Отчёты"
     ========================================= */
  if (window.renderNav) {
    var _renderNav = window.renderNav;
    window.renderNav = function () {
      _renderNav();

      var u = me();
      var navEl = document.getElementById('nav');

      if (!u || !navEl) return;

      var btn = navEl.querySelector('[data-tab="reports"]');

      if (!btn) {
        btn = document.createElement('button');
        btn.textContent = 'Отчёты';
        btn.setAttribute('data-tab', 'reports');

        btn.onclick = function () {
          go('reports');
        };

        var ref = navEl.children[3] || null;
        navEl.insertBefore(btn, ref);
      }

      btn.className = window.tab === 'reports' ? 'on' : '';
    };
  }

  if (window.render) {
    var _render = window.render;
    window.render = function () {
      if (window.DB && !DB.shiftGrid) DB.shiftGrid = [];

      if (window.tab === 'reports' && window.me && me()) {
        var mainEl = document.getElementById('main');
        if (mainEl) mainEl.innerHTML = reportsView();

        var a = alerts();
        var al = document.getElementById('alarm');
        if (al) al.innerHTML = a.length ? '<span class="badge bExp">! ' + a.length + '</span>' : '';

        updHead();
        injectTplPotentButtons();
        return;
      }

      _render();
      injectTplPotentButtons();
    };
  }

  if (window.homeView) {
    var _homeView = window.homeView;
    window.homeView = function () {
      var h = _homeView();
      return h.replace(
        '<b>📨 Последние отчёты</b>',
        '<b>📨 Последние отчёты</b> <button class="btn sec mini" onclick="go(\'reports\')">Все отчёты</button>'
      );
    };
  }

  if (window.potentView) {
    var _potentView = window.potentView;
    window.potentView = function () {
      var h = _potentView();
      return fixText(h);
    };
  }

  /* =========================================
     8. Смена PIN руководителем
     ========================================= */
  window.adminPinDlg = function (id) {
    if (!isBoss()) {
      return toast('Доступ только руководителю или админу');
    }

    var u = DB.users.find(function (x) { return x.id === id; });
    if (!u) return;

    openDlg(
      '<h3>🔑 PIN сотрудника</h3>' +
      '<p><b>' + esc(u.name) + '</b></p>' +
      '<label>Новый PIN (4 цифры)</label>' +
      '<input id="apPin" type="password" inputmode="numeric" maxlength="4">' +
      '<label>Повторите новый PIN</label>' +
      '<input id="apPin2" type="password" inputmode="numeric" maxlength="4">' +
      '<p><button class="btn" onclick="adminPinDo(' + id + ')">Сохранить</button> ' +
      '<button class="btn sec" onclick="closeDlg()">Закрыть</button></p>'
    );
  };

  window.adminPinDo = function (id) {
    if (!isBoss()) {
      return toast('Доступ только руководителю или админу');
    }

    var u = DB.users.find(function (x) { return x.id === id; });
    if (!u) return;

    var n1 = document.getElementById('apPin').value;
    var n2 = document.getElementById('apPin2').value;

    if (!/^[0-9]{4}$/.test(n1)) {
      return toast('PIN должен состоять из 4 цифр');
    }

    if (n1 !== n2) {
      return toast('PIN не совпадает');
    }

    u.pin = n1;

    save();
    closeDlg();
    render();

    toast('PIN изменён руководителем');
  };

  if (window.setView) {
    var _setView = window.setView;
    window.setView = function () {
      var h = _setView();
      return h.replace(
        /<button class="btn sec mini" onclick="openRespDlg\(([^)]+)\)">ответственность<\/button>/g,
        '<button class="btn sec mini" onclick="adminPinDlg($1)">🔑 PIN</button> <button class="btn sec mini" onclick="openRespDlg($1)">ответственность</button>'
      );
    };
  }

  /* =========================================
     9. График смен + импорт CSV/Excel
     ========================================= */
  window.shiftGridView = function () {
    if (!DB.shiftGrid) DB.shiftGrid = [];

    var h = '<div class="card" style="margin-top:8px">';
    h += '<b>🗓 График смен</b>';

    h += '<p>';
    h += '<button class="btn mini" onclick="openShiftDlg(-1)">+ Добавить смену</button> ';
    h += '<label class="btn sec mini" style="display:inline-block">📥 Импорт CSV/Excel<input type="file" hidden accept=".csv,.txt,text/csv" onchange="importShiftGrid(this)"></label>';
    h += '</p>';

    h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">';
    h += 'Импорт из Excel: сохраните файл как CSV (UTF-8) и выберите его.<br>';
    h += 'Формат колонок: Дата;Бригада;Машина;Сотрудники;Примечание';
    h += '</p>';

    if (!DB.shiftGrid.length) {
      h += '<p>Смен пока нет.</p>';
      h += '</div>';
      return h;
    }

    h += '<table>';
    h += '<thead>';
    h += '<tr>';
    h += '<th>Дата</th>';
    h += '<th>Бригада</th>';
    h += '<th>Машина</th>';
    h += '<th>Сотрудники</th>';
    h += '<th>Прим.</th>';
    h += '<th></th>';
    h += '</tr>';
    h += '</thead>';
    h += '<tbody>';

    DB.shiftGrid.forEach(function (s, i) {
      h += '<tr>';
      h += '<td>' + esc(s.date || '') + '</td>';
      h += '<td>' + esc(s.brigade || '') + '</td>';
      h += '<td>' + esc(s.car || '') + '</td>';
      h += '<td>' + esc(s.staff || '') + '</td>';
      h += '<td>' + esc(s.note || '') + '</td>';
      h += '<td style="white-space:nowrap">';
      h += '<button class="btn sec mini" onclick="openShiftDlg(' + i + ')">✏️</button> ';
      h += '<button class="btn del mini" onclick="delShiftRow(' + i + ')">🗑</button>';
      h += '</td>';
      h += '</tr>';
    });

    h += '</tbody></table></div>';

    return h;
  };

  window.openShiftDlg = function (idx) {
    if (!DB.shiftGrid) DB.shiftGrid = [];

    var s = idx < 0 ? {} : DB.shiftGrid[idx];

    openDlg(
      '<h3>Смена</h3>' +
      '<label>Дата</label>' +
      '<input id="shDate" type="date" value="' + esc(s.date || '') + '">' +
      '<label>Бригада</label>' +
      '<input id="shBrig" value="' + esc(s.brigade || '') + '">' +
      '<label>Машина</label>' +
      '<input id="shCar" value="' + esc(s.car || '') + '">' +
      '<label>Сотрудники</label>' +
      '<input id="shStaff" value="' + esc(s.staff || '') + '">' +
      '<label>Примечание</label>' +
      '<input id="shNote" value="' + esc(s.note || '') + '">' +
      '<p>' +
      '<button class="btn" onclick="saveShiftDlg(' + idx + ')">Сохранить</button> ' +
      '<button class="btn sec" onclick="closeDlg()">Закрыть</button>' +
      '</p>'
    );
  };

  window.saveShiftDlg = function (idx) {
    if (!DB.shiftGrid) DB.shiftGrid = [];

    var o = {
      date: document.getElementById('shDate').value,
      brigade: document.getElementById('shBrig').value.trim(),
      car: document.getElementById('shCar').value.trim(),
      staff: document.getElementById('shStaff').value.trim(),
      note: document.getElementById('shNote').value.trim()
    };

    if (!o.date) {
      return toast('Укажите дату смены');
    }

    if (idx < 0) {
      DB.shiftGrid.push(o);
    } else {
      DB.shiftGrid[idx] = o;
    }

    save();
    closeDlg();
    render();

    toast('Смена сохранена');
  };

  window.delShiftRow = function (idx) {
    ask('Удалить строку графика?', function () {
      if (!DB.shiftGrid) DB.shiftGrid = [];
      DB.shiftGrid.splice(idx, 1);
      save();
      render();
      toast('Строка удалена');
    });
  };

  window.importShiftGrid = function (inp) {
    var f = inp.files[0];
    if (!f) return;

    var r = new FileReader();

    r.onload = function () {
      if (!DB.shiftGrid) DB.shiftGrid = [];

      var lines = String(r.result).split(/\r?\n/);
      var added = 0;

      lines.forEach(function (line, ix) {
        line = line.trim();
        if (!line) return;

        var parts = line.split(/[;,\t]/).map(function (x) {
          return x.trim().replace(/^"|"$/g, '');
        });

        if (ix === 0 && /дата/i.test(parts[0])) {
          return;
        }

        DB.shiftGrid.push({
          date: parts[0] || '',
          brigade: parts[1] || '',
          car: parts[2] || '',
          staff: parts[3] || '',
          note: parts[4] || ''
        });

        added++;
      });

      save();
      render();

      toast('Импортировано строк: ' + added);
    };

    r.readAsText(f);
  };

  if (window.schedView) {
    window.schedView = function () {
      purgeSched();

      var h = '';

      h += '<button class="btn ' + (schedSub === 'days' ? '' : 'sec') + '" onclick="schedSub=\'days\';render()">📷 Журнал смены</button> ';
      h += '<button class="btn ' + (schedSub === 'months' ? '' : 'sec') + '" onclick="schedSub=\'months\';render()">📅 График месяца</button> ';
      h += '<button class="btn ' + (schedSub === 'grid' ? '' : 'sec') + '" onclick="schedSub=\'grid\';render()">🗓 Смены</button>';

      if (schedSub === 'grid') {
        return h + shiftGridView();
      }

      if (schedSub === 'days') {
        h += '<p><label class="btn sec" style="display:inline-block">➕ Добавить фото журнала<input type="file" hidden accept="image/*" onchange="addSchedPhoto(this,\'days\')"></label></p>';
        h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Фото журнала хранятся 2 дня и удаляются автоматически.</p>';

        if (DB.sched.days.length) {
          h += '<div class="thumbs">' + DB.sched.days.map(function (p) {
            return '<img src="' + p.img + '" onclick="openPhoto(\'days\',' + p.id + ')">';
          }).join('') + '</div>';
        } else {
          h += '<p>Фото журнала пока нет.</p>';
        }
      } else {
        h += '<p><label class="btn sec" style="display:inline-block">➕ Добавить график месяца<input type="file" hidden accept="image/*" onchange="addSchedPhoto(this,\'months\')"></label></p>';
        h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">График удаляется автоматически на 3-й день следующего месяца.</p>';

        if (DB.sched.months.length) {
          h += '<div class="thumbs">' + DB.sched.months.map(function (p) {
            return '<img src="' + p.img + '" onclick="openPhoto(\'months\',' + p.id + ')">';
          }).join('') + '</div>';
        } else {
          h += '<p>Графиков пока нет.</p>';
        }
      }

      return h;
    };
  }

  /* =========================================
     10. PWA / установка / офлайн
     ========================================= */
  window.installApp = function () {
    if (window.__medshiftInstallPrompt) {
      window.__medshiftInstallPrompt.prompt();
      window.__medshiftInstallPrompt.userChoice.then(function () {
        window.__medshiftInstallPrompt = null;
      });
    } else {
      toast('Откройте меню браузера → «Добавить на главный экран»');
    }
  };

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__medshiftInstallPrompt = e;
  });

  if ('serviceWorker' in navigator) {
    if (document.readyState === 'complete') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    } else {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  if (window.loginView) {
    var _loginView = window.loginView;
    window.loginView = function () {
      var h = _loginView();
      return h.replace(
        '<button class="btn sec wide" onclick="qrDlg()">📲 QR-код и инструкция по установке</button>',
        '<button class="btn sec wide" onclick="installApp()">📲 Установить приложение</button>' +
        '<button class="btn sec wide" onclick="qrDlg()">📲 QR-код и инструкция по установке</button>'
      );
    };
  }

  /* =========================================
     11. Перерисовать экран с учётом исправлений
     ========================================= */
  setTimeout(function () {
    if (window.render) render();
  }, 0);
})();
