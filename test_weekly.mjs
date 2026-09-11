// Ответ на «справился с заданием?» приходит из кнопки, которая навсегда остаётся
// в переписке. Без защиты десять нажатий давали десять недель серии.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const fn = src.match(/^async function progressCallback[\s\S]*?^\}/m)[0];

// проверка «уже отвечал» обязана стоять ДО начисления серии
const iGuard  = fn.indexOf('wdone:${tgid}:${week}`)');
const iStreak = fn.indexOf('streak += 1');
assert.ok(iGuard > -1, 'ответ за неделю читается из KV');
assert.ok(iGuard < iStreak, 'проверка стоит раньше, чем растёт серия');

// запись ответа — тоже до начисления, иначе сбой в середине даст повтор
const iWrite = fn.indexOf('RATE_LIMIT.put(`wdone:');
assert.ok(iWrite > -1 && iWrite < iStreak, 'ответ фиксируется до начисления');

// ранний выход есть
assert.match(fn, /if \(already !== null\)[\s\S]*?return new Response\('ok'\)/,
  'повторный клик выходит, ничего не меняя');

// «не вышло» не должно отправлять ждать неделю
const failBranch = fn.slice(fn.indexOf("} else {"));
assert.ok(!/со следующей|через неделю|next week/i.test(failBranch),
  'в ответе на «не вышло» нет отсылки ждать неделю');
assert.match(failBranch, /Ждать неделю не надо/, 'предлагаем начать сегодня');
assert.match(failBranch, /PLAN\[/, 'задание недели повторяется в сообщении');

console.log('недельный опрос: все проверки прошли');
