// Дерзкий режим: тон отделён от оценки. Разбор всегда считается нейтральным промптом,
// роаст накладывает второй вызов /roast, который не вправе двигать числа.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';

const app = readFileSync('app.js', 'utf8');
const worker = readFileSync('worker.js', 'utf8');

// ── Промпт разбора ──
// Старого replace-а нет: он молча отключал режим при любой правке промпта.
assert.ok(!/prompt\s*=\s*prompt\.replace\(/.test(app), 'prompt.replace вернулся — режим снова ломается молча');
assert.ok(app.includes('+ personaPrompt() +'), 'промпт не зовёт personaPrompt()');
assert.strictEqual(app.split('Give an honest, realistic and DISCRIMINATING').length - 1, 1,
  'текст персоны продублирован — при правке разъедутся');

const src = app.slice(app.indexOf('var PERSONA ='), app.indexOf('function duelRatePrompt'));
const persona = (edgy, l) => new Function('isEdgyTone', 'lang', src + '; return personaPrompt();')(() => edgy, () => l);

// Главное: тумблер НЕ влияет на промпт разбора. Замер 30.09 — роаст в промпте двигал
// тир у 12 лиц из 52, поэтому оценка обязана считаться одним и тем же текстом.
for (const l of ['ru', 'en']) {
  assert.strictEqual(persona(true, l), persona(false, l), `${l}: дерзкий режим снова правит промпт разбора`);
  assert.ok(!/РОАСТ|ROAST/.test(persona(true, l)), `${l}: роаст просочился в промпт разбора`);
}
assert.ok(persona(false, 'ru').includes('Use looksmaxxing terminology'), 'персона потеряла фразу про термины');

// Тон не должен уходить в разбор и попадать в ключ кэша: оба тона делят один разбор.
assert.ok(!/tone:\s*isEdgyTone\(\)/.test(app), 'фронт снова шлёт tone в разбор');
assert.ok(!/tone === 'edgy'/.test(worker), 'тон вернулся в ключ кэша разбора');

// ── Второй вызов ──
assert.ok(/isEdgyTone\(\)\s*&&\s*data\.text/.test(app), 'фронт не запрашивает дерзкий текст');
assert.ok(app.includes('async function roastReport'), 'нет функции запроса роаста');
assert.ok(worker.includes("path === '/roast'"), 'роут /roast не подключён');

// Границы режима должны пережить переезд во второй вызов.
// Кириллица в worker.js записана \u-escape'ами — разворачиваем, иначе regex не совпадёт.
const unesc = (t) => t.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const instr = unesc(worker.slice(worker.indexOf('async function roastRewrite'), worker.indexOf('let out = ')));
for (const [name, re] of [['русский', /РОАСТ/], ['английский', /SAVAGE ROAST/]]) {
  assert.ok(re.test(instr), `потерян ${name} роаст`);
}
for (const re of [/национальности/, /nationality/]) assert.ok(re.test(instr), 'потеряны границы по оскорблениям');
assert.ok(/ОБЩИЙ_БАЛЛ:/.test(instr), 'вход не проверяется на наш формат — роут станет бесплатной языковой моделью');

// ── Страховка по числам ──
const numSrc = worker.slice(worker.indexOf('function reportNumbers'), worker.indexOf('async function roastRewrite'));
const { reportNumbers } = await import('data:text/javascript,' + encodeURIComponent(numSrc + '\nexport { reportNumbers };'));
const base = 'РЕДКОСТЬ: ЛУЧШЕ 1 из 44\n\nОБЩИЙ_БАЛЛ: 5.5/8\nОбычный текст.\n\nСИММЕТРИЯ: 5.4/10\nРовное лицо.\n';
assert.strictEqual(reportNumbers(base), reportNumbers(base.replace('Обычный текст.', 'Дерзкий текст!')),
  'переписанная проза не должна считаться изменением чисел');
for (const bad of [base.replace('5.5/8', '6.1/8'), base.replace('5.4/10', '4.0/10'), base.replace('1 из 44', '1 из 400')]) {
  assert.notStrictEqual(reportNumbers(bad), reportNumbers(base), 'сдвиг числа не пойман страховкой');
}
assert.ok(/reportNumbers\(txt\) === reportNumbers\(src\)/.test(worker), 'воркер не сверяет числа после переписывания');

console.log('test_tone: ok');
