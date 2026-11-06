// Автоповтор при обрыве сети: быстрый обрыв повторяем один раз, долгий — нет, иначе
// готовый и уже списанный анализ спишется второй раз.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const a = readFileSync('app.js', 'utf8');
const src = a.match(/^var FETCH_RETRY_MS = .*$/m)[0] + '\n' + a.match(/^async function fetchAiOnce[\s\S]*?^\}/m)[0];
let calls, clock;
const make = (plan) => new Function('fetch', 'Date', 'setTimeout', 'WORKER_URL', src + '\nreturn fetchAiOnce;')(
  async () => { calls++; const step = plan.shift(); clock += step.ms; if (step.fail) throw new TypeError(step.fail); return { ok: true }; },
  { now: () => clock }, (f) => f(), 'https://x');

calls = 0; clock = 0;
assert.deepEqual(await make([{ ms: 300, fail: 'Failed to fetch' }, { ms: 9000 }])('{}'), { ok: true });
assert.equal(calls, 2, 'быстрый обрыв надо повторить');

calls = 0; clock = 0;
await assert.rejects(make([{ ms: 15000, fail: 'Load failed' }, { ms: 100 }])('{}'));
assert.equal(calls, 1, 'долгий обрыв повторять нельзя: анализ мог быть уже списан');

calls = 0; clock = 0;
await assert.rejects(make([{ ms: 100, fail: 'Failed to fetch' }, { ms: 100, fail: 'Failed to fetch' }])('{}'));
assert.equal(calls, 2, 'повтор ровно один');

calls = 0; clock = 0;
await assert.rejects(make([{ ms: 100, fail: 'Unexpected token' }])('{}'));
assert.equal(calls, 1, 'не сетевую ошибку не повторяем');
console.log('автоповтор при обрыве сети: все проверки прошли');
