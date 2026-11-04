// Счётчик воронки: исполняем настоящие функции на подставном KV. Лишний шаг не должен
// создавать ключи, а сбой счётчика не должен задевать страницу.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const a = readFileSync('app.js', 'utf8');
const { funnelHit, funnelText, FUNNEL_STEPS } = new Function('cors',
  w.match(/^const FUNNEL_STEPS = \[[\s\S]*?^\];/m)[0] + '\n' +
  w.match(/^const FUNNEL_FAIL_CODE = .*$/m)[0] + '\n' +
  w.match(/^async function funnelHit[\s\S]*?^\}/m)[0] + '\n' +
  w.match(/^async function funnelText[\s\S]*?^\}/m)[0] +
  '\nreturn { funnelHit, funnelText, FUNNEL_STEPS };')((body, status) => ({ body, status }));
const store = new Map();
const env = { RATE_LIMIT: { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) } };
const req = (x) => ({ json: async () => { if (x === 'bad') throw new Error('bad'); return x; } });

assert.equal((await funnelHit(req({ step: 'visit' }), env)).status, 204);
await funnelHit(req({ step: 'visit' }), env);
await funnelHit(req({ step: 'result' }), env);
assert.equal(store.size, 2, 'на два шага два ключа');
assert.equal([...store].find(([k]) => k.endsWith(':visit'))[1], '2', 'повтор прибавляется');
for (const x of [{ step: 'hack' }, { step: '__proto__' }, {}, 'bad']) await funnelHit(req(x), env);
assert.equal(store.size, 2, 'неизвестный шаг и мусор ключей не создают');

// Ошибки по кодам: известный код считается как есть, произвольная строка — как other.
for (const code of ['E-REF', 'E-REF', 'H502', 'x'.repeat(500)]) await funnelHit(req({ step: 'ai_fail', code }), env);
const errKeys = [...store.keys()].filter((k) => k.startsWith('fnerr:'));
assert.equal(errKeys.length, 1, 'коды одного дня лежат в одном ключе');
assert.deepEqual(JSON.parse(store.get(errKeys[0])), { 'E-REF': 2, H502: 1, other: 1 });
await funnelHit(req({ step: 'visit', code: 'E-REF' }), env);
assert.equal(JSON.parse(store.get(errKeys[0]))['E-REF'], 2, 'код без ai_fail не считается');

const text = await funnelText(env, 7);
assert.match(text, /Открыли сайт: 3 \(100%\)/);
assert.match(text, /Увидели результат: 1 \(33%\)/);
assert.match(text, /Ошибки по кодам: E-REF 2, H502 1, other 1/);

// Каждый шаг, который шлёт сайт, воркер должен знать: иначе он молча не посчитается.
const sent = [...a.matchAll(/fmStep\("(\w+)"[,)]/g)].map((m) => m[1]);
assert.ok(sent.length >= 9, 'шаги на сайте пропали');
for (const s of new Set(sent)) assert.ok(FUNNEL_STEPS.some((x) => x[0] === s), 'воркер не знает шаг ' + s);
assert.match(a, /else fmStep\("ai_fail", data\.code \|\| data\.error\)/, 'отказ сервера должен считаться с кодом');
for (const s of ['auth_ok', 'sub_ok']) assert.ok(sent.includes(s), 'сайт не шлёт ' + s);
assert.match(a, /fmStep\("gate_" \+ gs\)/, 'гейт после входа снова не считается');

// Слова на гейте: положение относительно среднего, без оценки.
const gateGeoWord = new Function(a.match(/^function gateGeoWord[\s\S]*?^\}/m)[0] + '; return gateGeoWord;')();
assert.equal(gateGeoWord({ value: 1.2, avg: 1 }), 'pwGeoAbove');
assert.equal(gateGeoWord({ value: 1.05, avg: 1 }), 'pwGeoNear');
assert.equal(gateGeoWord({ value: 0.8, avg: 1 }), 'pwGeoBelow');
const render = a.match(/^function renderGateGeo[\s\S]*?^\}/m)[0];
assert.ok(!/r\.verdict/.test(render), 'на гейте снова оценочные слова');
console.log('счётчик воронки и слова на гейте: все проверки прошли');
