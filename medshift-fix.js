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
     3. Н/СЛ: создание комплекта из любого шаблона
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

    askText('Название комплекта НС/ЛС', '⚕ НС/ЛС', function (n) {
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
      toast('Комплект НС/ЛС создан');
    });
  };

  window.createPotentBag = function () {
    if (window.openTplId) {
      return createPotentBagFromTpl(openTplId);
    }

    var kt = (DB.kitTemplates || []).find(function (k) {
      return k.name.indexOf('Сильнодействующие') >= 0 || k.name.indexOf('НС/ЛС') >= 0;
    });

    if (!kt) {
      curPot = false;
      curTpl = true;
      render();
      return toast('Откройте шаблон и нажмите «Создать комплект НС/ЛС из этого шаблона»');
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
    btn.textContent = '📦 Создать комплект НС/ЛС из этого шаблона';

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
      L.push('Комплекты НС/ЛС: ' + r.potentBag);
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
      h += '<p><b>Комплекты НС/ЛС:</b> ' + esc(r.potentBag) + '</p>';
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
     5. Новый submitRep: НС/ЛС + нормальные сроки
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
        h += '<p><b>⚕ Комплекты НС/ЛС:</b> ' + esc(r.potentBag) + '</p>';
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
/* =========================================
   ДОПОЛНЕНИЕ 2: новые шаблоны, импорт файла,
   укладки в машину из шаблонов
   ========================================= */
(function () {

  // ---------- разбор строк импортируемого файла ----------
  function parseTplLines(text) {
    var items = [];
    String(text).split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line) return;
      line = line.replace(/^\s*\d{1,3}\s*[.)]\s*/, '');
      var qty = 1, unit = 'шт';
      var m = line.match(/^(.*?)\s+([0-9]{1,4})\s*(амп|фл|шт|пар|уп|таб|капс|компл|блистер|пакет)?\.?$/i);
      if (m) {
        line = m[1];
        qty = +m[2];
        if (m[3]) unit = m[3].toLowerCase();
      }
      if (!line) return;
      items.push({ name: line, spec: '', unit: unit, qty: qty, expiry: '', potent: false });
    });
    return items;
  }
  window.parseTplLines = parseTplLines;

  // ---------- новый шаблон вручную ----------
  window.newTplDlg = function () {
    askText('Название нового шаблона', 'Новый шаблон', function (n) {
      if (!n.trim()) return;
      DB.kitTemplates = DB.kitTemplates || [];
      DB.kitTemplates.push({ id: uid(), name: n.trim(), items: [] });
      save();
      curTpl = true;
      openTplId = 'kit_' + (DB.kitTemplates.length - 1);
      render();
      toast('Шаблон создан. Добавляй позиции кнопкой «+ Позиция» или через поиск лекарств');
    });
  };

  // ---------- новый шаблон из файла (любое расширение) ----------
  window.importTplFile = function (inp) {
    var f = inp.files && inp.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var items = parseTplLines(r.result);
      if (!items.length) return toast('В файле не распознаны позиции');
      var defName = f.name.replace(/\.[^.]+$/, '');
      askText('Название шаблона из файла', defName || 'Шаблон из файла', function (n) {
        if (!n.trim()) return;
        DB.kitTemplates = DB.kitTemplates || [];
        DB.kitTemplates.push({ id: uid(), name: n.trim(), items: items });
        save();
        curTpl = true;
        openTplId = 'kit_' + (DB.kitTemplates.length - 1);
        render();
        toast('Шаблон создан, позиций: ' + items.length);
      });
    };
    r.onerror = function () { toast('Не удалось прочитать файл'); };
    r.readAsText(f);
    inp.value = '';
  };

  // ---------- кнопки в разделе «Шаблоны» ----------
  if (window.tplView) {
    var _tplView2 = window.tplView;
    window.tplView = function () {
      var h = _tplView2();
      h = h.replace(
        '<h3>📑 Шаблоны</h3>',
        '<h3>📑 Шаблоны</h3>' +
        '<p>' +
        '<button class="btn mini" onclick="newTplDlg()">➕ Новый шаблон</button> ' +
        '<label class="btn sec mini" style="display:inline-block">📥 Импорт из файла<input type="file" hidden accept="*/*" onchange="importTplFile(this)"></label>' +
        '</p>'
      );
      return h;
    };
  }

  // ---------- диалог добавления укладки в машину ----------
  window.addKitDlg = function (cid) {
    if (!isBoss()) return toast('Добавлять укладки может руководитель или админ');
    var c = DB.cars.find(function (x) { return x.id === cid; });
    if (!c) return;

    var h = '<h3>➕ Укладка · ' + esc(c.name) + '</h3>';
    h += '<label>Название укладки</label><input id="akName" placeholder="Например: Реанимационная укладка">';
    h += '<label>Создать из шаблона</label><select id="akTpl"><option value="-1">— Пустая (заполню вручную) —</option>';

    (DB.kitTemplates || []).forEach(function (kt, i) {
      h += '<option value="' + i + '">' + esc(kt.name) + ' (' + (kt.items || []).length + ' поз.)</option>';
    });

    if (DB.bagTypes && DB.bagTypes[0]) {
      h += '<option value="bag">👜 Шаблон сумки (' + (DB.bagTypes[0].items || []).length + ' поз.)</option>';
    }

    h += '</select>';
    h += '<p><button class="btn" onclick="addKitDo(' + cid + ')">Добавить</button> ' +
         '<button class="btn sec" onclick="closeDlg()">Закрыть</button></p>';
    openDlg(h);
  };

  window.addKitDo = function (cid) {
    if (!isBoss()) return toast('Добавлять укладки может руководитель или админ');
    var c = DB.cars.find(function (x) { return x.id === cid; });
    if (!c) return;

    var name = document.getElementById('akName').value.trim();
    var sel = document.getElementById('akTpl').value;
    var items = [];
    var defName = 'Укладка';

    if (sel === 'bag') {
      var bt = DB.bagTypes && DB.bagTypes[0];
      if (bt) {
        defName = bt.name;
        items = (bt.items || []).map(function (i) {
          return { name: i.name, spec: i.spec || '', unit: i.unit || 'шт', qty: i.qty || 1, expiry: '', potent: !!i.potent };
        });
      }
    } else if (sel !== '-1') {
      var kt = (DB.kitTemplates || [])[+sel];
      if (kt) {
        defName = kt.name;
        items = (kt.items || []).map(function (i) {
          return { name: i.name, spec: i.spec || '', unit: i.unit || 'шт', qty: i.qty || 1, expiry: '', potent: !!i.potent };
        });
      }
    }

    if (!name) name = defName;
    if (!name) return toast('Укажи название укладки');

    c.kits = c.kits || [];
    c.kits.push({ id: uid(), name: name, items: items });
    save();
    closeDlg();
    render();
    toast('Укладка добавлена: ' + name + ' (' + items.length + ' поз.)');
  };

  // ---------- кнопка «➕ Укладка» в карточке машины ----------
  if (window.carView) {
    var _carView2 = window.carView;
    window.carView = function () {
      var h = _carView2();
      h = h.replace(
        '>📨 Отчёт по смене</button>',
        '>📨 Отчёт по смене</button> ' +
        (isBoss() ? '<button class="btn sec" onclick="addKitDlg(' + curCar + ')">➕ Укладка</button>' : '')
      );
      return h;
    };
  }

})();
/* =========================================
   ДОПОЛНЕНИЕ 3: список отчётов карточками,
   кнопки не обрезаются на ПК
   ========================================= */
