// Кэш разбора по фото: повторная загрузка того же снимка не должна вызывать модель.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const w = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pick = (s, re) => { const m = s.match(re); assert.ok(m, 'не нашёл: ' + re); return m[0]; };

const photoCacheKey = new Function('crypto',
  pick(w, /^const REPORT_CACHE_VER = '[^']+';/m) + '\n'
  + pick(w, /^async function photoCacheKey[\s\S]*?^\}/m) + '\nreturn photoCacheKey;')(webcrypto);

const img = 'AAAABBBB', other = 'ZZZZ';
const base = await photoCacheKey(111, [img], 'ru', false);
assert.equal(base, await photoCacheKey(111, [img], 'ru', false), 'тот же снимок того же человека — тот же ключ');
assert.notEqual(base, await photoCacheKey(222, [img], 'ru', false), 'у другого человека свой кэш: чужой снимок не прогнать бесплатно');
assert.notEqual(base, await photoCacheKey(111, [img], 'en', false), 'другой язык — другой отчёт');
assert.notEqual(base, await photoCacheKey(111, [img], 'ru', true), 'тизер и полный разбор не путаются');
assert.notEqual(base, await photoCacheKey(111, [other], 'ru', false), 'другое фото — другой ключ');
assert.notEqual(base, await photoCacheKey(111, [img, other], 'ru', false), 'добавленный профиль — другой ключ');
assert.match(base, /^rep:v[0-9]+:111:[0-9a-f]{24}:ru:f$/, 'формат ключа: rep:версия:tgid:хэш:язык:тизер');
// Версия в ключе — единственный способ разом отключить старый кэш: перебрать ключи
// нельзя, листинг KV отдаёт их неполно (44 из тысяч на боевом namespace 07.10.2026).
// Поднимаешь версию — старые записи становятся недостижимы и уходят сами по TTL.
assert.match(w, /const REPORT_CACHE_VER = 'v2';/, 'версия формата отчёта проставлена');

// Замеры гайда и дуэль не кэшируем, и кэш проверяется ДО списания кредита.
assert.match(w, /const cacheKey = !isMeasure && !body\.compare && imgs\.length/, 'замер и дуэль мимо кэша');
const analyze = pick(w, /async function analyze\(request, env\)[\s\S]*?\n\}/);
assert.ok(analyze.indexOf('const hit = await env.RATE_LIMIT.get(cacheKey)') < analyze.indexOf('openrouter.ai'),
  'при попадании модель не вызывается');
assert.match(w, /expirationTtl: 60 \* 24 \* 3600/, 'кэш живёт 60 дней');

// Новый отчёт обязан записаться — иначе за каждый повтор снимка платим второй раз.
// Чтение и запись должны идти по ОДНОЙ переменной: если их развести, кэш молча
// перестанет попадать, а заметно это будет только по счёту от OpenRouter.
assert.match(analyze, /await env\.RATE_LIMIT\.put\(cacheKey, data\.choices\[0\]\.message\.content/,
  'готовый отчёт кладётся в кэш');
assert.match(analyze, /const hit = await env\.RATE_LIMIT\.get\(cacheKey\)/, 'и читается оттуда же');
assert.equal((analyze.match(/await photoCacheKey\(/g) || []).length, 1, 'ключ считается один раз на запрос');

// С 30.09 повтор того же снимка СПИСЫВАЕТСЯ как обычный анализ: токены экономим, но
// бесплатной перезагрузки одного и того же больше нет.
const hitBlock = analyze.slice(analyze.indexOf('const hit = await env.RATE_LIMIT.get(cacheKey)'), analyze.indexOf('// Модель.'));
assert.ok(hitBlock.includes('chargeQuota'), 'повтор снова бесплатный');
// Подписи про повтор быть НЕ должно: повторный отчёт ничем не отличается от первого.
// Конвейер детерминированный, модель вернула бы тот же текст, и анализ списывается так же —
// отличать нечего, а подпись только сеяла сомнение в оценке.
assert.ok(!app.includes('cachedNote'), 'подпись про сохранённый отчёт вернулась');
assert.ok(!app.includes('cached-note'), 'остался узел подписи');

console.log('кэш по фото: все проверки прошли');
