// Сырой адрес → дружественный UQ…. Ошибка здесь = токены уходят не туда,
// поэтому сверяемся с реальными адресами из блокчейна. Запуск: node test_address.mjs
import assert from 'node:assert';
import { rawToFriendly } from './worker.js';

// Пары взяты из tonapi: кошелёк владельца и мастер-контракт FACE.
assert.strictEqual(
  rawToFriendly('0:af0f50facd496f48f446b39027dbfcef1bd1307c09d351899a46f9a196c812cf'),
  'UQCvD1D6zUlvSPRGs5An2_zvG9EwfAnTUYmaRvmhlsgSz8I7');
assert.strictEqual(
  rawToFriendly('0:dcc5bfc08cdc0b9e77f7df571f177cd820bc8baa9d5bedf4bc866daa2d3aaa23', true),
  'EQDcxb_AjNwLnnf331cfF3zYILyLqp1b7fS8hm2qLTqqIyjb');

// Уже дружественный адрес не портим, пустое не ломает.
assert.strictEqual(rawToFriendly('UQCvD1D6zUlvSPRGs5An2_zvG9EwfAnTUYmaRvmhlsgSz8I7'),
                   'UQCvD1D6zUlvSPRGs5An2_zvG9EwfAnTUYmaRvmhlsgSz8I7');
assert.strictEqual(rawToFriendly(null), null);

// Длина всегда 48 символов, префикс UQ для кошелька.
const a = rawToFriendly('0:' + 'ab'.repeat(32));
assert.strictEqual(a.length, 48);
assert.ok(a.startsWith('UQ'), 'кошелёк должен быть non-bounceable (UQ)');

console.log('адреса: все проверки пройдены');