(function () {
  window.reportsView = function () {
    var h = '<h3>📨 Отчёты</h3>';
    h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Просмотр доступен всем. Удалять и менять статус может только руководитель или админ.</p>';

    var reps = (DB.reports || []).slice().reverse();

    if (!reps.length) {
      return h + '<p>Отчётов пока нет</p>';
    }

    reps.forEach(function (r) {
      h += '<div class="card" style="display:flex;gap:8px;align-items:center">';

      h += '<div style="flex:1 1 auto;min-width:0;cursor:pointer" onclick="viewReport(' + r.id + ')">';
      h += reportBadge(r) + ' <b>' + esc(r.car || '') + '</b> · ' + esc(r.user || '');
      h += '<br><small>' + new Date(r.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

      if (r.remarks) h += ' · ' + esc(r.remarks);
      if (r.potentBag) h += ' · ⚕ ' + esc(r.potentBag);
      if (r.resolved) h += ' · ✅ исправлен';

      h += '</small></div>';

      h += '<div style="flex:0 0 auto;white-space:nowrap">';
      h += '<button class="btn sec mini" onclick="viewReport(' + r.id + ')">👁</button>';
      if (isBoss()) {
        h += ' <button class="btn del" onclick="delReport(' + r.id + ')">🗑</button>';
      }
      h += '</div>';

      h += '</div>';
    });

    return h;
  };

  setTimeout(function () { if (window.render) render(); }, 0);
})();
/* =========================================
   ДОПОЛНЕНИЕ 6: красивый блок сезона на главной:
   сезон с душой, праздники и дни рождения
   ========================================= */
(function () {

  var css6 = `
.cwSeason{white-space:normal!important;max-width:52%!important;font-size:var(--fs)!important;overflow:visible!important}
.seasonBox{line-height:1.25}
.seasonIcons{font-size:calc(var(--fs) + 7px);letter-spacing:3px;animation:seasonFloat 3.2s ease-in-out infinite}
.seasonName{font-weight:700;font-size:calc(var(--fs) + 2px);color:var(--tx);margin-top:2px}
.seasonSoul{font-size:calc(var(--fs) - 3px);color:var(--mut);font-style:italic;margin-top:1px}
.seasonHoliday{margin-top:3px;font-size:calc(var(--fs) - 1px);font-weight:700;color:var(--ac)}
.seasonBday{margin-top:2px;font-size:calc(var(--fs) - 2px);font-weight:700;color:#d81b60}
body.dark .seasonBday{color:#ff8ab0}
@keyframes seasonFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@media(max-width:480px){.cwSeason{max-width:46%!important}.seasonIcons{font-size:calc(var(--fs) + 5px)}}
`;

  var st6 = document.createElement('style');
  st6.textContent = css6;
  document.head.appendChild(st6);

  var SEASONS = [
    { name: 'Зима',  icons: '❄️⛄❄️' },
    { name: 'Весна', icons: '🌸🐦🌷' },
    { name: 'Лето',  icons: '☀️🌻🍓' },
    { name: 'Осень', icons: '🍂🍁🍂' }
  ];

  var MONTH_SOUL = [
    'серебряный снег и тепло дома',
    'метели дорисовывают зиму',
    'капель и первые проталины',
    'скворцы вернулись, лёд тронулся',
    'черёмуха, тёплые вечера и салюты',
    'начало долгих светлых сумерек',
    'макушка лета, запах трав и гроз',
    'тёплые ночи и звездопад',
    'золото листьев и бабье лето',
    'багрянец, листопад и зонты',
    'последние листья и первый лёд',
    'мандарины, гирлянды и ожидание чуда'
  ];

  var HOLS = {
    '01-01': '🎄 Новый год',
    '01-07': '⭐ Рождество',
    '02-14': '💘 День влюблённых',
    '02-23': '🎖 23 февраля',
    '03-08': '💐 8 Марта',
    '04-01': '🤡 День смеха',
    '05-01': '🌷 Первомай',
    '05-09': '🎉 День Победы',
    '06-01': '🧸 День защиты детей',
    '06-12': '🇷🇺 День России',
    '09-01': '🎓 День знаний',
    '11-04': '🤝 Народное единство',
    '12-31': '🎆 Канун Нового года'
  };

  window.seasonHtml = function () {
    var d = new Date();
    var m = d.getMonth();
    var si = (m === 11 || m <= 1) ? 0 : (m <= 4 ? 1 : (m <= 7 ? 2 : 3));
    var s = SEASONS[si];

    var key = ('0' + (m + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    var hol = HOLS[key];

    /* третье воскресенье июня — День медицинского работника */
    if (m === 5 && d.getDay() === 0 && d.getDate() >= 15 && d.getDate() <= 21) {
      hol = '💚 День медицинского работника';
    }

    var bd = (window.bdayToday ? bdayToday() : []);

    var h = '<div class="seasonBox">';
    h += '<div class="seasonIcons">' + s.icons + '</div>';
    h += '<div class="seasonName">' + s.name + '</div>';
    h += '<div class="seasonSoul">' + MONTH_SOUL[m] + '</div>';
    if (hol) h += '<div class="seasonHoliday">' + hol + '</div>';
    if (bd.length) h += '<div class="seasonBday">🎉 День рождения: ' + bd.map(esc).join(', ') + '!</div>';
    h += '</div>';
    return h;
  };

  setTimeout(function () { if (window.render) render(); }, 0);
})();
/* =========================================
   ДОПОЛНЕНИЕ 7:
   - пилюлька между Чат и Ещё
   - вкладка «Смены» с CSV импортом
   - импорт текста в журнал смены и график месяца
   ========================================= */
(function () {
  if (window.__fix7_applied) return;
  window.__fix7_applied = true;

  var css7 = `
.schedCard{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:10px;margin-bottom:8px}
.schedCard .scDate{font-weight:700;color:var(--ac);font-size:calc(var(--fs) + 1px)}
.schedCard .scLine{font-size:calc(var(--fs) - 1px);margin-top:2px}
.schedCard .scNote{color:var(--mut);font-style:italic;margin-top:4px;font-size:calc(var(--fs) - 2px)}
.schedCard .scActions{margin-top:6px;display:flex;gap:6px}
.schedTabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}
.schedTabs .btn{margin:0}
.shiftEmpty{color:var(--mut);padding:8px;text-align:center;font-size:calc(var(--fs) - 1px)}
`;
  var st7 = document.createElement('style');
  st7.textContent = css7;
  document.head.appendChild(st7);

  if (window.DB && !DB.shiftGrid) DB.shiftGrid = [];
  if (window.DB && DB.sched) {
    if (!Array.isArray(DB.sched.days)) DB.sched.days = [];
    if (!Array.isArray(DB.sched.months)) DB.sched.months = [];
  }

  /* === 1. ПИЛЮЛЬКА МЕЖДУ ЧАТ И ЕЩЁ === */
  if (window.renderNav) {
    var _rn7 = window.renderNav;
    window.renderNav = function () {
      _rn7();
      var navEl = document.getElementById('nav');
      if (!navEl) return;
      var btns = Array.prototype.slice.call(navEl.children);
      var pill = null, eshe = null;
      btns.forEach(function (b) {
        var t = (b.textContent || '').trim();
        if (t === '💊') pill = b;
        if (t === 'Ещё') eshe = b;
      });
      if (pill && eshe && pill.nextElementSibling !== eshe) {
        navEl.insertBefore(pill, eshe);
      }
    };
  }

  /* === 2. ВКЛАДКА «СМЕНЫ» (таблица) === */
  window.shiftGridView = function () {
    if (!DB.shiftGrid) DB.shiftGrid = [];

    var h = '<div class="card">';
    h += '<b>🗓 График смен</b>';
    h += '<p style="margin-top:6px">';
    h += '<button class="btn mini" onclick="openShiftDlg(-1)">+ Добавить смену</button> ';
    h += '<label class="btn sec mini" style="display:inline-block">📥 Импорт CSV/Excel<input type="file" hidden accept=".csv,.txt,text/csv" onchange="importShiftGrid(this)"></label>';
    h += ' <button class="btn del mini" onclick="clearShiftGrid()">🗑 Очистить</button>';
    h += '</p>';
    h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Формат CSV: Дата;Бригада;Машина;Сотрудники;Примечание</p>';

    if (!DB.shiftGrid.length) {
      h += '<p class="shiftEmpty">Смен пока нет</p></div>';
      return h;
    }

    var sorted = DB.shiftGrid.slice().sort(function (a, b) {
      return (a.date || '').localeCompare(b.date || '');
    });

    h += '<table>';
    h += '<thead><tr><th>Дата</th><th>Бригада</th><th>Машина</th><th>Сотрудники</th><th>Прим.</th><th></th></tr></thead>';
    h += '<tbody>';

    sorted.forEach(function (s) {
      var realIdx = DB.shiftGrid.indexOf(s);
      h += '<tr>';
      h += '<td>' + esc(s.date || '') + '</td>';
      h += '<td>' + esc(s.brigade || '') + '</td>';
      h += '<td>' + esc(s.car || '') + '</td>';
      h += '<td>' + esc(s.staff || '') + '</td>';
      h += '<td>' + esc(s.note || '') + '</td>';
      h += '<td style="white-space:nowrap">';
      h += '<button class="btn sec mini" onclick="openShiftDlg(' + realIdx + ')">✏️</button> ';
      h += '<button class="btn del mini" onclick="delShiftRow(' + realIdx + ')">🗑</button>';
      h += '</td></tr>';
    });

    h += '</tbody></table></div>';
    return h;
  };

  window.openShiftDlg = function (idx) {
    if (!DB.shiftGrid) DB.shiftGrid = [];
    var s = idx < 0 ? {} : DB.shiftGrid[idx];
    openDlg(
      '<h3>Смена</h3>' +
      '<label>Дата</label><input id="shDate" type="date" value="' + esc(s.date || '') + '">' +
      '<label>Бригада</label><input id="shBrig" value="' + esc(s.brigade || '') + '">' +
      '<label>Машина</label><input id="shCar" value="' + esc(s.car || '') + '">' +
      '<label>Сотрудники</label><input id="shStaff" value="' + esc(s.staff || '') + '">' +
      '<label>Примечание</label><input id="shNote" value="' + esc(s.note || '') + '">' +
      '<p><button class="btn" onclick="saveShiftDlg(' + idx + ')">Сохранить</button> ' +
      '<button class="btn sec" onclick="closeDlg()">Закрыть</button></p>'
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
    if (!o.date) return toast('Укажите дату смены');
    if (idx < 0) DB.shiftGrid.push(o);
    else DB.shiftGrid[idx] = o;
    save(); closeDlg(); render();
    toast('Смена сохранена');
  };

  window.delShiftRow = function (idx) {
    ask('Удалить строку графика?', function () {
      DB.shiftGrid.splice(idx, 1);
      save(); render();
      toast('Строка удалена');
    });
  };

  window.clearShiftGrid = function () {
    if (!DB.shiftGrid || !DB.shiftGrid.length) return toast('Уже пусто');
    ask('Удалить все записи графика смен?', function () {
      DB.shiftGrid = [];
      save(); render();
      toast('График очищен');
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
        if (ix === 0 && /дата|date/i.test(parts[0])) return;
        DB.shiftGrid.push({
          date: parts[0] || '',
          brigade: parts[1] || '',
          car: parts[2] || '',
          staff: parts[3] || '',
          note: parts[4] || ''
        });
        added++;
      });
      save(); render();
      toast('Импортировано строк: ' + added);
    };
    r.readAsText(f);
  };

  /* === 3. ИМПОРТ ТЕКСТА В ЖУРНАЛ СМЕНЫ И ГРАФИК МЕСЯЦА === */
  window.importSchedText = function (kind, inp) {
    var f = inp.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      if (!DB.sched) DB.sched = { days: [], months: [] };
      if (!Array.isArray(DB.sched[kind])) DB.sched[kind] = [];

      var text = String(r.result).trim();
      if (!text) return toast('Файл пустой');

      var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      var month = todayStr().slice(0, 7);

      lines.forEach(function (line) {
        DB.sched[kind].push({
          id: uid(),
          ts: Date.now(),
          month: month,
          text: line
        });
      });

      save(); render();
      toast('Добавлено записей: ' + lines.length);
    };
    r.readAsText(f);
  };

  window.delSchedText = function (kind, id) {
    ask('Удалить запись?', function () {
      DB.sched[kind] = DB.sched[kind].filter(function (x) { return x.id !== id; });
      save(); render();
      toast('Запись удалена');
    });
  };

  /* === 4. ПЕРЕХВАТЫВАЕМ schedView === */
  if (window.schedView) {
    window.schedView = function () {
      purgeSched();

      var h = '<div class="schedTabs">';
      h += '<button class="btn ' + (schedSub === 'days' ? '' : 'sec') + '" onclick="schedSub=\'days\';render()">📷 Журнал смены</button>';
      h += '<button class="btn ' + (schedSub === 'months' ? '' : 'sec') + '" onclick="schedSub=\'months\';render()">📅 График месяца</button>';
      h += '<button class="btn ' + (schedSub === 'grid' ? '' : 'sec') + '" onclick="schedSub=\'grid\';render()">🗓 Смены</button>';
      h += '</div>';

      if (schedSub === 'grid') {
        return h + shiftGridView();
      }

      /* --- Журнал смены (days) --- */
      if (schedSub === 'days') {
        h += '<p>';
        h += '<label class="btn sec" style="display:inline-block">📷 Фото<input type="file" hidden accept="image/*" onchange="addSchedPhoto(this,\'days\')"></label> ';
        h += '<label class="btn sec" style="display:inline-block">📥 Импорт текстом<input type="file" hidden accept=".txt,.csv,text/plain" onchange="importSchedText(\'days\',this)"></label>';
        h += '</p>';
        h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Записи хранятся 2 дня и удаляются автоматически.</p>';

        var items = DB.sched.days.slice().reverse();
        if (!items.length) {
          h += '<p class="shiftEmpty">Записей пока нет</p>';
        } else {
          items.forEach(function (p) {
            if (p.img) {
              h += '<div class="schedCard"><img src="' + p.img + '" style="width:100%;max-width:200px;border-radius:8px;cursor:pointer" onclick="openPhoto(\'days\',' + p.id + ')">';
              h += '<div class="scActions"><button class="btn del mini" onclick="delPhoto(\'days\',' + p.id + ')">🗑</button></div></div>';
            } else if (p.text) {
              h += '<div class="schedCard">';
              h += '<div class="scDate">' + new Date(p.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</div>';
              h += '<div class="scLine">' + esc(p.text) + '</div>';
              h += '<div class="scActions"><button class="btn del mini" onclick="delSchedText(\'days\',' + p.id + ')">🗑</button></div>';
              h += '</div>';
            }
          });
        }
        return h;
      }

      /* --- График месяца (months) --- */
      h += '<p>';
      h += '<label class="btn sec" style="display:inline-block">📷 Фото<input type="file" hidden accept="image/*" onchange="addSchedPhoto(this,\'months\')"></label> ';
      h += '<label class="btn sec" style="display:inline-block">📥 Импорт текстом<input type="file" hidden accept=".txt,.csv,text/plain" onchange="importSchedText(\'months\',this)"></label>';
      h += '</p>';
      h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Записи удаляются автоматически на 3-й день следующего месяца.</p>';

      var mItems = DB.sched.months.slice().reverse();
      if (!mItems.length) {
        h += '<p class="shiftEmpty">Записей пока нет</p>';
      } else {
        mItems.forEach(function (p) {
          if (p.img) {
            h += '<div class="schedCard"><img src="' + p.img + '" style="width:100%;max-width:200px;border-radius:8px;cursor:pointer" onclick="openPhoto(\'months\',' + p.id + ')">';
            h += '<div class="scActions"><button class="btn del mini" onclick="delPhoto(\'months\',' + p.id + ')">🗑</button></div></div>';
          } else if (p.text) {
            h += '<div class="schedCard">';
            h += '<div class="scDate">' + new Date(p.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</div>';
            h += '<div class="scLine">' + esc(p.text) + '</div>';
            h += '<div class="scActions"><button class="btn del mini" onclick="delSchedText(\'months\',' + p.id + ')">🗑</button></div>';
            h += '</div>';
          }
        });
      }
      return h;
    };
  }

  setTimeout(function () {
    if (window.renderNav) renderNav();
    if (window.render) render();
  }, 0);
})();
/* =========================================
   ДОПОЛНЕНИЕ 8: склад с ключом (Firebase Auth).
   Синхронизация работает, посторонние снаружи.
   ========================================= */
(function () {
  if (window.__fix8_applied) return;
  window.__fix8_applied = true;

  var LS_AUTH = 'medshift_fb_auth';
  var API_KEY = (window.FB_CONF && FB_CONF.apiKey) || '';

  function loadAuth() {
    try { return JSON.parse(localStorage.getItem(LS_AUTH) || 'null'); } catch (e) { return null; }
  }
  function saveAuth(a) {
    if (a) localStorage.setItem(LS_AUTH, JSON.stringify(a));
    else localStorage.removeItem(LS_AUTH);
  }

  function scheduleRefresh(a) {
    if (!a || !a.exp) return;
    var delay = Math.max(30000, (a.exp - Date.now()) - 5 * 60000);
    setTimeout(function () { refreshToken(a.rt); }, delay);
  }

  function refreshToken(rt) {
    if (!rt || !API_KEY) return;
    fetch('https://securetoken.googleapis.com/v1/token?key=' + API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(rt)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.id_token) {
        var a = loadAuth() || {};
        a.rt = j.refresh_token || a.rt;
        a.id = j.id_token;
        a.exp = Date.now() + (+j.expires_in || 3600) * 1000;
        saveAuth(a);
        window.__fbToken = j.id_token;
        scheduleRefresh(a);
      } else {
        window.__fbToken = null;
      }
    }).catch(function () { window.__fbToken = null; });
  }

  function signIn(email, pass, cbOk, cbErr) {
    fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: pass, returnSecureToken: true })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.idToken) {
        var a = {
          email: email,
          rt: j.refreshToken,
          id: j.idToken,
          exp: Date.now() + (+j.expiresIn || 3600) * 1000
        };
        saveAuth(a);
        window.__fbToken = j.idToken;
        scheduleRefresh(a);
        cbOk();
      } else {
        cbErr((j && j.error && j.error.message) || 'UNKNOWN');
      }
    }).catch(function () { cbErr('NETWORK'); });
  }

  function errText(m) {
    if (!m) return 'Неизвестная ошибка';
    if (m.indexOf('INVALID_PASSWORD') >= 0 || m.indexOf('INVALID_LOGIN_CREDENTIALS') >= 0) return 'Неверный email или пароль склада';
    if (m.indexOf('USER_NOT_FOUND') >= 0) return 'Пользователь не создан в консоли Firebase';
    if (m.indexOf('TOO_MANY_ATTEMPTS') >= 0) return 'Слишком много попыток — подождите минуту';
    if (m === 'NETWORK') return 'Нет связи с сервером';
    return m;
  }

  window.fbCredDlg = function () {
    var a = loadAuth();
    openDlg(
      '<h3>🔑 Ключ склада</h3>' +
      '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">Один раз на устройство: email и пароль склада, которые создал руководитель в консоли Firebase.</p>' +
      '<label>Email склада</label><input id="fbEmail" type="email" value="' + esc((a && a.email) || '') + '">' +
      '<label>Пароль склада</label><input id="fbPass" type="password" placeholder="••••••••">' +
      '<p><button class="btn" onclick="fbCredDo()">Подключить</button> ' +
      '<button class="btn sec" onclick="closeDlg()">Позже</button></p>' +
      (a ? '<p><button class="btn del" onclick="fbCredForget()">Забыть ключ на этом устройстве</button></p>' : '')
    );
  };

  window.fbCredDo = function () {
    var e = document.getElementById('fbEmail').value.trim();
    var p = document.getElementById('fbPass').value;
    if (!e || !p) return toast('Введите email и пароль');
    signIn(e, p, function () {
      closeDlg();
      render();
      toast('🔓 Склад подключён');
      if (window.syncPush) syncPush();
      if (window.presBeat) presBeat();
    }, function (m) {
      toast('⚠ ' + errText(m));
    });
  };

  window.fbCredForget = function () {
    saveAuth(null);
    window.__fbToken = null;
    closeDlg();
    render();
    toast('Ключ удалён с устройства');
  };

  /* каждый запрос к складу теперь идёт с ключом */
  if (window.fbUrl) {
    var _fbUrl8 = window.fbUrl;
    window.fbUrl = function (p) {
      var u = _fbUrl8(p);
      if (window.__fbToken) u += (u.indexOf('?') >= 0 ? '&' : '?') + 'auth=' + encodeURIComponent(window.__fbToken);
      return u;
    };
  }

  /* кнопка и статус в разделе Ещё → Синхронизация */
  if (window.setView) {
    var _setView8 = window.setView;
    window.setView = function () {
      var h = _setView8();
      h = h.replace(
        '<button class="btn sec mini" onclick="syncTest()">🔍 Проверить связь</button>',
        '<button class="btn sec mini" onclick="syncTest()">🔍 Проверить связь</button> <button class="btn sec mini" onclick="fbCredDlg()">🔑 Ключ склада</button>'
      );
      h = h.replace(
        '<br>Отправка: ',
        '<br>🔑 Ключ склада: ' + (window.__fbToken ? '✅ задан' : '⚠ НЕ задан') + '<br>Отправка: '
      );
      return h;
    };
  }

  /* при первом запуске без ключа — предложить подключить */
  setTimeout(function () {
    if (window.FB_CONF && FB_CONF.databaseURL && !window.__fbToken && !loadAuth()) {
      fbCredDlg();
    }
    if (window.render) render();
  }, 600);
})();
/* =========================================
   ДОПОЛНЕНИЕ 9: ключ 🗝️ при регистрации +
   автопродление ключа после перезагрузки
   ========================================= */
