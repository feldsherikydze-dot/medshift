/* =====================================================================
   Сквозная проверка синхронизации на ДВУХ устройствах.

   Запуск:  node tests/sync-e2e.mjs

   Модульные тесты проверяют слияние на подставных объектах. Этот файл
   гоняет НАСТОЯЩИЙ sync.js по настоящему HTTP между двумя независимыми
   node-процессами через заглушку Firebase. Именно тут ловятся баги
   «удалённое воскресает», «офлайн-правка теряется», «две правки двоятся» —
   на них уже приходилось два фикса вслепую.
   ===================================================================== */
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startFakeFB } from './fakefb.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'medshift-e2e-'));

let passed = 0, failed = 0;
const fails = [];
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; fails.push(msg); console.log('  ✗ ' + msg); }
}
function section(t) { console.log('\n' + t); }

const fb = await startFakeFB();
console.log('Заглушка Firebase: ' + fb.url);

/* Один «запуск устройства»: сценарий + его собственное состояние на входе.
   Устройства-вкладки: A (первый телефон) и B (второй).
   Состояние ОБЯЗАТЕЛЬНО передаём: телефон не переустанавливается между
   шагами сценария. Раньше carry не передавался, устройство стартовало с
   пустым хранилищем, правки офлайн не находили своих объектов — и падало
   не приложение, а харнесс. */
const devs = { A: null, B: null };
async function run(dev, scenario) {
  const carry = devs[dev];
  const f = join(tmp, dev + '-' + scenario + '.json');
  if (carry !== undefined) writeFileSync(f, JSON.stringify(carry));
  const out = await new Promise((res, rej) => {
    execFile(process.execPath, [join(HERE, 'device.mjs'), scenario, fb.url, carry !== undefined ? f : ''],
      { encoding: 'utf8', timeout: 30000 }, (e, so, se) => {
        if (e && !so) return rej(new Error('устройство ' + dev + '/' + scenario + ' упало: ' + (se || e.message)));
        res(so);
      });
  });
  let r;
  try { r = JSON.parse(out); } catch { throw new Error('не разобрал вывод устройства: ' + out.slice(0, 400)); }
  if (r.err) throw new Error('внутри устройства ' + dev + '/' + scenario + ': ' + r.err);
  devs[dev] = r.db;
  dump(dev + ' → ' + scenario);
  return r.db;
}
const bagNames = db => db.bags.map(b => b.name);
const shiftRow = (db, date) => db.shiftGrid.find(r => r.date === date);

/* Раскладка состояния после каждого шага — чтобы падение читалось, а не угадывалось. */
const DEBUG = process.env.E2E_DEBUG === '1';
function state(dev) {
  const d = devs[dev];
  if (!d) return dev + '{ ещё не запускался }';
  return dev + '{ rev=' + d.rev + ' bags=[' + bagNames(d).join(';') + '] tomb=[' + (d.bagTomb || []).join(';') +
    '] grid=[' + d.shiftGrid.map(r => r.date + ':' + r.staff + '@' + (r.upd || 0)).join('; ') + ']' +
    ' gridTomb=[' + (d.shiftTomb || []).join(';') + '] }';
}
const dump = (why) => { if (DEBUG) console.log('    ' + why + '\n      A: ' + state('A') + '\n      B: ' + state('B')); };

