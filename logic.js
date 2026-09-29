/* =====================================================================
   Чистая логика слоя интерфейса.

   Здесь то, что решает, что попадёт в базу, но не рисовалось на экране:
   разбор файлов и вычисление «цвета» отчёта. Раньше это было размазано по
   boot.js и reports.js и не было покрыто ни одним тестом — а это ровно те
   места, где ошибка не видна: график смен просто оказывается неполным, а
   отчёт — не того цвета.

   Всё здесь — чистые функции: на вход данные, на выход результат. Побочных
   эффектов нет, поэтому проверяется без браузера.
   ===================================================================== */

/* Ключ строки графика смен. Дата+бригада+машина: у строк нет id, и по этому
   ключу слияние двух устройств понимает, что это одна и та же смена.
   Раньше ключ жил в boot.js и не был проверен — опечатка в нём тихо ломала
   и импорт CSV, и синхронизацию графика. */
export function shiftKeyOf(r) { return [r && r.date, r && r.brigade, r && r.car].join('|'); }

/* Импорт графика смен из CSV.
   Возвращает ТОЛЬКО новые строки — уже имеющиеся пропускаются, поэтому
   повторный импорт того же файла не двоит строки.
   Что здесь ломалось раньше:
   — заголовок «Дата;Бригада;Машина» попадал в график как смена, если перед
     ним была пустая строка или BOM (проверка индекса съезжала);
   — кавычки и запятые в значении не снимались;
   — повторный импорт дописывал дубли. */
export function parseShiftCsv(text, existing, now) {
  const rows = [], seen = {};
  (existing || []).forEach(x => { seen[shiftKeyOf(x)] = 1; });
  const ts = +now || Date.now();
  String(text == null ? '' : text).split(/\r?\n/).forEach(line => {
    line = line.trim().replace(/^﻿/, '');
    if (!line) return;
    // Голубчик, Excel отдаёт колонки через «|» (sheetRowsToText), а CSV — через ; , tab.
    // Принимаем все четыре, а то график из Excel не встанет. Старые тесты на ; , tab — зелёные.
    const parts = line.split(/[;,\t|]/).map(x => x.trim().replace(/^"|"$/g, ''));
    // Заголовок пропускаем всегда, а не только в первой строке: пустая
    // строка или BOM в начале файла раньше сдвигали индекс, и «Дата;Бригада»
    // попадала в график как смена.
    //
    // Именно (?![0-9]), а не \b. В JavaScript \w — это только латиница и
    // цифры, кириллицы в нём нет, поэтому между «Дата» и «;» границы слова
    // не существует: /^(дата|date)\b/i не срабатывало НИКОГДА, и заголовок
    // честно импортировался как смена «Дата / Бригада / Машина / …».
    if (/^(дата|date)(?![0-9])/i.test(parts[0] || '')) return;
    // Совсем пустая строка данных («;;;») в график не попадает: иначе
    // импорт пустого файла набивал график болванками.
    if (!parts.some(x => x)) return;
    const o = {
      date: parts[0] || '', brigade: parts[1] || '', car: parts[2] || '',
      staff: parts[3] || '', note: parts[4] || '', upd: ts
    };
    const k = shiftKeyOf(o);
    if (seen[k]) return;
    seen[k] = 1; rows.push(o);
  });
  return rows;
}

/* Импорт списка позиций в сумку/шаблон: единый парсер таблицы.
   Голубчик, один рецепт от всех хворей: понимает и «Название 10 амп»,
   и «1. | Адреналин г/хл р-р д/ин. 0,1 % амп 1 мл | 10 амп» из sumka.txt,
   и вставку из Excel (колонки через tab / ; / |), и «Анальгин, 10, таб».
   С № и без №, с «Не менее 4 шт», «3 пары», «1 бл», «2 уп», «1 туба».
   Возвращает {name, spec, unit, qty} — как addBagTpl из SEED складывает
   (name=r[2], spec=r[3], unit=r[4], qty=r[5]). Пустышки и заголовки
   («№ | НАИМЕНОВАНИЕ | КОЛИЧЕСТВО», «РАБОЧАЯ СУМКА — полный список»)
   в таблицу не попадают — а то давление подскочит. */