(function () {
  if (window.__fix9_applied) return;
  window.__fix9_applied = true;

  var LS_AUTH = 'medshift_fb_auth';
  var API_KEY = (window.FB_CONF && FB_CONF.apiKey) || '';

  function loadAuth() {
    try { return JSON.parse(localStorage.getItem(LS_AUTH) || 'null'); } catch (e) { return null; }
  }
  function saveAuth(a) {
    if (a) localStorage.setItem(LS_AUTH, JSON.stringify(a));
    else localStorage.removeItem(LS_AUTH);
  }

  var refreshT = null;
  function schedule(a) {
    clearTimeout(refreshT);
    if (!a || !a.rt) return;
    var delay = Math.max(30000, (a.exp - Date.now()) - 5 * 60000);
    refreshT = setTimeout(function () { refresh(a.rt); }, delay);
  }

  function refresh(rt) {
    if (!rt || !API_KEY) return;
    fetch('https://securetoken.googleapis.com/v1/token?key=' + API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(rt)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.id_token) {
        var a = loadAuth() || {};
        a.rt = j.refresh_token || a.rt;
        a.id = j.id_token;
        a.exp = Date.now() + (+j.expires_in || 3600) * 1000;
        saveAuth(a);
        window.__fbToken = j.id_token;
        schedule(a);
      } else {
        window.__fbToken = null;
      }
    }).catch(function () { window.__fbToken = null; });
  }

  function signIn9(email, pass, ok, err) {
    fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: pass, returnSecureToken: true })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.idToken) {
        var a = {
          email: email,
          rt: j.refreshToken,
          id: j.idToken,
          exp: Date.now() + (+j.expiresIn || 3600) * 1000
        };
        saveAuth(a);
        window.__fbToken = j.id_token;
        schedule(a);
        ok();
      } else {
        err((j && j.error && j.error.message) || 'UNKNOWN');
      }
    }).catch(function () { err('NETWORK'); });
  }

  function err9(m) {
    if (!m) return 'неизвестная ошибка';
    if (m.indexOf('INVALID_PASSWORD') >= 0 || m.indexOf('INVALID_LOGIN_CREDENTIALS') >= 0) return 'неверный пароль склада';
    if (m.indexOf('USER_NOT_FOUND') >= 0) return 'такой email склада не создан';
    if (m.indexOf('TOO_MANY_ATTEMPTS') >= 0) return 'слишком много попыток, подождите минуту';
    if (m === 'NETWORK') return 'нет связи';
    return m;
  }

  /* после перезагрузки страницы ключ восстанавливается сам */
  setTimeout(function () {
    var a = loadAuth();
    if (a && a.rt && !window.__fbToken) refresh(a.rt);
  }, 300);

  /* на экране входа старое окно ключа не мешается */
  setTimeout(function () {
    var d = document.getElementById('dlg');
    var b = document.getElementById('dlgBody');
    if (!me() && d && d.open && b && /Ключ склада/.test(b.innerHTML || '')) closeDlg();
  }, 900);

  /* === регистрация с полем «Ключ 🗝️» === */
  if (window.regView) {
    window.regView = function () {
      var pre = (loadAuth() || {}).email || '';
      var hasTok = !!window.__fbToken;

      var h = '<h3>Анкета сотрудника</h3>';
      h += '<label>ФИО</label><input id="rName">';
      h += '<label>PIN (4 цифры)</label><input id="rPin" type="password" inputmode="numeric" maxlength="4">';
      h += '<label>Повторите PIN</label><input id="rPin2" type="password" inputmode="numeric" maxlength="4">';
      h += '<label>Ключ 🗝️ (email склада)</label><input id="rgFbEmail" type="email" value="' + esc(pre) + '">';
      h += '<label>Пароль склада</label><input id="rgFbPass" type="password" placeholder="••••••••">';
      h += '<p style="font-size:calc(var(--fs) - 2px);color:var(--mut)">';
      h += hasTok
        ? 'На этом устройстве ключ уже введён — поля можно оставить пустыми.'
        : 'Ключ 🗝️ выдаёт руководитель — спросить у Ананович А.С.';
      h += '</p>';
      h += '<p><button class="btn" onclick="regDo()">Создать</button> <button class="btn sec" onclick="closeDlg()">Закрыть</button></p>';

      openDlg(h);
    };
  }

  if (window.regDo) {
    window.regDo = function () {
      var n = document.getElementById('rName').value.trim();
      if (!n) return toast('Введите ФИО');

      var p1 = document.getElementById('rPin').value;
      var p2 = document.getElementById('rPin2').value;
      if (!/^[0-9]{4}$/.test(p1)) return toast('PIN: ровно 4 цифры');
      if (p1 !== p2) return toast('PIN не совпадает');

      var finish = function () {
        var make = function (role) {
          if (isBannedName(n)) {
            toast('🚫 Регистрация запрещена: обратитесь к руководителю');
            return;
          }
          DB.users.push({ id: uid(), name: n, pin: p1, role: role, cars: [], bags: [], phone: '', bday: '' });
          DB.session = DB.users[DB.users.length - 1].id;
          localStorage.setItem('medshift_my', String(DB.session));
          localStorage.setItem('medshift_rem', '1');
          localStorage.setItem('medshift_rem_ts', String(Date.now()));
          save();
          closeDlg();
          presBeat();
          go('home');
          toast(role === 'admin' ? 'Вы администратор 👑' : 'Регистрация выполнена ✅. Права назначит руководитель');
        };

        if (FB_CONF.databaseURL) {
          restGet('state').then(function (v) {
            var rc = (v && v.data && v.data.users) ? v.data.users.length : 0;
            make((rc === 0 && DB.users.length === 0) ? 'admin' : 'user');
          });
        } else {
          make(DB.users.length ? 'user' : 'admin');
        }
      };

      /* ключ уже есть на устройстве — не мучаем человека */
      if (window.__fbToken || !FB_CONF.databaseURL) { finish(); return; }

      var e = (document.getElementById('rgFbEmail') || {}).value || '';
      var pw = (document.getElementById('rgFbPass') || {}).value || '';
      e = e.trim();

      if (!e || !pw) {
        return toast('Введите ключ 🗝️ — спросить у Ананович А.С.');
      }

      signIn9(e, pw, finish, function (m) {
        toast('⚠ Ключ не принят: ' + err9(m));
      });
    };
  }

  /* подсказка про Ананович и в окне «Ключ склада» */
  if (window.fbCredDlg) {
    var _f8dlg = window.fbCredDlg;
    window.fbCredDlg = function () {
      _f8dlg();
      var b = document.getElementById('dlgBody');
      if (b) {
        b.innerHTML = b.innerHTML.split('которые создал руководитель в консоли Firebase.').join('Ключ 🗝️ спросить у Ананович А.С.');
      }
    };
  }

  setTimeout(function () { if (window.render) render(); }, 0);
})();
/* =========================================
   ДОПОЛНЕНИЕ 10: ключ склада восстанавливается
   мгновенно и тихо при каждой перезагрузке
   ========================================= */
