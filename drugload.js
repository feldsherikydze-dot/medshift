/* =====================================================================
   Ленивая загрузка справочника лекарств.

   drugs.js — 73 КБ (382 препарата). Раньше он подключался в index.html
   обычным <script>, то есть разбирался ДО первой отрисовки на каждом
   запуске и на каждом устройстве станции. Теперь он не мешает старту:
   файл подтягивается, когда человек первый раз ищет препарат, и один
   раз в фоне, когда браузер освободился.

   Что это даёт: первый экран рисуется, не дожидаясь 73 КБ, на слабых
   телефонах это заметные миллисекунды, а на нормальных — заметно.
   Офлайн не ломается: drugs.js остаётся в списке ASSETS у service
   worker, поэтому в поле без сети файл отдаётся из кэша.

   Правила:
     — загрузка одна на сессию, повторные вызовы ждут тот же файл;
     — неудача не роняет приложение, а возвращает false: вызывающий
       решает, что показать (обычно «справочник не загрузился»);
     — повторный вызов после неудачи не ловится на том же обещании,
       иначе после одной сетевой ошибки справочник не подгрузился бы
       до перезапуска приложения.
   ===================================================================== */
import { VERSION } from './config.js';

/* idle — ещё не пробовали, loading — грузится, ready — на руках,
   failed — не получилось. Подвал и поиск показывают разное в зависимости
   от этого, потому что «нет файла» и «ещё не грузили» — разные вещи. */
let _state = 'idle';
let _p = null;

export function drugsState() {
  return _state;
}
export function drugsReady() {
  return _state === 'ready' && !!(window.DRUG_DB && window.DRUG_DB.length);
}

/* force=true — заново, даже если уже грузили: этим чинится битый файл
   (обрыв записи на телефоне раньше ломал справочник до перезапуска). */
export function ensureDrugs(force) {
  if (drugsReady() && !force) return Promise.resolve(true);
  if (_p && !force) return _p;
  _state = 'loading';
  _p = new Promise(resolve => {
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      _state = ok ? 'ready' : 'failed';
      resolve(_state === 'ready');
    };
    const s = document.createElement('script');
    s.src = 'drugs.js?v=' + (force ? Date.now() : VERSION);
    s.async = true;
    s.onload = () => finish(!!(window.DRUG_DB && window.DRUG_DB.length));
    s.onerror = () => { _p = null; finish(false); };
    document.head.appendChild(s);
  });
  return _p;
}

/* Фоновая подгрузка, когда браузеру нечем заняться. Сама по себе ничего
   не рисует и никого не ждёт: кто первый ищет препарат, тот и не заметит.
   Обещание возвращается, чтобы вызывающий мог узнать, когда файл на руках
   (так подвал дописывает себе число препаратов). */
export function preloadDrugs() {
  if (drugsReady()) return Promise.resolve(true);
  return new Promise(resolve => {
    const run = () => { ensureDrugs().then(resolve, () => resolve(false)); };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 });
    else setTimeout(run, 1200);
  });
}

/* Общая обёртка для двух мест, где нужен справочник: вкладка «Справочник»
   и поиск лекарства в диалогах. Пока drugs.js не на руках — в el пишется
   loadingText, файл догружается, и render() ставит настоящее содержимое.
   render() обязан сам наполнить el.
   noLoad=true — мы внутри колбэка той же загрузки: без этой отметки
   неудачная загрузка вызывала бы ensureDrugs() снова и снова (каждая
   попытка порождала бы следующую). */
export function withDrugs(el, loadingText, failedText, render, noLoad) {
  if (!el) return;
  if (drugsReady()) { render(); return; }
  el.innerHTML = drugsState() === 'failed' ? failedText : loadingText;
  if (noLoad) return;
  ensureDrugs().then(ok => { if (ok) render(); else el.innerHTML = failedText; });
}
