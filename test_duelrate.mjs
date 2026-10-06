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
  ${pick(src, /var PSL_SLOPE = [\d.]+;/)}
  ${pick(src, /var RARITY_LADDER = \[[\s\S]*?\]\.join\("\\n"\);/)}
  ${pick(src, /var RARITY_ANCHORS = \[[\s\S]*?\]\.join\("\\n"\);/)}
  ${pick(src, /var RARITY_INSTRUCTIONS = [^\n]*/)}
  ${pick(src, /^function duelRatePrompt[\s\S]*?^\}/m)}
  ${pick(src, /^function normInv[\s\S]*?^\}/m)}
  ${pick(src, /^function scoreFromRarity[\s\S]*?^\}/m)}
  ${pick(src, /var METHOD_SCALE = [\s\S]*?";\n/)}
  ${pick(src, /var METHOD_GROUPS = [\s\S]*?";\n/)}
  ${pick(src, /var METHOD_INSTRUCTIONS = [\s\S]*?";\n/)}
  ${pick(src, /var FEATURE_WEIGHTS = \{[^}]*\};/)}
  ${pick(src, /var PILLAR_WEIGHTS = \{[^}]*\};/)}
  ${pick(src, /var PSL_FROM_METHOD = [\d.]+;/)}
  ${pick(src, /var METHOD_KEYS = \[[^\]]*\];/)}
  ${pick(src, /^function scoreFromPillars[\s\S]*?^\}/m)}
  ${pick(src, /  function parseCompare\(txt, rates\)\{[\s\S]*?\n  \}/)}
  return { parseCompare, duelRatePrompt };
`)();

const KEYS5 = ['HARMONY', 'DIMORPHISM', 'ANGULARITY', 'SKIN', 'HAIR', 'MOUTH', 'EYES', 'SYMMETRY', 'NOSE', 'EARS'].map((k) => k + ': 5.0').join('\n');
const pair = 'RAR_A: ХУЖЕ 1 из 4\nRAR_B: ЛУЧШЕ 1 из 550\nSCORE_A: 3.9\nSCORE_B: 6.9\nWINNER: B\nVERDICT: B mogs.';
const alone = ['РЕДКОСТЬ: ЛУЧШЕ 1 из 2', 'РЕДКОСТЬ: ЛУЧШЕ 1 из 35'];

let r = parseCompare(pair, alone);
assert.equal(r.a, 4, 'балл A из отдельной оценки, а не из пары');
assert.equal(r.b, 5.4, 'балл B из отдельной оценки (1 из 35), а не из пары (1 из 550 → 6.2)');

r = parseCompare(pair, null);
assert.equal(r.b, 6.2, 'без отдельной оценки — запасной путь через RAR_B');
r = parseCompare(pair, [null, 'РЕДКОСТЬ: ЛУЧШЕ 1 из 35']);
assert.ok(Math.abs(r.a - 3.5) < 0.05 && r.b === 5.4, 'упал один запрос — только это лицо берётся из пары');

r = parseCompare('RAR_A: ЛУЧШЕ 1 из 6\nRAR_B: ЛУЧШЕ 1 из 5\nWINNER: B', ['РЕДКОСТЬ: ЛУЧШЕ 1 из 44', 'РЕДКОСТЬ: ЛУЧШЕ 1 из 2']);
assert.equal(r.winner, 'A', 'при заметном разрыве победитель — по независимым баллам');
r = parseCompare('WINNER: B', ['РЕДКОСТЬ: ЛУЧШЕ 1 из 6', 'РЕДКОСТЬ: ЛУЧШЕ 1 из 5']);
assert.equal(r.winner, 'B', 'почти равных оставляем на вердикт модели');

const p = duelRatePrompt();
assert.match(p, /HARMONY: 0\.0/, 'отдельная оценка просит те же десять оценок, что и разбор');
assert.match(p, /5 is an ORDINARY man/, 'и ту же шкалу справочника');
assert.match(p, /young Leonardo DiCaprio/, 'и те же якорные лица');
assert.ok(!/PSL SCORING/.test(p), 'шкалы PSL здесь нет: общий балл этот запрос не пишет');
// Балл обоих лиц считается по методике, со старой редкостью как запасным путём.
assert.equal(parseCompare('WINNER: A', [KEYS5, KEYS5]).a, 4, 'обычное лицо в дуэли — ровно 4');
assert.ok(/duelRatePrompt[\s\S]{0,400}METHOD_INSTRUCTIONS/.test(src), 'дуэль берёт инструкцию методики из общей переменной');

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
