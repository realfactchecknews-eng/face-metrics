// Дуэль оценивает каждое лицо отдельным запросом. В паре модель раздвигает лица
// (замер 14.09: 5.9 в обычном разборе, 6.9 в дуэли), поэтому балл берётся из отдельной
// оценки, а общий ответ остаётся запасным.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pick = (s, re) => { const m = s.match(re); assert.ok(m, 'не нашёл: ' + re); return m[0]; };
const { parseCompare, duelRatePrompt } = new Function(`
  var CMP_CATS = [];
  var PSL_SCALE_PROMPT = "SCALE";
  ${pick(src, /var PSL_MID = \d+;/)}
  ${pick(src, /var PSL_MAX = \d+;/)}
  ${pick(src, /var RARITY_LADDER = \[[\s\S]*?\]\.join\("\\n"\);/)}
  ${pick(src, /var RARITY_INSTRUCTIONS = [^\n]*/)}
  ${pick(src, /^function duelRatePrompt[\s\S]*?^\}/m)}
  ${pick(src, /^function normInv[\s\S]*?^\}/m)}
  ${pick(src, /^function scoreFromRarity[\s\S]*?^\}/m)}
  ${pick(src, /  function parseCompare\(txt, rates\)\{[\s\S]*?\n  \}/)}
  return { parseCompare, duelRatePrompt };
`)();

const pair = 'RAR_A: ХУЖЕ 1 из 4\nRAR_B: ЛУЧШЕ 1 из 550\nSCORE_A: 3.9\nSCORE_B: 6.9\nWINNER: B\nVERDICT: B mogs.';
const alone = ['РЕДКОСТЬ: ЛУЧШЕ 1 из 2', 'РЕДКОСТЬ: ЛУЧШЕ 1 из 35'];

let r = parseCompare(pair, alone);
assert.equal(r.a, 4, 'балл A из отдельной оценки, а не из пары');
assert.equal(r.b, 5.9, 'балл B из отдельной оценки: 5.9, как в обычном разборе, а не 6.9');

r = parseCompare(pair, null);
assert.equal(r.b, 6.9, 'без отдельной оценки — запасной путь через RAR_B');
r = parseCompare(pair, [null, 'РЕДКОСТЬ: ЛУЧШЕ 1 из 35']);
assert.ok(Math.abs(r.a - 3.3) < 0.05 && r.b === 5.9, 'упал один запрос — только это лицо берётся из пары');

r = parseCompare('RAR_A: ЛУЧШЕ 1 из 6\nRAR_B: ЛУЧШЕ 1 из 5\nWINNER: B', ['РЕДКОСТЬ: ЛУЧШЕ 1 из 44', 'РЕДКОСТЬ: ЛУЧШЕ 1 из 2']);
assert.equal(r.winner, 'A', 'при заметном разрыве победитель — по независимым баллам');
r = parseCompare('WINNER: B', ['РЕДКОСТЬ: ЛУЧШЕ 1 из 6', 'РЕДКОСТЬ: ЛУЧШЕ 1 из 5']);
assert.equal(r.winner, 'B', 'почти равных оставляем на вердикт модели');

const p = duelRatePrompt();
assert.match(p, /РЕДКОСТЬ|\u0420\u0415\u0414\u041a\u041e\u0421\u0422\u042c/, 'отдельная оценка просит ту же строку редкости');
assert.match(p, /1 \u0438\u0437 44: model level/, 'и ту же лестницу, что обычный разбор');
assert.ok(/" \+ RARITY_INSTRUCTIONS \+ "/.test(src), 'обычный разбор берёт инструкцию из той же переменной');

// Воркер: по одному запросу на лицо, одна картинка в каждом, ошибка одного — null.
const worker = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const rateFacesSeparately = new Function('fetch', pick(worker, /^async function rateFacesSeparately[\s\S]*?^\}/m) + '\nreturn rateFacesSeparately;');
const sent = [];
const fakeFetch = async (url, opts) => {
  const b = JSON.parse(opts.body); sent.push(b);
  if (b.messages[0].content[0].image_url.url.endsWith('BAD')) throw new Error('network');
  return { json: async () => ({ choices: [{ message: { content: 'РЕДКОСТЬ: ЛУЧШЕ 1 из 6' } }] }) };
};
const out = await rateFacesSeparately(fakeFetch)({ OPENROUTER_API_KEY: 'k' }, 'm', ['AAA', 'BAD', 'CCC'], 'rate');
assert.deepEqual(out, ['РЕДКОСТЬ: ЛУЧШЕ 1 из 6', null], 'два лица, упавший запрос — null, третья картинка не уходит');
assert.equal(sent.length, 2, 'ровно два запроса');
sent.forEach((b) => {
  assert.equal(b.messages[0].content.filter((c) => c.type === 'image_url').length, 1, 'одна фотография на запрос');
  assert.equal(b.temperature, 0, 'температура 0, как в обычном разборе');
});
assert.match(worker, /rates \}\);/, 'воркер отдаёт rates в ответе');

console.log('дуэль: все проверки прошли');
