// Ключ кошелька из walletStateInit (TON Connect) без похода в tonapi/toncenter.
// Хэш-функция ячеек сверена 21.11.2026 на пяти живых кошельках (2× v4R2, 3× v5R1):
// хэш восстановленного StateInit совпал с адресом, ключ — с ответом tonapi.
// Здесь — офлайн-проверки на синтетических данных с настоящим кодом кошельков.
// Запуск: node test_tonstateinit.mjs
import assert from 'node:assert';
import { randomBytes } from 'node:crypto';
import { parseBoc, pubKeyFromStateInit } from './worker.js';

// Публичный код стандартных кошельков (одинаковый у всех, из блокчейна).
const CODE_V4R2 = 'te6cckECFAEAAtQAART/APSkE/S88sgLAQIBIAIDAgFIBAUE+PKDCNcYINMf0x/THwL4I7vyZO1E0NMf0x/T//QE0VFDuvKhUVG68qIF+QFUEGT5EPKj+AAkpMjLH1JAyx9SMMv/UhD0AMntVPgPAdMHIcAAn2xRkyDXSpbTB9QC+wDoMOAhwAHjACHAAuMAAcADkTDjDQOkyMsfEssfy/8QERITAubQAdDTAyFxsJJfBOAi10nBIJJfBOAC0x8hghBwbHVnvSKCEGRzdHK9sJJfBeAD+kAwIPpEAcjKB8v/ydDtRNCBAUDXIfQEMFyBAQj0Cm+hMbOSXwfgBdM/yCWCEHBsdWe6kjgw4w0DghBkc3RyupJfBuMNBgcCASAICQB4AfoA9AQw+CdvIjBQCqEhvvLgUIIQcGx1Z4MesXCAGFAEywUmzxZY+gIZ9ADLaRfLH1Jgyz8gyYBA+wAGAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRzdHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+ICASAKCwBZvSQrb2omhAgKBrkPoCGEcNQICEekk30pkQzmkD6f+YN4EoAbeBAUiYcVnzGEAgFYDA0AEbjJftRNDXCx+AA9sp37UTQgQFA1yH0BDACyMoHy//J0AGBAQj0Cm+hMYAIBIA4PABmtznaiaEAga5Drhf/AABmvHfaiaEAQa5DrhY/AAG7SB/oA1NQi+QAFyMoHFcv/ydB3dIAYyMsFywIizxZQBfoCFMtrEszMyXP7AMhAFIEBCPRR8qcCAHCBAQjXGPoA0z/IVCBHgQEI9FHyp4IQbm90ZXB0gBjIywXLAlAGzxZQBPoCFMtqEssfyz/Jc/sAAgBsgQEI1xj6ANM/MFIkgQEI9Fnyp4IQZHN0cnB0gBjIywXLAlAFzxZQA/oCE8tqyx8Syz/Jc/sAAAr0AMntVGliJeU=';
const CODE_V5R1 = 'te6cckECFAEAAoEAART/APSkE/S88sgLAQIBIAIDAgFIBAUBAvIOAtzQINdJwSCRW49jINcLHyCCEGV4dG69IYIQc2ludL2wkl8D4IIQZXh0brqOtIAg1yEB0HTXIfpAMPpE+Cj6RDBYvZFb4O1E0IEBQdch9AWDB/QOb6ExkTDhgEDXIXB/2zzgMSDXSYECgLmRMOBw4hAPAgEgBgcCASAICQAZvl8PaiaECAoOuQ+gLAIBbgoLAgFIDA0AGa3OdqJoQCDrkOuF/8AAGa8d9qJoQBDrkOuFj8AAF7Ml+1E0HHXIdcLH4AARsmL7UTQ1woAgAR4g1wsfghBzaWduuvLgin8PAeaO8O2i7fshgwjXIgKDCNcjIIAg1yHTH9Mf0x/tRNDSANMfINMf0//XCgAK+QFAzPkQmiiUXwrbMeHywIffArNQB7Dy0IRRJbry4IVQNrry4Ib4I7vy0IgikvgA3gGkf8jKAMsfAc8Wye1UIJL4D95w2zzYEAP27aLt+wL0BCFukmwhjkwCIdc5MHCUIccAs44tAdcoIHYeQ2wg10nACPLgkyDXSsAC8uCTINcdBscSwgBSMLDy0InXTNc5MAGk6GwShAe78uCT10rAAPLgk+1V4tIAAcAAkVvg69csCBQgkXCWAdcsCBwS4lIQseMPINdKERITAJYB+kAB+kT4KPpEMFi68uCR7UTQgQFB1xj0BQSdf8jKAEAEgwf0U/Lgi44UA4MH9Fvy4Iwi1woAIW4Bs7Dy0JDiyFADzxYS9ADJ7VQAcjDXLAgkji0h8uCS0gDtRNDSAFETuvLQj1RQMJExnAGBAUDXIdcKAPLgjuLIygBYzxbJ7VST8sCN4gAQk1vbMeHXTNCon9ZI';

