// Проверка ton_proof: раскладка байтов сообщения и путь проверки подписи.
// Запуск: node test_tonproof.mjs
import assert from 'node:assert';
import { generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { tonProofDigest, ed25519Verify, hexBytes } from './worker.js';

const V = {
  wc: 0,
  hashHex: 'dcc5bfc08cdc0b9e77f7df571f177cd820bc8baa9d5bed74bc866daa2d3aaa23',
  domain: 'facerate.ru',
  ts: 1756728000,
  payload: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
};

const d1 = await tonProofDigest(V);
assert.strictEqual(d1.length, 32, 'дайджест должен быть 32 байта');
assert.deepStrictEqual([...await tonProofDigest(V)], [...d1], 'дайджест не детерминирован');

// Каждое поле обязано влиять на результат — иначе поле выпало из раскладки.
for (const [field, val] of [['wc', -1], ['hashHex', 'ab'.repeat(32)], ['domain', 'evil.com'],
                            ['ts', V.ts + 1], ['payload', 'deadbeef']]) {
  const d = await tonProofDigest({ ...V, [field]: val });
  assert.notDeepStrictEqual([...d], [...d1], `поле ${field} не влияет на дайджест`);
}

// Подпись настоящим ed25519-ключом проходит, испорченная и чужая — нет.
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
const sig = nodeSign(null, Buffer.from(d1), privateKey);

assert.ok(await ed25519Verify(pub, sig, d1), 'верная подпись должна проходить');
const bad = Buffer.from(sig); bad[0] ^= 0xff;
assert.ok(!(await ed25519Verify(pub, bad, d1)), 'испорченная подпись не должна проходить');
assert.ok(!(await ed25519Verify(pub, sig, await tonProofDigest({ ...V, payload: 'other' }))),
  'подпись не должна подходить к другому payload');

assert.deepStrictEqual([...hexBytes('00ff10')], [0, 255, 16]);

console.log('ton_proof: все проверки пройдены');
