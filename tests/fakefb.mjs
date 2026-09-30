/* =====================================================================
   Заглушка Firebase Realtime Database REST — только для тестов.

   Нужна, чтобы прогнать НАСТОЯЩИЙ код sync.js по настоящему HTTP-протоколу
   между двумя «устройствами». Модульные тесты проверяли слияние на
   подставных объектах и ни разу не проходили круг
   «устройство → сервер → устройство», где живут самые дорогие баги.

   Поддерживает ровно то, чем пользуется приложение:
     GET    /path.json      — отдать значение (404, если нет)
     PUT    /path.json      — записать значение целиком
     DELETE /path.json      — удалить
   Значения — обычный JSON. Вложенность задаётся путём через «/».
   ===================================================================== */
import { createServer } from 'node:http';

export function startFakeFB() {
  const store = {};           // «база» сервера: ключ пути → значение
  const log = [];             // журнал запросов — по нему видно, куда ходили

  const seg = p => p.split('/').filter(Boolean);

  function get(path) {
    let cur = store;
    for (const s of seg(path)) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[s];
    }
    return cur;
  }
  function set(path, val) {
    const s = seg(path);
    if (!s.length) { Object.keys(store).forEach(k => delete store[k]); Object.assign(store, val); return; }
    let cur = store;
    for (let i = 0; i < s.length - 1; i++) {
      if (cur[s[i]] == null || typeof cur[s[i]] !== 'object') cur[s[i]] = {};
      cur = cur[s[i]];
    }
    cur[s[s.length - 1]] = val;
  }
  function del(path) {
    const s = seg(path);
    if (!s.length) { Object.keys(store).forEach(k => delete store[k]); return; }
    let cur = store;
    for (let i = 0; i < s.length - 1; i++) {
      if (cur[s[i]] == null || typeof cur[s[i]] !== 'object') return;
      cur = cur[s[i]];
    }
    delete cur[s[s.length - 1]];
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const path = decodeURIComponent(url.pathname).replace(/\.json$/, '');
    // CORS не нужен для node, но пригодится, если запускать в браузере
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      log.push(req.method + ' /' + path);
      if (req.method === 'GET') {
        const v = get(path);
        if (v === undefined) { res.writeHead(404); res.end('null'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(v));
      } else if (req.method === 'PUT') {
        set(path, body ? JSON.parse(body) : null);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(get(path)));
      } else if (req.method === 'DELETE') {
        del(path);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('null');
      } else {
        res.writeHead(405); res.end();
      }
    });
  });

  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        url: 'http://127.0.0.1:' + port,
        store, log,
        put: (p, v) => { set(p, v); },
        get,
        close: () => new Promise(r => server.close(r))
      });
    });
  });
}
