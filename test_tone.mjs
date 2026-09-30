// Дерзкий режим: персона собирается функцией (а не хрупким prompt.replace),
// текст отдаётся на языке интерфейса, и тон участвует в ключе кэша воркера.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const app = readFileSync('app.js', 'utf8');
const worker = readFileSync('worker.js', 'utf8');

// 1. Старого replace-а больше нет: он молча отключал режим при любой правке промпта.
assert.ok(!/prompt\s*=\s*prompt\.replace\(/.test(app), 'prompt.replace вернулся — режим снова ломается молча');

// 2. Персона подставляется в промпт вызовом, а не литералом.
assert.ok(app.includes('+ personaPrompt() +'), 'промпт не зовёт personaPrompt()');
assert.strictEqual(
  app.split('Give an honest, realistic and DISCRIMINATING').length - 1, 1,
  'текст персоны продублирован — при правке разъедутся');

// 3. Функция собирает три варианта: обычный, дерзкий ru, дерзкий en.
const src = app.slice(app.indexOf('var PERSONA ='), app.indexOf('function duelRatePrompt'));
const make = (edgy, l) => new Function('isEdgyTone', 'lang', src + '; return personaPrompt();')(() => edgy, () => l);

const plain = make(false, 'ru');
assert.ok(plain.includes('DISCRIMINATING') && !/РОАСТ|ROAST/.test(plain), 'обычный тон подцепил роаст');
assert.strictEqual(make(false, 'en'), plain, 'без дерзкого режима язык не должен менять персону');

const ru = make(true, 'ru'), en = make(true, 'en');
assert.ok(ru.startsWith('Give an honest'), 'дерзкий режим должен начинаться с той же персоны');
// Дерзкий режим не получает фразу про английские термины — так было до рефакторинга.
// Если её вернуть, это правка промпта: сначала прогон по 52 лицам, потом код.
assert.ok(!ru.includes('Use looksmaxxing terminology'), 'в дерзкий режим просочилась фраза про термины — промпт изменился');
assert.ok(plain.includes('Use looksmaxxing terminology'), 'обычный тон потерял фразу про термины');
assert.ok(ru.includes('ДЕРЗКИЙ РОАСТ'), 'нет русского роаста');
assert.ok(en.includes('SAVAGE ROAST') && !/[А-Яа-я]/.test(en), 'английский промпт содержит русский текст');

// 4. Границы сохраняются в обоих языках — это не стилистика, а единственный тормоз режима.
for (const [name, txt] of [['ru', ru], ['en', en]]) {
  assert.ok(/ЧЕСТНЫМИ|HONEST/.test(txt), `${name}: потеряно требование честных оценок`);
  assert.ok(/национальности|nationality/.test(txt), `${name}: потеряны границы по оскорблениям`);
}

// 5. Фронт сообщает тон воркеру, иначе кэш о нём не узнает.
assert.ok(/tone:\s*isEdgyTone\(\)/.test(app), 'callAI не шлёт tone');

// 6. Ключ кэша разводит тона: тот же снимок в дерзком режиме — другой ключ.
const keySrc = worker.slice(worker.indexOf('async function photoCacheKey'), worker.indexOf('// ─────────────────────────── Анализ'));
const { photoCacheKey } = await import('data:text/javascript,' + encodeURIComponent(keySrc + '\nexport { photoCacheKey };'));
const plainKey = await photoCacheKey(7, ['img'], 'ru', false, '');
const edgyKey  = await photoCacheKey(7, ['img'], 'ru', false, 'edgy');
assert.notStrictEqual(plainKey, edgyKey, 'дерзкий разбор попадёт в кэш вежливого');
// Старые ключи не должны протухнуть: обычный путь обязан остаться прежним.
assert.strictEqual(plainKey, await photoCacheKey(7, ['img'], 'ru', false, undefined), 'обычный ключ изменился — весь кэш сбросится');
assert.ok(edgyKey.endsWith(':e'), 'дерзкий ключ собран неожиданно: ' + edgyKey);
// Тон не должен перебивать остальные измерения ключа.
assert.notStrictEqual(edgyKey, await photoCacheKey(7, ['img'], 'en', false, 'edgy'), 'язык потерялся');
assert.notStrictEqual(edgyKey, await photoCacheKey(7, ['img'], 'ru', true, 'edgy'), 'тизер потерялся');

console.log('test_tone: ok');
