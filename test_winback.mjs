// Дожим после бесплатного разбора: очередь, границы и отказ от писем.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const unesc = (t) => t.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const cron = w.slice(w.indexOf('async function winbackCron'), w.indexOf('/* ========='));

assert.ok(/ctx\.waitUntil\(winbackCron\(env\)\)/.test(w), 'крон дожима не подключён');

// ── Границы. Это непрошеная рассылка: без них Telegram ограничит бота, а через него идут деньги.
assert.strictEqual(+w.match(/WB_MAX\s+= (\d+)/)[1], 2, 'писем за всю жизнь должно быть два');
assert.ok(/\(row\.n \|\| 0\) >= WB_MAX/.test(cron), 'нет потолка писем');
assert.ok(/hourMsk < TRACK_HOUR_FROM/.test(cron), 'нет тихих часов');
assert.ok(/sent >= WB_PER_RUN/.test(cron), 'нет потолка на прогон');
assert.ok(/everBought:\$\{tgid\}/.test(cron), 'купившему продолжим слать');
assert.ok(/nomail:\$\{tgid\}/.test(cron), 'отказ от писем не проверяется');
assert.ok(/blocked\|chat not found\|deactivated/.test(cron), 'заблокировавшим будем стучаться вечно');

// ── Кнопка отказа обязана быть в КАЖДОМ письме и гасить все рассылки сразу.
assert.ok(/kb\.push\(\[\{ text: b\.wbStop, callback_data: 'nomail' \}\]\)/.test(cron), 'нет кнопки отказа');
const cb = w.slice(w.indexOf("if (data === 'nomail')"), w.indexOf('// Переключение языка'));
assert.ok(/put\(`nomail:\$\{tgid\}`, '1'\)/.test(cb) && !/expirationTtl/.test(cb), 'отказ должен быть бессрочным');
assert.ok(/wbDrop/.test(cb) && /trackTouch\(env, tgid, \{ remove: true \}\)/.test(cb),
  'отказ должен гасить обе рассылки, а не только ту, из которой нажали');
const track = w.slice(w.indexOf('async function trackCron'), w.indexOf('async function wbList'));
assert.ok(/nomail:\$\{tgid\}/.test(track) || /nomail/.test(track), 'напоминания о замерах игнорируют отказ');

// ── Очередь
assert.ok(/if \(!buyer && \(mode === 'free' \|\| mode === 'holder'\)\) await wbEnqueue/.test(w),
  'в очередь попадают не только бесплатные разборы неплативших');
assert.ok(/await wbDrop\(env, entry\.tgid\)/.test(w), 'покупка не убирает из очереди');
const enq = w.slice(w.indexOf('async function wbEnqueue'), w.indexOf('async function wbDrop'));
assert.ok(/list\.some\(/.test(enq), 'повторный разбор создаст дубль в очереди');
assert.ok(/nomail/.test(enq), 'отказавшегося можно снова поставить в очередь');

// ── Скидка во втором письме
assert.strictEqual(+w.match(/WB_DISCOUNT_PCT\s+= (\d+)/)[1], 25, 'скидка второго письма должна быть 25%');
assert.ok(/Math\.max\(pd, WB_DISCOUNT_PCT\)/.test(cron), 'своя скидка может быть больше — её нельзя перебивать');
assert.ok(/pd < WB_DISCOUNT_PCT/.test(cron), 'более щедрая скидка затирается нашей');
assert.ok(/expirationTtl: 3 \* 24 \* 3600/.test(cron), 'скидка без срока — срочность во втором письме станет ложью');

// ── Тексты
const txt = unesc(w);
for (const k of ['wbFirst', 'wbSecond', 'wbFirstBtn', 'wbSecondBtn', 'wbStop', 'wbStopped']) {
  assert.ok(txt.split(k + ':').length - 1 >= 2, `строка ${k} должна быть в обоих языках`);
}
// Балл подставляется, только если он есть: выдумывать число нельзя.
assert.ok(/wbFirst: \(score\) => \(score/.test(txt), 'письмо не умеет работать без сохранённого балла');
assert.ok(/lastscore:\$\{tgid\}/.test(w), 'балл нигде не сохраняется');
console.log('дожим: все проверки прошли');
