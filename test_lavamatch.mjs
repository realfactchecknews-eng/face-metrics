// Сопоставление товара Lava с тарифом (28.11.2026): каталог Lava иногда молчит, и платёж
// «не сопоставлялся», хотя через минуты приходил повторно и начислялся сам.
// Запуск: node test_lavamatch.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const w = readFileSync('worker.js', 'utf8');
const cut = (name) => { const i = w.indexOf(name); return w.slice(i, w.indexOf('\n}\n', i) + 2); };
const src = [cut('function lavaOfferIds'), cut('async function lavaCatalog'), cut('async function lavaPackIdByProductId')].join('\n');
const make = (fetchImpl, store) => new Function('fetch', 'PACKS', src + '; return lavaPackIdByProductId;')(fetchImpl, { p1: {}, p5: {} });

const store = new Map();
const env = { LAVA_API_KEY: 'k', LAVA_OFFER_IDS: JSON.stringify({ p1: 'off-1', p5: 'off-5' }),
  RATE_LIMIT: { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); }, delete: async (k) => { store.delete(k); } } };
const catalog = { items: [{ id: 'prod-A', offers: [{ id: 'other' }, { id: 'off-1' }] }] };
let calls = 0;
const down = async () => { calls++; return new Response('busy', { status: 503 }); };
const up = async () => { calls++; return new Response(JSON.stringify(catalog)); };

// Каталог молчит → undefined («не знаем»), а не null («товара нет»), и с одним повтором.
calls = 0; assert.strictEqual(await make(down)(env, 'prod-A'), undefined); assert.strictEqual(calls, 2, 'один повтор');
// Каталог ответил → тариф найден по любому офферу товара и запомнен.
assert.strictEqual(await make(up)(env, 'prod-A'), 'p1');
assert.strictEqual(store.get('lavaprod:prod-A'), 'p1', 'соответствие сохранено в KV');
// Дальше каталог может лежать — тариф берётся из KV, без запроса.
calls = 0; assert.strictEqual(await make(down)(env, 'prod-A'), 'p1'); assert.strictEqual(calls, 0, 'кэш без запроса к Lava');
// Чужой товар при живом каталоге → null.
assert.strictEqual(await make(up)(env, 'prod-X'), null);
// Сбой и самоначисление: тревога помнит contractId, успешный путь её снимает и пишет админу.
const hook = w.slice(w.indexOf('async function lavaWebhook'), w.indexOf('async function cryptoWebhook'));
assert.match(hook, /put\(`lavafail:\$\{upd\.contractId\}`/, 'сбой запоминается');
assert.match(hook, /get\(`lavafail:\$\{upd\.contractId\}`\)[\s\S]*Вручную НЕ выдавай/, 'начисление после сбоя снимает тревогу');
console.log('lava: сопоставление тарифа — все проверки пройдены');