const hex = (a) => [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));

// Минимальный сериализатор BOC для теста: порядок по убыванию глубины — ссылки всегда вперёд.
function serialize(root) {
  const all = [], seen = new Set();
  (function w(c) { if (seen.has(c)) return; seen.add(c); all.push(c); c.kids.forEach(w); })(root);
  all.sort((a, b) => b.depth - a.depth);
  const idx = new Map(all.map((c, i) => [c, i]));
  const body = [];
  for (const c of all) body.push(c.d1, c.d2, ...c.data, ...c.kids.map((k) => idx.get(k)));
  return Buffer.from([0xb5, 0xee, 0x9c, 0x72, 1, 4, all.length, 1, 0,
    ...[24, 16, 8, 0].map((s) => (body.length >> s) & 255), 0, ...body]).toString('base64');
}
const leaf = (bytes, bits) => {                // ячейка без ссылок с bits битами данных
  const len = Math.ceil(bits / 8), data = new Uint8Array(len); data.set(bytes.slice(0, len));
  if (bits % 8) data[len - 1] |= 0x80 >> (bits % 8);           // тег завершения
  return { d1: 0, d2: Math.floor(bits / 8) + len, data, kids: [], depth: 0 };
};
async function stateInit(codeB64, dataCell) {
  const [code] = await parseBoc(b64(codeB64));
  const [data] = await parseBoc(Buffer.from(serialize(dataCell), 'base64'));
  const root = { d1: 2, d2: 1, data: Uint8Array.from([0x34]), kids: [code, data], depth: Math.max(code.depth, data.depth) + 1 };
  const si = serialize(root);
  const [r] = await parseBoc(b64(si));
  return { si, addr: hex(r.hash) };
}

// 1. Хэши кода совпадают с таблицей в worker.js — иначе путь без сети молча не работает.
assert.strictEqual(hex((await parseBoc(b64(CODE_V4R2)))[0].hash), 'feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0');
assert.strictEqual(hex((await parseBoc(b64(CODE_V5R1)))[0].hash), '20834b7b72b112147e1b2fb457b84e74d1a30f04f737d4f62a668e9552d2b72f');

const key = randomBytes(32);
const id = Buffer.from([0x29, 0xa9, 0xa3, 0x17]);           // wallet_id 698983191

// 2. v4R2: seqno(32)=0, wallet_id(32), key(256), plugins(1)=0.
{
  const d = leaf(Buffer.concat([Buffer.alloc(4), id, key, Buffer.alloc(1)]), 321);
  const { si, addr } = await stateInit(CODE_V4R2, d);
  assert.strictEqual(hex(await pubKeyFromStateInit(si, addr)), hex(key), 'v4R2: ключ не извлёкся');
  assert.strictEqual(await pubKeyFromStateInit(si, 'ab'.repeat(32)), null, 'чужой адрес должен давать null');
}
// 3. v5R1: is_signature_allowed(1)=1, seqno(32)=0, wallet_id(32), key(256), extensions(1)=0 — сдвиг на бит.
{
  const raw = Buffer.concat([Buffer.alloc(4), id, key, Buffer.alloc(2)]);
  const sh = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i++) sh[i] = (raw[i] >> 1) | (i ? (raw[i - 1] & 1) << 7 : 0x80);
  const { si, addr } = await stateInit(CODE_V5R1, leaf(sh, 322));
  assert.strictEqual(hex(await pubKeyFromStateInit(si, addr)), hex(key), 'v5R1: ключ не извлёкся');
}
// 4. Незнакомый код — null (тогда воркер спрашивает сеть), а не ключ по угаданному смещению.
{
  const d = leaf(Buffer.concat([Buffer.alloc(8), key, Buffer.alloc(1)]), 321);
  const fake = serialize(leaf(Buffer.from('deadbeef', 'hex'), 32));
  const { si, addr } = await stateInit(fake, d);
  assert.strictEqual(await pubKeyFromStateInit(si, addr), null, 'незнакомый код не должен давать ключ');
}
// 5. Мусор вместо BOC — исключение (воркер его ловит и идёт в сеть).
await assert.rejects(pubKeyFromStateInit(Buffer.from('hello').toString('base64'), 'ab'.repeat(32)));

console.log('ton stateInit: все проверки пройдены');