(function () {
  if (window.__fix10_applied) return;
  window.__fix10_applied = true;

  var LS_AUTH = 'medshift_fb_auth';
  var API_KEY = (window.FB_CONF && FB_CONF.apiKey) || '';

  function loadA() {
    try { return JSON.parse(localStorage.getItem(LS_AUTH) || 'null'); } catch (e) { return null; }
  }
  function saveA(a) {
    if (a) localStorage.setItem(LS_AUTH, JSON.stringify(a));
  }

  var refreshT = null;
  function schedule(a) {
    clearTimeout(refreshT);
    if (!a || !a.rt) return;
    var delay = Math.max(30000, (a.exp - Date.now()) - 5 * 60000);
    refreshT = setTimeout(function () { doRefresh(a.rt); }, delay);
  }

  function afterToken() {
    if (window.SYNCSTAT) SYNCSTAT.lastErr = '';
    if (window.syncPush) syncPush();
    setTimeout(function () { if (window.render) render(); }, 60);
  }

  function doRefresh(rt) {
    if (!rt || !API_KEY) return;
    fetch('https://securetoken.googleapis.com/v1/token?key=' + API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(rt)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.id_token) {
        var a = loadA() || {};
        a.rt = j.refresh_token || a.rt;
        a.id = j.id_token;
        a.exp = Date.now() + (+j.expires_in || 3600) * 1000;
        saveA(a);
        window.__fbToken = j.id_token;
        schedule(a);
        afterToken();
      }
    }).catch(function () {});
  }

  /* 1. Мгновенно: сохранённый ключ ещё жив — берём без сети */
  var a0 = loadA();
  if (a0 && a0.id && a0.exp && Date.now() < a0.exp - 60000) {
    window.__fbToken = a0.id;
    schedule(a0);
    afterToken();
  } else if (a0 && a0.rt) {
    doRefresh(a0.rt);
  }

  /* 2. Ключ пришёл позже (медленная сеть) — обновляем экран */
  var seen = !!window.__fbToken;
  var watch = setInterval(function () {
    if (window.__fbToken && !seen) {
      seen = true;
      afterToken();
    }
    if (seen) clearInterval(watch);
  }, 400);
  setTimeout(function () { clearInterval(watch); }, 20000);

  /* 3. Окно «Ключ склада» не всплывает, если ключ уже на устройстве */
  setTimeout(function () {
    var d = document.getElementById('dlg');
    var b = document.getElementById('dlgBody');
    if (d && d.open && b && /Ключ склада/.test(b.innerHTML || '') && window.__fbToken) {
      closeDlg();
    }
  }, 1200);
})();
/* =========================================
   ДОПОЛНЕНИЕ 11: после входа по PIN сразу
   показать окно ключа склада, если его ещё нет
   ========================================= */