try {

section('Станция заводится, второе устройство забирает базу');
await run('A', 'seed');
ok(devs.A.users.length === 2, 'первое устройство создало 2 сотрудников');
await run('B', 'pull');
ok(devs.B.users.length === 2, 'второе устройство получило 2 сотрудников');
ok(devs.B.bags.length === 1, 'сумка доехала до второго устройства');
ok(shiftRow(devs.B, '2026-10-01') !== undefined, 'график смен доехал до второго устройства');

section('Правка офлайн не теряется');
await run('B', 'add-bag');
ok(bagNames(devs.B).indexOf('Сумка 2 (второе устройство)') >= 0, 'второе устройство создало свою сумку');
await run('A', 'pull2');
ok(bagNames(devs.A).indexOf('Сумка 2 (второе устройство)') >= 0,
  'СВОЯ сумка второго устройства доехала до первого — офлайн-правка не потерялась');

section('Удалённое не воскресает (могила числом)');
await run('A', 'del-bag');
ok(devs.A.bags.every(b => String(b.id) !== '1'), 'сумка удалена на первом устройстве');
ok(bagNames(devs.A).indexOf('Сумка 2 (второе устройство)') >= 0,
  'чужая сумка при этом уцелела: ' + bagNames(devs.A).join(' | '));
await run('B', 'pull3');
ok(devs.B.bags.every(b => String(b.id) !== '1'),
  'удалённая сумка НЕ вернулась на второе устройство: ' + bagNames(devs.B).join(' | '));

section('Удалённое не воскресает (могила строкой — исторический баг)');
await run('A', 'del-bag-wrong-type');
ok(devs.A.bags.length === 0, 'обе сумки удалены на первом устройстве');
await run('B', 'pull4');
ok(devs.B.bags.length === 0,
  'удалённое не вернулось даже при могиле-строке: ' + bagNames(devs.B).join(' | '));

section('График смен: правка и дополнение не теряются');
await run('A', 'shift-edit');
ok(shiftRow(devs.A, '2026-10-01').staff === 'Петрова', 'строка отредактирована на первом устройстве');
await run('B', 'shift-add');
ok(shiftRow(devs.B, '2026-10-01') !== undefined, 'первая строка на месте у второго устройства');
ok(shiftRow(devs.B, '2026-10-02') !== undefined, 'вторая строка добавлена вторым устройством');
await run('A', 'pull5');
ok(shiftRow(devs.A, '2026-10-01').staff === 'Петрова', 'правка первой строки не затерлась');
ok(shiftRow(devs.A, '2026-10-02') !== undefined, 'строка второго устройства доехала до первого');
ok(devs.A.shiftGrid.length === 2, 'строк ровно 2, удвоения нет: ' + devs.A.shiftGrid.length);

section('Удалённая строка графика не воскресает');
await run('A', 'del-shift');
ok(!shiftRow(devs.A, '2026-10-02'), 'строка удалена на первом устройстве');
await run('B', 'pull6');
ok(!shiftRow(devs.B, '2026-10-02'),
  'удалённая строка НЕ вернулась на второе устройство');

section('Офлайн-правка удалённой строки не воскресает её');
/* Раскрытие ограничения, а не бага: могилы применяются при СЛИЯНИИ
   (adoptState), локальная база сама себя не чистит. Поэтому устройство,
   дописавшее удалённую строку офлайн, видит её у себя до следующего
   успешного забора — но строка не доезжает до сервера в виде accepted,
   могила её отсекает, и на следующем заборе устройство чинит себя само.
   Проверяем именно этот контракт, а не мгновенное исчезновение. */
await run('B', 'del-shift-again');
ok((devs.B.shiftTomb || []).indexOf('2026-10-02|Б|2') >= 0, 'у устройства B есть могила этой строки');
ok(shiftRow(devs.B, '2026-10-02') !== undefined,
  'B дописал удалённую строку офлайн и видит её у себя до забора — ожидаемое поведение');
await run('A', 'pull7');
ok(!shiftRow(devs.A, '2026-10-02'),
  'Но сервер могилу уважает: первое устройство воскрешённую строку не приняло');
await run('B', 'pull8');
ok(!shiftRow(devs.B, '2026-10-02'),
  'на следующем заборе устройство вылечило себя само: строка исчезла и у него');

section('Удалённый сотрудник не возвращается вместе с PIN-хэшем');
await run('A', 'del-user');
ok(devs.A.users.every(u => String(u.id) !== '2'), 'сотрудник удалён на первом устройстве');
await run('B', 'pull9');
ok(devs.B.users.every(u => String(u.id) !== '2'),
  'удалённый сотрудник не вернулся на второе устройство: ' + devs.B.users.map(u => u.name).join(' | '));
ok(devs.B.users.every(u => !String(u.name).includes('Петрова')), 'фамилия удалённого сотрудника отсутствует');

section('Отчёт долетает и не теряет автора');
await run('B', 'report');
await run('A', 'pull9');
ok(devs.A.reports.length >= 1, 'отчёт доехал до первого устройства');
ok((devs.A.reports[0] || {}).author === 'Петрова Мария', 'автор отчёта сохранился');

} catch (e) {
  failed++; fails.push('сбой сценария: ' + e.message);
  console.log('\n✗ СБОЙ: ' + e.message);
} finally {
  await fb.close();
}

console.log('\n────────────────────────────────────────────────────');
if (failed) {
  console.log('Провалено: ' + failed + ', прошло: ' + passed);
  fails.forEach(f => console.log('  • ' + f));
  process.exit(1);
}
console.log('Все сквозные проверки синхронизации прошли: ' + passed);
