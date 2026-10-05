/* =====================================================================
   Тесты MedShift — запуск:  node tests/run.mjs
   Покрывает рискованные места: календарь сроков, слияние/tombstone-ы,
   дедупликация, нормализация и битая миграция.
   ===================================================================== */
import { suite, test, runAll, report, assert, eq, resetStorage, seedDB, seedDev, iso, runScript, networkDown, networkUp, swAnswer } from './shim.mjs';
/* Чистая логика слоя интерфейса. Импортируется напрямую: проверяем сами
   функции, а не то, что они делают с DOM. */
import { shiftKeyOf, parseShiftCsv, parseItemList, shiftReportStatus, reportStatusOf, reportDateText, isIsoDate, expInputType, countNoExpiry, reportText, reportFileName, expiredItemText, fsScaleFor, fsEffective, fsHintText } from '../logic.js';

let n = 0;
/** свежая копия db.js с заданным состоянием в localStorage */
async function loadDB(state) {
  resetStorage();
  if (state) seedDB(state);
  return await import('../db.js?t=' + (++n));
}
/** повторный импорт db.js БЕЗ сброса localStorage — как перезагрузка страницы */
async function reloadDB() { return await import('../db.js?r=' + (++n)); }
const base = (o = {}) => ({
  seq: 1, rev: 1, _termPatched: 1,
  settings: { warnDays: 10, city: 'Красноярск', accent: '#0b5394', dark: 'auto', fontSize: 14 },
  users: [{ id: 1, name: 'Иванов Иван', pin: 'x', role: 'admin', cars: [], bags: [], phone: '', bday: '' }],
  ...o
});

/* ---------------------------------------------------------------------
   Общий экземпляр db.js/sync.js для интеграционных тестов.
   Импорт на верхнем уровне — ДО любых других импортов приложения: как только
   auth.js подтянет './db.js', этот экземпляр будет зафиксирован навсегда.
   Остальные тесты работают на копиях через loadDB('?t=N').
   --------------------------------------------------------------------- */
resetStorage();
seedDB(base({
  session: 1,
  users: [{ id: 1, name: 'Босс', role: 'admin', cars: [], bags: [] }],
  chat: [{ id: 'c-local', ts: 10, author: 'Локальный', room: 'общая', text: 'привет' }],
  reports: []
}));
const sharedDB = await import('../db.js');
const sharedSync = await import('../sync.js');

