// Балл по методике дата-шита: десять оценок модели -> PSL 0-8 считаем мы.
// Замер 06.10.2026 по 52 размеченным лицам на боевом промпте: смещение −0.02,
// ошибка 0.310, в 0.5 — 79%, тир совпал 73%, 0 потерь разбора (было −0.20 / 0.454 /
// 75% / 54% на строке редкости). Веса и множитель трогать только с новым прогоном.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pick = (re) => { const m = src.match(re); assert.ok(m, 'не нашёл в app.js: ' + re); return m[0]; };
const { scoreFromPillars } = new Function(`
  ${pick(/var PSL_MAX = \d+;/)}
  ${pick(/var FEATURE_WEIGHTS = \{[^}]*\};/)}
  ${pick(/var PILLAR_WEIGHTS = \{[^}]*\};/)}
  ${pick(/var PSL_FROM_METHOD = [\d.]+;/)}
  ${pick(/var METHOD_KEYS = \[[^\]]*\];/)}
  ${pick(/^function pillarsFromText[\s\S]*?^\}/m)}
  ${pick(/^function scoreFromValues[\s\S]*?^\}/m)}
  ${pick(/^function scoreFromPillars[\s\S]*?^\}/m)}
  return { scoreFromPillars };
`)();

const KEYS = ['HARMONY', 'DIMORPHISM', 'ANGULARITY', 'SKIN', 'HAIR', 'MOUTH', 'EYES', 'SYMMETRY', 'NOSE', 'EARS'];
const all = (n) => KEYS.map((k) => k + ': ' + n.toFixed(1)).join('\n');

// 5 по всем десяти — обычный человек по шкале таблицы. 0.8 * 5 = 4.0, ровно середина PSL.
assert.equal(scoreFromPillars(all(5)), 4, 'обычное лицо по методике — ровно 4');
assert.equal(scoreFromPillars(all(6)), 4.8, 'заметно выше среднего — HTN');
assert.equal(scoreFromPillars(all(7.5)), 6, 'уровень работающей топ-модели — как Ди Каприо у автора');
assert.equal(scoreFromPillars(all(9)), 7.2, 'верх шкалы — как Кавилл у автора');
assert.equal(scoreFromPillars(all(3)), 2.4, 'низ шкалы достижим');

// Веса в сумме единица: иначе всю шкалу уводит.
const sumP = Object.values(new Function(`${pick(/var PILLAR_WEIGHTS = \{[^}]*\};/)} return PILLAR_WEIGHTS;`)()).reduce((a, b) => a + b, 0);
const sumF = Object.values(new Function(`${pick(/var FEATURE_WEIGHTS = \{[^}]*\};/)} return FEATURE_WEIGHTS;`)()).reduce((a, b) => a + b, 0);
assert.ok(Math.abs(sumP - 1) < 1e-9, 'веса столпов дают единицу');
assert.ok(Math.abs(sumF - 1) < 1e-9, 'веса оцениваемых групп дают единицу');
assert.ok(!('SKIN' in new Function(`${pick(/var FEATURE_WEIGHTS = \{[^}]*\};/)} return FEATURE_WEIGHTS;`)()), 'кожи в весах нет');

// PSL — это геометрия: кожа и волосы оцениваются, но в балл не входят вовсе.
const bump = (key, by) => KEYS.map((k) => k + ': ' + (k === key ? 5 + by : 5).toFixed(1)).join('\n');
assert.equal(scoreFromPillars(bump('SKIN', 5)), scoreFromPillars(all(5)), 'кожа балл не двигает');
assert.equal(scoreFromPillars(bump('HAIR', 5)), scoreFromPillars(all(5)), 'волосы балл не двигают');
assert.ok(scoreFromPillars(bump('MOUTH', 3)) > scoreFromPillars(bump('EARS', 3)), 'рот весит больше ушей');
assert.ok(scoreFromPillars(bump('HARMONY', 3)) > scoreFromPillars(bump('MOUTH', 3)), 'гармония весит больше любой группы признаков');

// Разбор не должен ломаться об оформление: модель добавляет маркер, звёздочки,
// запятую вместо точки. Строгий разбор из-за этого терял весь ответ целиком.
assert.equal(scoreFromPillars(KEYS.map((k) => '- **' + k + '**: 5,0').join('\n')), 4, 'маркеры, звёздочки и запятая не мешают');
assert.equal(scoreFromPillars(all(5).replace('EARS: 5.0', '')), null, 'нет одной оценки — null, балл не выдумываем');
assert.equal(scoreFromPillars(''), null, 'пустой ответ — null');

// Шкала не вылезает за края PSL.
assert.equal(scoreFromPillars(all(10)), 8, 'десятки дают ровно потолок 8');
assert.equal(scoreFromPillars(all(0)), 0, 'нули дают 0');

// Середина НЕ раздувается — этого и боялись при переходе. На замере полоса 4.0
// дала 3.86, полоса 4.4 — 4.14: обычное лицо остаётся MTN (3.6-4.5).
assert.ok(scoreFromPillars(all(5)) <= 4.5, 'обычное лицо остаётся в MTN');

console.log('рейт по методике: все проверки прошли');
