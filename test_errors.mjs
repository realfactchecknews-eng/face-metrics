// Ошибка анализа должна называть ПРИЧИНУ. Раньше всё сваливалось в «Сервис перегружен»,
// и по скриншоту от человека нельзя было понять, отклонила модель фото или упал провайдер.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const w = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const pick = (re) => { const m = w.match(re); assert.ok(m, 'не нашёл в worker.js: ' + re); return m[0]; };
const { explainAiError, msgKind } = new Function(
  pick(/^function explainAiError[\s\S]*?^\}/m) + '\n' + pick(/^function msgKind[\s\S]*?^\}/m)
  + '\nreturn { explainAiError, msgKind };')();

const cases = [
  [200, 'Image rejected by moderation', 'E-MOD'],
  [400, 'content_filter triggered',     'E-MOD'],
  [400, 'could not decode image',       'E-IMG'],
  [400, 'unsupported mime type',        'E-IMG'],
  [413, 'request entity too large',     'E-BIG'],
  [429, 'rate limit exceeded',          'E-RATE'],
  [402, 'insufficient credits',         'E-BAL'],
  [503, 'provider temporarily unavailable', 'E-UP'],
  [0,   'fetch failed',                 'E-UP'],
  [0,   'unknown',                      'E-NET'],
];
for (const [status, err, code] of cases) {
  const r = explainAiError(status, err, 'ru');
  assert.equal(r.code, code, `${status} «${err}» → ждём ${code}, вышло ${r.code}`);
  assert.ok(r.text.length > 40, 'сообщение должно объяснять, а не быть кодом: ' + code);
  assert.ok(!/перегруж/i.test(r.text) || code === 'E-UP', 'про перегрузку пишем только когда она и есть: ' + code);
  // Человеку важно знать, списали ли с него анализ, когда виноваты не он.
  if (['E-RATE', 'E-BAL', 'E-UP', 'E-NET'].includes(code)) {
    assert.match(r.text, /не списан/, 'в ошибке не по вине человека говорим, что анализ не списан: ' + code);
  }
  assert.ok(explainAiError(status, err, 'en').text !== r.text, 'английская версия отличается: ' + code);
}

// Код причины обязан доезжать до экрана: по нему разбираем жалобы со скриншотов.
// В тексте его нет — сайт рисует отдельной строкой, иначе он дублировался.
assert.match(w, /return json\(\{ error: 'model', code: why\.code, text: why\.text \}\)/, 'код едет отдельным полем');
assert.ok(!/Сервис перегружен, попробуйте ещё раз/.test(w), 'старая заглушка убрана');
for (const [status, err, code] of cases) {
  assert.ok(!explainAiError(status, err, 'ru').text.includes(code), 'код не продублирован в тексте: ' + code);
}

// Сайт обязан показать код и дать выход: без кнопок человек упирается в тупик.
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
assert.match(app, /data\.error === "model"/, 'ошибка модели разбирается отдельно');
assert.match(app, /t\("errCode"\) \+ data\.code/, 'код причины показывается человеку');
assert.match(app, /t\("errSupport"\)/, 'есть кнопка в поддержку');
assert.match(app, /t\("errRetry"\)/, 'есть кнопка повтора');
// Повторять отклонённое фото бессмысленно — нужен другой снимок.
assert.match(app, /var RETRYABLE = \["E-RATE", "E-BAL", "E-UP", "E-LEN", "E-NET"\]/, 'повтор предлагается не всегда');

// Где повтор бесполезен, человека ведём за другим фото, а не в тот же тупик.
assert.match(app, /t\("errAnotherPhoto"\)/, 'для отклонённого фото предлагается другое');
assert.match(app, /\/\^E-\\d\//, 'числовые коды вроде E-500 считаются повторяемыми');
// Две залитые кнопки подряд спорят друг с другом: вторая должна быть тише.
assert.match(app, /sa\.className = "gate-secondary"/, 'поддержка оформлена вторичной кнопкой');
assert.match(readFileSync(new URL('./style.css', import.meta.url), 'utf8'), /\.gate-secondary \{/, 'стиль вторичной кнопки есть');
for (const k of ['errRetry', 'errSupport', 'errCode']) {
  assert.ok((app.match(new RegExp(k + ':', 'g')) || []).length >= 2, 'подпись есть на двух языках: ' + k);
}

// Саппорт-бот: вложения распознаются и не молчат.
assert.equal(msgKind({ photo: [{}] }), 'фото');
assert.equal(msgKind({ document: { file_name: 'log.txt' } }), 'файл «log.txt»');
assert.equal(msgKind({ voice: {} }), 'голосовое');
assert.equal(msgKind({ text: 'привет' }), null, 'обычный текст вложением не считается');
assert.match(w, /copyMessage/, 'вложение уходит оператору как есть, а не строкой «нетекстовое сообщение»');
assert.match(w, /@humblemogg/, 'в ответе про вложения есть куда их прислать');
assert.ok(!/msg\.text \|\| '\[нетекстовое сообщение\]'/.test(w), 'подпись к фото больше не теряется');

console.log('ошибки и вложения: все проверки прошли');
