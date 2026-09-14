// Балл из редкости «лучше/хуже 1 из N». Жалобы были ровно на края шкалы: потолок 8.2 и
// пол около 4.7. Здесь фиксируем, что края теперь достижимы и лежат там, где обещано.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pick = (re) => { const m = src.match(re); assert.ok(m, 'не нашёл в app.js: ' + re); return m[0]; };
const { scoreFromRarity, canthalTiltDeg, pslTier } = new Function(`
  ${pick(/var PSL_MID = \d+;/)}
  ${pick(/var PSL_MAX = \d+;/)}
  ${pick(/^function normInv[\s\S]*?^\}/m)}
  ${pick(/^function scoreFromRarity[\s\S]*?^\}/m)}
  ${pick(/^function canthalTiltDeg[\s\S]*?^\}/m)}
  ${pick(/var PSL_TIERS = \[[\s\S]*?\];/)}
  ${pick(/^function pslTier[\s\S]*?^\}/m)}
  return { scoreFromRarity, canthalTiltDeg, pslTier };
`)();

// PSL форума looksmax.org: шкала 0-8, середина 4, один балл — одно стандартное отклонение.
const r = (s) => scoreFromRarity('РЕДКОСТЬ: ' + s);
assert.equal(r('ЛУЧШЕ 1 из 2'), 4, 'обычное лицо — ровно 4');
assert.equal(r('ЛУЧШЕ 1 из 6'), 5, '+1 SD — HTN 5');
assert.equal(r('ЛУЧШЕ 1 из 44'), 6, '+2 SD — Chadlite 6, модельный уровень');
assert.equal(r('ЛУЧШЕ 1 из 740'), 7, '+3 SD — Chad 7');
assert.equal(r('ЛУЧШЕ 1 из 4300'), 7.5, 'Adam-lite 7.5');
assert.equal(r('ЛУЧШЕ 1 из 31000'), 8, '+4 SD — True Adam 8');
assert.equal(r('ХУЖЕ 1 из 6'), 3, '-1 SD — LTN 3');
assert.equal(r('ХУЖЕ 1 из 44'), 2, '-2 SD — Sub-3 2');
assert.equal(r('ЛУЧШЕ 1 из 10000000'), 8, 'выше 8 не бывает');
assert.equal(r('ХУЖЕ 1 из 10000000'), 0, 'ниже 0 не бывает');
assert.equal(r('ЛУЧШЕ 1 из 10 000'), r('ЛУЧШЕ 1 из 10000'), 'пробелы в числе не ломают разбор');
assert.equal(r('ЛУЧШЕ 1 из 1'), 4, 'N меньше двух — середина, а не бесконечность');

// Лестница из промпта монотонна и попадает в целые тиры.
const ladder = ['ХУЖЕ 1 из 740', 'ХУЖЕ 1 из 44', 'ХУЖЕ 1 из 6', 'ЛУЧШЕ 1 из 2', 'ЛУЧШЕ 1 из 6',
  'ЛУЧШЕ 1 из 44', 'ЛУЧШЕ 1 из 740', 'ЛУЧШЕ 1 из 4300', 'ЛУЧШЕ 1 из 31000'];
const scores = ladder.map(r);
scores.slice(1).forEach((s, i) => assert.ok(s > scores[i], `${ladder[i + 1]} (${s}) должно быть выше ${ladder[i]} (${scores[i]})`));
assert.deepEqual(ladder.map(r).map((x) => pslTier(x).label),
  ['Subhuman', 'Sub-3', 'LTN', 'MTN', 'HTN', 'Chadlite', 'Chad', 'Adam-lite', 'True Adam'], 'каждая ступень — свой тир');
assert.equal(pslTier(4.9).label, 'MTN', 'тир — по порогу, а не округлением');
assert.ok(src.includes('1 \\u0438\\u0437 44: model level') || /1 \\u0438\\u0437 44: model level/.test(src), 'в промпте та же лестница, что в тесте');

assert.equal(scoreFromRarity('ОБЩИЙ_БАЛЛ: 4.1/8'), null, 'нет строки — null, дальше берётся балл модели');
assert.equal(scoreFromRarity('RAR_B: ХУЖЕ 1 из 44', 'RAR_B'), 2, 'дуэль разбирается той же шкалой');
assert.equal(scoreFromRarity('RAR_A: ЛУЧШЕ 1 из 44', 'RAR_B'), null, 'метка чужого игрока не подхватывается');

// Кантальный наклон: внешний уголок выше внутреннего — плюс, и завал головы не влияет.
const eyes = (tiltDeg, rollDeg) => {
  const lm = [], t = tiltDeg * Math.PI / 180, ro = rollDeg * Math.PI / 180;
  const put = (i, x, y) => { lm[i] = { x: x * Math.cos(ro) - y * Math.sin(ro), y: x * Math.sin(ro) + y * Math.cos(ro) }; };
  // y вниз, как в кадре. Левый глаз на снимке: внешний 33 слева, внутренний 133 справа.
  put(133, -20, 0); put(33, -20 - 30 * Math.cos(t), -30 * Math.sin(t));
  put(362, 20, 0);  put(263, 20 + 30 * Math.cos(t), -30 * Math.sin(t));
  return lm;
};
assert.ok(Math.abs(canthalTiltDeg(eyes(6, 0)) - 6) < 0.01, 'положительный наклон +6');
assert.ok(Math.abs(canthalTiltDeg(eyes(-3, 0)) + 3) < 0.01, 'отрицательный наклон -3');
assert.ok(Math.abs(canthalTiltDeg(eyes(6, 12)) - 6) < 0.01, 'завал головы 12° не меняет наклон глаз');

// Промпт: общий балл PSL 0-8, категории 0-10, старых следов нет.
assert.ok(!/92-100%=8-10/.test(src), 'старой таблицы симметрии нет');
assert.ok(!/ПЕРЦЕНТИЛЬ|PCT_A|scoreFromPercentile|RARITY_SLOPE/.test(src), 'перцентиля и старого наклона не осталось');
assert.ok(/on the looksmax\.org scale from 0 to 8/.test(src), 'промпт называет общий балл PSL 0-8');
assert.ok(/CATEGORY SCORES \(the eight features\) use a SEPARATE 0-10 scale/.test(src), 'категории остаются 0-10');
assert.ok(/0\.0\/8\\nOverall PSL/.test(src), 'модель пишет общий балл «/8»');
const worker = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
assert.ok(/FREE_TEASER_SUFFIX[^\n]*РЕДКОСТЬ/.test(worker), 'тизер требует строку редкости');

console.log('редкость и PSL 0-8: все проверки прошли');