(function () {
  if (window.__fix11_applied) return;
  window.__fix11_applied = true;

  if (window.announceLogin) {
    var _al11 = window.announceLogin;
    window.announceLogin = function (u) {
      _al11(u);
      setTimeout(function () {
        if (window.FB_CONF && FB_CONF.databaseURL && !window.__fbToken) {
          var a = null;
          try { a = JSON.parse(localStorage.getItem('medshift_fb_auth') || 'null'); } catch (e) {}
          if (!a && window.fbCredDlg) fbCredDlg();
        }
      }, 600);
    };
  }
})();
/* =========================================
   ДОПОЛНЕНИЕ 12: синхронизация фото журнала
   смены и графика месяца между устройствами
   ========================================= */
(function () {
  if (window.__fix12_applied) return;
  window.__fix12_applied = true;

  function restDelete(p) {
    return fetch(fbUrl(p), { method: 'DELETE' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    }).catch(function () {});
  }

  function bumpSchedMeta() {
    restPut('schedmeta', { ts: Date.now() }).then(function () {
      window.__schedSeen = Date.now();
    });
  }

  function alive(kind, p, now) {
    if (!p || !p.ts) return false;
    if (kind === 'days') return now - p.ts < 2 * 864e5;
    var q = (p.month || '').split('-');
    if (!q[0] || !q[1]) return false;
    return now < new Date(+q[0], +q[1], 3).getTime();
  }

  /* добавление фото: сразу на склад */
  if (window.addSchedPhoto) {
    window.addSchedPhoto = function (inp, kind) {
      var f = inp.files[0];
      if (!f) return;
      compressImage(f, function (img) {
        try {
          var p = { id: uid(), ts: Date.now(), month: todayStr().slice(0, 7), img: img };
          DB.sched[kind].push(p);
          save();
          render();
          toast('Фото добавлено');
          if (window.__fbToken) {
            restPut('sched/' + kind + '/' + p.id, p).then(function () { bumpSchedMeta(); });
          }
        } catch (e) {
          toast('Память телефона переполнена — удалите старые фото');
        }
      });
    };
  }

  /* удаление фото: и со склада тоже */
  if (window.delPhoto) {
    window.delPhoto = function (kind, id) {
      DB.sched[kind] = DB.sched[kind].filter(function (x) { return x.id !== id; });
      save();
      closeDlg();
      render();
      toast('Фото удалено');
      if (window.__fbToken) {
        restDelete('sched/' + kind + '/' + id).then(function () { bumpSchedMeta(); });
      }
    };
  }

  /* сверка со складом: скачать чужие, залить свои, убрать протухшее */
  function schedSync() {
    if (!window.FB_CONF || !FB_CONF.databaseURL || !window.__fbToken) return;
    restGet('schedmeta').then(function (m) {
      var ts = (m && m.ts) || 0;
      if (window.__schedSeenOnce && ts === window.__schedSeen) return;
      window.__schedSeen = ts;
      window.__schedSeenOnce = true;

      restGet('sched').then(function (rem) {
        rem = rem || {};
        var now = Date.now();
        var changedLocal = false, changedRemote = false;

        ['days', 'months'].forEach(function (kind) {
          var rlist = rem[kind] || {};
          var llist = DB.sched[kind] || [];

          /* чужие фото к нам (только ещё живые) */
          Object.keys(rlist).forEach(function (id) {
            var p = rlist[id];
            if (!p || !p.img) return;
            var has = llist.some(function (x) { return x.id === p.id; });
            if (!has && alive(kind, p, now)) {
              llist.push(p);
              changedLocal = true;
            }
          });

          /* наши фото на склад (если их там нет) */
          llist.forEach(function (p) {
            if (!rlist[p.id] && alive(kind, p, now)) {
              restPut('sched/' + kind + '/' + p.id, p);
              changedRemote = true;
            }
          });

          /* протухшее со склада убираем */
          Object.keys(rlist).forEach(function (id) {
            if (rlist[id] && !alive(kind, rlist[id], now)) {
              restDelete('sched/' + kind + '/' + id);
              changedRemote = true;
            }
          });

          DB.sched[kind] = llist;
        });

        if (changedLocal) { save(); render(); }
        if (changedRemote) { bumpSchedMeta(); }
      });
    });
  }

  setInterval(schedSync, 20000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) schedSync();
  });
  setTimeout(schedSync, 3000);
})();
/* =========================================
   ДОПОЛНЕНИЕ 13: визуал-пакет —
   карточки, шапка, кнопки, вход с логотипом
   ========================================= */
