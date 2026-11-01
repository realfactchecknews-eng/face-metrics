// Что человек видит до гейта: настоящие числа, а не только «?.?». Выбор строк исполняем
// по-настоящему: «Мешает ракурс» результатом не считается.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const a = readFileSync('app.js', 'utf8');
const gateGeoRows = new Function(a.match(/^function gateGeoRows[\s\S]*?^\}/m)[0] + '; return gateGeoRows;')();
const r = (level, label) => ({ level, label });

assert.deepEqual(gateGeoRows([r('norm', 'a'), r('minus', 'b'), r('plus', 'c'), r('norm', 'd')]).map((x) => x.label),
  ['c', 'a', 'b'], 'сначала сильная сторона, потом норма, потом слабое место');
assert.deepEqual(gateGeoRows([r('norm', 'a'), r('norm', 'b'), r('norm', 'c'), r('norm', 'd')]).map((x) => x.label),
  ['a', 'b', 'c'], 'если уровень один, всё равно три строки');
assert.deepEqual(gateGeoRows([r('plain', 'a'), r('norm', 'b')]).map((x) => x.label), ['b'], 'ракурс не показываем');
assert.deepEqual(gateGeoRows([r('plain', 'a')]), [], 'нечего показать — пустой блок');

const render = a.match(/^function renderGateGeo[\s\S]*?^\}/m)[0];
assert.match(render, /_afterGate === startAI && _pendingAnalysis/, 'в дуэли и кабинете чужой скан показывать нельзя');
assert.match(a, /try \{ renderGateGeo\(\); \} catch/, 'сбой геометрии не должен ломать пейволл');
console.log('геометрия до гейта: все проверки прошли');
