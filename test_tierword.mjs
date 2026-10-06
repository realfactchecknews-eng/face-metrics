// Название тира в тексте вердикта обязано совпадать со значком.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const app = readFileSync('app.js', 'utf8');
const cut = (a, b) => app.slice(app.indexOf(a), app.indexOf(b));
// pslColor объявлена МЕЖДУ таблицей и pslTier — берём от таблицы до конца pslTier.
const tiersEnd = app.indexOf('\n}', app.indexOf('function pslTier')) + 2;
const api = new Function(app.slice(app.indexOf('var PSL_TIERS'), tiersEnd)
  + cut('var TIER_WORDS', 'function parseAIReport') + '; return { fixTierWord, pslTier };')();
const fix = api.fixTierWord;

// Сама жалоба: показываем 4.5 (MTN), а в тексте написано HTN.
assert.strictEqual(fix('Крепкий HTN с хорошей базой.', 4.5), 'Крепкий MTN с хорошей базой.');
assert.strictEqual(fix('Уверенный MTN, ничего выдающегося.', 4.8), 'Уверенный HTN, ничего выдающегося.');

// Верно названный тир не трогаем — текст остаётся модельным.
const ok = 'Типичный MTN: средняя зона в порядке.';
assert.strictEqual(fix(ok, 4.2), ok, 'переписали правильный тир');

// Границы слов: Chad не должен портить Chadlite.
assert.strictEqual(fix('Почти Chadlite по костям.', 5.5), 'Почти Chadlite по костям.');
assert.strictEqual(fix('Это Chad уровень.', 5.5), 'Это Chadlite уровень.');
// Дефисы и слитные написания.
assert.strictEqual(fix('Уровень Adam-lite.', 6.0), 'Уровень Chad.');
assert.strictEqual(fix('Sub-3 по всем признакам.', 3.2), 'LTN по всем признакам.');
// Слово внутри другого слова не трогаем.
const inside = 'MTNmetrics и HTNx — не тиры.';
assert.strictEqual(fix(inside, 4.8), inside, 'задели слово, которое не тир');

// Пустые и странные входы не должны падать.
assert.strictEqual(fix('', 4.5), '');
assert.strictEqual(fix(null, 4.5), null);
assert.strictEqual(fix('текст', null), 'текст');

// Применяется там, где балл берётся из редкости — иначе исправлять нечего.
assert.ok(/result\.overallDesc = fixTierWord\(result\.overallDesc, result\.overall\)/.test(app),
  'замена не подключена к разбору отчёта');
console.log('тир в тексте: все проверки прошли');
