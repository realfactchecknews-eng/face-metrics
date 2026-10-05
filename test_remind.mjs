// Напоминание о бесплатном замере: очередь, частота, тихие часы и защита от спама.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const unesc = (t) => t.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

// ── Подключение ──
assert.ok(/ctx\.waitUntil\(trackCron\(env\)\)/.test(w), 'крон напоминаний не подключён к scheduled');
const cron = w.slice(w.indexOf('async function trackCron'), w.length);

// ── Границы, чтобы это не стало спамом ──
const max = +w.match(/TRACK_REMIND_MAX\s+= (\d+)/)[1];
assert.ok(max >= 1 && max <= 3, 'писем подряд должно быть мало: ' + max);
assert.ok(/\(row\.n \|\| 0\) >= TRACK_REMIND_MAX/.test(cron), 'нет потолка писем подряд — будет слать вечно');
assert.ok(/hourMsk < TRACK_HOUR_FROM \|\| hourMsk >= TRACK_HOUR_TO/.test(cron), 'нет тихих часов — напишем ночью');
assert.ok(/getUTCHours\(\) \+ 3/.test(cron), 'час считается не по Москве — у Cloudflare UTC');
assert.ok(/sent >= TRACK_REMIND_PER_RUN/.test(cron), 'нет потолка на прогон — упрёмся в лимиты Telegram');

// ── Кого не трогаем ──
assert.ok(/guide:\$\{tgid\}`\)\) === '1'/.test(cron), 'владельцам гайда шлём второе письмо поверх их рассылки');
assert.ok(/now - last\.t < PROG_FREE_COOLDOWN/.test(cron), 'напомним тому, кто уже сделал замер сам');
assert.ok(/blocked\|chat not found\|deactivated/.test(cron), 'заблокировавшим бота будем стучаться вечно');

// ── Очередь ──
assert.ok(/if \(isFirst\) await trackTouch/.test(w), 'покупатель не попадает в очередь');
// Три вызова плюс само объявление функции.
assert.strictEqual(w.split('await trackTouch(env, ').length - 1, 4,
  'очередь: ставится при покупке, двигается после замера, чистится при покупке гайда и при отказе от писем');
assert.ok(/trackTouch\(env, tgid, \{ remove: true \}\)/.test(w), 'купивший гайд остаётся в очереди замеров');
const save = w.slice(w.indexOf('async function progSave'), w.indexOf('/* ---------- ПРОМПТ ЗАМЕРА'));
assert.ok(save.includes('trackTouch'), 'после замера срок напоминания не сдвигается');

// Очередь — одно значение, а не ключ на человека: крон ходит каждый час.
assert.ok(/getList\(env, 'tracklist'\)/.test(w), 'очередь хранится не одним списком');
assert.ok(!/trnext:\$\{/.test(w), 'вернулись ключи на каждого — это лишние чтения KV каждый час');

// ── Разовое наполнение старыми покупателями ──
const seed = w.slice(w.indexOf('async function trackSeed'), w.indexOf('async function trackCron'));
assert.ok(/tracklistSeeded/.test(seed), 'наполнение не одноразовое — перезапишет очередь');
assert.ok(/cursor/.test(seed), 'ключи перебираются без курсора — тысячи не влезут в один прогон');
assert.ok(/Math\.random\(\)/.test(seed), 'все старые покупатели получат письмо одной пачкой');

// ── Тексты ──
const txt = unesc(w);
for (const k of ['remindFirst', 'remindAgain', 'remindBtn']) {
  assert.strictEqual(txt.split(k + ':').length - 1, 2, `строка ${k} должна быть в обоих языках`);
}
assert.ok(/tips\[tgid\]|tips:\$\{tgid\}/.test(cron), 'личный совет из отчёта не подставляется');
assert.ok(/firstTip \|\| ''/.test(cron) || /\|\| ''/.test(cron), 'без совета письмо должно уходить общим, а не с пустотой');
// ── Поведение очереди на живом коде ──
// Берём настоящие getList/putList/trackTouch и крутим их на поддельном KV: ошибка здесь
// молча теряет человека из очереди или дублирует его.
const pick = (name) => { const i = w.indexOf('async function ' + name); return w.slice(i, w.indexOf('\n}', i) + 2); };
const envSrc = pick('getList') + pick('putList') + pick('trackList') + pick('trackTouch');
const DAY = 864e5;
const { trackTouch, trackList } = new Function('PROG_FREE_COOLDOWN',
  envSrc + '; return { trackTouch, trackList };')(30 * DAY);
const store = new Map();
const env = { RATE_LIMIT: { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) } };

await trackTouch(env, 777);
let l = await trackList(env);
assert.strictEqual(l.length, 1, 'покупатель не встал в очередь');
assert.strictEqual(l[0].id, '777', 'id должен храниться строкой — tgid приходит и числом, и строкой');
assert.ok(l[0].due > Date.now() + 29 * DAY, 'срок напоминания меньше 30 дней');

// Повторный вызов (второй замер) не должен плодить дубли.
await trackTouch(env, '777');
l = await trackList(env);
assert.strictEqual(l.length, 1, 'дубль в очереди — человек получит два письма');

// Счётчик писем обнуляется после замера, иначе напоминания кончатся навсегда.
l[0].n = 2; await env.RATE_LIMIT.put('tracklist', JSON.stringify(l));
await trackTouch(env, 777);
assert.strictEqual((await trackList(env))[0].n, 0, 'после замера счётчик писем не обнулился');

// Удаление (купил гайд).
await trackTouch(env, 777, { remove: true });
assert.strictEqual((await trackList(env)).length, 0, 'из очереди не удаляется');
await trackTouch(env, 777, { remove: true });  // повторное удаление не должно падать

console.log('напоминание о замере: все проверки прошли');
