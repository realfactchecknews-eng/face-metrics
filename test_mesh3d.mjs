// 3D-сетка: выпрямление головы по матрице и симметрия по отражению половин. Исполняем
// настоящие функции из app.js на синтетическом лице.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const a = readFileSync('app.js', 'utf8');
const grab = (re) => { const m = a.match(re); assert.ok(m, 'не нашёл в app.js: ' + re); return m[0]; };
const { mesh3dPoints, mesh3dSymmetry, PAIRS } = new Function(
  grab(/^var MESH3D_SYM_PAIRS = [\s\S]*?;$/m) + '\n' + grab(/^var MESH3D_MID = .*;$/m) + '\n' +
  grab(/^function mesh3dPoints[\s\S]*?^\}/m) + '\n' + grab(/^function mesh3dSymmetry[\s\S]*?^\}/m) +
  '\nreturn { mesh3dPoints, mesh3dSymmetry, PAIRS: MESH3D_SYM_PAIRS };')();

// Симметричное лицо: пары зеркальны относительно X=0, всё прочее на средней линии.
function face() {
  const P = Array.from({ length: 478 }, (_, i) => ({ X: 0, Y: (i % 40) - 20, Z: -5 }));
  PAIRS.forEach(([l, r], k) => { const y = k * 3 - 30, x = 10 + (k % 5) * 6; P[l] = { X: -x, Y: y, Z: 0 }; P[r] = { X: x, Y: y, Z: 0 }; });
  P[33] = { X: -30, Y: -10, Z: 0 }; P[263] = { X: 30, Y: -10, Z: 0 };
  return P;
}
const sym = mesh3dSymmetry(face(), 0);
assert.ok(sym.value > 99 && !sym.rough, 'ровное лицо должно быть ~100%, вышло ' + sym.value);

// Перекошенная улыбка: уголок рта и соседние точки губ вверх на 0.15 межглазного.
const crooked = face();
[291, 267, 314, 270, 321].forEach((i) => { crooked[i] = { ...crooked[i], Y: crooked[i].Y - 9 }; });
const c = mesh3dSymmetry(crooked, 0).value;
assert.ok(c < 90, 'гримаса должна заметно ронять симметрию, вышло ' + c);

// Повёрнутая голова: горизонталь не верим, считаем только вертикаль и помечаем.
const shifted = face();
shifted[263] = { ...shifted[263], X: 45 };
assert.ok(mesh3dSymmetry(shifted, 20).value > 99, 'сдвиг по горизонтали при повороте не должен штрафовать');
assert.equal(mesh3dSymmetry(shifted, 20).rough, true);

// Выпрямление: голову завалили на 20°, после mesh3dPoints линия глаз снова горизонтальна.
const th = 20 * Math.PI / 180, R = [[Math.cos(th), -Math.sin(th), 0], [Math.sin(th), Math.cos(th), 0], [0, 0, 1]];
const matrix = new Float32Array(16);
for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) matrix[4 * j + i] = R[i][j]; // по столбцам, как у MediaPipe
matrix[15] = 1;
const lm = face().map((q) => {
  const cam = [q.X, -q.Y, -q.Z], r = R.map((row) => row[0] * cam[0] + row[1] * cam[1] + row[2] * cam[2]);
  return { x: 500 + r[0], y: 400 - r[1], z: -r[2] };
});
const tiltBefore = Math.atan2(lm[263].y - lm[33].y, lm[263].x - lm[33].x) * 180 / Math.PI;
const M = mesh3dPoints(lm, matrix);
const tiltAfter = Math.atan2(M.P[263].Y - M.P[33].Y, M.P[263].X - M.P[33].X) * 180 / Math.PI;
assert.ok(Math.abs(tiltBefore) > 15, 'тестовое лицо должно быть завалено');
assert.ok(Math.abs(tiltAfter) < 0.5, 'после выпрямления линия глаз горизонтальна, вышло ' + tiltAfter);
assert.deepEqual(mesh3dPoints(lm, null).P, mesh3dPoints(lm, null).P0, 'без матрицы сетка как на фото');

// Сетка — украшение: её сбой не должен ломать ни гейт, ни отчёт.
assert.match(a, /try \{ renderMeshBlock\(isTeaser, skipSideEffects\); \} catch/, 'сбой сетки ломает отчёт');
assert.match(a, /try \{ renderGateGeo\(\); \} catch/, 'сбой сетки ломает гейт');
console.log('3D-сетка: все проверки прошли');
