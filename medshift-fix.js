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