(function () {
  if (window.__fix13_applied) return;
  window.__fix13_applied = true;

  var css13 = `
.card{border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 4px 12px rgba(0,0,0,.05);transition:transform .06s}
.card.clickable:active{transform:scale(.985)}
body.dark .card{box-shadow:0 1px 2px rgba(0,0,0,.45),0 4px 14px rgba(0,0,0,.28)}

header{background:linear-gradient(135deg,rgba(255,255,255,.16),rgba(0,0,0,.10)),var(--ac);box-shadow:0 2px 10px rgba(0,0,0,.20)}

nav{box-shadow:0 1px 0 var(--bd)}
nav button{position:relative}
nav button.on{box-shadow:none;font-weight:700;color:var(--ac)}
nav button.on::after{content:'';position:absolute;left:20%;right:20%;bottom:4px;height:3px;border-radius:3px;background:var(--ac)}

.btn{border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,.16);transition:transform .06s}
.btn:active{transform:scale(.96)}
.btn.sec,.btn.del{box-shadow:none}

.badge{border-radius:999px;padding:3px 8px;font-weight:600}

.clockWeather{border-radius:16px;background:linear-gradient(135deg,rgba(255,255,255,.10),rgba(0,0,0,.03)),var(--card);box-shadow:0 4px 14px rgba(0,0,0,.08)}
body.dark .clockWeather{background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(0,0,0,.18)),var(--card)}
.cwTime{letter-spacing:.5px}

tbody tr:nth-child(even):not(.exp):not(.soon){background:rgba(127,179,255,.06)}
body.dark tbody tr:nth-child(even):not(.exp):not(.soon){background:rgba(255,255,255,.035)}

#dlg{border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28)}
#dlg h3{margin-top:2px}

.toast{border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.35);background:rgba(28,28,30,.92);backdrop-filter:blur(6px)}
body.dark .toast{background:rgba(238,238,240,.94);color:#14181d}

main h3{margin:10px 2px 8px}
input:focus,select:focus,textarea:focus{outline:2px solid var(--ac);outline-offset:1px}

::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}

.loginwrap .card{border-radius:18px;padding:18px 14px;box-shadow:0 10px 34px rgba(0,0,0,.14);text-align:center}
body.dark .loginwrap .card{box-shadow:0 10px 34px rgba(0,0,0,.5)}
.loginwrap h2{margin:4px 0 2px;font-size:calc(var(--fs) + 10px);letter-spacing:.5px}
.loginwrap .bigbtn{text-align:left}
.msLogo{width:64px;height:64px;display:block;margin:0 auto 6px;filter:drop-shadow(0 4px 10px rgba(0,0,0,.25))}
`;

  var st13 = document.createElement('style');
  st13.textContent = css13;
  document.head.appendChild(st13);

  /* логотип на экране входа */
  if (window.loginView) {
    var _lv13 = window.loginView;
    window.loginView = function () {
      var h = _lv13();
      return h.replace(
        '<h2>МедСмена</h2>',
        '<svg class="msLogo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="2" y="2" width="60" height="60" rx="16" fill="var(--ac)"/>' +
        '<path d="M32 14v20M22 24h20" stroke="#fff" stroke-width="7" stroke-linecap="round"/>' +
        '<path d="M12 46h9l4-7 6 12 5-9h16" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg><h2>МедСмена</h2>'
      );
    };
  }

  setTimeout(function () { if (window.render) render(); }, 0);
})();
/* =========================================
   ДОПОЛНЕНИЕ 14: чат-пузыри и плавные диалоги
   ========================================= */
(function () {
  if (window.__fix14_applied) return;
  window.__fix14_applied = true;

  var css14 = `
.msg{margin-right:14%;border-radius:10px}
.msg.mine{background:var(--ac);color:#fff;margin-right:0;margin-left:16%}
.msg.mine b{color:#fff}
.msg.mine small{color:rgba(255,255,255,.75)}
.msg.sys{background:transparent;border:1px dashed var(--bd);color:var(--mut);text-align:center;margin-left:8%;margin-right:8%;font-size:calc(var(--fs) - 2px)}
#dlg{animation:dlgIn .16s ease}
@keyframes dlgIn{from{transform:scale(.97);opacity:.6}to{transform:scale(1);opacity:1}}
`;
  var st14 = document.createElement('style');
  st14.textContent = css14;
  document.head.appendChild(st14);

  function decorateChat() {
    if (window.tab !== 'chat') return;
    var u = window.me ? me() : null;
    if (!u) return;
    var box = document.getElementById('cbox');
    if (!box) return;
    var msgs = box.querySelectorAll('.msg');
    for (var i = 0; i < msgs.length; i++) {
      var b = msgs[i].querySelector('b');
      var author = b ? b.textContent : '';
      if (author === u.name) msgs[i].classList.add('mine');
      else if (author.indexOf('Система') >= 0 || author.indexOf('Феликс') >= 0) msgs[i].classList.add('sys');
    }
  }

  if (window.render) {
    var _r14 = window.render;
    window.render = function () {
      _r14();
      decorateChat();
    };
  }

  setTimeout(function () { if (window.render) render(); }, 0);
})();
/* =========================================
   ДОПОЛНЕНИЕ 15: атрибуты сезона вокруг
   праздника + кучка внизу, катается от наклона
   ========================================= */
(function () {
  if (window.__fix15_applied) return;
  window.__fix15_applied = true;

  var css15 = `
.msLeaves{position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:6;overflow:hidden}
.msLeaf{position:absolute;left:0;top:0;will-change:transform;user-select:none;line-height:1;opacity:.95;filter:drop-shadow(0 1px 1px rgba(0,0,0,.18))}
.seasonWrap{position:relative;display:inline-block}
.seasonDeco{position:absolute;font-size:calc(var(--fs) + 2px);opacity:.9;animation:decoFloat 4s ease-in-out infinite;pointer-events:none}
@keyframes decoFloat{0%,100%{transform:translateY(0) rotate(-8deg)}50%{transform:translateY(-4px) rotate(8deg)}}
`;
  var st15 = document.createElement('style');
  st15.textContent = css15;
  document.head.appendChild(st15);

  function seasonSet15() {
    var m = new Date().getMonth();
    if (m === 11 || m <= 1) return ['❄️', '⛄', '🌨', '❄️'];
    if (m <= 4) return ['🌸', '', '', '🌿'];
    if (m <= 7) return ['🌻', '', '️', ''];
    return ['🍂', '🍁', '', ''];
  }

  /* === атрибуты вокруг сезона/праздника === */
  if (window.seasonHtml) {
    var _sh15 = window.seasonHtml;
    window.seasonHtml = function () {
      var h = _sh15();
      var s = seasonSet15();
      var d = '<div class="seasonWrap">';
      d += '<span class="seasonDeco" style="left:-16px;top:-8px;animation-delay:0s">' + s[0] + '</span>';
      d += '<span class="seasonDeco" style="right:-16px;top:-8px;animation-delay:.7s">' + s[1] + '</span>';
      d += '<span class="seasonDeco" style="left:-20px;bottom:-6px;animation-delay:1.4s">' + s[2] + '</span>';
      d += '<span class="seasonDeco" style="right:-20px;bottom:-6px;animation-delay:2.1s">' + s[3] + '</span>';
      d += h + '</div>';
      return d;
    };
  }

  /* === кучка внизу с физикой === */
  var leavesBox = null, parts = [], rafId = null;
  var tilt = 0, hasTilt = false, lastTiltTs = 0;

  function ensureBox() {
    if (leavesBox) return leavesBox;
    leavesBox = document.createElement('div');
    leavesBox.className = 'msLeaves';
    document.body.appendChild(leavesBox);
    return leavesBox;
  }

  function stopLeaves() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (leavesBox) leavesBox.innerHTML = '';
    parts = [];
  }

  function startLeaves() {
    stopLeaves();
    if (!window.me || !me()) return;
    if (window.S && S().leaves === false) return;

    var box = ensureBox();
    var set = seasonSet15();
    var n = window.innerWidth < 480 ? 12 : 18;

    for (var i = 0; i < n; i++) {
      var el = document.createElement('span');
      el.className = 'msLeaf';
      el.textContent = set[i % set.length];
      var r = 10 + Math.random() * 8;
      el.style.fontSize = (r * 1.6) + 'px';
      box.appendChild(el);
      parts.push({
        el: el, r: r,
        x: Math.random() * window.innerWidth,
        y: -40 - Math.random() * window.innerHeight * 0.6,
        vx: 0, vy: 0,
        rot: Math.random() * 360
      });
    }
    loop();
  }

  function loop() {
    rafId = requestAnimationFrame(loop);
    var W = window.innerWidth, H = window.innerHeight;
    var floor = H - 6;
    var t = Date.now() / 1000;
    var breeze = Math.sin(t * 0.7) * 0.03;
    var ax = (hasTilt ? tilt : 0) * 0.5 + breeze;
    var i, j, p;

    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      p.vx += ax;
      p.vy += 0.35;
      p.vx *= 0.992;
      p.vy *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vx * 2.2;
      if (p.x < p.r) { p.x = p.r; p.vx *= -0.4; }
      if (p.x > W - p.r) { p.x = W - p.r; p.vx *= -0.4; }
      if (p.y > floor - p.r) {
        p.y = floor - p.r;
        p.vy *= -0.22;
        p.vx *= 0.94;
        if (Math.abs(p.vy) < 0.6) p.vy = 0;
      }
    }

    for (i = 0; i < parts.length; i++) {
      for (j = i + 1; j < parts.length; j++) {
        var a = parts[i], b = parts[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var min = a.r + b.r;
        if (d < min) {
          var push = (min - d) / 2;
          var nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
          var dv = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (dv > 0) {
            a.vx -= dv * nx * 0.5; a.vy -= dv * ny * 0.5;
            b.vx += dv * nx * 0.5; b.vy += dv * ny * 0.5;
          }
        }
      }
    }

    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      p.el.style.transform = 'translate(' + (p.x - p.r) + 'px,' + (p.y - p.r) + 'px) rotate(' + p.rot + 'deg)';
    }
  }

  /* наклон телефона */
  window.addEventListener('deviceorientation', function (e) {
    if (e.gamma == null) return;
    hasTilt = true;
    lastTiltTs = Date.now();
    tilt = Math.max(-1, Math.min(1, e.gamma / 30));
  });

  /* на ПК — мышка */
  window.addEventListener('mousemove', function (e) {
    if (hasTilt) return;
    tilt = (e.clientX / window.innerWidth - 0.5) * 1.2;
  });

  /* iPhone спросит разрешение на датчики при первом тапе */
  document.addEventListener('click', function () {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' &&
          typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(function () {}).catch(function () {});
      }
    } catch (e) {}
  }, { once: true });

  /* выключатель в настройках */
  window.msToggleLeaves = function (on) {
    S().leaves = !!on;
    save();
    if (on) startLeaves(); else stopLeaves();
  };

  if (window.setView) {
    var _sv15 = window.setView;
    window.setView = function () {
      var h = _sv15();
      return h.replace(
        '<label>Режим оформления</label>',
        '<label><input type="checkbox" style="width:auto"' + (S().leaves === false ? '' : ' checked') + ' onchange="msToggleLeaves(this.checked)"> 🍂 Кучка атрибутов сезона внизу (катается от наклона)</label>' +
        '<label>Режим оформления</label>'
      );
    };
  }

  /* старт/стоп вместе с входом-выходом */
  if (window.render) {
    var _r15 = window.render;
    window.render = function () {
      _r15();
      if (window.me && me()) {
        if (!rafId) startLeaves();
      } else {
        stopLeaves();
      }
    };
  }

  window.addEventListener('resize', function () {
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].x > window.innerWidth - parts[i].r) parts[i].x = window.innerWidth - parts[i].r;
    }
  });

  setTimeout(function () { if (window.render) render(); }, 0);
})();
/* =========================================
   ДОПОЛНЕНИЕ 16: логотип-скорая на экране
   входа и иконка во вкладке браузера
   ========================================= */