function _isKnownUnitWord(w) {
  const s = String(w || '').toLowerCase().replace(/\./g, '').trim();
  if (!s) return false;
  if (['ам', 'амп', 'фл', 'шт', 'пар', 'пара', 'пары', 'уп', 'таб', 'табл', 'капс', 'компл', 'бл', 'блистер', 'пакет', 'туба', 'туб'].includes(s)) return true;
  if (/^ампул/.test(s)) return true;
  if (/^флакон/.test(s)) return true;
  if (/^штук/.test(s)) return true;
  if (/^упак/.test(s)) return true;
  if (/^таблет/.test(s)) return true;
  if (/^капсул/.test(s)) return true;
  if (/^комплект/.test(s)) return true;
  if (/^блист/.test(s)) return true;
  if (/^пакет/.test(s)) return true;
  if (/^туб/.test(s)) return true;
  return false;
}
function _normUnit(w) {
  const s = String(w || '').toLowerCase().replace(/\./g, '').trim();
  if (!s) return 'шт';
  if (s === 'ам' || s === 'амп' || /^ампул/.test(s)) return 'амп';
  if (s === 'фл' || /^флакон/.test(s)) return 'фл';
  if (s === 'шт' || /^штук/.test(s) || s === 'штука' || s === 'штуки') return 'шт';
  if (s === 'пар' || s === 'пара' || s === 'пары' || /^пар/.test(s)) return 'пар';
  if (s === 'уп' || /^упак/.test(s)) return 'уп';
  if (s === 'таб' || s === 'табл' || /^таблет/.test(s)) return 'таб';
  if (s === 'капс' || /^капсул/.test(s)) return 'капс';
  if (s === 'компл' || /^комплект/.test(s)) return 'компл';
  if (s === 'бл') return 'бл';
  if (/^блист/.test(s) || s === 'блистер') return 'блистер';
  if (/^пакет/.test(s)) return 'пакет';
  if (/^туб/.test(s) || s === 'туба') return 'туба';
  return s || 'шт';
}
function _isHeaderLine(line) {
  const s = String(line || '');
  const low = s.toLowerCase();
  if (/^\s*№\s*[\|\t;]?\s*наимен/i.test(s)) return true;
  if (/^\s*наименование\b/i.test(s)) return true;
  if (/наимен/i.test(s) && (/колич/i.test(s) || /кол-?\s*во/i.test(s) || /\bqty\b/i.test(s))) return true;
  if (/рабочая сумка.*полный список/i.test(s)) return true;
  if (/таблетированные формы/i.test(s)) return true;
  if (/нумерация как в оригинале/i.test(s)) return true;
  if (/позиция.*отсутствует/i.test(s)) return true;
  return false;
}
function _parseQtyCell(qtyStr) {
  const s = String(qtyStr == null ? '' : qtyStr).trim().replace(/\s+/g, ' ');
  if (!s) return { qty: 1, unit: 'шт', confident: false };
  const m = s.match(/(?:не\s+менее\s+)?(\d{1,4}(?:[.,]\d+)?)\s*([а-яёa-z]+)?\.?\s*$/i);
  if (!m) return { qty: 1, unit: 'шт', confident: false };
  const numStr = m[1], unitRaw = (m[2] || '').trim();
  if (unitRaw && !_isKnownUnitWord(unitRaw)) return { qty: 1, unit: 'шт', confident: false };
  if (!unitRaw) {
    if (/^(?:не\s+менее\s+)?\d{1,4}(?:[.,]\d+)?\s*\.?$/.test(s)) {
      const qty = Math.max(1, Math.round(parseFloat(numStr.replace(',', '.'))) || 1);
      return { qty, unit: 'шт', confident: true };
    }
    return { qty: 1, unit: 'шт', confident: false };
  }
  const qty = Math.max(1, Math.round(parseFloat(numStr.replace(',', '.'))) || 1);
  return { qty, unit: _normUnit(unitRaw), confident: true };
}
/* Делит полное наименование на имя + форму ТОЧНО как шаблон SEED.
   Постановили на совещании: строка в строку!
   Стадия 1 — лекарства: р-р, конц., таб./табл., аэр., пор., сусп., глаз.
   Стадия 2 — цифры-обозначения это форма: бинты 7х14, 0,9%, 0,05%-100 мл,
   Глицин 100 мг, пакеты 50х60 см. Берем самое раннее начало.
   Скобки: если вся форма в скобках "(не менее 70 см х 140 см)" — режем перед "(".
   \b для кириллицы не работает — проверяем вручную. */
