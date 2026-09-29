// Балл из редкости «лучше/хуже 1 из N». Жалобы были ровно на края шкалы: потолок 8.2 и
// пол около 4.7. Здесь фиксируем, что края теперь достижимы и лежат там, где обещано.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pick = (re) => { const m = src.match(re); assert.ok(m, 'не нашёл в app.js: ' + re); return m[0]; };
const { scoreFromRarity, canthalTiltDeg, pslTier } = new Function(`
  ${pick(/var PSL_MID = \d+;/)}
  ${pick(/var PSL_MAX = \d+;/)}
  ${pick(/var PSL_SLOPE = [\d.]+;/)}
  ${pick(/^function normInv[\s\S]*?^\}/m)}
  ${pick(/^function scoreFromRarity[\s\S]*?^\}/m)}
  ${pick(/^function canthalTiltDeg[\s\S]*?^\}/m)}
  ${pick(/var PSL_TIERS = \[[\s\S]*?\];/)}
  ${pick(/^function pslTier[\s\S]*?^\}/m)}
  return { scoreFromRarity, canthalTiltDeg, pslTier };
`)();

// PSL форума looksmax.org: шкала 0-8, середина 4, один балл — одно стандартное отклонение.
const r = (s) => scoreFromRarity('РЕДКОСТЬ: ' + s);
// Шкала по дата-шиту владельца: 4 + 0.75*z. Наклон подобран по 52 лицам с листа
// MENS GUIDE, у которых там проставлен PSL: смещение −0.14, средняя ошибка 0.39.
assert.equal(r('ЛУЧШЕ 1 из 2'), 4, 'обычное лицо — ровно 4');
assert.equal(r('ЛУЧШЕ 1 из 3'), 4.3, 'чуть выше среднего');
assert.equal(r('ЛУЧШЕ 1 из 4'), 4.5, 'приятное лицо, но не оборачиваются');
assert.equal(r('ЛУЧШЕ 1 из 6'), 4.7, 'привлекательный — начало HTN');
assert.equal(r('ЛУЧШЕ 1 из 44'), 5.5, 'модельный уровень — Chadlite');
assert.equal(r('ЛУЧШЕ 1 из 740'), 6.2, 'топ-модель или актёр на пике');
assert.equal(r('ЛУЧШЕ 1 из 1000'), 6.3, 'молодой Ди Каприо');
assert.equal(r('ЛУЧШЕ 1 из 31000'), 7, 'Adam-lite');
assert.equal(r('ХУЖЕ 1 из 6'), 3.3, 'ниже среднего — LTN');
assert.equal(r('ХУЖЕ 1 из 44'), 2.5, 'явно непривлекательное — Sub-3');
assert.ok(r('ЛУЧШЕ 1 из 10000000') <= 8 && r('ЛУЧШЕ 1 из 10000000') > 7, 'край шкалы не упирается в 8 раньше времени');
assert.ok(r('ХУЖЕ 1 из 10000000') >= 0, 'ниже 0 не бывает');
assert.equal(r('ЛУЧШЕ 1 из 10 000'), r('ЛУЧШЕ 1 из 10000'), 'пробелы в числе не ломают разбор');
assert.equal(r('ЛУЧШЕ 1 из 1'), 4, 'N меньше двух — середина, а не бесконечность');

// Лестница из промпта монотонна и попадает в целые тиры.
const ladder = ['ХУЖЕ 1 из 740', 'ХУЖЕ 1 из 44', 'ХУЖЕ 1 из 6', 'ЛУЧШЕ 1 из 2', 'ЛУЧШЕ 1 из 3', 'ЛУЧШЕ 1 из 4', 'ЛУЧШЕ 1 из 6',
  'ЛУЧШЕ 1 из 44', 'ЛУЧШЕ 1 из 740', 'ЛУЧШЕ 1 из 4300', 'ЛУЧШЕ 1 из 31000'];
const scores = ladder.map(r);
scores.slice(1).forEach((s, i) => assert.ok(s > scores[i], `${ladder[i + 1]} (${s}) должно быть выше ${ladder[i]} (${scores[i]})`));
assert.deepEqual(ladder.map(r).map((x) => pslTier(x).label),
  ['Subhuman', 'Sub-3', 'LTN', 'MTN', 'MTN', 'MTN', 'HTN', 'Chadlite', 'Chad', 'Adam-lite', 'Adam-lite'],
  'ступени ложатся на тиры из дата-шита: обычное лицо в MTN, модельный уровень с 5.3');
assert.equal(pslTier(4.5).label, 'MTN', 'обычное лицо не попадает в HTN');
assert.equal(pslTier(6).label, 'Chad', 'Ди Каприо по дата-шиту — Chad, а не Chadlite');
assert.equal(pslTier(4.59).label, 'MTN', 'тир — по порогу, а не округлением');
assert.ok(/1 \\u0438\\u0437 44: model benchmark/.test(src), 'в промпте та же лестница, что в тесте');

assert.equal(scoreFromRarity('ОБЩИЙ_БАЛЛ: 4.1/8'), null, 'нет строки — null, дальше берётся балл модели');
assert.equal(scoreFromRarity('RAR_B: ХУЖЕ 1 из 44', 'RAR_B'), 2.5, 'дуэль разбирается той же шкалой');
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
assert.ok(/5\.3-5\.7 Chadlite: model benchmark/.test(src), 'модельный уровень описан с 5.3');
assert.match(src, /RARITY_ANCHORS/, 'в промпте есть якорные лица');
assert.match(src, /young Leonardo DiCaprio/, 'Ди Каприо среди якорей');
assert.ok(/CATEGORY SCORES \(the eight features\) use a SEPARATE 0-10 scale/.test(src), 'категории остаются 0-10');
assert.ok(/0\.0\/8\\nOverall PSL/.test(src), 'модель пишет общий балл «/8»');
const worker = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
assert.ok(/FREE_TEASER_SUFFIX[^\n]*РЕДКОСТЬ/.test(worker), 'тизер требует строку редкости');

console.log('редкость и PSL 0-8: все проверки прошли');
