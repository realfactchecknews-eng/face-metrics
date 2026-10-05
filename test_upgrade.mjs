// Доплата до ведения после покупки PDF-гайда.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const packs = new Function(w.slice(w.indexOf('const PACKS = {'), w.indexOf('\n};', w.indexOf('const PACKS = {')) + 3) + '; return PACKS;')();

// Цена доплаты = разница. Сумма двух шагов обязана совпасть с прямой ценой, иначе один
// из путей оказывается наказанием.
assert.ok(packs.gupg, 'тарифа доплаты нет');
assert.strictEqual(packs.gpdf.rub + packs.gupg.rub, packs.guide.rub,
  `399 + ${packs.gupg.rub} должно давать ровно ${packs.guide.rub}`);
assert.strictEqual(packs.gupg.type, 'guide', 'доплата должна выдавать то же, что полный гайд');
assert.strictEqual(packs.gupg.credits, packs.guide.credits, 'анализы должны совпадать с полным гайдом');
assert.strictEqual(packs.gupg.stars, packs.gupg.rub, 'звёзды и рубли разошлись');

// Главная дыра: без проверки кто угодно купит полное ведение за 600 вместо 999.
assert.ok(/packId === 'gupg' && !\(await env\.RATE_LIMIT\.get\(`gpdf:\$\{tgid\}`\)\)/.test(w),
  'доплату можно купить без PDF — это полный гайд за 600');
const scr = w.slice(w.indexOf("} else if (data === 'upg')"), w.indexOf("} else if (data.startsWith('pay:')"));
assert.ok(/gpdf:\$\{tgid\}/.test(scr), 'экран доплаты открыт всем');

// Флаг ставится при покупке PDF, иначе доплату не купит даже тот, кому она положена.
const grant = w.slice(w.indexOf("if (pack?.type === 'guidepdf')"), w.indexOf("if (pack?.type === 'sub')"));
assert.ok(/put\(`gpdf:\$\{tgid\}`, '1'\)/.test(grant), 'покупка PDF не отмечается');
assert.ok(!/expirationTtl/.test(grant.slice(grant.indexOf('gpdf:'))), 'флаг покупки с TTL — доплата однажды перестанет продаваться');

// Предложение уходит само, на всех трёх способах оплаты, и только за PDF.
assert.strictEqual(w.split('await offerUpgrade(env, tgid, pack').length - 1, 3,
  'предложение должно уходить после оплаты любым способом');
const off = w.slice(w.indexOf('async function offerUpgrade'), w.indexOf("// Начисление тарифа"));
assert.ok(/pack\?\.type !== 'guidepdf'/.test(off), 'предложение уходит и после других покупок');
assert.ok(/guide:\$\{tgid\}`\)\) === '1'/.test(off), 'предложим ведение тому, у кого оно уже есть');

// В общем списке тарифов доплаты быть не должно.
assert.ok(!/row\('gupg'/.test(w), 'доплата попала в общий список бота');
const app = readFileSync('app.js', 'utf8');
assert.ok(!/packBtn\("gupg"\)/.test(app), 'доплата попала на пейволл сайта');
console.log('доплата до ведения: все проверки прошли');