function _splitNameSpec(full) {
  full = String(full || '').trim();
  if (!full) return { name: '', spec: '' };
  const isLD = (ch) => /[а-яёa-z0-9]/i.test(ch || '');
  const bi = full.indexOf('(');
  const search1 = bi >= 0 ? full.slice(0, bi) : full;
  const low1 = search1.toLowerCase();
  const kws = ['конц.', 'табл.', 'таб.', 'аэр.', 'пор.', 'сусп.', 'глаз.', 'р-р'];
  let best1 = -1;
  for (const kw of kws) {
    let from = 0;
    while (true) {
      const idx = low1.indexOf(kw, from);
      if (idx === -1) break;
      const prev = idx === 0 ? ' ' : low1[idx - 1];
      let ok = !isLD(prev);
      if (ok && kw === 'р-р') {
        const nxt = low1[idx + 3] || ' ';
        if (isLD(nxt)) ok = false;
      }
      if (ok) { if (best1 === -1 || idx < best1) best1 = idx; break; }
      from = idx + 1;
    }
  }
  // Скобка-форма: "(не менее 70 см х 140 см)" — после ")" пусто, внутри цифры.
  let bestBr = -1;
  if (bi !== -1) {
    const ci = full.indexOf(')', bi);
    if (ci !== -1) {
      const inside = full.slice(bi + 1, ci);
      const after = full.slice(ci + 1).trim();
      if (!after && /\d/.test(inside)) bestBr = bi;
    }
  }
  // Стадия 2 — ищем по ВСЕЙ строке (размеры могут быть после скобок: пакеты 50х60).
  const low2 = full.toLowerCase();
  let best2 = -1;
  for (const kw of ['фл.', 'туба']) {
    let from = 0;
    while (true) {
      const idx = low2.indexOf(kw, from);
      if (idx === -1) break;
      const prev = idx === 0 ? ' ' : low2[idx - 1];
      if (!isLD(prev)) { if (best2 === -1 || idx < best2) best2 = idx; break; }
      from = idx + 1;
    }
  }
  const re2 = /(\d+[.,]?\d*\s*%(?![а-яёa-z0-9])|\d+[.,]?\d*\s*(?:мг|г|мл|мм|см|л)(?![а-яёa-z0-9])|\d+[.,]?\d*\s*[хx\*]\s*\d+|№\s*\d+)/i;
  const m2 = low2.match(re2);
  if (m2 && m2.index != null) {
    if (best2 === -1 || m2.index < best2) best2 = m2.index;
  }
  // самое раннее побеждает: доза 0,9% раньше чем р-р (Натрия хлорид 0,9% р-р...)
  let best = -1;
  [best1, bestBr, best2].forEach((b) => { if (b !== -1 && (best === -1 || b < best)) best = b; });
  if (best === -1) return { name: full, spec: '' };
  const n = full.slice(0, best).trim().replace(/[,\s]+$/, '');
  const s = full.slice(best).trim();
  if (!n || n.length < 2) return { name: full, spec: '' };
  return { name: n, spec: s };
}
function _parseSingleLine(s) {
  s = String(s || '').trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s+(?:не\s+менее\s+)?(\d{1,4}(?:[.,]\d+)?)\s*([а-яёa-z]+)?\.?\s*$/i);
  if (m) {
    const namePart = (m[1] || '').trim();
    const numStr = m[2], unitRaw = (m[3] || '').trim();
    if (!namePart) return null;
    if (unitRaw) {
      if (!_isKnownUnitWord(unitRaw)) { const sp0 = _splitNameSpec(s); return { name: sp0.name || s, spec: sp0.spec || '', unit: 'шт', qty: 1, expiry: '', potent: false }; }
      const qty = Math.max(1, Math.round(parseFloat(numStr.replace(',', '.'))) || 1);
      const sp = _splitNameSpec(namePart);
      return { name: sp.name, spec: sp.spec, unit: _normUnit(unitRaw), qty, expiry: '', potent: false };
    }
    if (/[0-9]/.test(namePart)) { const sp9 = _splitNameSpec(s); return { name: sp9.name || s, spec: sp9.spec || '', unit: 'шт', qty: 1, expiry: '', potent: false }; }
    const qty = Math.max(1, Math.round(parseFloat(numStr.replace(',', '.'))) || 1);
    const sp2 = _splitNameSpec(namePart);
    return { name: sp2.name, spec: sp2.spec, unit: 'шт', qty, expiry: '', potent: false };
  }
  const spF = _splitNameSpec(s);
  return { name: spF.name || s, spec: spF.spec || '', unit: 'шт', qty: 1, expiry: '', potent: false };
}
export function parseItemList(text) {
  const out = [];
  String(text == null ? '' : text).split(/\r?\n/).forEach(rawLine => {
    let line = String(rawLine == null ? '' : rawLine).replace(/^﻿/, '').replace(/^\uFEFF/, '').trim();
    if (!line) return;
    if (_isHeaderLine(line)) return;
    let s = line.replace(/^[-*•–—]\s*/, '');
    s = s.replace(/^\s*\d{1,4}\s*[.)]\s*(\|\s*)?/, '');
    s = s.replace(/^\s*\d{1,4}\s*\|\s*/, '');
    s = s.trim();
    if (!s) return;
    if (_isHeaderLine(s)) return;
    if (/[|\t;]/.test(s)) {
      let cells = s.split(/[|\t;]/).map(c => c.trim()).filter(c => c !== '');
      if (!cells.length) return;
      if (cells.length === 1) { const one = _parseSingleLine(cells[0]); if (one && one.name) out.push(one); return; }
      const name = cells[0];
      let specCells = cells.slice(1, -1);
      let qtySrc = cells[cells.length - 1];
      if (!/\d/.test(qtySrc) && specCells.length) {
        const prev = specCells[specCells.length - 1];
        if (/\d/.test(prev)) { qtySrc = prev + ' ' + qtySrc; specCells = specCells.slice(0, -1); }
        else { const joined = _parseSingleLine(cells.join(' ')); if (joined && joined.name) out.push(joined); return; }
      }
      const q = _parseQtyCell(qtySrc);
      if (!q.confident) { const joined = _parseSingleLine(cells.join(' ')); if (joined && joined.name) out.push(joined); return; }
      if (!name.trim()) return;
      const spN = _splitNameSpec(name.trim());
      const extra = specCells.join(' ').trim();
      const finSpec = (spN.spec ? spN.spec + (extra ? ' ' + extra : '') : extra).trim();
      out.push({ name: spN.name, spec: finSpec, unit: q.unit, qty: q.qty, expiry: '', potent: false });
      return;
    }
    if (/,/.test(s) && /,\s*(?:не\s+менее\s+)?\d|,\s*(?:амп?|фл|шт|пар|уп|таб|бл|туба|блистер|капс|компл|пакет)/i.test(s)) {
      const cells = s.split(',').map(c => c.trim()).filter(c => c !== '');
      if (cells.length >= 2) {
        if (cells.length === 2 && /^\d/.test(cells[0]) === false && /^\d/.test(cells[1]) && /\d,\d/.test(s) && !/,\s*(?:не\s+менее\s+)?\d+\s*(?:амп|фл|шт|пар|уп|таб|бл|туба|блистер)/i.test(s)) {
          const one = _parseSingleLine(s); if (one && one.name) out.push(one); return;
        }
        const name = cells[0];
        let specCells = cells.slice(1, -1);
        let qtySrc = cells[cells.length - 1];
        if (!/\d/.test(qtySrc) && specCells.length) {
          const prev = specCells[specCells.length - 1];
          if (/\d/.test(prev)) { qtySrc = prev + ' ' + qtySrc; specCells = specCells.slice(0, -1); }
          else { const one = _parseSingleLine(s); if (one && one.name) out.push(one); return; }
        }
        const q = _parseQtyCell(qtySrc);
        if (!q.confident) { const one = _parseSingleLine(s); if (one && one.name) out.push(one); return; }
        if (!name.trim()) return;
        const spC = _splitNameSpec(name.trim());
        const extraC = specCells.join(' ').trim();
        const finC = (spC.spec ? spC.spec + (extraC ? ' ' + extraC : '') : extraC).trim();
        out.push({ name: spC.name, spec: finC, unit: q.unit, qty: q.qty, expiry: '', potent: false });
        return;
      }
    }
    const one = _parseSingleLine(s);
    if (one && one.name) out.push(one);
  });
  return out;
}
/* Шаблонный импорт — тот же единый парсер, голубчик: раньше здесь жила
   своя копия с другим списком единиц, и «пары» с «бл» тихо терялись.
   Держим один рецепт на всех, а то давление скачет. */
