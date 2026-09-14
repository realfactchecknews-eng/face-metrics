// Замеры гайда на той же шкале PSL 0-8, что обычный разбор. Главное — чтобы воркер и
// сайт считали одно и то же, и чтобы старые замеры из 10 не обрушили график.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const workerSrc = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const pick = (s, re) => { const m = s.match(re); assert.ok(m, 'не нашёл: ' + re); return m[0]; };

const W = new Function(`
  ${pick(workerSrc, /^const PSL_MID = \d+;/m)}
  ${pick(workerSrc, /^const PSL_MAX = \d+;/m)}
  ${pick(workerSrc, /^const RARITY_LADDER = \[[\s\S]*?\]\.join\('\\n'\);/m)}
  ${pick(workerSrc, /^function normInv[\s\S]*?^\}/m)}
  ${pick(workerSrc, /^function scoreFromRarity[\s\S]*?^\}/m)}
  ${pick(workerSrc, /^function normalizeMeasureText[\s\S]*?^\}/m)}
  const PROG_CATS = ['СИММЕТРИЯ', 'КОЖА'];
  ${pick(workerSrc, /^function parseScores[\s\S]*?^\}/m)}
  const MEASURE_BASE = ${pick(workerSrc, /^const MEASURE_BASE = (`[\s\S]*?`);/m).replace(/^const MEASURE_BASE = /, '').replace(/;$/, '')};
  ${pick(workerSrc, /^function buildMeasurePrompt[\s\S]*?^\}/m)}
  return { RARITY_LADDER, scoreFromRarity, normalizeMeasureText, parseScores, buildMeasurePrompt, MEASURE_BASE };
`)();
const A = new Function(`
  ${pick(app, /var PSL_MID = \d+;/)}
  ${pick(app, /var PSL_MAX = \d+;/)}
  ${pick(app, /var RARITY_LADDER = \[[\s\S]*?\]\.join\("\\n"\);/)}
  ${pick(app, /^function normInv[\s\S]*?^\}/m)}
  ${pick(app, /^function scoreFromRarity[\s\S]*?^\}/m)}
  ${pick(app, /^function measureOverallPsl[\s\S]*?^\}/m)}
  return { RARITY_LADDER, scoreFromRarity, measureOverallPsl };
`)();

assert.equal(W.RARITY_LADDER, A.RARITY_LADDER, 'лестница в воркере и на сайте совпадает слово в слово');
for (const line of ['ЛУЧШЕ 1 из 2', 'ЛУЧШЕ 1 из 44', 'ХУЖЕ 1 из 15', 'ЛУЧШЕ 1 из 500', 'ХУЖЕ 1 из 10000000'])
  assert.equal(W.scoreFromRarity('РЕДКОСТЬ: ' + line), A.scoreFromRarity('РЕДКОСТЬ: ' + line), 'одинаковый PSL: ' + line);

const report = 'РЕДКОСТЬ: ЛУЧШЕ 1 из 44\n\nОБЩИЙ_БАЛЛ: 5.5/8\nЛицо сильное.\n\nСИММЕТРИЯ: 6.5/10\nКОЖА: 7/10\n\nКАЧЕСТВО_СЪЁМКИ: СОПОСТАВИМО';
let sc = W.parseScores(report);
assert.equal(sc.overall, 5.5, 'общий балл замера — «/8» модели: он с десятыми, график прогресса строится по нему');
assert.deepEqual(sc.cats, { 'СИММЕТРИЯ': 6.5, 'КОЖА': 7 }, 'категории по-прежнему из 10');
assert.equal(W.parseScores('ОБЩИЙ_БАЛЛ: 4.6/8\nКОЖА: 5/10').overall, 4.6, 'без строки редкости — ОБЩИЙ_БАЛЛ из 8');
assert.equal(W.parseScores('РЕДКОСТЬ: ЛУЧШЕ 1 из 44\nКОЖА: 5/10').overall, 6, 'нет «/8» — запасной путь через редкость');
assert.equal(W.parseScores('ОБЩИЙ_БАЛЛ: 9.4/8').overall, 8, 'выше 8 не бывает, даже если модель ошиблась');

const norm = W.normalizeMeasureText(report);
assert.ok(!/РЕДКОСТЬ/.test(norm), 'строка редкости не показывается человеку');
assert.match(norm, /^ОБЩИЙ_БАЛЛ: 5\.5\/8$/m, 'балл модели с десятыми в тексте сохраняется');
assert.equal(W.parseScores(norm).overall, 5.5, 'текст и график показывают одно число');
const old10 = W.normalizeMeasureText('РЕДКОСТЬ: ЛУЧШЕ 1 из 44\nОБЩИЙ_БАЛЛ: 7.1/10\nКОЖА: 5/10');
assert.match(old10, /^ОБЩИЙ_БАЛЛ: 6\.0\/8$/m, 'модель по привычке написала «/10» — ставим PSL по редкости');
assert.equal(W.normalizeMeasureText('ОБЩИЙ_БАЛЛ: 4.6/8'), 'ОБЩИЙ_БАЛЛ: 4.6/8', 'без строки редкости текст не трогаем');

assert.match(W.MEASURE_BASE, /ОБЩИЙ_БАЛЛ: X\/8/, 'промпт просит общий балл из 8');
assert.match(W.MEASURE_BASE, /1 из 44: model level/, 'в промпт подставлена лестница');
assert.match(W.MEASURE_BASE, /СИММЕТРИЯ: X\/10/, 'категории в промпте остаются из 10');
assert.match(W.MEASURE_BASE, /различай десятые/, 'промпт просит общий балл с десятыми');

// Прошлые баллы модель видеть не должна — ни «/8», ни «/10», ни строку редкости.
const prompt = W.buildMeasurePrompt({}, [
  { t: Date.now() - 20 * 864e5, text: 'РЕДКОСТЬ: ХУЖЕ 1 из 6\nОБЩИЙ_БАЛЛ: 5.1/10\nСтарый.\nСИММЕТРИЯ: 5.5/10' },
  { t: Date.now() - 10 * 864e5, text: 'ОБЩИЙ_БАЛЛ: 6.0/8\nНовый, итого 6.0/8.\nКОЖА: 7.0/10\nРЕКОМЕНДАЦИИ:\n1. x' },
]);
const tail = prompt.slice(W.MEASURE_BASE.length);
assert.ok(!/[0-9]\s*\/\s*(8|10)\b/.test(tail), 'прошлые баллы скрыты: ' + (tail.match(/.{0,30}[0-9]\s*\/\s*(8|10).{0,10}/) || [''])[0]);
assert.ok(!/ХУЖЕ 1 из 6/.test(tail), 'прошлая строка редкости скрыта');

// Старые точки из 10 переводятся в PSL по якорям прежней шкалы, новые не трогаются.
assert.equal(A.measureOverallPsl({ overall: 5.3 }), 4.3);
assert.equal(A.measureOverallPsl({ overall: 8.2 }), 6.2);
assert.equal(A.measureOverallPsl({ overall: 6.0, scale: 8 }), 6.0, 'новая точка остаётся как есть');
assert.equal(A.measureOverallPsl({ overall: null }), null);

console.log('замеры гайда на PSL 0-8: все проверки прошли');
