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
assert.match(w, /text: `\$\{why\.text\} \(\$\{why\.code\}\)`/, 'код подставляется в текст ошибки');
assert.ok(!/Сервис перегружен, попробуйте ещё раз/.test(w), 'старая заглушка убрана');

// Саппорт-бот: вложения распознаются и не молчат.
assert.equal(msgKind({ photo: [{}] }), 'фото');
assert.equal(msgKind({ document: { file_name: 'log.txt' } }), 'файл «log.txt»');
assert.equal(msgKind({ voice: {} }), 'голосовое');
assert.equal(msgKind({ text: 'привет' }), null, 'обычный текст вложением не считается');
assert.match(w, /copyMessage/, 'вложение уходит оператору как есть, а не строкой «нетекстовое сообщение»');
assert.match(w, /@humblemogg/, 'в ответе про вложения есть куда их прислать');
assert.ok(!/msg\.text \|\| '\[нетекстовое сообщение\]'/.test(w), 'подпись к фото больше не теряется');

console.log('ошибки и вложения: все проверки прошли');