export function parseTplLines(text) { return parseItemList(text); }
/* HTML-таблица из .xls (Excel умеет сохраняться как HTML) -> текст «a | b».
   Чистая функция: на вход строка, на выход строки для parseItemList. */
export function htmlTableToText(html) {
  const out = [];
  String(html == null ? '' : html).replace(/<tr[^>]*>([\s\S]*?)<\/tr\s*>/gi, (m, row) => {
    const cells = [];
    row.replace(/<(td|th)[^>]*>([\s\S]*?)<\/\1\s*>/gi, (mm, tag, cell) => {
      let t = String(cell || '').replace(/<br[^>]*>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').trim().replace(/\s+/g, ' ');
      cells.push(t);
      return '';
    });
    const nonEmpty = cells.map(c => (c || '').trim()).filter(c => c !== '');
    if (nonEmpty.length) out.push(nonEmpty.join(' | '));
    return '';
  });
  return out.join('\n');
}
/* Строки листа Excel (SheetJS sheet_to_json header:1) -> текст для парсера. */
export function sheetRowsToText(rows) {
  const out = [];
  (rows || []).forEach(r => {
    const cells = (r || []).map(c => String(c == null ? '' : c).trim()).filter(c => c !== '');
    if (!cells.length) return;
    if (cells.length === 1 && !String(cells[0]).trim()) return;
    out.push(cells.join(' | '));
  });
  return out.join('\n');
}

/* ---------- Размер шрифта под размер окна ----------
   Пользователь в настройках задаёт БАЗОВЫЙ размер, а на экране он
   умножается на размер окна. Раньше было только «как выбрал, так и есть»:
   на телефоне 14px удобно, а на мониторе 1920px те же 14px в колонке
   900px — мелко и «телефонно», окно огромное, а приложение занимает
   в нём треть.
   Телефон — как есть (×1), широкое окно — до ×1.4. Выбор пользователя при
   этом не отменяется, а умножается; потолок 26px, иначе с базой 30 на
   мониторе получится 42px и таблицы рассыпаются. */
export function fsScaleFor(width) {
  const w = Math.max(Number(width) || 0, 320);
  if (w <= 600) return 1;                       // телефон и узкое окно — не трогаем
  if (w >= 1800) return 1.4;                    // дальше расти незачем
  return 1 + (w - 600) * 0.4 / 1200;            // 600→1.0, 1200→1.2, 1800→1.4
}
export function fsEffective(base, width) {
  const b = Math.min(30, Math.max(10, Number(base) || 14));
  return Math.min(26, Math.round(b * fsScaleFor(width)));
}
/* Подпись под ползунком: что получится на этом экране. Раньше её не было,
   и на мониторе выбранные 14px тихо превращались в 20px — выглядело так,
   будто шрифт проигнорировали. */
export function fsHintText(base, width) {
  const b = Math.min(30, Math.max(10, Number(base) || 14));
  const eff = fsEffective(base, width);
  return 'На этом экране: ' + eff + 'px' + (eff === b ? ' (телефон)' : ' (окно ' + Math.round(Math.max(Number(width) || 0, 320)) + 'px)');
}

/* Цвет отчёта по смене. Решает, что увидит руководитель: «зелёный» смена
   означает «замечаний нет». Ошибка здесь — неверная оценка состояния
   автомобиля, поэтому правило держим явным и проверяем тестами.
   Красный — только просрочка. Жёлтый — «скоро срок», замечания по
   оборудованию или отчёт с замечаниями.
   Имя с «shift» — чтобы не спутать с reportStatus() в reports.js, который
   переводит готовый отчёт в цвет ярлыка. */
export function shiftReportStatus(o) {
  if (o && o.hasExpired) return 'red';
  if (o && (o.expCount > 0 || o.mode === 'rem' || o.defCount > 0)) return 'yellow';
  return 'green';
}

/* Понимает ли поле <input type="date"> такую дату. Ровно формат
   ГГГГ-ММ-ДД — и больше ничего: «01.10.2026» и «1 октября» в это поле не
   попадают, оно молча показывает пустое.
   Отсюда была потеря: в графике смен хранится ровно то, что человек ввёл
   в файле импорта, и нормально это может быть «01.10.2026». При редактировании
   такой строки дата не показывалась, а сохранение требовало ввести её заново —
   и смена молча переезжала на другой день. */
export function isIsoDate(s) {
  if (typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/* Позиции, у которых срок годности не вписан.
   Такая позиция не проверяется нигде: в просрочку не попадает, в отчёт не
   идёт, в тревоги не выходит. А по процессу станции сотрудник обязан
   проверить «прям всё всё» и отвечает за пропуск — то есть незаполненный
   срок выглядит как «всё проверил», хотя на самом деле позиция выпала из
   проверки навсегда. Считаем отдельно, чтобы это было видно.
   Считаем только настоящие препараты: расходники вроде перчаток и шприцов
   часто хранятся без даты, и если и их считать, счётчик будет всегда
   большим и в итоге перестанут на него смотреть. */
export function countNoExpiry(items) {
  let n = 0;
  for (let i = 0; i < (items || []).length; i++) {
    const it = items[i] || {};
    if (it.expiry) continue;
    if (it.professional === false) continue;
    n++;
  }
  return n;
}

/* Позиция из списка просрочки в виде строки. В списке встречаются два вида
   записей: уже готовая строка (так сохраняет отчёт) и объект (так строит
   soonList при проверке экрана). Оба должны печататься одинаково понятно. */
export function expiredItemText(d) {
  if (typeof d === 'string') return d;
  if (d && d.item) {
    const place = d.type === 'kit' ? ((d.carName || '') + ' / ' + (d.kitName || '')) : (d.name || '');
    return place + ': ' + (d.item.name || '') + ' (' + (d.item.expiry || 'нет срока') + ')';
  }
  return 'неизвестная позиция';
}

/* Текст отчёта — то, что уходит в файл и в печать: по нему потом сверяют
   смену и по нему же штрафуют за пропуск, поэтому функция обязана быть
   проверяемой. Раньше жила в reports.js, и проверить её было нечем: файл
   тянет за собой DOM. Здесь она чистая и покрыта тестами.
   Пустые поля печатаются прочерком, а не «undefined»: в отчёте не должно
   быть слов, которых нет в исходных данных. */
export function reportText(r) {
  const s = reportStatusOf(r);
  const L = ['ОТЧЁТ ПО СМЕНЕ', '', 'Статус: ' + s.label, 'Дата: ' + reportDateText(r && r.ts),
    'Машина: ' + ((r && r.car) || '—'), 'Сотрудник: ' + ((r && r.user) || '—'),
    'Бригада: ' + ((r && r.brigade) || '—'),
    'Рабочая сумка: ' + ((r && r.bagNum) || '—'),
    'ЭКГ №: ' + ((r && r.ecgNum) || '—') + ' · заряд: ' + ((r && r.ecgCharge) || '—')];
  if (r && r.potentBag) L.push('Комплекты НС/ПВ/СД: ' + r.potentBag);
  if (r && r.defects && r.defects.length) { L.push('', 'Дефекты оборудования:'); r.defects.forEach(d => L.push('- ' + d)); }
  if (r && r.expired && r.expired.length) { L.push('', 'Просроченные / истекающие позиции:'); r.expired.forEach(d => L.push('- ' + expiredItemText(d))); }
  if (r && r.remarks) { L.push('', 'Примечания:', r.remarks); }
  if (r && r.resolved) { L.push('', 'Отчёт отмечен как исправленный:', reportDateText(r.resolvedTs) + ' · ' + (r.resolvedBy || '')); }
  return L.join('\n');
}

/* Имя файла для сохранения отчёта.
   Две ловушки, обе пойманы тестами:
   — toISOString() бросает RangeError на битом ts;
   — new Date(null) — это не «нет даты», а 1 января 1970, и время это
     конечное, поэтому проверка isFinite() проходила. Отчёт без даты
     сохранялся как файл от 1970 года и при сортировке уезжал в начало.
   Неположительное время считаем отсутствующей датой — так же, как при
   показе даты в отчёте. todayIso передаётся снаружи, чтобы функция
   оставалась чистой и проверяемой. */
export function reportFileName(r, todayIso) {
  const d = new Date(r && r.ts);
  const ms = d.getTime();
  const day = isFinite(ms) && ms > 0 ? d.toISOString().slice(0, 10) : (todayIso || '0000-00-00');
  const car = String((r && r.car) || 'sluzhba').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 40) || 'sluzhba';
  return 'otchet-' + car + '-' + day + '.txt';
}

/* Статус готового отчёта в цвете ярлыка. Живёт здесь, а не в reports.js,
   потому что та же формула была продублирована в трёх местах (список
   отчётов, главная, отчёты по машине) и разошлась: в одном бейдж печатал
   сырой `r.status`, то есть буквально слово «undefined».
   Главное здесь — статуса может не быть вовсе. Отчёт без статуса приезжает
   со старого телефона или теряет поле при слиянии. Раньше «нет статуса»
   попадал в ветку «КРАСНЫЙ» по умолчанию: руководитель видел критический
   вызов, которого нет, и это ложь, которая стоит времени. Неизвестный
   статус показываем честно и нейтрально. */
export function reportStatusOf(r) {
  if (!r) return { cls: 'bY', label: '—' };
  if (r.resolved) return { cls: 'bG', label: '✅ исправлен' };
  if (r.status === 'green') return { cls: 'bG', label: 'без замечаний' };
  if (r.status === 'yellow') return { cls: 'bY', label: 'с замечаниями' };
  if (r.status === 'red') return { cls: 'bR', label: 'КРАСНЫЙ' };
  return { cls: 'bY', label: 'без статуса' };
}

/* Дата отчёта для показа. `ts` может быть null (поле потерялось при
   слиянии) или мусором — тогда `new Date(ts)` молча даёт 1 января 1970
   года, и человек видит отчёт, якобы сделанный в 1970-м. Лучше прямо
   сказать «дата неизвестна»: неизвестная дата — это признак битой записи,
   а не время рождения отчёта. */
export function reportDateText(ts, opts) {
  if (ts == null || ts === '') return 'дата неизвестна';
  const d = new Date(ts);
  const ms = d.getTime();
  if (!isFinite(ms) || ms <= 0) return 'дата неизвестна';
  return d.toLocaleString('ru-RU', opts);
}
