// Балл из редкости «лучше/хуже 1 из N». Жалобы были ровно на края шкалы: потолок 8.2 и
// пол около 4.7. Здесь фиксируем, что края теперь достижимы и лежат там, где обещано.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pick = (re) => { const m = src.match(re); assert.ok(m, 'не нашёл в app.js: ' + re); return m[0]; };
const { scoreFromRarity, canthalTiltDeg } = new Function(`
  ${pick(/var RARITY_SLOPE = [\d.]+;/)}
  ${pick(/^function normInv[\s\S]*?^\}/m)}
  ${pick(/^function scoreFromRarity[\s\S]*?^\}/m)}
  ${pick(/^function canthalTiltDeg[\s\S]*?^\}/m)}
  return { scoreFromRarity, canthalTiltDeg };
`)();

const r = (s) => scoreFromRarity('РЕДКОСТЬ: ' + s);
assert.equal(r('ЛУЧШЕ 1 из 2'), 5, 'обычное лицо — ровно середина');
assert.equal(r('ЛУЧШЕ 1 из 200'), 7.2, 'модельный уровень начинается выше 7');
assert.equal(r('ЛУЧШЕ 1 из 10000000'), 9.5, 'тру адам достижим');
assert.equal(r('ХУЖЕ 1 из 200'), 2.8, 'sub-3 достижим');
assert.ok(r('ЛУЧШЕ 1 из 200000') > 8.2, 'старого потолка 8.2 больше нет');
assert.ok(r('ХУЖЕ 1 из 20') < 4.2, 'старого пола 4.2 больше нет');
assert.equal(r('ЛУЧШЕ 1 из 10 000'), r('ЛУЧШЕ 1 из 10000'), 'пробелы в числе не ломают разбор');
assert.equal(r('ЛУЧШЕ 1 из 1'), 5, 'N меньше двух — середина, а не бесконечность');

// Монотонность по всей лестнице: чем реже лицо, тем выше балл.
const ladder = ['ХУЖЕ 1 из 10000', 'ХУЖЕ 1 из 200', 'ХУЖЕ 1 из 20', 'ХУЖЕ 1 из 5', 'ЛУЧШЕ 1 из 2',
  'ЛУЧШЕ 1 из 5', 'ЛУЧШЕ 1 из 20', 'ЛУЧШЕ 1 из 200', 'ЛУЧШЕ 1 из 5000', 'ЛУЧШЕ 1 из 200000', 'ЛУЧШЕ 1 из 10000000'];
const scores = ladder.map(r);
scores.slice(1).forEach((s, i) => assert.ok(s > scores[i], `${ladder[i + 1]} (${s}) должно быть выше ${ladder[i]} (${scores[i]})`));
scores.forEach((s) => assert.ok(s >= 0.5 && s <= 10, 'балл в пределах шкалы'));

assert.equal(scoreFromRarity('ОБЩИЙ_БАЛЛ: 6.1/10'), null, 'нет строки — null, дальше берётся балл модели');
assert.equal(scoreFromRarity('RAR_B: ХУЖЕ 1 из 200', 'RAR_B'), 2.8, 'дуэль разбирается той же шкалой');
assert.equal(scoreFromRarity('RAR_A: ЛУЧШЕ 1 из 200', 'RAR_B'), null, 'метка чужого игрока не подхватывается');

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

// Промпт больше не превращает почти любую симметрию в 8-10 и не просит перцентиль.
assert.ok(!/92-100%=8-10/.test(src), 'старой таблицы симметрии нет');
assert.ok(!/ПЕРЦЕНТИЛЬ|PCT_A|scoreFromPercentile/.test(src), 'перцентиля не осталось нигде');
assert.ok(/7-7\.9 Chad-Lite: model level/.test(src), 'тир 7 описан как модельный уровень');
const worker = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
assert.ok(/FREE_TEASER_SUFFIX[^\n]*РЕДКОСТЬ/.test(worker), 'тизер требует строку редкости');

console.log('редкость: все проверки прошли');
