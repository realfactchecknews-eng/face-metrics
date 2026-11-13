// Мини-приложение: данные входа из хеша переживают стирание хеша, обычный визит
// мини-аппом не считается, звёзды в мини-аппе открываются родным окном оплаты.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const a = readFileSync('app.js', 'utf8');
const w = readFileSync('worker.js', 'utf8');
const iife = a.match(/^var TG_MINI = (\(function \(\) \{[\s\S]*?^\}\)\(\));/m)[1];

function run(hash, store) {
  const ss = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  return new Function('location', 'sessionStorage', 'return ' + iife)({ hash }, ss);
}

const store = {};
const data = 'query_id=AAA&user=%7B%22id%22%3A42%7D&auth_date=1&hash=x';
const m = run('#tgWebAppData=' + encodeURIComponent(data) + '&tgWebAppVersion=7.0&tgWebAppStartParam=analyze', store);
assert.equal(m.initData, data, 'initData декодирован один раз');
assert.equal(m.start, 'analyze');
assert.deepEqual(run('', store), m, 'после стирания хеша данные берутся из sessionStorage');
assert.equal(run('#analyze', {}), null, 'обычный визит — не мини-апп');

const buy = a.match(/^function buyPack[\s\S]*?^\}/m)[0];
assert.match(buy, /W\.openInvoice\(d\.link/, 'звёзды в мини-аппе — через openInvoice');
assert.match(buy, /window\.location\.href = d\.link/, 'вне мини-аппа оплата как раньше');
assert.ok(w.includes("['mini', 'Открыли как мини-апп']"), 'воркер не знает шаг mini');
assert.match(w.match(/^async function authWebApp[\s\S]*?^\}/m)[0], /rememberUsername/, 'вход из мини-аппа не запоминает ник');
assert.match(buy, /src: TG_MINI \? "mini" \+/, 'сайт не говорит воркеру, откуда открыт счёт');
const srcOf = (start) => new Function('TG_MINI', 'return ' + buy.match(/src: (TG_MINI \?.*?: "site")/)[1])(start === undefined ? null : { start });
assert.equal(srcOf('ads_ch'), 'mini:ads_ch', 'метка объявления не доходит до покупки');
assert.equal(srcOf('analyze'), 'mini');
assert.equal(srcOf(undefined), 'site');
const okSrc = new RegExp(w.match(/\/(\^mini\(:ads_[^/]+)\/\.test\(body\.src/)[1]);
assert.ok(okSrc.test('mini:ads_ch') && !okSrc.test('mini:<script>') && !okSrc.test('x'), 'воркер пропускает мусор в src');
assert.match(w.match(/^async function buy\([\s\S]*?^\}/m)[0], /buysrc:\$\{sess\.id\}/, '/buy не запоминает источник счёта');
assert.match(w.match(/^async function recordOrder[\s\S]*?^\}/m)[0], /buysrc:[\s\S]*src/, 'покупка не получает метку источника');
const mk = w.match(/^function menuKb[\s\S]*?^\}/m)[0];
assert.equal((mk.match(/kbAnalyze, web_app: \{ url: MINIAPP_ANALYZE_URL \}/g) || []).length, 2, '«Начать анализ» в боте не открывает мини-апп');
assert.match(w, /MINIAPP_ANALYZE_URL = 'https:\/\/facerate\.ru\/\?[^']*open=analyze/, 'мини-апп из бота не ведёт сразу к загрузке');
console.log('мини-приложение: все проверки прошли');
