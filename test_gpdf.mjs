// Бумажный гайд (PDF без ведения) — мостик между 149 и 999.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const app = readFileSync('app.js', 'utf8');
const packs = new Function(w.slice(w.indexOf('const PACKS = {'), w.indexOf('\n};', w.indexOf('const PACKS = {')) + 3) + '; return PACKS;')();

assert.ok(packs.gpdf, 'тарифа нет');
assert.strictEqual(packs.gpdf.rub, 399, 'цена должна быть 399');
assert.strictEqual(packs.gpdf.type, 'guidepdf', 'свой тип нужен, чтобы выдача отличалась от гайда с ведением');
// Цена обязана лечь МЕЖДУ пятёркой и полным гайдом — в этом весь смысл тарифа.
assert.ok(packs.p5.rub < packs.gpdf.rub && packs.gpdf.rub < packs.guide.rub,
  'тариф должен стоять между 149 и 999, иначе он не мостик');

// К гайду идёт ОДИН полный разбор: иначе гайд читается в пустоту — объяснили, что мерить,
// а своих восьми цифр у человека нет, в бесплатном тизере их три.
assert.strictEqual(packs.gpdf.credits, 1, 'к гайду должен прилагаться один полный разбор');
assert.ok(packs.gpdf.credits < packs.p5.credits, 'разборов не должно быть больше, чем в пятёрке за 149');
// Но ведение он не отдаёт — это и есть тариф за 999.
const grant = w.slice(w.indexOf("if (pack?.type === 'guidepdf')"), w.indexOf("if (pack?.type === 'sub')"));
assert.ok(/sendDocument/.test(grant), 'файл не отправляется');
assert.ok(!/guide:\$\{tgid\}/.test(grant), 'ставится флаг гайда — человек получит ведение бесплатно');
assert.ok(!/guidelist/.test(grant), 'попадает в рассылку заданий, за которую не платил');
assert.ok(/credits:\$\{tgid\}/.test(grant), 'обещанный разбор не начисляется');
assert.ok(/GUIDE_FILE_ID/.test(grant), 'файл берётся не из настроек');

// Виден в обоих магазинах, иначе его никто не купит.
assert.ok(/\{ id: 'gpdf'/.test(w), 'нет строки в списке тарифов бота');
assert.ok(/packBtn\("gpdf"\)/.test(app), 'нет кнопки на пейволле сайта');
assert.strictEqual(app.split('packGpdf:').length - 1, 2, 'название должно быть в обоих языках');
assert.ok(/gpdf: "📄 " \+ t\("packGpdf"\)/.test(app), 'название тарифа не переводится');

// Описание инвойса должно отличаться от гайда с ведением, иначе покупатель решит, что берёт его.
const inv = w.slice(w.indexOf('async function createInvoice'), w.indexOf('const req = {'));
assert.ok(/guidepdf/.test(inv), 'в инвойсе нет своего описания');
assert.ok(/Без ведения|No coaching/.test(w), 'в описании не сказано, что ведения нет');
console.log('гайд PDF: все проверки прошли');
