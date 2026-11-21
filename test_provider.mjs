// Пин провайдера и seed. Жалобы «одно фото рейтит по-разному» шли отсюда: у Gemini пина не было,
// и «Google» против «Google AI Studio» давали разницу в 1.1 балла на одном фото (замер 28.09.2026).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const w = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const pick = (re) => { const m = w.match(re); assert.ok(m, 'не нашёл: ' + re); return m[0]; };

const buildBodySrc = pick(/  const buildBody = \(attempt\) => \{[\s\S]*?\n  \};/);
const build = new Function('model', 'isTeaser', 'stable', 'sessionId', 'messages', 'backupMessages = messages', `
  const MODEL_BACKUP = 'x-ai/grok-4.3';
  ${buildBodySrc}
  return (attempt) => JSON.parse(buildBody(attempt));
`);

const gem = build('google/gemini-3.7-flash', false, true, 's', []);
const gemOld = build('google/gemini-3.7-flash', false, false, 's', []);   // старый app.js без stable
const grok = build('x-ai/grok-4.3', false, true, 's', []);

assert.deepEqual(gem(0).provider, { order: ['google-ai-studio'], allow_fallbacks: true }, 'Gemini пинится на AI Studio');
assert.deepEqual(gemOld(0).provider, gem(0).provider, 'пин не зависит от флага stable: старый кэш тоже должен быть стабилен');
assert.deepEqual(grok(0).provider, { order: ['xai'], allow_fallbacks: true }, 'у запасной модели свой пин');
assert.equal(gem(0).provider.allow_fallbacks, true, 'фолбэк оставлен: падение бэкенда не должно превращаться в ошибку');

// seed есть на КАЖДОЙ попытке и у каждой свой
const seeds = [0, 1, 2, 3].map((a) => gem(a).seed);
assert.ok(seeds.every((s) => typeof s === 'number'), 'seed есть на всех четырёх попытках: ' + seeds);
assert.equal(new Set(seeds).size, 4, 'у каждой попытки свой seed, иначе ретрай упрётся в тот же пустой ответ');
assert.equal(gem(0).seed, build('google/gemini-3.7-flash', false, true, 's', [])(0).seed, 'одна и та же попытка — тот же seed');
assert.equal(gem(0).temperature, 0, 'температура 0');

// отдельная оценка лиц дуэли — с тем же пином, иначе дуэль и анализ разъедутся
const duel = pick(/^async function rateFacesSeparately[\s\S]*?^\}/m);
assert.match(duel, /google-ai-studio/, 'дуэль пинится так же');
assert.match(w, /console\.log\('AI ok'[^)]*provider: data\.provider/, 'провайдер пишется в лог для разбора жалоб');

// Проверка возраста (21.11.2026) уходит только в запасную модель. Основной промпт не меняется:
// любая его правка двигает баллы, а без замера на 52 лицах её не выкатывают.
const MAIN_MSG = [{ role: 'user', content: 'main' }], BACKUP_MSG = [{ role: 'user', content: 'guard+main' }];
assert.deepEqual(build('google/gemini-3.7-flash', false, true, 's', MAIN_MSG, BACKUP_MSG)(0).messages, MAIN_MSG, 'основная модель — без проверки возраста');
assert.deepEqual(build('x-ai/grok-4.3', false, true, 's', MAIN_MSG, BACKUP_MSG)(1).messages, BACKUP_MSG, 'запасная — с проверкой возраста');
assert.match(w, /const AGE_GUARD = '[^']*under 18[^']*UNDERAGE/, 'проверка возраста на месте');
assert.match(w, /usedBackup && \/\^\\W\*UNDERAGE/, 'ответ UNDERAGE превращается в отказ E-AGE');

console.log('пин провайдера: все проверки прошли');