(function () {
  if (window.__fix16_applied) return;
  window.__fix16_applied = true;

  var AMB = '<svg class="msLogo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="2" y="2" width="60" height="60" rx="16" fill="var(--ac)"/>' +
    '<rect x="3" y="30" width="3.5" height="2" rx="1" fill="rgba(255,255,255,.75)"/>' +
    '<rect x="2" y="35" width="4.5" height="2" rx="1" fill="rgba(255,255,255,.55)"/>' +
    '<rect x="8" y="22" width="40" height="20" rx="4" fill="#fff"/>' +
    '<path d="M48 26h6l6 8v8H48z" fill="#fff"/>' +
    '<path d="M50 28h4l4 5h-8z" fill="#bfe3ff"/>' +
    '<rect x="8" y="36" width="52" height="3.5" fill="#e53935"/>' +
    '<rect x="24" y="24" width="4" height="10" fill="#e53935"/>' +
    '<rect x="21" y="27" width="10" height="4" fill="#e53935"/>' +
    '<rect x="30" y="17" width="9" height="5" rx="2" fill="#42a5f5"/>' +
    '<circle cx="34.5" cy="15" r="2.5" fill="#90caf9" opacity=".8"/>' +
    '<circle cx="20" cy="44" r="5" fill="#263238"/>' +
    '<circle cx="20" cy="44" r="2" fill="#90a4ae"/>' +
    '<circle cx="50" cy="44" r="5" fill="#263238"/>' +
    '<circle cx="50" cy="44" r="2" fill="#90a4ae"/>' +
    '</svg>';

  /* подменяем логотип на экране входа */
  if (window.loginView) {
    var _lv16 = window.loginView;
    window.loginView = function () {
      var h = _lv16();
      return h.replace(/<svg class="msLogo"[\s\S]*?<\/svg>/, AMB);
    };
  }

  /* иконка во вкладке браузера */
  var l = document.createElement('link');
  l.rel = 'icon';
  l.type = 'image/svg+xml';
  l.href = 'icon.svg';
  document.head.appendChild(l);

  setTimeout(function () { if (window.render) render(); }, 0);
})();
/* =========================================
   ДОПОЛНЕНИЕ 17: бренд ООО «КрасНЕО» +
   жёлтая машинка скорой как на сайте
   ========================================= */
(function () {
  if (window.__fix17_applied) return;
  window.__fix17_applied = true;

  var BRAND = 'ООО «КрасНЕО»';
  var BRAND_FULL = 'ООО «КрасНЕО» · первая частная скорая помощь';
  var BRAND_FOOT = 'ООО «КрасНЕО» — первая частная скорая помощь · Красноярск, пр. Металлургов 8 · тел. 203-03-03';

  var AMB = '<svg class="msLogo" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="2" y="2" width="60" height="60" rx="16" fill="#0b5394"/>' +
    '<rect x="3" y="30" width="3.5" height="2" rx="1" fill="rgba(255,255,255,.75)"/>' +
    '<rect x="2" y="35" width="4.5" height="2" rx="1" fill="rgba(255,255,255,.55)"/>' +
    '<rect x="8" y="22" width="40" height="20" rx="4" fill="#fdd835"/>' +
    '<path d="M48 26h6l6 8v8H48z" fill="#fdd835"/>' +
    '<path d="M50 28h4l4 5h-8z" fill="#b3e5fc"/>' +
    '<rect x="8" y="36" width="52" height="3.5" fill="#e53935"/>' +
    '<rect x="24" y="24" width="4" height="10" fill="#e53935"/>' +
    '<rect x="21" y="27" width="10" height="4" fill="#e53935"/>' +
    '<rect x="30" y="17" width="9" height="5" rx="2" fill="#42a5f5"/>' +
    '<circle cx="34.5" cy="15" r="2.5" fill="#90caf9" opacity=".8"/>' +
    '<circle cx="20" cy="44" r="5" fill="#263238"/>' +
    '<circle cx="20" cy="44" r="2" fill="#cfd8dc"/>' +
    '<circle cx="50" cy="44" r="5" fill="#263238"/>' +
    '<circle cx="50" cy="44" r="2" fill="#cfd8dc"/>' +
    '</svg>';

  /* название во вкладке браузера и в шапке */
  document.title = BRAND + ' · смена';
  var hl = document.querySelector('header .hdr-left');
  if (hl) hl.innerHTML = hl.innerHTML.replace('МедСмена', BRAND);

  /* экран входа: жёлтая машинка + бренд */
  if (window.loginView) {
    var _lv17 = window.loginView;
    window.loginView = function () {
      var h = _lv17();
      h = h.replace(/<svg class="msLogo"[\s\S]*?<\/svg>/, AMB);
      h = h.replace('<h2>МедСмена</h2>',
        '<h2>' + BRAND + '</h2>' +
        '<p style="margin:2px 0 8px;font-size:calc(var(--fs) - 2px);color:var(--mut)">' +
        BRAND_FULL + '<br>Красноярск · 203-03-03</p>');
      return h;
    };
  }

  /* в окне QR-инструкции тоже бренд */
  if (window.qrDlg) {
    var _qr17 = window.qrDlg;
    window.qrDlg = function () {
      _qr17();
      var b = document.getElementById('dlgBody');
      if (b) b.innerHTML = b.innerHTML.split('«МедСмена»').join('«' + BRAND + '»');
    };
  }

  /* строка организации в печатном отчёте */
  if (window.reportPrintHtml) {
    var _rph17 = window.reportPrintHtml;
    window.reportPrintHtml = function (r) {
      return _rph17(r) +
        '<div style="margin-top:14px;padding-top:8px;border-top:1px solid #ccc;font-size:12px;color:#555">' +
        BRAND_FOOT + '</div>';
    };
  }

  /* и в скачанном текстовом отчёте */
  if (window.reportText) {
    var _rt17 = window.reportText;
    window.reportText = function (r) {
      return _rt17(r) + '\n\n' + BRAND_FOOT;
    };
  }

  setTimeout(function () { if (window.render) render(); }, 0);
})();
/* =========================================
   ДОПОЛНЕНИЕ 18: ФИО в шапке не срезается,
   при необходимости переносится на 2 строки
   ========================================= */
(function () {
  if (window.__fix18_applied) return;
  window.__fix18_applied = true;

  var css18 = `
header{align-items:flex-start}
.hdr-left{flex:1 1 auto;min-width:0}
.hdr-user{
  max-width:52%!important;
  white-space:normal!important;
  overflow:visible!important;
  text-overflow:clip!important;
  text-align:right;
  line-height:1.2;
  font-size:calc(var(--fs) - 2px)!important;
  opacity:.95;
}
@media(max-width:480px){
  .hdr-user{max-width:48%!important}
}
`;

  var st18 = document.createElement('style');
  st18.textContent = css18;
  document.head.appendChild(st18);

  setTimeout(function () { if (window.updHead) updHead(); }, 0);
})();
/* =========================================
   ДОПОЛНЕНИЕ 26: КОМПЛЕКСНЫЙ ФИКС
   - Исправление пути state/date/users
   - Безопасный syncPush (фикс ошибки 2704)
   - Защита от дублирования иконок ключа
   ========================================= */
