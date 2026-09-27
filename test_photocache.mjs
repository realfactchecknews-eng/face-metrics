// Кэш разбора по фото: повторная загрузка того же снимка не должна вызывать модель.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const w = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pick = (s, re) => { const m = s.match(re); assert.ok(m, 'не нашёл: ' + re); return m[0]; };

const photoCacheKey = new Function('crypto', pick(w, /^async function photoCacheKey[\s\S]*?^\}/m) + '\nreturn photoCacheKey;')(webcrypto);

const img = 'AAAABBBB', other = 'ZZZZ';
const base = await photoCacheKey(111, [img], 'ru', false);
assert.equal(base, await photoCacheKey(111, [img], 'ru', false), 'тот же снимок того же человека — тот же ключ');
assert.notEqual(base, await photoCacheKey(222, [img], 'ru', false), 'у другого человека свой кэш: чужой снимок не прогнать бесплатно');
assert.notEqual(base, await photoCacheKey(111, [img], 'en', false), 'другой язык — другой отчёт');
assert.notEqual(base, await photoCacheKey(111, [img], 'ru', true), 'тизер и полный разбор не путаются');
assert.notEqual(base, await photoCacheKey(111, [other], 'ru', false), 'другое фото — другой ключ');
assert.notEqual(base, await photoCacheKey(111, [img, other], 'ru', false), 'добавленный профиль — другой ключ');
assert.match(base, /^rep:111:[0-9a-f]{24}:ru:f$/, 'формат ключа: rep:tgid:хэш:язык:тизер');

// Замеры гайда и дуэль не кэшируем, и кэш проверяется ДО списания кредита.
assert.match(w, /const cacheKey = !isMeasure && !body\.compare && imgs\.length/, 'замер и дуэль мимо кэша');
const analyze = pick(w, /async function analyze\(request, env\)[\s\S]*?\n\}/);
assert.ok(analyze.indexOf('const hit = await env.RATE_LIMIT.get(cacheKey)') < analyze.indexOf('Списание ПОСЛЕ успеха'),
  'попадание в кэш отдаётся до списания: за повтор того же снимка платить не за что');
assert.ok(analyze.indexOf('const hit = await env.RATE_LIMIT.get(cacheKey)') < analyze.indexOf('openrouter.ai'),
  'при попадании модель не вызывается');
assert.match(w, /expirationTtl: 60 \* 24 \* 3600/, 'кэш живёт 60 дней');

// На сайте человек должен понимать, почему отчёт прежний.
assert.match(app, /if \(data\.cached\)/, 'сайт различает ответ из кэша');
assert.match(app, /cachedNote: "Это тот же снимок/, 'есть русская подпись');
assert.match(app, /cachedNote: "Same photo as before/, 'есть английская подпись');
assert.match(app, /var oldNote = document\.getElementById\("cachedNote"\)/, 'подпись убирается при новом анализе');

console.log('кэш по фото: все проверки прошли');
