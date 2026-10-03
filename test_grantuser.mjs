// /grantuser — начисление анализов по @никам (конкурсы в канале).
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const block = w.slice(w.indexOf("if (text.startsWith('/grantuser')"), w.indexOf("// ── Админ: /lavaproducts"));

// Выдача кредитов обязана быть только для админа.
assert.ok(/ADMIN_USERNAMES\.includes\(msg\.from\.username \|\| ''\)/.test(
  w.slice(w.indexOf("text.startsWith('/grantuser')") - 200, w.indexOf("text.startsWith('/grantuser')") + 200)),
  'команда начисления доступна не только админу');

// Ник -> id отдаёт сам Telegram: своей таблицы ников у нас нет.
assert.ok(/getChat/.test(block), 'ник не превращается в id');
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
console.log('/grantuser: все проверки прошли');