(function () {
  if (window.__fix26_applied) return;
  window.__fix26_applied = true;

  /* === 1. ПЕРЕХВАТ ПУТЕЙ (state/date/users) === */
  var _restGet = window.restGet;
  if (_restGet) {
    window.restGet = function (path) {
      if (path === 'state/users' || path === 'users') {
        console.log('[Fix26] 🔄 GET → state/date/users');
        return _restGet('state/date/users');
      }
      return _restGet(path);
    };
  }

  var _restPut = window.restPut;
  if (_restPut) {
    window.restPut = function (path, data) {
      if (path === 'state/users' || path === 'users') {
        console.log('[Fix26] 🔄 PUT → state/date/users');
        return _restPut('state/date/users', data);
      }
      return _restPut(path, data);
    };
  }

  var _restDelete = window.restDelete;
  if (_restDelete) {
    window.restDelete = function (path) {
      if (path && (path.startsWith('state/users/') || path.startsWith('users/'))) {
        var uid = path.split('/').pop();
        console.log('[Fix26] 🔄 DELETE → state/date/users/' + uid);
        return _restDelete('state/date/users/' + uid);
      }
      return _restDelete(path);
    };
  }

  /* === 2. БЕЗОПАСНЫЙ SYNCPUSH (ФИКС ОШИБКИ 2704) === */
  var _originalSyncPush = window.syncPush;
  window.syncPush = function () {
    // Проверка токена
    var token = window.__fbToken || localStorage.getItem('medshift_fb_auth');
    if (!token) {
      console.warn('[Fix26] ⚠ Токен отсутствует, пропускаем syncPush');
      return Promise.resolve();
    }

    // Если оригинальная функция не вернула Promise — оборачиваем
    if (_originalSyncPush) {
      try {
        var result = _originalSyncPush();
        if (result && typeof result.then === 'function') {
          return result.catch(function (e) {
            console.error('[Fix26] ❌ syncPush ошибка:', e);
            return Promise.resolve();
          });
        }
      } catch (e) {
        console.error('[Fix26] ❌ syncPush исключение:', e);
      }
    }

    // Fallback: возвращаем пустой Promise чтобы не ломать .then()
    console.warn('[Fix26] syncPush не найден или не возвращает Promise');
    return Promise.resolve();
  };

  /* === 3. ЗАЩИТА ОТ ДУБЛИРОВАНИЯ ИКОНОК КЛЮЧА === */
  var _originalRender = window.render;
  if (_originalRender) {
    window.render = function () {
      var result = _originalRender.apply(this, arguments);
      
      // Убираем дублирующиеся иконки ключа после рендера
      setTimeout(function () {
        var containers = document.querySelectorAll('.user-card, .staff-item, [class*="user"]');
        containers.forEach(function (container) {
          var keys = container.querySelectorAll('🔑, .key-icon, [class*="key"]');
          if (keys.length > 1) {
            for (var i = 1; i < keys.length; i++) {
              keys[i].remove();
            }
          }
        });
      }, 100);
      
      return result;
    };
  }

  console.log('[Fix26] ✅ Комплексный фикс активирован');
})();
/* =========================================
   ДОПОЛНЕНИЕ 26 FINAL: КОМПЛЕКСНЫЙ ФИКС
   - Кнопки Удалить/Сброс (с PIN, правильный путь)
   - Безопасный syncPush (гарантированный перехват)
   - Путь state/date/users
   ========================================= */
(function () {
  if (window.__fix26_final_applied) return;
  window.__fix26_final_applied = true;

  /* === 1. ФУНКЦИИ УПРАВЛЕНИЯ АККАУНТОМ === */
  function registerAccountButtons() {
    window.deleteMyAccountDlg = function () {
      var u = window.me ? me() : null;
      if (!u) return toast('Вы не вошли в систему');
      openDlg(
        '<h3>🗑 Удалить мой аккаунт</h3>' +
        '<p style="color:var(--mut);font-size:calc(var(--fs) - 2px)">' +
        'Аккаунт «<b>' + esc(u.name) + '</b>» будет удалён навсегда.<br>' +
        'Ваши отчёты останутся в истории, но доступ будет закрыт.</p>' +
        '<label>Введите PIN для подтверждения</label>' +
        '<input id="delPin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autofocus>' +
        '<p style="margin-top:10px"><button class="btn del" onclick="doDeleteMyAccount()">Удалить навсегда</button> ' +
        '<button class="btn sec" onclick="closeDlg()">Отмена</button></p>'
      );
    };

    window.doDeleteMyAccount = function () {
      var u = window.me ? me() : null;
      if (!u) return;
      var pin = document.getElementById('delPin').value;
      if (pin !== u.pin) return toast('❌ Неверный PIN');
      ask('Точно удалить аккаунт «' + esc(u.name) + '»? Это необратимо.', function () {
        DB.users = DB.users.filter(function (x) { return x.id !== u.id; });
        // ✅ ПРАВИЛЬНЫЙ ПУТЬ: state/date/users
        if (window.restDelete) {
          restDelete('state/date/users/' + u.id).catch(function (e) {
            console.warn('[Fix26] Не удалось удалить с сервера:', e);
          });
        }
        DB.session = null;
        localStorage.removeItem('medshift_my');
        localStorage.removeItem('medshift_rem');
        save(); closeDlg(); go('login'); toast('🗑 Аккаунт удалён');
      });
    };

    window.safeResetDlg = function () {
      var u = window.me ? me() : null;
      if (!u) return toast('Сначала войдите в систему');
      openDlg(
        '<h3>♻️ Сброс устройства</h3>' +
        '<p style="color:var(--mut);font-size:calc(var(--fs) - 2px)">' +
        'Очистит кэш и настройки <b>только на этом устройстве</b>.<br>' +
        'База на сервере (сотрудники, отчёты) <b>НЕ удалится</b>.</p>' +
        '<label>Введите PIN для подтверждения</label>' +
        '<input id="resetPin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autofocus>' +
        '<p style="margin-top:10px"><button class="btn del" onclick="doSafeReset()">Сбросить</button> ' +
        '<button class="btn sec" onclick="closeDlg()">Отмена</button></p>'
      );
    };

    window.doSafeReset = function () {
      var u = window.me ? me() : null;
      if (!u) return;
      var pin = document.getElementById('resetPin').value;
      if (pin !== u.pin) return toast('❌ Неверный PIN');
      localStorage.removeItem('medshift_my');
      localStorage.removeItem('medshift_rem');
      localStorage.removeItem('medshift_rem_ts');
      localStorage.removeItem('medshift_fb_auth');
      if (window.DB) {
        DB.session = null; DB.users = []; DB.bags = [];
        DB.cars = []; DB.reports = []; DB.chat = [];
      }
      closeDlg();
      toast('♻️ Устройство сброшено. База на сервере сохранена.');
      setTimeout(function () { location.reload(); }, 800);
    };

    console.log('[Fix26-Final] ✅ Кнопки управления аккаунтом зарегистрированы');
  }

  // Регистрируем сразу + повторно через 1 сек (защита от перезаписи)
  registerAccountButtons();
  setTimeout(registerAccountButtons, 1000);

  /* === 2. ПЕРЕХВАТ ПУТЕЙ (state/date/users) === */
  var _restGet = window.restGet;
  if (_restGet) {
    window.restGet = function (path) {
      if (path === 'state/users' || path === 'users') return _restGet('state/date/users');
      return _restGet(path);
    };
  }
  var _restPut = window.restPut;
  if (_restPut) {
    window.restPut = function (path, data) {
      if (path === 'state/users' || path === 'users') return _restPut('state/date/users', data);
      return _restPut(path, data);
    };
  }
  var _restDelete = window.restDelete;
  if (_restDelete) {
    window.restDelete = function (path) {
      if (path && (path.startsWith('state/users/') || path.startsWith('users/'))) {
        return _restDelete('state/date/users/' + path.split('/').pop());
      }
      return _restDelete(path);
    };
  }

  /* === 3. БЕЗОПАСНЫЙ SYNCPUSH (ГАРАНТИРОВАННЫЙ ПЕРЕХВАТ) === */
  var checkInterval = setInterval(function () {
    if (window.syncPush && !window.__syncPushWrapped) {
      window.__syncPushWrapped = true;
      var _originalSyncPush = window.syncPush;
      window.syncPush = function () {
        var token = window.__fbToken || localStorage.getItem('medshift_fb_auth');
        if (!token) { console.warn('[Fix26] ⚠ Нет токена'); return Promise.resolve(); }
        try {
          var result = _originalSyncPush();
          if (result && typeof result.then === 'function') {
            return result.catch(function (e) { console.error('[Fix26] ❌ syncPush:', e); return Promise.resolve(); });
          }
        } catch (e) { console.error('[Fix26] ❌ syncPush exception:', e); }
        return Promise.resolve();
      };
      console.log('[Fix26-Final] ✅ syncPush безопасно обёрнут');
      clearInterval(checkInterval);
    }
  }, 500);
  setTimeout(function () { clearInterval(checkInterval); }, 10000);

  console.log('[Fix26-Final] ✅ Комплексный фикс активирован');
})();
