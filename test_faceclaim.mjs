// Начисления за задания: без кошелька не начисляем, дважды не начисляем,
// невыполненное не начисляем. Запуск: node test_faceclaim.mjs
import assert from 'node:assert';
import { faceClaim, FACE_TASKS } from './worker.js';

function fakeEnv(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { RATE_LIMIT: {
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => void m.delete(k),
  }, _m: m };
}
const pending = (env, tgid) => parseInt(env._m.get(`facepay:${tgid}`) || '0', 10);
const amount = (id) => FACE_TASKS.find((t) => t.id === id).amount;

// Задание не выполнено — ничего не начисляем.
let env = fakeEnv({ 'wallet:1': '0:aa' });
await faceClaim(env, 1, 'buy', 'ru');
assert.strictEqual(pending(env, 1), 0, 'начислили за невыполненное задание');

// Выполнено, кошелёк есть — начисляем ровно один раз.
env = fakeEnv({ 'wallet:1': '0:aa', 'everBought:1': '1' });
await faceClaim(env, 1, 'buy', 'ru');
assert.strictEqual(pending(env, 1), amount('buy'), 'не начислили за выполненное');
await faceClaim(env, 1, 'buy', 'ru');
assert.strictEqual(pending(env, 1), amount('buy'), 'повторный клик начислил второй раз');

// Разные задания суммируются.
env._m.set('guide:1', '1');
await faceClaim(env, 1, 'guide', 'ru');
assert.strictEqual(pending(env, 1), amount('buy') + amount('guide'), 'награды не суммируются');

// Без кошелька не начисляем — отправлять было бы некуда.
env = fakeEnv({ 'everBought:2': '1' });
await faceClaim(env, 2, 'buy', 'ru');
assert.strictEqual(pending(env, 2), 0, 'начислили без привязанного кошелька');

// Несуществующее задание не ломает и не начисляет.
env = fakeEnv({ 'wallet:3': '0:cc' });
await faceClaim(env, 3, 'nope', 'ru');
assert.strictEqual(pending(env, 3), 0);

console.log('начисления за задания: все проверки пройдены');