/* ============================== db.js ============================== */
suite('db.js · календарь и сроки', async () => {
  const m = await loadDB(base());

  test('todayStr() в формате ГГГГ-ММ-ДД', () => eq(m.todayStr(), iso(0)));
  test('daysLeft(): будущее', () => eq(m.daysLeft(iso(10)), 10));
  test('daysLeft(): сегодня = 0', () => eq(m.daysLeft(iso(0)), 0));
  test('daysLeft(): прошлое = отрицательное', () => eq(m.daysLeft(iso(-3)), -3));
  test('daysLeft() не ломается на переходе через месяц', () => eq(m.daysLeft(iso(40)), 40));
  test('daysLeft("") и мусорная дата дают null, а не NaN', () => {
    eq(m.daysLeft(''), null, 'пустой срок');
    eq(m.daysLeft('2026-13-45'), null, 'неразбираемая дата');
  });

  test('soonList(): берёт истекающие, просроченные, но не «свежие»', () => {
    const s = { bags: [{ id: 5, name: 'Сумка', items: [
      { name: 'скоро', expiry: iso(5) },
      { name: 'просрочен', expiry: iso(-2) },
      { name: 'свежий', expiry: iso(200) },
      { name: 'без срока', expiry: '' }
    ] }] };
    return loadDB(base({ ...s, session: 1 })).then(mm => {
      const names = mm.soonList().map(x => x.item.name).sort();
      eq(names, ['просрочен', 'скоро'], 'должны попасть только истекающие и просроченные');
    });
  });

  test('soonList(): неразбираемая дата НЕ попадает в тревоги (null <= 10 === true)', () => {
    // Регрессия: daysLeft() возвращает null для битой даты, а в JS
    // `null <= warnDays` истинно — позиция с мусорным форматом даты
    // показывалась как «осталось 0 дн» и тянулась в тревоги и отчёт.
    const s = { bags: [{ id: 5, name: 'Сумка', items: [
      { name: 'мусор1', expiry: '2026-13-45' },
      { name: 'мусор2', expiry: '31.12.2027' },
      { name: 'пусто', expiry: '' },
      { name: 'норма', expiry: iso(3) }
    ] }] };
    return loadDB(base({ ...s, session: 1 })).then(mm => {
      const names = mm.soonList().map(x => x.item.name);
      eq(names, ['норма'], 'в тревоги должен попасть только нормальный срок');
    });
  });

  test('expClass(): 4 состояния, битая дата = none', () => {
    return loadDB(base({ settings: { warnDays: 10 } })).then(mm => {
      eq(mm.expClass(iso(-1)), 'exp', 'просрочено');
      eq(mm.expClass(iso(0)), 'soon', 'сегодня истекает');
      eq(mm.expClass(iso(5)), 'soon', 'скоро истекает');
      eq(mm.expClass(iso(90)), 'ok', 'свежее');
      eq(mm.expClass('31.12.2027'), 'none', 'неразбираемая дата');
      eq(mm.expClass(''), 'none', 'пустой срок');
      eq(mm.expClass(null), 'none', 'нет срока');
    });
  });

  test('normalizeDB(): восстанавливает потерянный warnDays', () => {
    // Баг: без warnDays порог становился 0, и ВСЕ тревоги по срокам
    // молча выключались — просрочки просто переставали гореть.
    return loadDB(base({ settings: { city: 'Красноярск', fontSize: 14 } })).then(mm => {
      eq(mm.DB.settings.warnDays, 10, 'потерянный warnDays должен вернуться к значению по умолчанию');
      eq(mm.expClass(iso(3)), 'soon', 'и тревоги должны снова работать');
    });
  });

  test('normalizeDB(): чинит мусор в settings и в структуре', () => {
    const s = base();
    s.settings = { warnDays: 'не число', accent: 'red" onmouseover="alert(1)', fontSize: 999, dark: 'нет' };
    s.sched = null;
    s.users = [{ id: 1, name: 'Иванов', pin: 'x', role: 'admin', cars: 'не массив', bags: null, bday: 12345 }];
    s.bags = [null, { id: 2, name: 'Сумка', items: 'не массив' }];
    s.cars = [{ id: 3, name: 'Машина', equip: null, kits: [null, { id: 9, items: null }] }];
    return loadDB(s).then(mm => {
      eq(mm.DB.settings.warnDays, 10, 'warnDays должен стать числом');
      eq(mm.DB.settings.accent, '#0b5394', 'accent вне формата #rrggbb должен сброситься — он уходит в style= без экранирования');
      eq(mm.DB.settings.fontSize, 14, 'fontSize вне диапазона должен сброситься');
      eq(mm.DB.settings.dark, 'auto', 'неизвестный режим темы должен сброситься');
      eq(Array.isArray(mm.DB.sched.days), true, 'sched: null должен превратиться в объект');
      eq(mm.DB.users[0].cars.length, 0, 'cars: "не массив" должен стать пустым массивом');
      eq(mm.DB.users[0].bday, '12345', 'числовой день рождения должен стать строкой');
      eq(mm.DB.bags.length, 1, 'null в bags должен отсеяться');
      eq(mm.DB.bags[0].items.length, 0, 'items: "не массив" должен стать пустым массивом');
      eq(mm.DB.cars[0].kits.length, 1, 'null в kits должен отсеяться');
      eq(mm.DB.cars[0].kits[0].items.length, 0, 'items: null должен стать пустым массивом');
    });
  });

  test('esc(): экранирует и одинарную кавычку', () => {
    return loadDB(base()).then(mm => {
      eq(mm.esc("a'b"), 'a&#39;b', 'одинарная кавычка должна экранироваться');
      eq(mm.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
    });
  });

  test('adoptDB(): восстановление ЗАМЕНЯЕТ базу, а не сливает её', async () => {
    // Баг найден вживую: __importDB делал Object.assign, а он не удаляет
    // ключи. Выгрузка, сделанная до появления графика смен, не содержит
    // shiftGrid — и старая сетка оставалась на устройстве, то есть
    // восстановление давало смесь двух состояний без всякого предупреждения.
    const s = base();
    s.shiftGrid = [{ date: '2026-10-01', brigade: 'А', car: '1', staff: 'Старый', note: '', upd: 1 }];
    s.shiftTomb = ['2026-10-01|А|1'];
    s.kitTemplates = [{ id: 555, name: 'Старая укладка', items: [] }];
    s.potents = [{ id: 666, name: 'Старый комплект', items: [] }];
    const mm = await loadDB(s);

    const file = base({ reports: [{ id: 'r1', ts: 1, author: 'X' }] });   // выгрузка БЕЗ графика
    mm.adoptDB(file);

    eq(mm.DB.shiftGrid.length, 0, 'графика смен не было в файле — он не должен остаться от прошлого состояния');
    eq(mm.DB.shiftTomb.length, 0, 'могилы графика тоже должны уйти');
    eq(mm.DB.kitTemplates.some(k => k.name === 'Старая укладка'), false, 'устаревший шаблон не должен пережить восстановление');
    // seedBasics() намеренно возвращает 5 базовых укладок, если список пуст,
    // поэтому проверяем именно отсутствие чужого шаблона, а не длину.
    eq(mm.DB.kitTemplates.length > 0, true, 'базовые укладки должны остаться на месте');
    eq(mm.DB.potents.length, 0, 'устаревшие комплекты не должны пережить восстановление');
    eq(mm.DB.reports.length, 1, 'а содержимое файла должно загрузиться');
    eq(mm.DB.users.length, 1, 'пользователи из файла должны быть на месте');
  });

  test('adoptDB(): нормализует мусор из файла и отсекает мусорные аргументы', async () => {
    const mm = await loadDB(base());
    mm.adoptDB({
      settings: { warnDays: 'не число', accent: 'red" onmouseover="alert(1)', fontSize: 999 },
      sched: null,
      users: [{ id: 1, name: 'Иванов', cars: 'не массив', bags: null }, null],
      bags: [null, { id: 2, name: 'Сумка', items: 'не массив' }]
    });
    eq(mm.DB.settings.warnDays, 10, 'потерянный warnDays должен восстановиться');
    eq(mm.DB.settings.accent, '#0b5394', 'чужая подсветка не должна доехать до style= (там нет экранирования)');
    eq(Array.isArray(mm.DB.sched.days), true, 'sched: null должен стать объектом, а не уронить приложение');
    eq(mm.DB.users.length, 1, 'null в users должен отсеяться');
    eq(mm.DB.users[0].cars.length, 0, 'cars: "не массив" должен стать пустым массивом');
    eq(mm.DB.bags[0].items.length, 0, 'items: "не массив" должен стать пустым массивом');
    let err = null;
    try { mm.adoptDB(null); } catch (e) { err = e.message; }
    assert(!!err, 'adoptDB(null) должен отказывать, а не превращать базу в undefined');
    try { mm.adoptDB([1, 2]); } catch (e) { err = err || e.message; }
    assert(!!err, 'adoptDB(массив) должен отказывать');
  });

  test('фото смен не попадают в главный блоб базы', async () => {
    // Фото лежали прямо в DB.sched и значит сериализовались при каждом
    // save() — мегабайты base64 на каждый чих, а при исчерпании квоты
    // setItem падал и переставал сохраняться ВСЁ.
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(20000);
    const s = base();
    s.sched = { days: [{ id: 111, ts: Date.now(), month: iso(0).slice(0, 7), img: big }], months: [] };
    const mm = await loadDB(s);
    eq(mm.DB.sched.days[0].img, big, 'в памяти фото должно остаться — иначе просмотр сломается');
    mm.save(); mm.saveNow();
    const blob = localStorage.getItem('medshift_v3');
    assert(blob.indexOf('base64') < 0, 'главный блоб не должен содержать base64');
    assert(blob.indexOf('"id":111') >= 0, 'метаданные фото должны остаться в главном блобе');
    const media = JSON.parse(localStorage.getItem('medshift_media') || '{}');
    eq(media['111'], big, 'фото должно уехать в отдельный ключ');
  });

  test('после перезагрузки фото снова доступны', async () => {
    const big = 'data:image/jpeg;base64,' + 'B'.repeat(500);
    const s = base();
    s.sched = { days: [{ id: 222, ts: Date.now(), month: iso(0).slice(0, 7), img: big }], months: [] };
    const first = await loadDB(s);
    first.save(); first.saveNow();
    const second = await reloadDB();     // перечитываем localStorage заново
    eq(second.DB.sched.days.length, 1, 'запись фото должна сохраниться');
    eq(second.DB.sched.days[0].img, big, 'фото должно подхватиться из medshift_media при старте');
  });

  test('удалённое фото не остаётся в хранилище медиа', async () => {
    const s = base();
    s.sched = { days: [{ id: 333, ts: Date.now(), month: iso(0).slice(0, 7), img: 'data:image/jpeg;base64,CCC' }], months: [] };
    const mm = await loadDB(s);
    mm.save(); mm.saveNow();
    mm.DB.sched.days = mm.DB.sched.days.filter(x => x.id !== 333);
    mm.save(); mm.saveNow();
    const media = JSON.parse(localStorage.getItem('medshift_media') || '{}');
    eq(Object.keys(media).length, 0, 'осиротевшее фото должно вычищаться, иначе хранилище растёт бесконечно');
  });

  test('выгрузка базы компактна: фото идут отдельным файлом', async () => {
    // Раньше exportDB писал JSON.stringify(DB) вместе с base64-фото —
    // файл на мегабайты, в мессенджере не отправить, и развернуть его
    // на новом телефоне (там уже есть станция) смысла нет.
    const big = 'data:image/jpeg;base64,' + 'D'.repeat(40000);
    const s = base();
    s.sched = { days: [{ id: 555, ts: Date.now(), month: iso(0).slice(0, 7), img: big }], months: [] };
    const mm = await loadDB(s);
    mm.save(); mm.saveNow();
    const file = JSON.stringify(mm.exportSlim());
    assert(file.indexOf('base64') < 0, 'в файле базы не должно быть ни байта картинок');
    assert(file.indexOf('"id":555') >= 0, 'метаданные фото должны остаться в файле базы');
    assert(file.length < 20000, 'файл базы должен остаться компактным, а не весить как фото: ' + file.length);
    eq(mm.mediaAll()['555'], big, 'фото должно уходить отдельным файлом и не теряться');
  });

  test('в выгрузке базы нет сессии — импортёр не должен входить под чужим именем', async () => {
    // Раньше exportSlim возвращал {...DB} вместе с session: человек
    // импортировал чужую выгрузку и оказывался заложенным под тем, кто
    // выгружал. sync.js в той же ситуации session вырезает.
    const s = base({ session: 1 });
    const mm = await loadDB(s);
    const file = mm.exportSlim();
    eq('session' in file, false, 'сессии в файле выгрузки быть не должно');
    eq(mm.DB.session, 1, 'при этом собственная сессия после выгрузки не теряется');
  });

  test('немедленная запись не тащит base64-фото в главный ключ и не будит пуш', async () => {
    // adoptState и syncPut раньше писали JSON.stringify(DB) напрямую: в памяти
    // лежат картинки смен, и каждый пуш раздувал главный ключ на мегабайты —
    // упираясь в квоту, которая глушится, после чего правки перестают
    // сохраняться молча.
    const big = 'data:image/jpeg;base64,' + 'W'.repeat(5000);
    const s = base({ session: 1 });
    s.sched = { days: [{ id: 7001, ts: Date.now(), month: iso(0).slice(0, 7), img: big }], months: [] };
    const mm = await loadDB(s);
    let calls = 0;
    window.__onSave = () => { calls++; };
    mm.saveLocalNow();
    const raw = localStorage.getItem('medshift_v3') || '';
    assert(raw.indexOf('base64') < 0, 'в главном ключе не должно быть ни байта картинок');
    eq(calls, 0, 'запись из синхронизации не должна будить ещё один пуш');
    eq(mm.mediaAll()['7001'], big, 'фото должно переехать в отдельный ключ, а не пропасть');
    delete window.__onSave;
  });

  test('ни один модуль не пишет базу напрямую в главный ключ', async () => {
    const fs = await import('node:fs');
    const read = f => fs.readFileSync(new URL(f, new URL('../', import.meta.url)), 'utf8');
    ['sync.js', 'auth.js', 'boot.js', 'views.js', 'ui.js', 'reports.js', 'chat.js', 'logic.js'].forEach(f => {
      const src = read(f);
      assert(!/localStorage\.setItem\(\s*(LS_KEYS\.DB|'medshift_v3'|LS)\s*,\s*JSON\.stringify\(\s*DB/.test(src),
        f + ': прямая запись JSON.stringify(DB) возвращает в главный ключ base64-фото и упирается в квоту — нужен save()/saveLocalNow()');
    });
  });

  test('круг «выгрузил → переустановил → восстановил» возвращает и базу, и фото', async () => {
    const big = 'data:image/jpeg;base64,' + 'E'.repeat(3000);
    const s = base();
    s.bags = [{ id: 1, name: 'Сумка 1', items: [{ name: 'Аспирин', qty: 4 }] }];
    s.sched = { days: [{ id: 777, ts: Date.now(), month: iso(0).slice(0, 7), img: big }], months: [] };
    const src = await loadDB(s);
    src.save(); src.saveNow();
    const dbFile = JSON.parse(JSON.stringify(src.exportSlim()));
    const photoFile = { kind: 'medshift-media', photos: src.mediaAll() };

    // Чистое устройство: хранилище пустое, как после переустановки.
    resetStorage();
    const dst = await reloadDB();
    eq(dst.DB.bags.length, 0, 'до восстановления сумок нет');
    dst.adoptDB(dbFile);
    eq(dst.mediaRestore(photoFile.photos), 1, 'фото должно восстановиться');
    eq(dst.DB.bags[0].items[0].qty, 4, 'содержимое сумки восстановилось');
    eq(dst.DB.sched.days[0].img, big, 'фото вернулось на место и доступно для просмотра');
  });

  test('импорт фото отказывает на мусоре и не затирает хранилище', async () => {
    const s = base();
    s.sched = { days: [{ id: 888, ts: Date.now(), month: iso(0).slice(0, 7), img: 'data:image/jpeg;base64,FFF' }], months: [] };
    const mm = await loadDB(s);
    mm.save(); mm.saveNow();
    let err = '';
    try { mm.mediaRestore(null); } catch (e) { err = e.message; }
    assert(!!err, 'mediaRestore(null) должен отказывать');
    try { mm.mediaRestore([1, 2]); } catch (e) { err = err || e.message; }
    assert(!!err, 'mediaRestore(массив) должен отказывать');
    eq(mm.mediaAll()['888'], 'data:image/jpeg;base64,FFF', 'прежнее фото должно уцелеть');
  });

  test('parseShiftCsv(): разбирает файл и НЕ двоит уже импортированное', () => {
    // Раньше этот разбор жил прямо в boot.js и не был покрыт ни одним тестом:
    // ошибка в нём не видна — график просто оказывается неполным.
    const csv = 'Дата;Бригада;Машина;Сотрудники;Примечание\r\n' +
      '2026-10-01;А;1;Иванов Иван;\r\n' +
      '2026-10-02;Б;2;Петрова Мария;ночная\r\n';
    const rows = parseShiftCsv(csv, [], 1000);
    eq(rows.length, 2, 'должны добавиться обе строки');
    eq(rows[0].date, '2026-10-01', 'дата разобрана');
    eq(rows[1].staff, 'Петрова Мария', 'сотрудники разобраны');
    eq(rows[1].note, 'ночная', 'примечание разобрано');
    eq(rows[0].upd, 1000, 'у всех строк одна отметка времени — иначе порядок слияния плавает');
    eq(parseShiftCsv(csv, rows, 2000).length, 0, 'повторный импорт того же файла не должен двоить строки');
  });

  test('parseShiftCsv(): заголовок не попадает в график даже после пустой строки и BOM', () => {
    // Именно этот случай раньше сдвигал индекс: «Дата;Бригада» заезжала
    // в график как смена, и в списке смен появлялась пустая строка.
    const csv = '﻿\n\nДата;Бригада;Машина;Сотрудники;Примечание\n2026-10-03;В;3;Сидоров;';
    const rows = parseShiftCsv(csv, [], 1000);
    eq(rows.length, 1, 'должна остаться только настоящая смена');
    eq(rows[0].date, '2026-10-03', 'дата настоящей строки');
    assert(rows[0].brigade === 'В', 'бригада не должна съехать: ' + rows[0].brigade);
  });

  test('parseShiftCsv(): пустые строки и мусор не попадают в график', () => {
    eq(parseShiftCsv('', [], 1000).length, 0, 'пустой файл не должен добавлять строки');
    eq(parseShiftCsv('\n\n\r\n', [], 1000).length, 0, 'пустые строки не должны добавлять строки');
    eq(parseShiftCsv(';;;;', [], 1000).length, 0, 'строка из одних разделителей — не смена');
    eq(parseShiftCsv(null, [], 1000).length, 0, 'на null не должно падать');
    const comma = parseShiftCsv('2026-10-04,Г,4,Кузнецов,дневная', [], 1000);
    eq(comma.length, 1, 'разделитель-запятая тоже допустим');
    eq(comma[0].car, '4', 'машина разобрана при запятой');
  });

  test('parseItemList(): количество и единица измерения разбираются верно', () => {
    const items = parseItemList('Аспирин 20 таб\n\n1. Анальгин 10 амп\nАдреналин 2 амп.');
    eq(items.length, 3, 'пустая строка между позициями не должна давать лишнюю');
    eq(items[0].name, 'Аспирин', 'название');
    eq(items[0].qty, 20, 'количество');
    eq(items[0].unit, 'таб', 'единица измерения');
    eq(items[1].name, 'Анальгин', 'нумерованный список должен начинаться с названия');
    eq(items[2].qty, 2, 'количество с точкой в конце строки');
  });

  test('parseItemList(): количество по умолчанию — 1, единица — шт', () => {
    const items = parseItemList('Скальпель\nПерчатки');
    eq(items.length, 2, 'позиции без числа принимаются');
    eq(items[0].qty, 1, 'количество по умолчанию 1');
    eq(items[0].unit, 'шт', 'единица по умолчанию шт');
    eq(items[1].name, 'Перчатки', 'название целиком');
  });

  test('shiftReportStatus(): просрочка — всегда красный, иначе отчёт зелёный', () => {
    // Цвет отчёта — это оценка состояния автомобиля. Ошибка здесь означает
    // «смена без замечаний» там, где на деле просрочка.
    eq(shiftReportStatus({ hasExpired: false, expCount: 0, mode: 'ok', defCount: 0 }), 'green', 'чистая смена — зелёная');
    eq(shiftReportStatus({ hasExpired: true, expCount: 0, mode: 'ok', defCount: 0 }), 'red', 'просрочка без прочего — всё равно красная');
    eq(shiftReportStatus({ hasExpired: true, expCount: 3, mode: 'rem', defCount: 2 }), 'red', 'просрочка сильнее всего остального');
    eq(shiftReportStatus({ hasExpired: false, expCount: 1, mode: 'ok', defCount: 0 }), 'yellow', 'скоро срок — жёлтый');
    eq(shiftReportStatus({ hasExpired: false, expCount: 0, mode: 'ok', defCount: 1 }), 'yellow', 'дефект оборудования — жёлтый');
    eq(shiftReportStatus({ hasExpired: false, expCount: 0, mode: 'rem', defCount: 0 }), 'yellow', 'отчёт с замечаниями — жёлтый');
    eq(shiftReportStatus({ hasExpired: false, expCount: 0, mode: 'ok', defCount: 0 }), 'green', 'и снова чистая смена');
  });

  test('reportStatusOf(): отчёт без статуса не должен выглядеть красным', () => {
    // Найдено вживую на станции из 12 человек. Отчёт без поля status
    // приезжает со старого телефона или теряет поле при слиянии. Раньше он
    // попадал в ветку «КРАСНЫЙ» по умолчанию: руководитель видел критический
    // вызов, которого нет. Ложная тревога хуже честного «не знаю».
    eq(reportStatusOf({ status: 'red' }).cls, 'bR', 'красный остаётся красным');
    eq(reportStatusOf({ status: 'yellow' }).cls, 'bY', 'жёлтый остаётся жёлтым');
    eq(reportStatusOf({ status: 'green' }).cls, 'bG', 'зелёный остаётся зелёным');
    eq(reportStatusOf({ resolved: true, status: 'red' }).cls, 'bG', 'исправленный — зелёный, как и было');
    const нет = reportStatusOf({ user: 'Кто-то' });
    assert(нет.cls !== 'bR', 'отчёт без статуса не должен быть красным — это ложный вызов');
    assert(!/КРАСНЫЙ/i.test(нет.label), 'подпись не должна врать: ' + нет.label);
    assert(/без статуса/.test(нет.label), 'подпись должна честно говорить, что статуса нет: ' + нет.label);
    eq(reportStatusOf({ status: 'green' }).label, 'без замечаний', 'штатная подпись не изменилась');
  });

  test('reportDateText(): потерянная дата не должна показывать 1970 год', () => {
    // ts = null (поле потерялось) молча превращался в new Date(null) —
    // это 1 января 1970. Человек видел отчёт, сделанный в 1970 году.
    const short = { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' };
    eq(reportDateText(null, short), 'дата неизвестна', 'null');
    eq(reportDateText(undefined, short), 'дата неизвестна', 'поля нет вовсе');
    eq(reportDateText('', short), 'дата неизвестна', 'пустая строка');
    eq(reportDateText('ерунда', short), 'дата неизвестна', 'мусор вместо даты');
    assert(reportDateText(0, short).indexOf('1970') < 0, 'ноль — это тоже эпоха, а не дата отчёта');
    assert(reportDateText(null).indexOf('1970') < 0, 'и в полной записи не должно быть 1970');
    // нормальная дата показывается как прежде
    assert(/\d/.test(reportDateText(Date.now(), short)), 'настоящая дата должна показываться');
    assert(reportDateText(Date.now(), short) !== 'дата неизвестна', 'настоящая дата не должна помечаться неизвестной');
  });

  test('purgeSched(): не падает на записи без month', () => {
    // Раньше здесь стояло p.month.split('-') без проверки — запись счёта
    // с отсутствующим month роняла приложение на каждом запуске.
    const s = base();
    s.sched = { days: [{ ts: Date.now() }], months: [{ ts: Date.now() }, { month: iso(0).slice(0, 7) }, null] };
    return loadDB(s).then(mm => {
      let err = null;
      try { mm.purgeSched(); } catch (e) { err = e.message; }
      eq(err, null, 'purgeSched не должен падать: ' + err);
      eq(mm.DB.sched.months.length, 1, 'остаться должен только месяц с корректным month');
    });
  });

  test('badgeExp(): битая дата показывает «нет срока», а не «осталось null дн»', () => {
    return loadDB(base({})).then(mm => {
      assert(!/null/.test(mm.badgeExp('2026-13-45')), 'не должно быть "null" в бейдже: ' + mm.badgeExp('2026-13-45'));
      assert(mm.badgeExp('2026-13-45').includes('нет срока'), 'битая дата = «нет срока»: ' + mm.badgeExp('2026-13-45'));
    });
  });

  test('soonList(): порог берётся из settings.warnDays', () => {
    const s = { settings: { warnDays: 30 }, bags: [{ id: 5, name: 'Сумка', items: [{ name: 'через 20 дней', expiry: iso(20) }] }] };
    return loadDB(base({ ...s, session: 1 })).then(mm => eq(mm.soonList().length, 1, 'warnDays=30 должен включать +20'));
  });

  test('soonList(): заглядывает в укладки машин и комплекты НС', () => {
    const s = {
      bags: [], cars: [{ id: 7, name: '103', kits: [{ id: 71, name: 'Реаним.', items: [{ name: ' адреналин', expiry: iso(3) }] }] }],
      potents: [{ id: 9, name: 'Комплект', items: [{ name: 'промедол', expiry: iso(1) }] }]
    };
    // session обязателен: список просрочки отвечает на вопрос «за что отвечает
    // вошедший», и без входа ответственности нет ни у кого.
    return loadDB(base({ ...s, session: 1 })).then(mm => {
      const t = mm.soonList().map(x => x.type).sort();
      eq(t, ['kit', 'pot']);
    });
  });

  test('badgeExp(): 4 корзины + «нет срока»', () => {
    const cases = [['', 'нет срока'], [iso(-4), 'просрочен'], [iso(5), 'осталось'], [iso(200), 'дн']];
    cases.forEach(([d, needle]) => assert(m.badgeExp(d).includes(needle), 'для ' + JSON.stringify(d) + ' ожидалось ' + needle + ', получено ' + m.badgeExp(d)));
  });
});

suite('db.js · тревоги', async () => {
  test('alerts(): просрочка в сумке даёт агрегат bSoon', async () => {
    // Вход под руководителем: он отвечает за всё и видит все сумки.
    // Сотруднику показывается только то, за что он назначен.
    const m = await loadDB(base({ session: 1, bags: [{ id: 5, name: 'Сумка', items: [{ name: 'просрочен', expiry: iso(-1) }] }] }));
    const a = m.alerts();
    assert(a.some(x => x.l === 'bSoon' && x.items && x.items.length === 1), 'ожидался bSoon с items');
  });

  test('alerts(): дефект оборудования даёт bExp', async () => {
    // Вход под руководителем: он отвечает за всё и видит все машины.
    const m = await loadDB(base({ session: 1, cars: [{ id: 7, name: '103', equip: [{ id: 1, name: 'Дефибриллятор', status: 'def' }], kits: [] }] }));
    assert(m.alerts().some(x => x.l === 'bExp' && x.carId === 7), 'ожидался bExp по машине');
  });

  test('alerts(): сотрудник получает дефект только по своей машине', async () => {
    // Раньше дефекты считались по всем DB.cars, и человек получал тревогу
    // по чужой машине — при том что счётчики рядом уже были по своим.
    const users = [
      { id: 1, name: 'Босс', role: 'admin', cars: [], bags: [] },
      { id: 2, name: 'Сотрудник', role: 'user', cars: [7], bags: [] }
    ];
    const cars = [
      { id: 7, name: '103', equip: [{ id: 1, name: 'Дефибриллятор', status: 'def' }], kits: [] },
      { id: 8, name: '104', equip: [{ id: 2, name: 'Кислород', status: 'def' }], kits: [] }
    ];
    const worker = await loadDB(base({ session: 2, users, cars }));
    const a = worker.alerts().filter(x => x.l === 'bExp');
    assert(a.some(x => x.carId === 7), 'дефект своей машины должен прийти');
    eq(a.filter(x => x.carId === 8).length, 0, 'дефект чужой машины сотруднику не нужен');
  });

  test('alerts(): непрочитанные отчёты видит только руководитель', async () => {
    const users = [
      { id: 1, name: 'Босс', role: 'admin', cars: [], bags: [] },
      { id: 2, name: 'Сотрудник', role: 'user', cars: [], bags: [] }
    ];
    const reports = [{ id: 90, ts: Date.now(), car: '103', user: 'X', status: 'red', viewed: false }];

    const boss = await loadDB(base({ session: 1, users, reports }));
    assert(boss.alerts().some(x => x.reportId === 90), 'руководитель должен видеть отчёт');

    const worker = await loadDB(base({ session: 2, users, reports }));
    eq(worker.alerts().filter(x => x.reportId === 90).length, 0, 'сотрудник не должен получать тревогу по отчёту');
  });

  test('isBoss(): admin и lead — да, user — нет', async () => {
    const mk = (role) => loadDB(base({ session: 1, users: [{ id: 1, name: 'X', role, cars: [], bags: [] }] }));
    eq((await mk('admin')).isBoss(), true);
    eq((await mk('lead')).isBoss(), true);
    eq((await mk('user')).isBoss(), false);
  });
});

suite('db.js · дедупликация', async () => {
  test('dedupe(): склеивает сумки с разным регистром и пробелами', async () => {
    const m = await loadDB(base({
      bags: [{ id: 20, name: 'Сумка 1', items: [] }, { id: 10, name: 'сумка  1', items: [] }],
      users: [{ id: 1, name: 'Босс', role: 'admin', cars: [], bags: [20] }]
    }));
    const changed = m.dedupe();
    eq(changed, 1, 'ожидался один склеенный объект');
    eq(m.DB.bags.length, 1);
    eq(m.DB.bags[0].id, 10, 'побеждает объект с меньшим id');
    eq(m.DB.users[0].bags, [10], 'ссылка пользователя должна переехать на выживший id');
  });

  test('dedupe(): переименовывает carId в отчётах', async () => {
    const m = await loadDB(base({
      cars: [{ id: 30, name: '103', equip: [], kits: [] }, { id: 12, name: ' 103 ', equip: [], kits: [] }],
      reports: [{ id: 1, ts: 1, carId: 30, car: '103', user: 'X', status: 'green' }]
    }));
    m.dedupe();
    eq(m.DB.cars.length, 1);
    eq(m.DB.reports[0].carId, 12, 'carId в отчёте должен указать на выжившую машину');
  });

  test('dedupe(): объекты без имени не склеиваются', async () => {
    const m = await loadDB(base({ bags: [{ id: 1, name: '', items: [] }, { id: 2, name: '', items: [] }] }));
    eq(m.dedupe(), 0);
    eq(m.DB.bags.length, 2);
  });

  test('dedupe(): содержимое склеиваемых сумок не теряется', async () => {
    // Две одноимённые сумки — почти всегда правки с двух телефонов.
    // Раньше побеждала одна запись целиком, содержимое второй уходило молча.
    const m = await loadDB(base({
      bags: [
        { id: 20, name: 'Сумка 1', desc: 'ночная, Б3', items: [{ name: 'Бинт', spec: '', unit: 'шт', qty: 1, expiry: '' }], kits: [] },
        { id: 10, name: 'сумка  1', desc: '', items: [{ name: 'Вата', spec: '', unit: 'шт', qty: 2, expiry: '' }, { name: 'Бинт', spec: '', unit: 'шт', qty: 5, expiry: '' }], kits: [] }
      ],
      users: [{ id: 1, name: 'Босс', role: 'admin', cars: [], bags: [20] }]
    }));
    m.dedupe();
    eq(m.DB.bags.length, 1, 'должна остаться одна запись');
    const b = m.DB.bags[0];
    eq(b.id, 10, 'выживает прежний победитель — меньший id, иначе поедут назначения');
    eq(b.items.length, 2, 'позиции обеих сумок должны сохраниться');
    eq(b.desc, 'ночная, Б3', 'пустая табличка должна заполниться от дубля');
    eq(m.DB.users[0].bags, [10], 'ссылка пользователя должна переехать на выжившую запись');
  });

  test('dedupe(): укладки и оборудование машины-дубля не пропадают', async () => {
    const m = await loadDB(base({
      cars: [
        { id: 30, name: '103', plates: '', charge: '', equip: [{ id: 'e1', name: 'Дефибриллятор', status: 'ok' }], kits: [{ id: 'k1', name: 'Реанимационная', items: [{ name: 'Эпинефрин', spec: '', unit: 'амп', qty: 1, expiry: '' }] }] },
        { id: 12, name: ' 103 ', plates: 'О 123', charge: '70%', equip: [{ id: 'e2', name: 'Кислород', status: 'def' }], kits: [{ id: 'k2', name: 'Реанимационная', items: [{ name: 'Атропин', spec: '', unit: 'амп', qty: 1, expiry: '' }] }] }
      ]
    }));
    m.dedupe();
    eq(m.DB.cars.length, 1, 'должна остаться одна машина');
    const c = m.DB.cars[0];
    eq(c.id, 12, 'выживает прежний победитель');
    eq(c.equip.length, 2, 'оборудование обеих машин должно сохраниться');
    eq(c.plates, 'О 123', 'госномер не должен потеряться');
    eq(c.charge, '70%', 'заряд не должен потеряться');
    eq(c.kits[0].items.length, 2, 'позиции одинаковой укладки должны слиться');
  });

  test('dedupe(): укладка с другим именем добавляется, а не выбрасывается', async () => {
    const m = await loadDB(base({
      bags: [
        { id: 20, name: 'Сумка', desc: '', items: [], kits: [{ id: 'k1', name: 'Аварийная', items: [{ name: 'Жгут', spec: '', unit: 'шт', qty: 1, expiry: '' }] }] },
        { id: 10, name: 'Сумка', desc: '', items: [], kits: [{ id: 'k2', name: 'Ночная', items: [{ name: 'Фонарь', spec: '', unit: 'шт', qty: 1, expiry: '' }] }] }
      ]
    }));
    m.dedupe();
    eq(m.DB.bags[0].kits.length, 2, 'обе укладки должны уцелеть');
  });
});

suite('db.js · устойчивость к битым данным', async () => {
  test('normalizeDB(): чинит не-массивы и отсутствующие ключи', async () => {
    const m = await loadDB({ settings: {}, users: 'это не массив', bags: null, sched: { days: 'нет', months: 5 } });
    eq(Array.isArray(m.DB.users), true, 'users должен стать массивом');
    eq(Array.isArray(m.DB.bags), true);
    eq(Array.isArray(m.DB.sched.days), true);
    eq(Array.isArray(m.DB.sched.months), true);
    eq(typeof m.DB.schedTomb, 'object');
  });

  test('битый JSON в хранилище не роняет приложение — база стартует пустой', async () => {
    // Раньше JSON.parse стоял прямо на импорте модуля: одна испорченная
    // запись — и падал весь граф, человек видел заглушку watchdog вместо причины.
    resetStorage();
    localStorage.setItem('medshift_v3', '{oops');
    const m = await import('../db.js?bad=' + (++n));
    eq(Array.isArray(m.DB.users), true, 'база должна подняться как пустая');
    eq(Array.isArray(m.DB.bags), true);
    eq(m.DB.settings.warnDays > 0, true, 'настройки должны быть по умолчанию');
    assert(!m.DB || typeof m.DB === 'object', 'DB обязан быть объектом');
  });

  test('шрифт на телефоне не трогаем, на мониторе растим — и не больше потолка', () => {
    // Просьба: «на телефоне маленькое, на ПК по размеру окна». Раньше размер
    // был один и тот же везде: 14px и в кармане, и на 1920px.
    eq(fsScaleFor(360), 1, 'телефон — как есть');
    eq(fsScaleFor(414), 1, 'узкое окно — как есть');
    eq(fsScaleFor(600), 1, 'на границе ещё не растим: телефон в горизонтальной ориентации');
    assert(fsScaleFor(1200) > 1, 'на планшете/ноутбуке должно подрасти');
    assert(fsScaleFor(1900) > fsScaleFor(1200), 'чем шире окно, тем крупнее');
    eq(fsScaleFor(4000), fsScaleFor(1800), 'дальше 1800px расти незачем');
    eq(fsEffective(14, 360), 14, 'на телефоне выбранное и получается равное');
    assert(fsEffective(14, 1600) >= 18, 'на мониторе 14px должны превратиться в читаемые ~19');
    eq(fsEffective(30, 1900), 26, 'потолок 26px: иначе таблицы на широком окне рассыпаются');
    eq(fsEffective(10, 360), 10, 'минимальный размер не уходит ниже 10');
    eq(fsEffective(14, 0), 14, 'при неопределённой ширине ведём себя как на телефоне, а не падаем');
    eq(fsEffective(14, null), 14, 'то же для null');
    // Подпись под ползунком обязана совпадать с тем, что реально получится:
    // если она «отстаёт», человек видит «14px» и не понимает, почему текст
    // на мониторе крупнее.
    eq(fsHintText(14, 360), 'На этом экране: 14px (телефон)', 'на телефоне выбранное и получается равное');
    eq(fsHintText(14, 1600), 'На этом экране: 19px (окно 1600px)', 'на мониторе подпись говорит правду');
    eq(fsHintText(22, 360), 'На этом экране: 22px (телефон)');
    assert(fsHintText(14, 2560).indexOf('14px') < 0, 'подпись не должна показывать выбранное, если показывает другое');
  });

  test('владелец станции остаётся админом, кого бы ни удалили', async () => {
    // Правило было «админ = кто зарегистрировался первым», оно жило в коде
    // регистрации. Стоило админу нажать «Удалить мой аккаунт» — права уезжали
    // к тому, кто зарегистрируется следующим. На работающей станции это
    // означало бы: один человек ушёл, а управление получил новичок.
    const station = {
      users: [
        { id: 111, name: 'Владелец', role: 'admin', pin: 'x', cars: [], bags: [] },
        { id: 222, name: 'Второй', role: 'user', pin: 'x', cars: [], bags: [] },
        { id: 333, name: 'Третий', role: 'user', pin: 'x', cars: [], bags: [] }
      ]
    };
    const m = await loadDB(base(station));
    eq(m.DB.ownerId, 111, 'владелец должен запомниться один раз');

    // Второй запуск на том же состоянии: уже известный владелец не должен
    // переизбираться заново при каждом запуске (иначе первым «самым ранним»
    // окажется не он, а тот, кто случайно принёс базу с другого телефона).
    const again = await reloadDB();
    eq(again.DB.ownerId, 111, 'владелец не должен меняться от запуска к запуску');

    // Порча роли (например, переносом выгрузки) не должна оставлять станцию
    // без человека с правами.
    const broken = await loadDB(base({ users: [{ id: 111, name: 'Владелец', role: 'user', pin: 'x', cars: [], bags: [] }] , ownerId: 111 }));
    eq(broken.DB.users[0].role, 'admin', 'владелец с испорченной ролью обязан снова стать админом');

    // Владелец удалил аккаунт — права переходят следующему, а не пропадают.
    const gone = await loadDB(base({
      ownerId: 111,
      users: [
        { id: 222, name: 'Второй', role: 'user', pin: 'x', cars: [], bags: [] },
        { id: 333, name: 'Третий', role: 'user', pin: 'x', cars: [], bags: [] }
      ]
    }));
    eq(gone.DB.ownerId, 222, 'владелец должен перейти к оставшемуся сотруднику');
    eq(gone.DB.users.length, 2, 'при этом никого не удаляем — на станции 12 человек');
  });

  test('владелец не отбирает права у того, кому их дали', async () => {
    const m = await loadDB(base({
      ownerId: 111,
      users: [
        { id: 111, name: 'Владелец', role: 'admin', pin: 'x', cars: [], bags: [] },
        { id: 222, name: 'Старший смены', role: 'lead', pin: 'x', cars: [], bags: [] }
      ]
    }));
    eq(m.DB.users[0].role, 'admin', 'владелец остаётся админом');
    eq(m.DB.users[1].role, 'lead', 'у второго роль не меняется');
  });

  test('normalizeDB(): восстанавливает вложенные массивы предметов', async () => {
    const m = await loadDB(base({ bags: [{ id: 1, name: 'Б' }], cars: [{ id: 2, name: 'М' }] }));
    eq(Array.isArray(m.DB.bags[0].items), true);
    eq(Array.isArray(m.DB.bags[0].kits), true);
    eq(Array.isArray(m.DB.cars[0].equip), true);
  });

  test('normalizeDB(): settings.city и fontSize имеют значения по умолчанию', async () => {
    const m = await loadDB({ settings: {} });
    eq(m.DB.settings.city, 'Красноярск');
    eq(m.DB.settings.fontSize, 14);
  });

  test('migrate(): переносит пользователей и сумки из medshift_v1', async () => {
    resetStorage();
    localStorage.setItem('medshift_v11', JSON.stringify({
      users: [{ name: 'Старый Иванов', pin: '1234', role: 'lead' }],
      bags: [{ name: 'Старая сумка', items: [{ name: 'Анальгин', vol: '2 мл', unit: 'амп', qty: 5 }] }]
    }));
    const m = await import('../db.js?t=' + (++n));
    eq(m.DB.users.length, 1);
    eq(m.DB.users[0].name, 'Старый Иванов');
    eq(m.DB.bags.length, 1);
    assert(m.DB.bags[0].items[0].spec.includes('2 мл'), 'vol должен переехать в spec, получено ' + m.DB.bags[0].items[0].spec);
  });

  test('migrate(): не запускается повторно, если пользователи уже есть', async () => {
    resetStorage();
    seedDB(base({ users: [{ id: 1, name: 'Новый', role: 'user', cars: [], bags: [] }] }));
    localStorage.setItem('medshift_v11', JSON.stringify({ users: [{ name: 'Старый', pin: '0000' }] }));
    const m = await import('../db.js?t=' + (++n));
    eq(m.DB.users.length, 1, 'не должно подмешиваться');
  });
});

suite('db.js · терминология, tombstone-ы, утилиты', async () => {
  test('termSanitize(): «Сильнодействующие» → «НС/ПВ/СД препараты», идемпотентно', async () => {
    const m = await loadDB(base({ kitTemplates: [{ id: 1, name: 'Сильнодействующие', items: [{ name: 'сильнодействующих средств' }] }] }));
    eq(m.termSanitize(), true, 'должны быть изменения');
    assert(m.DB.kitTemplates[0].name.includes('НС/ПВ/СД'), m.DB.kitTemplates[0].name);
    eq(m.termSanitize(), false, 'повторный вызов не должен ничего менять');
  });

  test('isDead(): tomb и bans', async () => {
    const m = await loadDB(base({ tomb: [3], bans: [{ id: 4, name: 'Забаненный' }], users: [
      { id: 3, name: 'Удалённый', role: 'user', cars: [], bags: [] },
      { id: 4, name: 'Забаненный', role: 'user', cars: [], bags: [] }
    ] }));
    eq(m.isDead(3), true, 'tomb');
    eq(m.isDead(4), true, 'бан');
    eq(m.isDead(5), false);
    eq(m.isBannedName('  ЗАБАНЕННЫЙ '), true, 'сравнение без учёта регистра и пробелов');
  });

  test('me(): выбирает сессию и игнорирует удалённых', async () => {
    const m = await loadDB(base({ session: 2, users: [
      { id: 1, name: 'Первый', role: 'user', cars: [], bags: [] },
      { id: 2, name: 'Второй', role: 'user', cars: [], bags: [] }
    ] }));
    eq(m.me().name, 'Второй');
    m.DB.tomb = [2];
    eq(m.me(), null, 'удалённый пользователь не должен быть текущим');
  });

  test('uid(): уникален в пределах одной миллисекунды', async () => {
    const m = await loadDB(base());
    const realNow = Date.now;
    Date.now = () => 1780000000000;           // замораживаем часы
    const set = new Set();
    for (let i = 0; i < 900; i++) set.add(m.uid());
    Date.now = realNow;
    eq(set.size, 900, 'id не должны повторяться внутри одной миллисекунды');
  });

  test('uid(): остаётся точным целым числом (важно для data-id)', async () => {
    const m = await loadDB(base());
    for (let i = 0; i < 500; i++) {
      const id = m.uid();
      assert(Number.isSafeInteger(id), 'id вышел за пределы точного целого: ' + id);
      assert(id > 1e15, 'id слишком мал — сломается сортировка по времени: ' + id);
    }
  });

  test('uid(): у разных устройств разные слоты', async () => {
    const realRandom = Math.random;
    Math.random = () => 0.5;            // одинаковый старт счётчика у обоих
    resetStorage(); seedDev('dA'); seedDB(base());
    const a = await import('../db.js?t=' + (++n));
    resetStorage(); seedDev('dB'); seedDB(base());
    const b = await import('../db.js?t=' + (++n));
    Math.random = realRandom;
    assert(a.DEVSALT !== b.DEVSALT, 'соли устройств должны различаться: ' + a.DEVSALT + ' / ' + b.DEVSALT);
    const A = a.uid(), B = b.uid();
    assert(A !== B, 'два устройства в одну миллисекунду выдали одинаковый id');
  });

  test('normName() и esc()', async () => {
    const m = await loadDB(base());
    eq(m.normName('  Иванов   ПЕТРОВ '), 'иванов петров');
    eq(m.esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    eq(m.esc(null), '');
  });

  test('purgeSched(): дни старше 2 суток и месяцы после 3-го числа', async () => {
    const now = Date.now();
    const m = await loadDB(base({ sched: {
      days: [{ id: 1, ts: now - 3 * 864e5, img: 'a' }, { id: 2, ts: now - 3600e3, img: 'a' }],
      months: [{ id: 3, month: iso(-40).slice(0, 7), img: 'a' }, { id: 4, month: iso(5).slice(0, 7), img: 'a' }]
    } }));
    m.purgeSched();
    eq(m.DB.sched.days.map(x => x.id), [2], 'остаётся только свежий день');
    eq(m.DB.sched.months.map(x => x.id), [4], 'прошлый месяц должен быть вычищен');
  });

  test('myBags()/myCars(): сотрудник видит только назначенное, руководитель — всё', async () => {
    const s = { bags: [{ id: 1, name: 'Моя' }, { id: 2, name: 'Чужая' }], cars: [{ id: 3, name: 'Моя' }, { id: 4, name: 'Чужая' }] };
    const boss = await loadDB(base({ ...s, session: 1, users: [{ id: 1, name: 'Б', role: 'lead', cars: [3], bags: [1] }] }));
    eq(boss.myBags().length, 2, 'руководитель видит все сумки');
    const w = await loadDB(base({ ...s, session: 2, users: [{ id: 2, name: 'С', role: 'user', cars: [3], bags: [1] }] }));
    eq(w.myBags().map(x => x.id), [1]);
    eq(w.myCars().map(x => x.id), [3]);
  });

  test('назначение может быть и у нескольких сумок — людей переставляют', async () => {
    // Отдельно оговорено: людей часто переводят с машины на машину и с
    // сумки на сумку, поэтому назначений может быть несколько, и права
    // приходят вместе с каждым. Если бы правило было «ровно одна сумка»,
    // перестановка ломала бы работу человека.
    const s = { bags: [{ id: 1, name: 'Первая' }, { id: 2, name: 'Вторая' }, { id: 3, name: 'Чужая' }], cars: [] };
    const w = await loadDB(base({ ...s, session: 2, users: [{ id: 2, name: 'С', role: 'user', cars: [], bags: [1, 2] }] }));
    eq(w.myBags().map(x => x.id), [1, 2], 'обе назначенные сумки видны, третья — нет');
    // Без назначений видно всё — осознанное решение (см. тест «без назначений
    // сотрудник видит всё»). Проверяем тут само наличие механизма выбора.
    const без = await loadDB(base({ ...s, session: 2, users: [{ id: 2, name: 'С', role: 'user', cars: [], bags: [] }] }));
    eq(без.myBags().length, 3, 'без назначений показываются все сумки — чтобы человек ничего не пропустил');
    eq(без.безНазначений(), true, 'и приложение сообщает, что назначений нет');
  });

  test('сумки назначены тому, кому положено, а не всем подряд', async () => {
    // Проверка, что правило вообще можно применить: у сотрудника в базе
    // назначения есть, значит ограничение не загонит людей в тупик.
    const станция = base({
      session: 1,
      users: [
        { id: 1, name: 'Руководитель', role: 'admin', pin: 'x', cars: [], bags: [1, 2] },
        { id: 2, name: 'Сотрудник', role: 'user', pin: 'x', cars: [], bags: [1] }
      ],
      bags: [{ id: 1, name: 'Сумка 1' }, { id: 2, name: 'Сумка 2' }]
    });
    const m = await loadDB(станция);
    const сотрудник = m.DB.users.find(u => u.id === 2);
    eq(сотрудник.bags, [1], 'у сотрудника есть назначение — он не останется без сумки');
    eq(m.myBags().map(b => b.id), [1, 2], 'руководителю доступны обе');
  });
});

/* ============================== auth.js ============================== */
suite('auth.js · PIN', async () => {
  const a = await import('../auth.js');
  test('setPin + verifyPin: верный PIN принимается', async () => {
    const u = { id: 1, name: 'U', pin: '', role: 'user' };
    await a.setPin(u, '1234');
    eq(await a.verifyPin(u, '1234'), true);
    eq(await a.verifyPin(u, '9999'), false);
  });

  test('истечение сессии не тащит base64-фото в главный ключ', async () => {
    // checkSessionExpiry писал JSON.stringify(DB) напрямую в localStorage:
    // картинки смен в памяти ещё не отцеплены, и они возвращались в главный
    // ключ — ровно то, ради чего медиа вынесены отдельно. Плюс прямая
    // запись падала без try/catch при переполнении квоты.
    const db = sharedDB;
    const big = 'data:image/jpeg;base64,' + 'Q'.repeat(3000);
    db.DB.session = 1;
    db.DB.sched = { days: [{ id: 9001, ts: Date.now(), month: iso(0).slice(0, 7), img: big }], months: [] };
    localStorage.setItem('medshift_rem', '0');
    localStorage.setItem('medshift_rem_ts', String(Date.now()));
    a.checkSessionExpiry();
    const rawSrazu = localStorage.getItem('medshift_v3') || '';
    assert(rawSrazu.indexOf('base64') < 0,
      'сразу после истечения сессии в главном ключе не должно быть картинок');
    db.saveNow();
    const raw = localStorage.getItem('medshift_v3') || '';
    assert(raw.indexOf('base64') < 0, 'в главном ключе не должно остаться ни байта картинок');
    eq(db.DB.session, null, 'сессия должна закрыться');
    eq(db.mediaAll()['9001'], big, 'фото при этом не потерялось — оно в отдельном ключе');
    db.DB.sched = { days: [], months: [] };
    db.DB.session = 1;               // возвращаем состояние общего экземпляра
    localStorage.setItem('medshift_rem', '1');
  });
  test('verifyPin: неверная соль не проходит', async () => {
    const u = { id: 1, name: 'U', pin: await m_hash('1234', 'saltA'), pinSalt: 'saltA' };
    eq(await a.verifyPin(u, '1234'), true);
    eq(await a.verifyPin(u, '1234' + '0'), false);
  });
  test('verifyPin: без PIN и без соли — отказ', async () => {
    eq(await a.verifyPin({ id: 1, name: 'U' }, '1234'), false);
    eq(await a.verifyPin(null, '1234'), false);
  });
  test('verifyPin: legacy 4-значный PIN переезжает на хэш', async () => {
    const u = { id: 1, name: 'U', pin: '4321', role: 'user' };
    eq(await a.verifyPin(u, '4321'), true, 'старый PIN должен сработать один раз');
    assert(typeof u.pin === 'string' && u.pin.length === 64, 'PIN должен стать hex-хэшем');
    assert(u.pinSalt, 'должна появиться соль');
  });
  test('pinCheck(): блокирует перебор PIN после 5 неудач', async () => {
    // PIN — 4 цифры, всего 10 000 вариантов. Без счётчика попыток он
    // подбирается вручную за пару минут, а модель «один общий аккаунт
    // станции» делает это реальной угрозой: подбор даёт доступ к отчётам
    // и к смене от чужого имени.
    const a = await import('../auth.js');
    const u = { id: 7, name: 'Браконер', pin: '', pinSalt: '' };
    await a.setPin(u, '4821');
    const msgs = [];
    for (let i = 0; i < 4; i++) msgs.push(await a.pinCheck(u, '0000'));
    eq(msgs[0].indexOf('Осталось попыток: 4') >= 0, true, 'после первой неудачи должен показываться остаток попыток: ' + msgs[0]);
    const last = await a.pinCheck(u, '0000');
    assert(/Слишком много попыток/.test(last), 'на пятой неудаче должна включаться блокировка: ' + last);
    const blocked = await a.pinCheck(u, '4821');
    assert(/Слишком много попыток/.test(blocked), 'даже верный PIN не должен проходить в блокировке: ' + blocked);
    eq(a.pinLockedMs(u) > 0, true, 'блокировка должна быть с таймером');
  });

  test('pinCheck(): успешный вход сбрасывает счётчик попыток', async () => {
    const a = await import('../auth.js');
    const u = { id: 8, name: 'Уставший', pin: '', pinSalt: '' };
    await a.setPin(u, '1357');
    await a.pinCheck(u, '0000');
    await a.pinCheck(u, '0000');
    eq(u.pinFails, 2, 'неудачи должны накапливаться');
    eq(await a.pinCheck(u, '1357'), null, 'верный PIN должен пройти');
    eq(u.pinFails, 0, 'счётчик должен обнулиться после успеха');
    eq(await a.pinCheck(u, '1357'), null, 'и повторный вход тоже проходит');
  });

  test('setPin() снимает блокировку', async () => {
    // Руководитель сбросил сотруднику PIN — человек не должен остаться
    // заблокированным, иначе войти нельзя до истечения таймера.
    const a = await import('../auth.js');
    const u = { id: 9, name: 'Забывчивый', pin: '', pinSalt: '' };
    await a.setPin(u, '2468');
    for (let i = 0; i < 5; i++) await a.pinCheck(u, '0000');
    eq(a.pinLockedMs(u) > 0, true, 'должна быть блокировка');
    await a.setPin(u, '2468');
    eq(a.pinLockedMs(u), 0, 'после сброса PIN блокировка должна сняться');
    eq(await a.pinCheck(u, '2468'), null, 'и вход должен работать');
  });

  test('verifyPin() сам по себе попыток не считает', async () => {
    // verifyPin зовут и при смене своего PIN: там счётчик неуместен,
    // легитимный промах не должен приводить к блокировке.
    const a = await import('../auth.js');
    const u = { id: 10, name: 'Аккуратный', pin: '', pinSalt: '' };
    await a.setPin(u, '1122');
    for (let i = 0; i < 20; i++) await a.verifyPin(u, '9999');
    eq(u.pinFails, undefined, 'verifyPin не должен трогать счётчик');
    eq(a.pinLockedMs(u), 0, 'verifyPin не должен блокировать');
  });

  test('у пользователя без пароля verifyPin не проходит даже при верном вводе', async () => {
    const u = { id: 1, name: 'U', pin: '', role: 'user' };
    eq(await a.verifyPin(u, ''), false, 'пустой PIN не должен пускать в приложение');
  });
});

/* ============================== sync.js ============================== */
suite('sync.js · слияние состояния (adoptState)', async () => {
  const db = sharedDB, sync = sharedSync;

  test('живой: локальный чат переживает adoptState', () => {
    sync.adoptState({ rev: 5, chat: [{ id: 'c-rem', ts: 20, author: 'Удалённый', room: 'общая', text: 'здравствуй' }], users: [], reports: [] }, 5);
    const ids = db.DB.chat.map(x => x.id).sort();
    eq(ids, ['c-local', 'c-rem'], 'оба сообщения должны остаться');
  });

  test('живой: session не перетирается удалённым состоянием', () => {
    sync.adoptState({ rev: 6, users: [], reports: [], chat: [], session: 999 }, 6);
    eq(db.DB.session, 1, 'чужая сессия не должна применяться');
  });

  test('живой: tombstone локального удаления не даёт объекту воскреснуть', () => {
    db.DB.bags = [];                          // объект удалён локально
    db.DB.bagTomb = [55];
    sync.adoptState({ rev: 7, users: [], reports: [], chat: [], bags: [{ id: 55, name: 'Машина-мешок', items: [] }] }, 7);
    eq(db.DB.bags.filter(b => b.id === 55).length, 0, 'удалённый локально объект не должен вернуться из облака');
  });

  test('живой: без tombstone удалённый объект всё-таки приезжает', () => {
    db.DB.bagTomb = [];
    sync.adoptState({ rev: 7, users: [], reports: [], chat: [], bags: [{ id: 55, name: 'Машина-мешок', items: [] }] }, 7);
    eq(db.DB.bags.filter(b => b.id === 55).length, 1, 'без tombstone объект должен синхронизироваться');
    db.DB.bagTomb = [55];
  });

  test('живой: бан пользователя сильнее обычного списка', () => {
    sync.adoptState({ rev: 8, users: [{ id: 1, name: 'Босс', role: 'admin' }], bans: [{ id: 1, name: 'Босс' }], reports: [], chat: [] }, 8);
    eq(db.DB.users.filter(u => u.id === 1).length, 0, 'забаненный не должен числиться активным');
  });

  test('живой: adoptState применяет новый rev', () => {
    eq(db.DB.rev, 8);
  });

  test('живой: adoptState откатывает локальные изменения к более старому rev', () => {
    db.DB.settings.warnDays = 99;
    sync.adoptState({ rev: 3, users: [], reports: [], chat: [], settings: { warnDays: 10 } }, 3);
    eq(db.DB.rev, 3, 'старый rev должен откатить состояние — это last-write-wins, не слияние');
  });

  test('alive(): дни — 2 суток, месяцы — до 3-го числа следующего месяца', () => {
    const now = Date.now();
    eq(sync.alive('days', { ts: now - 864e5 }, now), true, 'вчера — ещё жив');
    eq(sync.alive('days', { ts: now - 3 * 864e5 }, now), false, 'позавчера — мёртв');
    eq(sync.alive('days', { ts: 0 }, now), false, 'без ts — мёртв');
    eq(sync.alive('days', {}, now), false);
    eq(sync.alive('months', { month: iso(0).slice(0, 7), ts: now }, now), true, 'текущий месяц жив');
    eq(sync.alive('months', { month: iso(40).slice(0, 7), ts: now }, now), true, 'будущий месяц жив');
    eq(sync.alive('months', { month: iso(-40).slice(0, 7), ts: now }, now), false, 'прошлый месяц мёртв');
  });

  test('живой: могила-строка против записи-числа (id из data-arg)', () => {
    // Реальный баг: delBag/delUser клали в могилу строку из data-arg,
    // а фильтр сравнивал строго — удалённое возвращалось с сервера.
    db.DB.bags = [{ id: 77, name: 'Сумка', items: [] }];
    db.DB.bagTomb = ['77'];
    db.DB.users = [{ id: 88, name: 'Сотрудник', role: 'user', cars: [], bags: [] }];
    db.DB.tomb = ['88'];
    eq(db.isDead(88), true, 'isDead должен узнавать могилу, записанную строкой');
    sync.adoptState({ rev: 4, users: [{ id: 88, name: 'Сотрудник', role: 'user' }], reports: [], chat: [], bags: [{ id: 77, name: 'Сумка', items: [] }] }, 4);
    eq(db.DB.bags.filter(b => String(b.id) === '77').length, 0, 'сумка с могилой-строкой не должна воскреснуть');
    eq(db.DB.users.filter(u => String(u.id) === '88').length, 0, 'сотрудник с могилой-строкой не должен воскреснуть');
  });

  test('живой: удалённое не возвращается локальной копией обратно (mergeArr vs могилы)', () => {
    // Сценарий: устройство A удалило сумку, устройство B было офлайн и
    // всё ещё держит её у себя. mergeTombs() убирает 91 из удалённого
    // списка, но следующая строка mergeArr(rem, DB) возвращала её
    // локальной копией — и сумка воскресала, уезжая обратно на сервер.
    db.DB.bags = [{ id: 91, name: 'Зомби', items: [] }];
    db.DB.bagTomb = [91];
    db.DB.users = []; db.DB.tomb = [];
    db.DB.chat = []; db.DB.reports = []; db.DB.tasks = [];
    sync.adoptState({ rev: 5, users: [], reports: [], chat: [], tasks: [], bags: [{ id: 91, name: 'Зомби', items: [] }] }, 5);
    eq(db.DB.bags.length, 0, 'локальная копия удалённого не должна возвращаться в базу');
    eq(db.DB.bagTomb.length, 1, 'могила должна сохраниться');
  });

  test('живой: график смен сливается, а не затирается', () => {
    db.DB.shiftGrid = [{ date: '2026-10-01', brigade: 'А', car: '1', staff: 'Иванов', note: '', upd: 100 }];
    sync.adoptState({ rev: 6, users: [], reports: [], chat: [], bags: [], shiftGrid: [
      { date: '2026-10-01', brigade: 'А', car: '1', staff: 'Петров', note: '', upd: 200 },
      { date: '2026-10-02', brigade: 'Б', car: '2', staff: 'Сидоров', note: '', upd: 50 }
    ] }, 6);
    eq(db.DB.shiftGrid.length, 2, 'обе строки должны остаться');
    const d1 = db.DB.shiftGrid.find(r => r.date === '2026-10-01');
    eq(d1.staff, 'Петров', 'по более поздней правке (upd=200) должен победить сервер');
  });

  test('живой: удалённая строка графика не воскресает', () => {
    db.DB.shiftGrid = [{ date: '2026-10-03', brigade: 'В', car: '3', staff: 'Кто-то', note: '', upd: 999 }];
    db.DB.shiftTomb = ['2026-10-03|В|3'];
    sync.adoptState({ rev: 7, users: [], reports: [], chat: [], bags: [], shiftGrid: [{ date: '2026-10-03', brigade: 'В', car: '3', staff: 'Кто-то', note: '', upd: 999 }] }, 7);
    eq(db.DB.shiftGrid.filter(r => r.date === '2026-10-03').length, 0, 'удалённая строка графика не должна вернуться');
  });

  test('живой: локальный бан переживает забор с пустым серверным списком', () => {
    db.DB.bans = [{ id: 70, name: 'Забаненный' }]; db.DB.banTomb = [];
    sync.adoptState({ rev: 20, users: [{ id: 71, name: 'Живой', role: 'user', cars: [], bags: [] }], bans: [], reports: [], chat: [] }, 20);
    eq(db.DB.bans.length, 1, 'локальный бан не должен стираться пустым списком с сервера');
    eq(db.DB.users.some(u => u.id === 71), true, 'обычный сотрудник должен остаться в списке');
  });

  test('живой: бан с сервера не исчезает на повторном заборе', () => {
    db.DB.bans = []; db.DB.banTomb = [];
    const mk = rev => ({ rev, users: [{ id: 80, name: 'Нарушитель', role: 'user', cars: [], bags: [] }], bans: [{ id: 80, name: 'Нарушитель' }], reports: [], chat: [] });
    sync.adoptState(mk(21), 21);
    eq(db.DB.bans.length, 1, 'первый забор: бан должен примениться');
    sync.adoptState(mk(22), 22);
    eq(db.DB.bans.length, 1, 'второй забор: бан обязан остаться — иначе человек снова входит');
    eq(db.DB.users.some(u => u.id === 80), false, 'забаненный не должен числиться активным');
  });

  test('живой: снятый бан не возвращается с сервера', () => {
    db.DB.bans = []; db.DB.banTomb = [80];
    sync.adoptState({ rev: 23, users: [{ id: 80, name: 'Нарушитель', role: 'user', cars: [], bags: [] }], bans: [{ id: 80, name: 'Нарушитель' }], reports: [], chat: [] }, 23);
    eq(db.DB.bans.length, 0, 'снятый бан не должен воскреснуть со стороны сервера');
    eq(db.DB.users.some(u => u.id === 80), true, 'после снятия бана человек снова в списке');
    db.DB.banTomb = []; db.DB.bans = [];
  });

  test('живой: состояние не той формы не роняет приём и не портит базу', () => {
    db.DB.bags = [{ id: 1, name: 'Сумка', items: [] }];
    let threw = '';
    try { sync.adoptState({ rev: 24, bags: 'не массив', users: [], reports: [], chat: [] }, 24); } catch (e) { threw = String(e && e.message || e); }
    eq(threw, '', 'слияние не должно бросать исключение — раньше это роняло весь экран');
    eq(Array.isArray(db.DB.bags), true, 'база должна остаться в норме');
    eq(db.DB.bags.length, 1, 'локальные данные не должны пострадать');
  });
});

/* ====================== согласованность сборки ====================== */
suite('сборка · версия в одном месте', async () => {
  const fs = await import('node:fs');
  const root = new URL('../', import.meta.url);
  const read = f => fs.readFileSync(new URL(f, root), 'utf8');
  const cfg = read('config.js');
  const html = read('index.html');
  const sw = read('sw.js');
  const man = read('manifest.webmanifest');

  const version = (cfg.match(/VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1];
  assert(!!version, 'в config.js должен быть VERSION');

  test('VERSION из config.js совпадает с ?v= в index.html', () => {
    const qs = html.match(/\?v=([0-9][^"'\s]*)/g) || [];
    assert(qs.length > 0, 'в index.html должен быть хотя бы один ?v=');
    qs.forEach(q => {
      const v = q.replace('?v=', '');
      eq(v, version, 'расхождение версий: index.html ' + q + ' против config.js ' + version);
    });
  });

  test('в index.html не осталось других версий', () => {
    const all = (html.match(/[0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?/g) || []).filter(v => v !== version);
    eq(all.length, 0, 'в index.html найдены посторонние номера версий: ' + all.join(', '));
  });

  test('sw.js не содержит ручного имени кэша', () => {
    // Комментарии вырезаем: там старое имя упомянуто как объяснение,
    // что именно было исправлено.
    const code = sw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert(!/medshift-cache-v\d+/.test(code), 'имя кэша должно собираться из VERSION в config.js, а не быть вписано руками');
    assert(/VERSION/.test(code), 'sw.js должен читать VERSION из config.js');
  });

  test('манифест: serviceworker и id на месте', () => {
    const j = JSON.parse(man);
    eq(j.serviceworker, 'sw.js', 'в манифесте должен быть serviceworker');
    assert(!!j.id, 'в манифесте должен быть id, иначе приложение может установиться дважды');
  });

  test('все файлы из sw.js ASSETS существуют на диске', () => {
    const block = (sw.match(/var ASSETS = \[([\s\S]*?)\];/) || [])[1] || '';
    const files = (block.match(/'\.\/([^']+)'/g) || []).map(s => s.slice(3, -1)).filter(f => f !== '');
    assert(files.length > 10, 'список ASSETS разобран плохо: найдено ' + files.length);
    const missing = files.filter(f => !fs.existsSync(new URL(f, root)));
    eq(missing.length, 0, 'файлы из ASSETS отсутствуют на диске: ' + missing.join(', '));
  });

  test('каждый свой модуль приложения есть в sw.js ASSETS — иначе он не работает офлайн', () => {
    // Обратная проверка к предыдущей: там ловили «в кэше есть, чего нет на
    // диске», а нужен «модуль подключили, а в кэш не положили». При выходе
    // в поле без сети импорт такого модуля падает, и экран остаётся пустым.
    const block = (sw.match(/var ASSETS = \[([\s\S]*?)\];/) || [])[1] || '';
    const cached = new Set((block.match(/'\.\/([^']+)'/g) || []).map(s => s.slice(3, -1)));
    const sources = ['boot.js', 'ui.js', 'views.js', 'reports.js', 'chat.js', 'weather.js', 'seasons.js', 'db.js', 'sync.js', 'auth.js', 'background.js', 'logic.js'];
    const imported = new Set();
    sources.forEach(f => {
      let src = '';
      try { src = read(f); } catch { return; }
      (src.match(/from '\.\/([\w.-]+\.js)'/g) || []).forEach(m => imported.add(m.slice(8, -1)));
    });
    assert(imported.size >= 10, 'импорты разобрались плохо: найдено ' + imported.size);
    const notCached = [...imported].filter(f => !cached.has(f));
    eq(notCached.length, 0, 'модуль подключён, но не в офлайн-кэше — без сети сломается: ' + notCached.join(', '));
  });

  test('широкое окно не сжимает календарь', () => {
    // Сетка .wgrid на главной держит ОДНУ карточку — календарь. Правило
    // `span 2` означало «занять две колонки из двух». Стоило на широком окне
    // добавить третью колонку, календарь занимал 2 из 3: уезжал влево, справа
    // зияла пустота, и на мониторе он не растягивался. `1 / -1` — это всегда
    // вся ширина сетки, сколько колонок бы ни было.
    const css = read('styles.css');
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const spanRule = (rules.match(/\.wgrid \.span2\s*\{([^}]*)\}/) || [])[1] || '';
    assert(/grid-column\s*:\s*1\s*\/\s*-1/.test(spanRule),
      'карточка календаря должна занимать всю ширину сетки (grid-column:1 / -1), а не фиксированное число колонок. Найдено: ' + spanRule.trim());
    // И никакая медиа-ветка не должна делать сетку шире двух колонок:
    // второй карточки в ней нет, значит лишние колонки только отнимают
    // ширину у календаря.
    const wide = rules.match(/\.wgrid\s*\{[^}]*grid-template-columns\s*:\s*repeat\((\d)\s*,/g) || [];
    const cols = wide.map(m => +m.match(/repeat\((\d)/)[1]);
    cols.forEach(n => assert(n <= 2, 'сетка .wgrid не должна становиться шире двух колонок: repeat(' + n + ',1fr)'));
  });

  test('шапка и кнопки страниц не уезжают под статус-бар iPhone', () => {
    // Жалоба с телефона: ярлык на рабочем экране iPhone, приложение в
    // standalone с viewport-fit=cover — и шапка с кнопками вкладок уходят
    // под «шторку» целиком. Причина не в отсутствии safe-area: правило
    // header{padding:6px 10px} в @media(max-width:480px) стоит ПОЗЖЕ
    // базового и перетирает env(safe-area-inset-top) shorthand'ом.
    // Ширина 480px — это все iPhone (375–430), то есть бьёт ровно по тем,
    // у кого шторка есть.
    // Правило проверяется здесь по исходнику: в тестах нет ни iPhone,
    // ни env(), а в десктопном браузере inset и так равен нулю.
    const css = read('styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const padWithSat = /padding(?:-top)?\s*:[^;{}]*var\(--sat\)/;

    assert(/--sat\s*:\s*0px/.test(css),
      'в :root должен быть --sat:0px — без значения по умолчанию отступ сломается там, где safe-area не нужна');
    assert(/@supports\s*\(\s*padding-top\s*:\s*env\(safe-area-inset-top\)\s*\)\s*\{\s*:root\s*\{\s*--sat\s*:\s*env\(safe-area-inset-top\)/.test(css),
      'отступ шторки обязан приходить из env(safe-area-inset-top) внутри @supports, а не быть вписаным числом');

    const heads = [...css.matchAll(/(?:^|[^\w-])header\s*\{([^}]*)\}/g)].map(m => m[1]);
    assert(heads.length >= 2, 'правил header должно быть минимум два (общее и мобильное), найдено ' + heads.length);
    heads.forEach((body, i) => {
      assert(padWithSat.test(body),
        'header №' + (i + 1) + ' задаёт padding без var(--sat): «' + body.trim().slice(0, 110) +
        '» — на iPhone шапка уедет под статус-бар');
    });

    const nav = (css.match(/(?:^|[^\w-])nav\s*\{([^}]*)\}/) || [])[1] || '';
    assert(/position\s*:\s*sticky/.test(nav), 'кнопки вкладок остаются прилипшими (position:sticky) — без этого проверка top теряет смысл');
    assert(/top\s*:\s*var\(--sat\)/.test(nav),
      'прилипшие кнопки вкладок должны останавливаться ниже шторки (top:var(--sat)), а не под ней. Найдено: ' + nav.trim().slice(0, 110));

    const dlgs = [...css.matchAll(/(?:^|[^\w-])#dlg\s*\{([^}]*)\}/g)].map(m => m[1]);
    assert(dlgs.length >= 2, 'правил #dlg должно быть минимум два, найдено ' + dlgs.length);
    dlgs.forEach((body, i) => {
      assert(/margin(?:-top)?\s*:[^;{}]*var\(--sat\)/.test(body),
        'диалог №' + (i + 1) + ' открывается от самой кромки экрана, под статус-баром. Найдено: ' + body.trim().slice(0, 110));
    });
  });

  test('русский текст не перекодирован (файл прочитан как windows-1251)', () => {
    // Так выглядел ущерб, когда я переписал config.js и index.html командой
    // PowerShell: она прочитала UTF-8 как windows-1251 и записала обратно
    // уже дважды перекодированным. В шапке вместо «КрасНЕО» встало
    // «РћРћРћ В«РљСЂР°СЃРѕР•РћВ»», и это увидели все 12 человек на станции.
    // Сигнатура надёжная: русский алфавит — это А-Я, а-я, Ё, ё. Любая
    // другая буква кириллицы (U+0455, U+0458, U+0459, U+045B — сербская и
    // македонская разновидности) в нормальном файле не встречается, а при
    // перекодировке появляется сразу и сразу в куче.
    const ru = /[\u0401\u0410-\u042F\u0430-\u044F\u0451]/;
    const files = fs.readdirSync(root).filter(f => /\.(js|css|html|webmanifest|md)$/.test(f));
    const dirty = [];
    files.forEach(f => {
      const s = read(f);
      for (const ch of s) {
        const c = ch.codePointAt(0);
        if (c >= 0x400 && c <= 0x4FF && !ru.test(ch)) { dirty.push(f + ' (символ ' + ch + ' U+' + c.toString(16).toUpperCase() + ')'); break; }
      }
    });
    eq(dirty.length, 0, 'файл перекодирован — русский текст превратился в мусор: ' + dirty.join(', '));
    // И точка привязки: название компании должно остаться читаемым.
    ['config.js', 'index.html'].forEach(f => {
      assert(read(f).indexOf('ООО «КрасНЕО»') >= 0, f + ': название компании в файле нечитаемо — файл перекодирован');
    });
  });

  test('sw.js отдаёт приложение из кэша, когда сеть ответила ошибкой 502', async () => {
    // Найдено вживую: приложение открылось на 502 Bad Gateway, хотя все
    // файлы лежали в кэше. Причина — стратегия «Network First» откатывалась
    // в кэш только когда сеть ПАДАЛА (fetch бросал исключение). Но сеть
    // может ответить и кодом ошибки: 502 от прокси, 503 от перегруженного
    // шлюза, 404 у ещё не залитого файла. Тогда страница уходила в браузер
    // как есть, и человек видел ошибку вместо приложения. Ровно тот случай,
    // ради которого офлайн и нужен: вышка-перехватчик в больнице, плохой
    // Wi-Fi, МЧС-фильтр.
    const cache = { 'seed.js': 'window.SEED=[];', 'index.html': '<html>приложение</html>' };
    const r1 = await swAnswer('seed.js', { status: 502, cache });
    eq(r1.статус, 200, 'seed.js лежит в кэше, но пришёл 502 — должен отдаться из кэша');
    eq(r1.тело, 'window.SEED=[];', 'отдан не тот файл');
    const r2 = await swAnswer('index.html', { status: 502, cache });
    eq(r2.тело, '<html>приложение</html>', 'навигация при 502 должна отдать index.html из кэша');
  });

  test('sw.js при ошибке сети отдаёт кэш, а при успехе — свежее', async () => {
    const cache = { 'index.html': 'старый' };
    const off = await swAnswer('index.html', { throws: true, cache });
    eq(off.тело, 'старый', 'сети нет — отдаём кэш');
    const on = await swAnswer('index.html', { status: 200, body: 'новый', cache });
    eq(on.тело, 'новый', 'сеть ответила — отдаём свежее, а не из кэша');
  });

  test('sw.js не подменяет 404 файла, которого нет ни в сети, ни в кэше', async () => {
    // Честность важнее удобства: если файла правда нет, приложение должно
    // получить настоящую ошибку, а не тихо подсунуть пустую заглушку — иначе
    // битый drugs.js выглядел бы как пустой справочник.
    const r = await swAnswer('drugs.js', { status: 404, cache: { 'index.html': 'x' } });
    eq(r.статус, 404, 'несуществующий файл обязан остаться 404');
  });

  test('isIsoDate(): поле календаря понимает ровно свой формат', () => {
    // Отсюда была потеря смен в графике: <input type="date"> показывает пустое
    // на всём, кроме ГГГГ-ММ-ДД, а график хранит дату ровно ту, что ввёл
    // человек при импорте. Правит бригаду — дата пропадает, смена не сохраняется.
    eq(isIsoDate('2026-10-01'), true, 'штатный формат принимается');
    eq(isIsoDate('01.10.2026'), false, 'русский формат в календарь не влезает');
    eq(isIsoDate('1 октября'), false, 'словесная дата тоже');
    eq(isIsoDate('2026-13-45'), false, 'несуществующая дата не считается датой');
    eq(isIsoDate('2026-10-32'), false, '32 октября не бывает');
    eq(isIsoDate(''), false, 'пустая строка');
    eq(isIsoDate(null), false, 'нет значения');
    eq(isIsoDate(20261001), false, 'число — не строка');
  });

  test('срок годности в чужом формате не пропадает при сохранении', () => {
    // Позиция с «31.12.2027» попадала в <input type="date">, который
    // показывает пустоту, а сохранение формы пересобирало позицию целиком —
    // срок исчезал, и позиция навсегда выпадала из проверки.
    eq(expInputType('2026-10-01'), 'date', 'штатный формат — календарь');
    eq(expInputType(''), 'date', 'для новой позиции календарь остаётся');
    eq(expInputType(null), 'date', 'нет значения — календарь');
    eq(expInputType('01.10.2026'), 'text', 'русский формат должен показываться текстом, а не пустотой');
    eq(expInputType('31.12.2027'), 'text', 'то же для срока, записанного точками');

    const boot = read('boot.js'), views = read('views.js');
    const вДиалогах = (boot.match(/expInputType\(/g) || []).length;
    const вТаблицах = (views.match(/expInputType\(/g) || []).length;
    assert(вДиалогах >= 3, 'в диалогах должно быть три выбора типа поля срока, найдено: ' + вДиалогах);
    assert(вТаблицах >= 3, 'в таблицах должно быть три выбора типа поля срока, найдено: ' + вТаблицах);
    assert(!/type="date" value="' \+ \(it\.expiry/.test(boot + views),
      'ни одно поле срока больше не навязывает календарь со значением записи');
  });

  test('редактор смены не теряет дату, которую не понимает календарь', () => {
    // Проверяем решение: нестандартная дата показывается текстом и
    // возвращается как есть. Конвертировать её в ГГГГ-ММ-ДГГ нельзя —
    // смена опознаётся по ключу «дата|бригада|машина», и смена формата
    // выглядела бы как удаление строки и появление новой.
    const boot = read('boot.js');
    const длг = boot.match(/window\.openShiftDlg[\s\S]*?openDlg\(/);
    assert(!!длг, 'не нашёл openShiftDlg');
    const код = длг[0];
    // поле даты выбирается по isIsoDate: одна ветка — календарь, другая —
    // обычный текст, и обе берут одно и то же значение из записи
    const выбор = код.match(/isIsoDate\([\s\S]*?;\n/);
    assert(!!выбор, 'редактор должен выбирать тип поля даты по isIsoDate');
    assert(/type="date"/.test(выбор[0]), 'для штатной даты должен остаться календарь');
    assert(/type="text"[^]*shDate|shDate[^]*type="text"/.test(выбор[0]),
      'для нестандартной даты нужен обычный текстовый ввод, иначе она покажется пустой');
    assert(/isIsoDate\(d\)/.test(код), 'проверка должна идти по самой дате записи');
    // сохранение берёт значение поля как есть, без преобразования формата
    const сохр = boot.match(/window\.saveShiftDlg[\s\S]*?\n};/);
    assert(сохр && /getElementById\('shDate'\)\.value/.test(сохр[0]), 'сохранение берёт дату из поля как есть');
    assert(сохр && !/toISOString|toLocaleDateString|new Date\(.*shDate/.test(сохр[0]),
      'сохранение не должно переводить дату в другой формат — это ломает ключ смены');
  });

  test('без назначений сотрудник видит всё, а не пустоту — отчёт не должен врать', async () => {
    // Решение, принятое при подготовке к заливке: назначения ставятся
    // вручную, а ограничение появилось позже, и часть станции какое-то время
    // работала бы без них. Строгий вариант опасен: человек увидел бы ноль
    // просрочки и отчитался «всё проверил», а за пропуск штрафуют. Поэтому
    // нет назначений — видно всё, и ограничение включается само, как только
    // назначения появятся.
    const станция = {
      bags: [{ id: 1, name: 'Моя' }, { id: 2, name: 'Чужая' }],
      cars: [{ id: 3, name: 'Моя' }, { id: 4, name: 'Чужая' }]
    };
    const без = await loadDB(base({
      ...станция, session: 2,
      users: [{ id: 2, name: 'С', role: 'user', cars: [], bags: [] }]
    }));
    eq(без.myBags().length, 2, 'без назначений видны все сумки — иначе человек ничего не проверит');
    eq(без.myCars().length, 2, 'без назначений видны все машины');
    eq(без.безНазначений(), true, 'признак «назначений нет» должен сработать, чтобы объяснить полный список');

    const с = await loadDB(base({
      ...станция, session: 2,
      users: [{ id: 2, name: 'С', role: 'user', cars: [3], bags: [1] }]
    }));
    eq(с.myBags().map(x => x.id), [1], 'как только назначение есть — ограничение включается');
    eq(с.myCars().map(x => x.id), [3]);
    eq(с.безНазначений(), false, 'при назначении подсказку не показываем');
    // и просрочка при этом тоже своя, а не вся станция
    eq(с.soonList().length, 0, 'у назначенных сумок пусто — тревог быть не должно');
  });

  test('видно всё — но править можно только своё по назначению', async () => {
    // Право на правку не расширилось вместе с видимостью: показывать для
    // проверки и позволять менять чужое — разные вещи. Сотрудник без
    // назначений видит все сумки, но не может ни переименовать, ни удалить
    // ни одну, потому что ему ни одна не назначена.
    const станция = base({
      session: 2,
      users: [{ id: 2, name: 'С', role: 'user', cars: [], bags: [] }],
      bags: [{ id: 1, name: 'Первая' }, { id: 2, name: 'Вторая' }]
    });
    const без = await loadDB(станция);
    eq(без.canUseBag(1), false, 'назначений нет — нельзя даже на первую сумку');
    eq(без.canUseBag(2), false, 'ни на одну');
    const с = await loadDB({
      ...станция, session: 2,
      users: [{ id: 2, name: 'С', role: 'user', cars: [], bags: [2] }]
    });
    eq(с.canUseBag(2), true, 'назначенная сумка — своя');
    eq(с.canUseBag(1), false, 'неназначенная — чужая');
    const начальник = await loadDB({
      ...станция, session: 1,
      users: [{ id: 1, name: 'Р', role: 'lead', cars: [], bags: [] }]
    });
    eq(начальник.canUseBag(1), true, 'руководителю доступно всё');
  });

  test('экран сумок объясняет, почему список полный', () => {
    const views = read('views.js');
    const экран = views.match(/export function bagsView[\s\S]*?\n}/);
    assert(!!экран, 'не нашёл bagsView');
    const код = экран[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert(/безНазначений\(\)/.test(код),
      'при отсутствии назначений нужна подсказка — иначе полный список выглядит как ошибка');
    assert(/назначени/i.test(код), 'в подсказке должно быть слово про назначение');
    // и кнопки правки — по назначению, а не всем подряд
    assert(/canUseBag\(b\.id\)/.test(код),
      'правка сумки должна быть закрыта тем, кому она не назначена');
  });

  test('сотрудник не может создать, удалить или заблокировать коллегу', async () => {
    // Найдено вживую, и это самая тяжёлая находка: обычный сотрудник создал
    // себе учётную запись с ролью «админ» и удалил коллегу из списка станции.
    // Кнопки у него скрыты — но обработчики вызываются из консоли, и в моей
    // проверке так и случилось. Оба действия необратимы: удаление кладёт id в
    // могилу, и с других телефонов человек не возвращается.
    const src = read('boot.js');
    const удаление = src.match(/window\.delUser[\s\S]*?\n};/);
    assert(!!удаление, 'не нашёл delUser');
    assert(/if\s*\(!isBoss\(\)\)/.test(удаление[0]),
      'в delUser обязана быть проверка прав: скрытая кнопка не защищает, вызов доступен из консоли');
    const окно = src.match(/window\.addUserDlg\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\n\};/);
    const создание = src.match(/window\.addUserDo[\s\S]*?\n};/);
    assert(!!создание, 'не нашёл addUserDo');
    assert(/if\s*\(!isBoss\(\)\)/.test(создание[0]),
      'в addUserDo обязана быть проверка прав — иначе сотрудник создаёт себе админа прямо из формы выбора роли');
    const auth = read('auth.js');
    const бан = auth.match(/export function banUser[\s\S]*?\n}/);
    assert(!!бан, 'не нашёл banUser');
    assert(/isBoss\(\)/.test(бан[0]), 'в banUser обязана быть проверка прав');
  });

  test('удаление сотрудника убирает его безвозвратно — могила обязана быть', async () => {
    // Отдельно проверяем, что защита не сломала саму механику: удалённый
    // сотрудник не должен вернуться с сервера.
    const m = await loadDB(base({
      session: 1,
      users: [{ id: 1, name: 'Руководитель', role: 'lead', pin: 'x', cars: [], bags: [] },
              { id: 2, name: 'Сотрудник', role: 'user', pin: 'x', cars: [], bags: [] }]
    }));
    eq(m.DB.users.length, 2, 'двое в списке');
    eq(m.isBoss(), true, 'вошедший — руководитель');
    // роль видна по коду, а удаление выполняет boot.js; здесь проверяем, что
    // данные пользователя вообще удаляемы и могила кладётся строкой
    m.DB.tomb = m.DB.tomb || [];
    m.DB.tomb.push(2);
    m.DB.users = m.DB.users.filter(u => u.id !== 2);
    eq(m.DB.users.length, 1, 'остался один');
    assert(m.DB.tomb.some(x => String(x) === '2'), 'могила должна хранить id строкой — сравнение строгое, иначе вернётся с сервера');
  });

  test('reportText(): отчёт не теряет ни дефекты, ни просрочку, ни ЭКГ', () => {
    // По отчёту сверяют смену и по нему штрафуют за пропуск, поэтому текст
    // обязан быть полным. Функция перенесена в logic.js именно поэтому:
    // в reports.js её нечем было проверять — файл тянет за собой DOM.
    const r = {
      ts: Date.now(), status: 'red', car: 'Амбуланс 3', user: 'Сидоров Пётр Петрович',
      brigade: 'Б2', bagNum: 'Сумка выездная №6', ecgNum: '912', ecgCharge: '40%',
      potentBag: 'Морфин 2',
      defects: ['Тонометр (не набирает давление)', 'Дыхательный мешок'],
      expired: ['Сумка выездная №6: Адреналин (2026-09-07)', 'Амбуланс 3 / Реанимационная: Атропин (2026-10-01)'],
      remarks: 'вызов по линии, уточняли координаты'
    };
    const t = reportText(r);
    ['Амбуланс 3', 'Сидоров Пётр Петрович', 'Б2', 'Сумка выездная №6', '912', '40%',
     'Морфин 2', 'Тонометр', 'Дыхательный мешок', 'Адреналин', 'Атропин', 'уточняли координаты']
      .forEach(x => assert(t.indexOf(x) >= 0, 'в отчёте потерялось: ' + x + '\n---\n' + t));
    assert(t.indexOf('КРАСНЫЙ') >= 0, 'в отчёте должен быть статус');
    assert(/Дата: \d{2}\.\d{2}\.\d{4}/.test(t), 'должна быть нормальная дата:\n' + t);
  });

  test('reportText(): битый отчёт печатается, а не падает и не врёт', () => {
    const t = reportText({ id: 1, ts: null, user: 'Кто-то' });
    assert(t.length > 0, 'битый отчёт должен хоть что-то напечатать');
    assert(t.indexOf('дата неизвестна') >= 0, 'потерянная дата должна быть названа, а не превратиться в 1970:\n' + t);
    assert(t.indexOf('без статуса') >= 0, 'отсутствующий статус должен быть назван:\n' + t);
    assert(!/undefined|NaN|1970/.test(t), 'в отчёте не должно быть слов, которых нет в данных:\n' + t);
    // и совсем пустая запись не должна ронять приложение
    const пусто = reportText({});
    assert(!/undefined|NaN/.test(пусто), 'пустой отчёт печатается прочерками:\n' + пусто);
    assert(reportText(null).length > 0, 'null не должен ронять');
  });

  test('reportFileName(): имя, которое Windows примет', () => {
    // В имени файла нельзя оставлять \ / : * ? " < > | — иначе сохранение
    // не работает. Раньше при битом ts toISOString() бросал RangeError.
    eq(reportFileName({ car: 'Амбуланс 1', ts: Date.UTC(2026, 8, 27) }, '2026-09-27'),
      'otchet-Амбуланс_1-2026-09-27.txt', 'обычное имя');
    const поганое = reportFileName({ car: 'А/Б\\В:Г*Д?Е"Ж<З>Ы|', ts: Date.UTC(2026, 8, 27) }, '2026-09-27');
    assert(/[\\/:*?"<>|]/.test(поганое) === false, 'в имени остались запрещённые символы: ' + поганое);
    // битая дата — не падение, а сегодняшнее число
    eq(reportFileName({ car: 'Амбуланс 1', ts: null }, '2026-09-27'), 'otchet-Амбуланс_1-2026-09-27.txt',
      'при битом ts подставляется переданная дата, а не исключение');
    eq(reportFileName({ ts: 'ерунда' }, '2026-09-27'), 'otchet-sluzhba-2026-09-27.txt',
      'без машины и с мусорной датой');
    assert(reportFileName({ car: 'A'.repeat(200), ts: Date.UTC(2026, 8, 27) }, '2026-09-27').length < 80,
      'имя не должно быть бесконечным');
  });

  test('табличка сумки и укладки считается одним кодом и говорит словами', () => {
    // Значков без подписи человек в поле не расшифрует: «⚠ 10» — это десять
    // чего? Просрочено и «без срока» показывались одинаково, а значили
    // разное. Поэтому на карточке сумки и на укладке машины одна и та же
    // функция infoPlate() с подписями, иначе через месяц будут две разные
    // правды об одном и том же.
    const views = read('views.js');
    const табличка = views.match(/function infoPlate[\s\S]*?\n}/);
    assert(!!табличка, 'не нашёл infoPlate — единый подсчёт для карточек');
    const код = табличка[0];
    assert(/просрочено\/скоро/.test(код), 'у просрочки должна быть подпись');
    assert(/без срока/.test(код), 'у позиций без срока должна быть подпись');
    assert(/countNoExpiry\(/.test(код), 'счётчик «без срока» обязан идти через countNoExpiry');
    // обе карточки используют её, а не считают по-своему
    const вызовы = (views.match(/infoPlate\(/g) || []).length;
    assert(вызовы >= 3, 'infoPlate должна вызываться на карточке сумки и на укладке, найдено вызовов: ' + вызовы);
    assert(!/badge bNoDate/.test(views), 'старая метка-значок без подписи должна уйти');
  });

  test('каждый модуль приложения разбирается без синтаксических ошибок', async () => {
    // Найдено вживую: в boot.js осталась лишняя скобка, 114 тестов были
    // зелёными, а приложение не запускалось — «boot.js НЕ выполнился за 3 с».
    // Причина в том, что тесты импортируют db.js, logic.js, views.js и
    // drugload.js, а boot.js не импортируют: его нечем было проверить.
    // Проверяем разбором ВСЕХ модулей проекта, включая boot.js.
    const cp = await import('node:child_process');
    const os = await import('node:os');
    const path = await import('node:path');
    const tmp = path.join(os.tmpdir(), 'medshift-syntax-check');
    fs.mkdirSync(tmp, { recursive: true });
    const файлы = fs.readdirSync(root).filter(f => f.endsWith('.js'));
    assert(файлы.length >= 10, 'нашёл подозрительно мало модулей: ' + файлы.length);
    const плохие = [];
    файлы.forEach(f => {
      // .mjs — чтобы node --check разбирал файл как модуль, а не как скрипт
      const копия = path.join(tmp, f + '.mjs');
      fs.writeFileSync(копия, read(f), 'utf8');
      try {
        cp.execFileSync(process.execPath, ['--check', копия], { stdio: 'pipe' });
      } catch (e) {
        const вывод = String((e.stderr || '') + (e.stdout || '')).split('\n').slice(0, 3).join(' ').trim();
        плохие.push(f + ': ' + вывод);
      }
    });
    eq(плохие.length, 0, 'файл не разбирается — приложение не запустится: ' + плохие.join(' | '));
  });

  test('countNoExpiry(): позиции без срока считаются, но расходники проходят', () => {
    // Позиция без вписанного срока не проверяется нигде: ни в просрочку, ни
    // в отчёт, ни в тревоги. По процессу станции сотрудник отвечает за
    // пропуск, то есть «всё проверил» оказывается неправдой.
    const items = [
      { name: 'Адреналин', expiry: '2026-10-01' },
      { name: 'Анальгин', expiry: '' },
      { name: 'Атропин', expiry: null },
      { name: undefined, expiry: '' }
    ];
    eq(countNoExpiry(items), 3, 'три позиции без срока');
    eq(countNoExpiry([{ name: 'Адреналин', expiry: '2026-10-01' }]), 0, 'со сроком счётчик молчит');
    eq(countNoExpiry([]), 0, 'пустая сумка');
    eq(countNoExpiry(null), 0, 'нет списка — тоже ноль, а не падение');
  });

  test('тревога называет позиции без срока — иначе пропуск не виден', async () => {
    const станция = base({
      session: 2,
      users: [{ id: 2, name: 'С', role: 'user', cars: [], bags: [1] }],
      bags: [{ id: 1, name: 'Моя', items: [{ name: 'Адреналин', expiry: '' }, { name: 'Анальгин', expiry: '2030-01-01' }] }]
    });
    const сотрудник = await loadDB(станция);
    const тревоги = сотрудник.alerts();
    const пункт = тревоги.find(x => x.noDate);
    assert(!!пункт, 'в тревогах должна быть строка про позиции без срока — иначе они выпадают из проверки молча');
    assert(/1/.test(пункт.t), 'в тревоге должно быть число позиций: ' + пункт.t);
    // чужая сумка в счёт не попадает — это ответственность другого человека
    const сЧужой = await loadDB(base({
      session: 3,
      users: [{ id: 3, name: 'Другой', role: 'user', cars: [], bags: [2] }],
      bags: [{ id: 1, name: 'Моя', items: [{ name: 'Адреналин', expiry: '' }] },
             { id: 2, name: 'Чужая', items: [{ name: 'Анальгин', expiry: '' }] }]
    }));
    const чужие = сЧужой.alerts().find(x => x.noDate);
    assert(/^Без срока годности: 1 /.test(чужие.t), 'считается только своя сумка, получено: ' + чужие.t);
  });

  test('просрочка видна по ответственности: сотруднику — своё, руководителю — всё', async () => {
    // Правило станции: сотрудник отвечает за назначенные сумки, свои машины
    // и их укладки, и видеть просрочку по чужим сумкам ему не нужно. Раньше
    // список брался по всем сумкам станции, и человек получал красный отчёт
    // и тревогу из-за сумки, которую не вёл.
    const просрочка = '2020-01-01';
    const станция = {
      bags: [
        { id: 1, name: 'Моя сумка', items: [{ name: 'Адреналин', expiry: просрочка }] },
        { id: 2, name: 'Чужая сумка', items: [{ name: 'Анальгин', expiry: просрочка }] }
      ],
      cars: [
        { id: 3, name: 'Моя машина', kits: [{ id: 31, name: 'Реанимационная', items: [{ name: 'Атропин', expiry: просрочка }] }] },
        { id: 4, name: 'Чужая машина', kits: [{ id: 41, name: 'Травматологическая', items: [{ name: 'Димедрол', expiry: просрочка }] }] }
      ],
      potents: [{ id: 50, name: 'НС комплект', items: [{ name: 'Морфин', expiry: просрочка }] }]
    };
    const сотрудник = await loadDB(base({
      ...станция, session: 2,
      users: [{ id: 2, name: 'С', role: 'user', cars: [3], bags: [1] }]
    }));
    const вижу = сотрудник.soonList().map(x => x.item.name).sort();
    eq(вижу, ['Адреналин', 'Атропин', 'Морфин'],
      'сотрудник видит только свою сумку, свою укладку и общие НС');
    assert(вижу.indexOf('Анальгин') < 0, 'просрочка чужой сумки сотруднику показываться не должна');
    assert(вижу.indexOf('Димедрол') < 0, 'просрочка чужой машины сотруднику показываться не должна');

    const нач = await loadDB(base({
      ...станция, session: 1,
      users: [{ id: 1, name: 'Р', role: 'lead', cars: [], bags: [] }]
    }));
    const всё = нач.soonList().map(x => x.item.name).sort();
    eq(всё, ['Адреналин', 'Анальгин', 'Атропин', 'Димедрол', 'Морфин'],
      'руководитель видит просрочку по всей станции');

    // Без назначений — видно всё. Это осознанное решение перед заливкой:
    // строгий вариант означал бы, что человек увидит ноль просрочки и
    // отчитается «всё проверил», а за пропуск штрафуют. Ограничение
    // включается само, как только назначения появятся.
    const без = await loadDB(base({
      ...станция, session: 2,
      users: [{ id: 2, name: 'С', role: 'user', cars: [], bags: [] }]
    }));
    eq(без.soonList().map(x => x.item.name), ['Адреналин', 'Анальгин', 'Атропин', 'Димедрол', 'Морфин'],
      'без назначений сотрудник не должен ничего пропускать — значит видит всю просрочку станции');
  });

  test('кэш сводных списков разделён по вошедшему', () => {
    // Список просрочки зависит от того, кто вошёл. Если ключ кэша не включает
    // пользователя, то на одном телефоне при смене смены прежнему могут
    // показаться данные прежнего — а это данные об ответственности.
    const src = read('db.js');
    const ключ = src.match(/const _ck = [\s\S]*?;/);
    assert(!!ключ, 'не нашёл ключ кэша');
    assert(/DB\.session/.test(ключ[0]),
      'ключ кэша списков обязан включать сессию — иначе после смены пользователя покажется чужой список просрочки');
  });

  test('машины видны всем, а перечень оборудования ведёт только руководитель', () => {
    // Правило станции: сотрудник приходит на любую машину, проверяет её,
    // заполняет ячейки, пишет дефекты и отправляет отчёт. Перечень
    // оборудования с номерами ОВМ, статусы, укладки, название, госномер и
    // удаление машины правит только руководитель или админ. Назначение на
    // машину прав НЕ даёт — в отличие от сумок.
    const views = read('views.js');
    const список = views.match(/export function carsView[\s\S]*?\n}/);
    assert(!!список, 'не нашёл carsView');
    const код = список[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert(/DB\.cars\.forEach/.test(код),
      'машины должны быть видны всем: сотрудник отчитывается по той машине, на которой работал, и это не обязательно назначенная');
    assert(!/myCars\(\)/.test(код),
      'список машин не должен фильтроваться по назначению — иначе сотрудник не сможет отчитаться по чужой машине');
    const экран = views.match(/export function carView[\s\S]*?\n}/);
    assert(!!экран, 'не нашёл carView');
    const код2 = экран[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert(/openRep/.test(код2), 'отчёт по смене должен быть доступен с любой машины');
    // управление — только руководителю
    assert(/const свой = isBoss\(\)/.test(код2),
      'внутри машины право управления должно быть isBoss(), а не назначением: ОВМ правит только ответственный');
  });

  test('дефекты и отметки по оборудованию пишет любой сотрудник', () => {
    // Отдельно от управления: сотрудник при проверке заполняет ячейки и пишет
    // дефекты. Это сообщение руководству, а не правка учёта, поэтому
    // ограничивать его нельзя — иначе дефект в поле останется незамеченным.
    const views = read('views.js');
    const строка = views.match(/data-act="setCh"[\s\S]{0,400}/);
    assert(!!строка, 'не нашёл поля отметки заряда в списке оборудования');
    assert(!/isBoss\(\)[^]{0,200}data-act="setCh"/.test(views),
      'поле отметки не должно быть спрятано от сотрудника — им он сообщает о неисправности');
    assert(/data-act="setDef"/.test(views), 'поле «недочёт» должно быть доступно');
  });

  test('экран сумок показывает сотруднику только назначенное', () => {
    // Правило станции: руководитель и админ распоряжаются всем, сотрудник —
    // только тем, на что он назначен. Найдено вживую: любой из двенадцати
    // видел все сумки и мог удалить чужую, а удаление необратимо (могила).
    // Ключевое: myBags() была написана под это правило, но не подключалась.
    const views = read('views.js');
    const экран = views.match(/export function bagsView[\s\S]*?\n}/);
    assert(!!экран, 'не нашёл bagsView');
    // комментарии вырезаем: там объяснение правила со словами «myBags()»,
    // и проверка искала бы само себя
    const код = экран[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert(/myBags\(\)/.test(код),
      'bagsView должен брать myBags() — иначе сотрудник видит сумки, которые ему не назначены, даже когда назначения есть');
    assert(!/видны\s*=\s*isBoss\(\)\s*\?\s*DB\.bags/.test(код),
      'bagsView не должен обходить ограничение собственным условием — это правило живёт в myBags()');
    // и когда назначений нет, человек должен понимать, почему список полный
    assert(/безНазначений\(\)/.test(код),
      'при отсутствии назначений нужна подсказка — иначе полный список выглядит как ошибка');
  });

  test('удаление сумки защищено в обработчике, а не только спрятанной кнопкой', () => {
    // Удаление ставит могилу на id, и сумка больше не вернётся ни с одного
    // телефона. Спрятать кнопку мало: вызов можно сделать и вручную, что и
    // было сделано в проверке.
    const boot = read('boot.js');
    const уд = boot.match(/window\.delBag[\s\S]*?\n};/);
    assert(!!уд, 'не нашёл delBag');
    assert(/isBoss\(\)/.test(уд[0]), 'в delBag обязана быть проверка прав');
    assert(/myBags\(\)/.test(уд[0]),
      'сотруднику должно быть можно удалить только назначенную ему сумку, а не любую');
    // сравнение должно быть по строке: id приходит из data-arg строкой
    assert(/String\(b\.id\)\s*===\s*String\(id\)|String\(id\)\s*===\s*String\(b\.id\)/.test(уд[0]),
      'сравнение id должно приводить к строке, иначе назначение не сработает');
  });

  test('очистка графика смен закрыта не только кнопкой, но и самим обработчиком', () => {
    // Найдено вживую: обычный сотрудник видел «🗑 Очистить» и мог стереть
    // весь график станции. Очистка ставит могилы на каждую строку, поэтому
    // записи не вернутся ни с одного телефона. Модель приложения однозначна:
    // удаление отчёта, правка машин, шаблонов и очистка чата — только у
    // руководителя (reports.js:124 ставит такую же проверку в обработчике).
    const boot = read('boot.js');
    const очистка = boot.match(/window\.clearShiftGrid[\s\S]*?\n};/);
    assert(!!очистка, 'не нашёл обработчик очистки графика');
    assert(/if\s*\(!isBoss\(\)\)/.test(очистка[0]),
      'в обработчике очистки обязана быть проверка isBoss() — спрятать кнопку мало, вызов можно сделать вручную');
    // и кнопка не показывается тем, кому нельзя
    const views = read('views.js');
    const кнопка = views.match(/clearShiftGrid/);
    assert(!!кнопка, 'кнопка очистки должна остаться — руководителю она нужна');
    const блок = views.match(/isBoss\(\)[^]*?clearShiftGrid/);
    assert(!!блок, 'кнопка очистки показывается без проверки прав — обычный сотрудник её видит');
  });

  test('сброс устройства убирает локальные фото и предупреждает об этом', () => {
    // Кнопка называется «полный сброс», но ключ medshift_media оставался:
    // у человека оставались все фото смен, и сброс не делал того, что обещал.
    const boot = read('boot.js');
    const сброс = boot.match(/window\.doSafeReset[\s\S]*?\n};/);
    assert(!!сброс, 'не нашёл doSafeReset');
    assert(/medshift_media/.test(сброс[0]),
      'doSafeReset обязан удалять локальное хранилище фото — иначе сброс не полный');
    const диалог = boot.match(/window\.safeResetDlg[\s\S]*?\n};/);
    assert(!!диалог, 'не нашёл safeResetDlg');
    assert(/фото/i.test(диалог[0]), 'диалог обязан предупреждать, что локальные фото удалятся');
  });

  test('статус отчёта и его дата считаются в одном месте — копий быть не должно', () => {
    // Формула статуса отчёта была продублирована в трёх файлах и разошлась:
    // в списке на главной отчёт без статуса показывался «КРАСНЫЙ», а в
    // отчётах по машине в бейдж печаталось сырое r.status — слово
    // «undefined» прямо на экране. Копии удалены, все три места ведут на
    // общую формулу reportStatusOf/reportDateText.
    ['views.js', 'reports.js', 'db.js'].forEach(f => {
      const src = read(f);
      // Ищем именно цепочку «статус → цвет ярлыка» и подстановку сырого
      // статуса в разметку. Одиночная проверка «статус зелёный?» — это
      // фильтр (например, не тревожить по зелёному отчёту), а не копия
      // формулы, и ловить её нельзя.
      assert(!/status[^\n]*\?\s*'bG'\s*:\s*[^\n]*'bY'\s*:\s*[^\n]*'bR'/.test(src),
        f + ': нашлась своя цепочка «статус → цвет» — именно она разошлась с общей формулой');
      assert(!/'\s*\+\s*r\.status\s*\+/.test(src),
        f + ": в разметку попадает сырой r.status — у отчёта без статуса на экране появится слово «undefined»");
      assert(!/new Date\(r\.ts\)/.test(src),
        f + ': дата отчёта снова считается напрямую вместо reportDateText() — потерянная дата снова станет 1970 годом');
    });
    // и формула обязана быть чистой функцией, а не в разметке
    const logic = read('logic.js');
    assert(/export function reportStatusOf/.test(logic), 'reportStatusOf должен жить в logic.js');
    assert(/export function reportDateText/.test(logic), 'reportDateText должен жить в logic.js');
  });

  test('правки содержимого сумки проверяются в обработчике, а не только кнопкой', () => {
    // Единый паттерн пакета прав: проверка живёт внутри обработчика.
    // Скрытая кнопка не защищает — вызов доступен из консоли и по data-act,
    // а правка уезжает в общий синк на всю станцию.
    const boot = read('boot.js');
    ['renameBag', 'saveRenameBag', 'fillBagFromTpl', 'toggleEditBag', 'editBagItem',
      'delBagItemEdit', 'setExp', 'delItem', 'openItemDlg', 'saveItemDlg',
      'openImportDlg', 'doImport'].forEach(fn => {
      const m = boot.match(new RegExp('window\\.' + fn + ' = [\\s\\S]*?\\n};'));
      assert(!!m, 'не нашёл обработчик ' + fn);
      assert(/bagOk\(/.test(m[0]), fn + ': обязана быть проверка права на сумку — иначе чужую сумку правит кто угодно');
    });
    const ячейка = boot.match(/window\.cellEdit = [\s\S]*?\n};/);
    assert(!!ячейка, 'не нашёл cellEdit');
    assert(/bagOk\(p\[1\]\)/.test(ячейка[0]), 'cellEdit для позиции сумки обязан проверять право');
    // а само правило — назначение или руководитель, не «любой вошедший»
    const db = read('db.js');
    const правило = db.match(/export function canUseBag[\s\S]*?\n}/);
    assert(!!правило, 'не нашёл canUseBag');
    assert(/isBoss\(\)/.test(правило[0]) && /u\.bags/.test(правило[0]),
      'право на сумму даёт руководитель или назначение, а не факт входа');
  });

  test('назначение ответственности не даёт сотрудник самому себе', () => {
    // Эскалация прав: addResp не проверял ничего, и сотрудник назначал себе
    // любую сумку — вместе с правом её править. Запись уезжает в общий синк.
    const boot = read('boot.js');
    ['addResp', 'setRespSel', 'rmResp'].forEach(fn => {
      const m = boot.match(new RegExp('window\\.' + fn + ' = [\\s\\S]*?\\n};'));
      assert(!!m, 'не нашёл обработчик ' + fn);
      assert(/bossOk\(\)|isBoss\(\)/.test(m[0]), fn + ': назначает только руководитель');
    });
  });

  test('оборудование, укладки и шаблоны правит руководитель — в обработчиках', () => {
    const boot = read('boot.js');
    ['delTpl', 'newTplDlg', 'addKitDo', 'addEquipItem', 'toggleEditKit', 'openKitItem',
      'saveKitItem', 'editKitItem', 'delKitItemEdit', 'setExpKit', 'delKitItem',
      'toggleEditTpl', 'addTplPos', 'delTplPos'].forEach(fn => {
      const m = boot.match(new RegExp('window\\.' + fn + ' = [\\s\\S]*?\\n};'));
      assert(!!m, 'не нашёл обработчик ' + fn);
      assert(/bossOk\(\)|isBoss\(\)/.test(m[0]), fn + ': обязана быть проверка isBoss()');
    });
    // а на экране эти кнопки тоже не показываются всем
    const views = read('views.js');
    const укладка = views.match(/function kitView[\s\S]*?\n}/);
    assert(!!укладка, 'не нашёл kitView');
    assert(/canE/.test(укладка[0]) && /isBoss\(\)/.test(укладка[0]),
      'кнопки добавления и удаления позиции укладки должны быть за isBoss()');
  });

  test('чат: очищает руководитель, писать может только вошедший', () => {
    const chat = read('chat.js');
    const очистка = chat.match(/export function clearChat[\s\S]*?\n}/);
    assert(!!очистка, 'не нашёл clearChat');
    assert(/isBoss\(\)/.test(очистка[0]), 'clearChat обязана проверять права — висит на window');
    const отправка = chat.match(/export function sendMsg[\s\S]*?\n}/);
    assert(!!отправка, 'не нашёл sendMsg');
    assert(/const u = me\(\)/.test(отправка[0]) && /if \(!u\)/.test(отправка[0]),
      'без входа отправка должна останавливаться до добавления сообщения — иначе в чате «аноним»');
  });

  test('фото удаляет автор или руководитель, и автор записывается при загрузке', () => {
    const boot = read('boot.js');
    const удаление = boot.match(/window\.delPhoto = [\s\S]*?\n};/);
    assert(!!удаление, 'не нашёл delPhoto');
    assert(/photoCanDelete\(/.test(удаление[0]), 'delPhoto обязана проверять право — удаление уезжает на всю станцию');
    const правило = boot.match(/function photoCanDelete[\s\S]*?\n}/);
    assert(!!правило, 'не нашёл photoCanDelete');
    assert(/isBoss\(\)/.test(правило[0]), 'руководитель может всегда');
    assert(/p\.by/.test(правило[0]), 'автор снимка может удалить своё');
    // автор должен записываться при загрузке — иначе правило не о ком
    assert(/by: DB\.session/.test(boot), 'при загрузке фото/документа нужен автор (by)');
    // кнопка 🗑 показывается только тому, кто может удалить
    const просмотр = boot.match(/window\.openPhoto = [\s\S]*?\n};/);
    assert(!!просмотр, 'не нашёл openPhoto');
    assert(/photoCanDelete\(p\)/.test(просмотр[0]), 'кнопка удаления фото должна отсекаться по праву');
  });

  test('warnDays: 0 — валидное значение, а не повод подставить 10', async () => {
    // +el.value || 10 превращал 0 в 10: «показывать всё» выставить было нельзя.
    const boot = read('boot.js');
    const сеттер = boot.match(/window\.setWarnDays = [\s\S]*?\n};/);
    assert(!!сеттер, 'не нашёл setWarnDays');
    const код = сеттер[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert(/Number\.isFinite/.test(код), 'проверка обязана быть числом, а не ||');
    assert(!/\|\| 10/.test(код), 'подстановка через || снова съест ноль');
  });

  test('дата рождения сверяется с календарём до записи', () => {
    // «31 февраля» сохранялось молча, и напоминание не срабатывало никогда.
    const boot = read('boot.js');
    const уст = boot.match(/window\.setBday = [\s\S]*?\n};/);
    assert(!!уст, 'не нашёл setBday');
    assert(/getFullYear|getMonth|getDate/.test(уст[0]), 'без сверки с календарём несуществующая дата снова сохранится');
  });

  test('профиль правится только вошедшим — me() проверяется', () => {
    const boot = read('boot.js');
    ['setName', 'setPhone', 'setBday'].forEach(fn => {
      const m = boot.match(new RegExp('window\\.' + fn + ' = [\\s\\S]*?\\n};'));
      assert(!!m, 'не нашёл ' + fn);
      assert(/const u = me\(\); if \(!u\)/.test(m[0]), fn + ': без проверки me() вызов из консоли роняет обработчик');
    });
    const views = read('views.js');
    const экран = views.match(/export function setView[\s\S]*?\n}/);
    assert(!!экран, 'не нашёл setView');
    assert(/if \(!u\) return/.test(экран[0]), 'setView без входа обязан вернуть пусто, а не упасть на u.name');
  });

  test('setFontSize понимает оба делегата: (el) и (arg, el)', () => {
    // input-делегат зовёт fn(arg, el), change-делегат — fn(el). Раньше
    // setFontSize брал первый аргумент за элемент: живое обновление во время
    // движения ползунка молча падало в catch, найдено живым прогоном.
    const boot = read('boot.js');
    const сеттер = boot.match(/window\.setFontSize = [\s\S]*?\n};/);
    assert(!!сеттер, 'не нашёл setFontSize');
    assert(/'value' in Object/.test(сеттер[0]) || /el = el \|\| a/.test(сеттер[0]),
      'setFontSize обязан выбирать элемент из двух вариантов вызова — иначе input-делегат роняет обновление');
  });

  test('ползунок шрифта: живой во время движения и максимум как в базе', () => {
    // Подпись ехала только на отпускании, а max=22 спорил с 10–30 в normalizeDB.
    const views = read('views.js');
    assert(/max="30"/.test(views), 'максимум ползунка обязан совпадать с normalizeDB (30)');
    const boot = read('boot.js');
    const делегат = boot.match(/document\.addEventListener\('input'[\s\S]*?\n\}\);/);
    assert(!!делегат, 'не нашёл input-делегата');
    assert(/setFontSize/.test(делегат[0]), 'ползунок шрифта обязан обновлять подпись во время движения, а не на отпускании');
  });

  test('пустой список сумок объясняется словами', () => {
    const views = read('views.js');
    const экран = views.match(/export function bagsView[\s\S]*?\n}/);
    assert(!!экран, 'не нашёл bagsView');
    assert(/Попросите руководителя/.test(экран[0]), 'пустота без объяснения похожа на ошибку загрузки');
  });

  test('сервис-воркер: версия в запросе не мешает офлайну, dev-кэш не сносит боевой', async () => {
    const fs = await import('node:fs');
    const read = f => fs.readFileSync(new URL(f, new URL('../', import.meta.url)), 'utf8');
    const sw = read('sw.js');
    // index.html просит ./boot.js?v=2.6.1, в precache лежит голый ./boot.js
    assert(/url\.pathname/.test(sw), 'запрос с ?v= обязан сниматься до голого URL при поиске в кэше');
    assert(/throw new Error/.test(sw), 'без версии в config.js установка обязана прерываться, а не ставить dev-кэш');
    assert(/medshift-cache-dev/.test(sw) && /return Promise\.resolve\(\)/.test(sw),
      'запасной dev-кэш не должен сносить боевой при активации');
  });

  test('устройство без входа не публикуется в онлайн станции', () => {
    const sync = read('sync.js');
    const бит = sync.match(/export function presBeat[\s\S]*?\n}/);
    assert(!!бит, 'не нашёл presBeat');
    const кодБит = бит[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert(!/гость/.test(кодБит), '«гость» в онлайне раздувал счётчик и светил устройство до входа');
    assert(/if \(u\)/.test(кодБит), 'публикация — только при наличии сессии');
  });

  test('все index.html data-act имеют обработчик', () => {
    const acts = new Set();
    (html.match(/data-act="[^"]+"/g) || []).forEach(m => acts.add(m.slice(10, -1)));
    const src = ['boot.js', 'ui.js', 'views.js', 'reports.js', 'chat.js', 'weather.js', 'seasons.js', 'db.js', 'sync.js', 'auth.js', 'background.js']
      .map(f => { try { return read(f); } catch { return ''; } }).join('\n');
    const q = String.fromCharCode(34), ap = String.fromCharCode(39);
    const orphan = [...acts].filter(a => {
      const needle = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return !(src.indexOf(q + needle + q) >= 0 || src.indexOf(ap + needle + ap) >= 0);
    });
    eq(orphan.length, 0, 'data-act без обработчика: ' + orphan.join(', '));
  });
});

/* =====================================================================
   Справочник лекарств вынесен из index.html в drugs.js и грузится по
   надобности (drugload.js). Проверяем четыре вещи: он не вернулся в
   разметку, он остался в офлайн-кэше, он действительно догружается по
   требованию, и — главное — станция получает ту же самую заготовку базы.
   ===================================================================== */
suite('сборка · ленивая загрузка справочника', async () => {
  const fs = await import('node:fs');
  const root = new URL('../', import.meta.url);
  const read = f => fs.readFileSync(new URL(f, root), 'utf8');
  const html = read('index.html');
  const sw = read('sw.js');
  const seedSrc = read('seed.js');
  const drugsSrc = read('drugs.js');
  const assets = (sw.match(/var ASSETS = \[([\s\S]*?)\];/) || [])[1] || '';
  const cached = new Set((assets.match(/'\.\/([^']+)'/g) || []).map(s => s.slice(3, -1)));
  const W = globalThis.window;

  test('drugs.js не подключается в index.html — иначе 73 КБ снова тормозят запуск', () => {
    assert(!/<script[^>]+drugs\.js/.test(html),
      'в index.html снова есть <script src="drugs.js">: он должен догружаться по надобности (drugload.js)');
    assert(/<script[^>]+seed\.js\?v=/.test(html),
      'в index.html должен остаться <script src="seed.js?v=..."> — из него db.js берёт заготовку сумки на старте');
  });

  test('seed.js, drugload.js и drugs.js в офлайн-кэше — иначе в поле всё отвалится', () => {
    // drugs.js в ASSETS остался специально: он грузится по надобности, но
    // надобность наступает обычно уже без сети.
    ['seed.js', 'drugload.js', 'drugs.js'].forEach(f => assert(cached.has(f), f + ' должен быть в sw.js ASSETS'));
  });

  test('seed.js не содержит справочника — иначе разделение теряет смысл', () => {
    assert(!/var DRUG_DB/.test(seedSrc), 'в seed.js снова появился DRUG_DB (весь файл — 73 КБ ради одной строки)');
    assert(!/window\.DRUG_DB/.test(seedSrc), 'в seed.js снова появился window.DRUG_DB');
    ['window.SEED=', 'var RE=', 'var TR=', 'var AK=', 'var TM=', 'var EQ=', 'window.POTENT_SEED='].forEach(m =>
      assert(seedSrc.indexOf(m) >= 0, 'в seed.js нет ' + m));
    assert(seedSrc.length < 30000, 'seed.js подозрительно велик: ' + seedSrc.length + ' символов');
    assert(drugsSrc.length > seedSrc.length * 2, 'похоже, файлы перепутаны местами');
  });

  test('список сильнодействующих в seed.js совпадает с фильтром по справочнику', () => {
    // db.js раньше брал эти позиции из DRUG_DB по знаку ⚕ в группе. Теперь он
    // берёт их из POTENT_SEED, потому что большого справочника на старте
    // ещё нет. Если эти два списка разойдутся, укладка «Сильнодействующие»
    // у новых телефонов будет отличаться от старых — тихо и незаметно.
    const pot = arr => arr.map(r => ({ name: r[0], spec: r[1], unit: r[2], qty: 1, expiry: '', potent: true }));
    const fromSeed = pot(new Function('return ' + (seedSrc.match(/window\.POTENT_SEED=([\s\S]*?);\n/) || [])[1])());
    const dbTxt = drugsSrc.match(/var DRUG_DB=\[[\s\S]*?\n\];/)[0].replace(/^var DRUG_DB=/, 'return ').replace(/;$/, '');
    const fromDb = pot(new Function(dbTxt)().filter(d => (d.g || '').indexOf('⚕') >= 0).map(d => [d.n, d.s, d.u]));
    assert(fromSeed.length > 0, 'POTENT_SEED пуст');
    eq(fromSeed, fromDb, 'POTENT_SEED разошёлся с DRUG_DB — укладка «Сильнодействующие» будет другой');
  });

  test('первая установка создаёт сумку и укладку НС/ПВ без большого справочника', async () => {
    // Ровно то состояние, в котором оказывается новый телефон при первом
    // запуске: seed.js уже выполнился, drugs.js ещё нет.
    delete W.DRUG_DB;
    runScript('seed.js');
    const m = await loadDB(base());
    m.seedBasics();
    const bag = m.DB.bagTypes.find(b => b.name === 'Рабочая сумка');
    const potKit = m.DB.kitTemplates.find(k => /Сильнодейств/.test(k.name));
    assert(bag && bag.items.length > 100, 'заготовка «Рабочая сумка» не создалась: ' + (bag ? bag.items.length : 'нет сумки'));
    ['Реанимационная', 'Травматологическая', 'Акушерская', 'Термосумка'].forEach(nm =>
      assert(m.DB.kitTemplates.some(k => k.name === nm && k.items.length > 0), 'укладка «' + nm + '» пустая'));
    assert(potKit && potKit.items.length > 0, 'укладка «Сильнодействующие» пустая — на новом телефоне нечем работать');
    eq(potKit.items.length, 24, 'состав сильнодействующих изменился');
    // и он реально помечен potent
    assert(potKit.items.every(i => i.potent === true), 'в укладке НС/ПВ есть не potent-позиции');
  });

  test('старый seed.js без POTENT_SEED не ломает базу — есть запасной путь', async () => {
    // Файл мог остаться в кэше service worker от прежней версии. Тогда
    // POTENT_SEED нет, и db.js обязан взять те же записи из DRUG_DB.
    delete W.SEED; delete W.RE; delete W.TR; delete W.AK; delete W.TM; delete W.EQ; delete W.POTENT_SEED;
    runScript('seed.js'); delete W.POTENT_SEED;
    runScript('drugs.js');
    const m = await loadDB(base());
    m.seedBasics();
    const potKit = m.DB.kitTemplates.find(k => /Сильнодейств/.test(k.name));
    eq((potKit || {}).items ? potKit.items.length : 0, 24, 'без POTENT_SEED укладка НС/ПВ собралась не из DRUG_DB');
    delete W.DRUG_DB;
  });

  test('справочник догружается по требованию: ensureDrugs() даёт DRUG_DB', async () => {
    delete W.DRUG_DB;
    const dl = await import('../drugload.js?d=' + (++n));
    eq(dl.drugsState(), 'idle', 'до первого обращения справочник не должен считаться загруженным');
    eq(dl.drugsReady(), false, 'DRUG_DB не должно существовать до загрузки');
    const ok = await dl.ensureDrugs();
    eq(ok, true, 'ensureDrugs() не смог загрузить drugs.js');
    eq(dl.drugsState(), 'ready', 'состояние должно стать ready');
    eq((W.DRUG_DB || []).length, 382, 'справочник загрузился не полностью');
    // повторный вызов не должен ни падать, ни перезапрашивать файл
    eq(await dl.ensureDrugs(), true, 'повторный вызов ensureDrugs() обязан быть безобидным');
    delete W.DRUG_DB;
  });

  test('подвал сам дописывает число препаратов, когда справочник догрузился', async () => {
    // Подвал рисуется вместе с экраном, когда drugs.js ещё нет, и пишет
    // «справочник по надобности». Если после фоновой загрузки его не
    // обновить, человек будет думать, что справочник сломан. Обновлять
    // надо сам подвал, а не весь экран: в этот момент может быть открыт
    // диалог, и полная перерисовка его бы закрыла.
    delete W.DRUG_DB;
    const el = globalThis.__setEl('footLine', { textContent: '' });
    const v = await import('../views.js?v=' + (++n));
    const dl = await import('../drugload.js');
    v.updateFoot();
    assert(/справочник по надобности/.test(el.textContent),
      'до загрузки подвал должен говорить «по надобности», а не молчать: ' + el.textContent);
    eq(await dl.ensureDrugs(), true, 'справочник не загрузился');
    v.updateFoot();
    assert(/382/.test(el.textContent), 'после догрузки подвал должен показать число препаратов: ' + el.textContent);
    globalThis.__resetEls();
    delete W.DRUG_DB;
  });

  test('подвал не врёт: при неудачной загрузке пишет про неудачу, а не «по надобности»', async () => {
    // Состояние failed — это не «ещё не грузили». Человек должен видеть, что
    // файл не пришёл, иначе он будет искать препарат в пустоте и думать, что
    // препарата нет в базе.
    // Берём экземпляр БЕЗ суффикса: именно к нему привязан views.js
    // (`import ... from './drugload.js'`). Экземпляр с суффиксом — другой
    // модуль со своим состоянием, и проверка была бы в пустоту.
    const el = globalThis.__setEl('footLine', { textContent: '' });
    const dl = await import('../drugload.js');
    // рвём сеть: любой запрос drugs.js теперь падает
    networkDown();
    let ret;
    try { ret = await dl.ensureDrugs(true); } finally { networkUp(); }
    eq(ret, false, 'недоступный drugs.js обязан вернуть false, а не упасть или зависнуть');
    eq(dl.drugsState(), 'failed', 'после неудачи состояние должно быть failed, а не ready');
    const v = await import('../views.js?g=' + (++n));
    v.updateFoot();
    assert(/не загрузил/i.test(el.textContent), 'подвал должен честно сказать про неудачу: ' + el.textContent);
    // и повторная попытка после неудачи обязана быть возможна: сеть чинится,
    // телефон уезжает в зону покрытия. Промах с состоянием 'failed' навсегда
    // оставил бы станцию без справочника до перезапуска приложения.
    eq(await dl.ensureDrugs(), true, 'после неудачи повторная попытка обязана снова грузить файл');
    globalThis.__resetEls();
    delete W.DRUG_DB;
  });

  test('boot.js зовёт updateFoot после фоновой загрузки — иначе подвал навсегда «по надобности»', () => {
    // Связка двух файлов: drugload.js отдаёт обещание, boot.js на его
    // исполнение зовёт updateFoot. Проверяем по исходнику, потому что
    // прогнать весь boot.js в тестах нельзя (он тянет за собой DOM, сеть
    // и localStorage, а тесты делят один экземпляр БД).
    const boot = read('boot.js');
    const m = boot.match(/preloadDrugs\(\)[\s\S]{0,200}?updateFoot\(\)/);
    assert(!!m, 'boot.js должен вызвать updateFoot() по обещанию preloadDrugs() — иначе подвал не обновится');
  });
});

/* вспомогательное для теста соли */
async function m_hash(pin, salt) {
  const d = new TextEncoder().encode(salt + ':' + pin);
  const b = await crypto.subtle.digest('SHA-256', d);
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}

await runAll();
process.exit(report() ? 1 : 0);
