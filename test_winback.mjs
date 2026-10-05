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
// Цена в письме считается, а не пишется руками: акция кончится, а письма продолжат
// уходить каждый день — и начнут врать о цене.
assert.ok(/text = b\.wbFirst\(priceLine\(L\)\)/.test(w), 'письмо не получает живую цену');
const pl = w.slice(w.indexOf('function priceLine'), w.indexOf("async function wbList"));
assert.ok(/PACKS\.p1/.test(pl) && /saleActive\(\)/.test(pl), 'цена в письме не привязана к тарифам и акции');
assert.ok(/p\.oldRub > p\.rub/.test(pl), 'без скидки письмо всё равно пообещает «потом дороже»');
// Ни одна цена не должна быть вшита в текст письма.
const texts = txt.slice(txt.indexOf('wbFirst:'), txt.indexOf('wbStopped:'));
assert.ok(!/\d{2,3}\s*₽/.test(texts), 'в тексте письма вшита цена — после акции он станет враньём');
assert.ok(!/\d+ (октября|ноября|сентября)/.test(texts), 'в тексте письма вшита дата акции');

// Проверяем обе ветки строки цены на живом коде.
const mk = (rub, oldRub, active) => new Function('PACKS', 'saleActive', 'SALE_ENDS_AT',
  pl + '; return priceLine;')({ p1: { rub, oldRub } }, () => active, Date.parse('2026-10-09T12:00:00+03:00'));
assert.match(mk(79, 99, true)('ru'), /79 ₽ до 9 октября, потом 99/, 'во время акции цена названа неверно');
assert.strictEqual(mk(99, 99, false)('ru'), 'Открыть целиком — 99 ₽.', 'после акции письмо всё ещё обещает скидку');
assert.strictEqual(mk(79, 99, false)('ru'), 'Открыть целиком — 79 ₽.', 'акция кончилась, а «потом дороже» осталось');
console.log('дожим: все проверки прошли');
