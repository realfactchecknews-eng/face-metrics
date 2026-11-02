// Вход через Telegram посреди анализа. Раньше после входа страница перезагружалась и
// человек терял фото. Хранение фото исполняем по-настоящему на подставном хранилище.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const a = readFileSync('app.js', 'utf8');
const fn = (name) => a.match(new RegExp('^function ' + name + '[\\s\\S]*?^\\}', 'm'))[0];

const poll = fn('pollTgLogin');
assert.ok(!/location\.reload/.test(poll), 'после входа снова перезагрузка — фото пропадёт');
assert.match(poll, /onLoginSuccess\(st\)/, 'после входа ничего не продолжается');
assert.ok(!/location\.reload\(\)/.test(a.replace(/\/\/.*$/gm, '')), 'перезагрузка где-то ещё');

const start = fn('startTgLogin');
assert.match(start, /if \(_afterGate === startAI && _pendingAnalysis\) saveResumePhotos\(\)/, 'фото не сохраняется перед уходом в Telegram');
assert.ok(start.indexOf('saveResumePhotos') < start.indexOf('location.href'), 'сохранять надо до ухода со страницы');

const login = fn('onLoginSuccess');
assert.match(login, /pwRecheck\(\)/, 'живая страница должна продолжить анализ сама');
assert.match(login, /resumeSavedAnalysis\(\)/, 'выгруженная страница должна поднять фото');
assert.match(a, /clearResumePhotos\(\);\n\s*backToUploadTop\(\);/, 'закрыл гейт — фото должно стираться');

// Хранение по-настоящему: срок 30 минут, мусор и чужие данные не ломают страницу.
const store = new Map();
const localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
let now = 1e12;
const api = new Function('localStorage', 'Date',
  a.match(/^var RESUME_KEY = .*$/m)[0] + '\n' + a.match(/^var RESUME_MAX_MS = .*$/m)[0] + '\n' +
  fn('clearResumePhotos') + '\n' + fn('readResumePhotos') + '\nreturn { readResumePhotos, RESUME_KEY };')(
  localStorage, { now: () => now });
store.set(api.RESUME_KEY, JSON.stringify({ ts: now, front: 'data:x', side: null }));
assert.equal(api.readResumePhotos().front, 'data:x', 'свежее фото должно читаться');
now += 31 * 60 * 1000;
assert.equal(api.readResumePhotos(), null, 'старше 30 минут — не поднимаем');
assert.equal(store.size, 0, 'просроченное фото стирается');
store.set(api.RESUME_KEY, '{битый');
assert.equal(api.readResumePhotos(), null, 'битые данные не ломают страницу');
assert.equal(store.size, 0);

const resume = fn('resumeSavedAnalysis');
assert.match(resume, /if \(!getAccount\(\)\) return false/, 'без входа поднимать фото бессмысленно — упрётся в тот же гейт');
assert.ok(resume.indexOf('clearResumePhotos()') < resume.indexOf('runAnalysis'), 'фото стирается до запуска, а не после');
assert.match(resume, /runWithGates\(runAnalysis\)/, 'соглашение должно проверяться и при продолжении');
console.log('вход посреди анализа: все проверки прошли');
