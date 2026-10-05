// Скидка на ведение владельцу PDF-гайда. Сделана скидкой, а не отдельным тарифом:
// отдельный требовал бы своего товара в Lava.top, своей кнопки и своей защиты от покупки
// без PDF — а здесь всё берётся из одного места.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const app = readFileSync('app.js', 'utf8');
const packs = new Function(w.slice(w.indexOf('const PACKS = {'), w.indexOf('\n};', w.indexOf('const PACKS = {')) + 3) + '; return PACKS;')();

// Отдельного тарифа доплаты быть не должно — иначе его пришлось бы защищать от покупки
// без гайда, заводить товар в Lava и держать цену в двух местах.
assert.ok(!packs.gupg, 'вернулся отдельный тариф доплаты');
assert.ok(!/gupg/.test(w), 'в коде остались следы отдельного тарифа');

// Процент считается ИЗ ЦЕН, а не записан числом: поменяется 399 или 999 — пересчитается сам.
const pctSrc = w.slice(w.indexOf('function guideUpgradePct'), w.indexOf('async function buyerDiscountPct'));
assert.ok(/PACKS\.guide\.rub - PACKS\.gpdf\.rub/.test(pctSrc), 'скидка записана числом — разъедется при смене цен');
const pct = new Function('PACKS', pctSrc + '; return guideUpgradePct();')(packs);
const applyDiscount = new Function('return ' + w.match(/function applyDiscount\([^)]*\)\s*\{[^}]*\}/)[0])();
const price = applyDiscount(packs.guide.rub, pct);
// Два шага не должны стоить заметно дороже или дешевле одного.
assert.ok(Math.abs(packs.gpdf.rub + price - packs.guide.rub) <= 2,
  `${packs.gpdf.rub} + ${price} должно сойтись с ${packs.guide.rub}, вышло ${packs.gpdf.rub + price}`);

// Скидка берётся максимумом: промо в 25% не должно её затирать.
const bd = w.slice(w.indexOf('async function buyerDiscountPct'), w.indexOf('function applyDiscount'));
assert.ok(/Math\.max\(parseInt\(pd, 10\) \|\| 0, upgrade\)/.test(bd), 'промо-скидка затирает скидку владельца гайда');
assert.ok(/let best = upgrade/.test(bd), 'скидка владельца гайда теряется среди остальных');
assert.ok(/packId === 'guide' &&/.test(bd), 'скидка применяется не только к ведению');

// Флаг покупки PDF — основание для скидки, без TTL.
const grant = w.slice(w.indexOf("if (pack?.type === 'guidepdf')"), w.indexOf("if (pack?.type === 'sub')"));
assert.ok(/put\(`gpdf:\$\{tgid\}`, '1'\)/.test(grant), 'покупка PDF не отмечается — скидка не сработает');
assert.ok(!/expirationTtl/.test(grant.slice(grant.indexOf('gpdf:'))), 'флаг с TTL — скидка однажды пропадёт');

// Цена на экране обязана совпадать со счётом: расхождение читается как обман.
assert.ok(/guideKb\(L, env, discPct = 0\)/.test(w), 'экран гайда не умеет показывать персональную цену');
assert.strictEqual(w.split("guideKb(L, env, await buyerDiscountPct(env, tgid, 'guide'))").length - 1, 3,
  'не все экраны гайда показывают персональную цену');
assert.ok(/guidePackFor\(env, tgid\)/.test(w), 'сайт получает цену гайда без скидки');

// Предложение после покупки PDF.
const off = w.slice(w.indexOf('async function offerUpgrade'), w.indexOf('// Начисление тарифа'));
assert.ok(/pack\?\.type !== 'guidepdf'/.test(off), 'предложение уходит и после других покупок');
assert.ok(/guide:\$\{tgid\}`\)\) === '1'/.test(off), 'предложим ведение тому, у кого оно уже есть');
assert.ok(/applyDiscount\(PACKS\.guide\.rub, guideUpgradePct\(\)\)/.test(off), 'цена в предложении записана числом');
assert.ok(/callback_data: 'guide'/.test(off), 'кнопка ведёт не на экран гайда');
assert.strictEqual(w.split('await offerUpgrade(env, tgid, pack').length - 1, 3,
  'предложение должно уходить после оплаты любым способом');
console.log('скидка на ведение: все проверки прошли');
