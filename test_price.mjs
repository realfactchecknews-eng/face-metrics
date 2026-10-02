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

assert.strictEqual(packs.p1.stars, 79, 'акционная цена одного анализа — 79');
assert.strictEqual(packs.p1.oldStars, 99, 'зачёркиваться должна обычная цена 99');

// Зачёркнутая цена обязана быть НАСТОЯЩЕЙ: той, что мы реально брали и вернём после акции.
// Нарисованная «старая» цена, которой не было, — тёмный паттерн и недостоверные сведения
// о цене по ЗоЗПП, за это штрафуют.
const sale = w.match(/const SALE_ENDS_AT = Date\.parse\('([^']+)'\)/)[1];
const ends = Date.parse(sale);
assert.ok(!Number.isNaN(ends), 'дата окончания акции не парсится');
// Акция должна быть ограничена по времени и не висеть годами: «до повышения» обязано
// однажды наступить, иначе второй раз этой строке никто не поверит.
assert.ok(ends - Date.now() < 40 * 864e5, 'акция тянется больше месяца — это уже не акция, а цена');
assert.ok(packs.p1.oldRub > packs.p1.rub, 'без этого зачёркивание не нарисуется вовсе');
// Зачёркивание рисуется только там, где old* БОЛЬШЕ текущей цены. Значит у тарифов,
// которые мы не удешевляли, old* обязан равняться текущей цене — иначе на экране появится
// скидка, которой нет.
const discounted = Object.entries(packs).filter(([, p]) => p.oldRub > p.rub).map(([id]) => id);
assert.deepStrictEqual(discounted, ['p1'], 'скидка должна быть только у p1, а размечена у: ' + discounted.join(', '));
for (const [id, p] of Object.entries(packs)) {
  if (discounted.includes(id)) continue;
  if (p.oldRub != null) assert.strictEqual(p.oldRub, p.rub, `${id}: old* не равен цене — нарисуется несуществующая скидка`);
  if (p.oldStars != null) assert.strictEqual(p.oldStars, p.stars, `${id}: old* в звёздах не равен цене`);
}

// Пятёрка намеренно не тронута: на фоне 99 за штуку она выглядит выгодно и тянет чек вверх.
assert.strictEqual(packs.p5.rub, 149, 'p5 изменён — контраст с p1 задуман');
assert.ok(packs.p5.rub / packs.p5.credits < packs.p1.rub, 'пятёрка перестала быть выгоднее поштучной покупки');

// Скидка 20% не должна давать некрасивую или нулевую цену.
const applyDiscount = new Function('return ' + w.match(/function applyDiscount\([^)]*\)\s*\{[^}]*\}/)[0].replace('function applyDiscount', 'function applyDiscount'))();
assert.strictEqual(applyDiscount(79, 20), 63, 'скидка на акционную цену считается неожиданно');
// Lava не принимает инвойс ниже своей минималки — акция со скидкой не должна её пробить.
const lavaMin = +w.match(/LAVA_MIN_RUB = (\d+)/)[1];
assert.ok(applyDiscount(packs.p1.lavaRub, 20) >= lavaMin, 'цена со скидкой ниже минимума Lava — оплата картой упадёт');
assert.ok(applyDiscount(packs.p1.stars, 20) >= 1, 'скидка уводит цену ниже минимума Telegram');

// Цены во фронт приходят из воркера, а не зашиты в разметку.
assert.ok(!/\b70\s*₽/.test(app), 'в app.js осталась зашитая старая цена');
assert.ok(/packs\[id\]/.test(app), 'фронт перестал брать цены из ответа воркера');
console.log('цены: все проверки прошли');
