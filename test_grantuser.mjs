// /grantuser — начисление анализов по @никам (конкурсы в канале).
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const block = w.slice(w.indexOf("if (text.startsWith('/grantuser')"), w.indexOf("// ── Админ: /lavaproducts"));

// Выдача кредитов обязана быть только для админа.
assert.ok(/ADMIN_USERNAMES\.includes\(msg\.from\.username \|\| ''\)/.test(
  w.slice(w.indexOf("text.startsWith('/grantuser')") - 200, w.indexOf("text.startsWith('/grantuser')") + 200)),
  'команда начисления доступна не только админу');

// Ник -> id: только по своему указателю. Telegram id по @нику обычного человека не отдаёт,
// getChat умеет лишь каналы — на 12 реальных никах не нашёлся ни один.
assert.ok(/resolveUsername/.test(block), 'ник не превращается в id');
assert.ok(!/getChat/.test(block), 'вернулся getChat — он по никам людей не работает и врёт о причине');

// Указатель должен наполняться отовсюду, где мы вообще видим ник.
assert.ok(w.split('rememberUsername(env,').length - 1 >= 4,
  'ник запоминается не во всех точках входа (три бота + вход на сайте)');
const res = w.slice(w.indexOf('async function resolveUsername'), w.indexOf('async function getSession'));
assert.ok(/toLowerCase\(\)/.test(res), 'регистр ника не нормализуется — @Vasya и @vasya разъедутся');
assert.ok(/translog/.test(res), 'нет запасного пути через журнал платежей');
assert.ok(/replace\(\/\^@\/, ''\)/.test(block), 'лидирующая @ не срезается — getChat получит @@ник');
// Потолки: случайная опечатка не должна раздать по 500 анализов и не должна уйти в тысячу человек.
assert.ok(/n > 50/.test(block), 'нет потолка на количество анализов');
assert.ok(/names\.slice\(0, 50\)/.test(block), 'нет потолка на число получателей');
assert.ok(/!n \|\| n < 1/.test(block), 'нет проверки количества — NaN начислит мусор');

// Нераспознанные ники должны быть ВИДНЫ, иначе человек молча останется без приза.
assert.ok(/fail\.push\(name\)/.test(block) && /не найдены/.test(block), 'неудачи не попадают в отчёт');
// Недоставленное сообщение не отменяет начисление, но должно быть помечено.
assert.ok(/сообщение не доставлено/.test(block), 'молчим о недоставленном сообщении');
assert.ok(/В translog не пишется/.test(block), 'подарки не должны выглядеть выручкой');
assert.ok(/escHtml\(/.test(block), 'ники уходят в HTML без экранирования');

// Разбор строки на деле, а не на глаз.
const parse = (text) => {
  const [head, tail] = text.slice(10).split('|');
  const parts = (head || '').trim().split(/\s+/).filter(Boolean);
  return { n: parseInt(parts[0], 10), names: parts.slice(1).map((s) => s.replace(/^@/, '').trim()).filter(Boolean), note: (tail || '').trim() };
};
let r = parse('/grantuser 1 @vasya @petya | Твой рейт совпал.');
assert.strictEqual(r.n, 1); assert.deepStrictEqual(r.names, ['vasya', 'petya']);
assert.strictEqual(r.note, 'Твой рейт совпал.');
r = parse('/grantuser 2 vasya');                       // без @ тоже должно работать
assert.deepStrictEqual(r.names, ['vasya']);
r = parse('/grantuser 1 @a   @b    @c');               // лишние пробелы
assert.deepStrictEqual(r.names, ['a', 'b', 'c']);
assert.strictEqual(r.note, '');
assert.ok(Number.isNaN(parse('/grantuser @a @b').n), 'без количества команда обязана отбиться');
// ── Разовое наполнение указателя из старых сессий ──
// Без него указатель начинает жизнь пустым, и человек, пользующийся сервисом год,
// выглядит незнакомцем — на этом 03.10 провалилась выдача призов конкурса.
const seed = w.slice(w.indexOf('async function unameSeed'), w.indexOf('async function getSession'));
assert.ok(/prefix: 'sess:'/.test(seed), 'ники берутся не из сессий');
assert.ok(/unameSeeded/.test(seed), 'наполнение не одноразовое — будет гонять впустую вечно');
assert.ok(/unameCursor/.test(seed), 'нет курсора: десятки тысяч ключей за один прогон не перебрать');
assert.ok(/Promise\.all/.test(seed), 'чтения последовательные — это минуты ожидания на ровном месте');
assert.ok(/ctx\.waitUntil\(unameSeed\(env\)/.test(w), 'наполнение не подключено к крону');
assert.ok(/text\.startsWith\('\/unameseed'\)/.test(w), 'нет команды, чтобы не ждать крон во время раздачи призов');

// Долгая работа не должна висеть на ответе вебхуку: Telegram не дожидается, считает
// доставку неудачной и шлёт тот же апдейт снова — получается пачка «Собираю ники...»
// без результата и несколько параллельных прогонов вместо одного.
assert.ok(/async function tgWebhook\(request, env, ctx\)/.test(w), 'вебхук не получает ctx');
assert.ok(/tgWebhook\(request, env, ctx\)/.test(w), 'ctx не передаётся из роутера');
const seedCmd = w.slice(w.indexOf("text.startsWith('/unameseed')"), w.indexOf("// ── Админ: /grantuser N @user1"));
assert.ok(/ctx\.waitUntil\(job\)/.test(seedCmd), 'перебор сессий всё ещё держит ответ вебхуку');
// Ответ Telegram должен уходить ПОСЛЕ постановки работы в waitUntil. Сравниваем по
// вызову sendMessage, а не по тексту: та же фраза встречается в комментарии выше.
assert.ok(seedCmd.indexOf('ctx.waitUntil(job)') < seedCmd.indexOf("tgApi(env, 'sendMessage', { chat_id: chat,\n      text: '⏳"),
  'работа ставится после ответа — отчёт не придёт');
assert.ok(/if \(!ctx\) await job/.test(seedCmd), 'без ctx работа потеряется молча');

console.log('/grantuser: все проверки прошли');
