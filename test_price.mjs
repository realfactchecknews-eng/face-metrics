// Цена одного анализа и её согласованность по всем способам оплаты.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const app = readFileSync('app.js', 'utf8');

const packs = new Function(w.slice(w.indexOf('const PACKS = {'), w.indexOf('\n};', w.indexOf('const PACKS = {')) + 3)
  + '; return PACKS;')();

// Звёзды, рубли и Lava обязаны совпадать: расхождение — это «на сайте одна цена, в чеке другая».
for (const [id, p] of Object.entries(packs)) {
  assert.strictEqual(p.stars, p.rub, `${id}: цена в звёздах и рублях разошлась`);
  if (p.lavaRub != null) assert.strictEqual(p.lavaRub, p.rub, `${id}: цена Lava разошлась с рублёвой`);
}

assert.strictEqual(packs.p1.stars, 99, 'один анализ должен стоить 99');
assert.strictEqual(packs.p1.oldStars, 70, 'прошлая цена должна остаться в old* — по ней сверяют историю');
// old* рисуется зачёркнутым только когда он БОЛЬШЕ текущей цены: подъём не должен
// показывать фальшивую «скидку».
for (const [id, p] of Object.entries(packs)) {
  if (p.oldRub != null) assert.ok(p.oldRub <= p.rub, `${id}: old* выше текущей — нарисуется несуществующая скидка`);
}

// Пятёрка намеренно не тронута: на фоне 99 за штуку она выглядит выгодно и тянет чек вверх.
assert.strictEqual(packs.p5.rub, 149, 'p5 изменён — контраст с p1 задуман');
assert.ok(packs.p5.rub / packs.p5.credits < packs.p1.rub, 'пятёрка перестала быть выгоднее поштучной покупки');

// Скидка 20% не должна давать некрасивую или нулевую цену.
const applyDiscount = new Function('return ' + w.match(/function applyDiscount\([^)]*\)\s*\{[^}]*\}/)[0].replace('function applyDiscount', 'function applyDiscount'))();
assert.strictEqual(applyDiscount(99, 20), 79, 'скидка на p1 считается неожиданно');
assert.ok(applyDiscount(packs.p1.stars, 20) >= 1, 'скидка уводит цену ниже минимума Telegram');

// Цены во фронт приходят из воркера, а не зашиты в разметку.
assert.ok(!/\b70\s*₽/.test(app), 'в app.js осталась зашитая старая цена');
assert.ok(/packs\[id\]/.test(app), 'фронт перестал брать цены из ответа воркера');
console.log('цены: все проверки прошли');
