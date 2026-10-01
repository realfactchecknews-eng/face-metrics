// Бесплатный замер раз в 30 дней тем, кто хоть раз платил — механика возврата.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const app = readFileSync('app.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

// ── Ритмы ──
const free = w.match(/const PROG_FREE_COOLDOWN = (\d+) \* 24 \* 3600e3/);
assert.ok(free, 'нет отдельного кулдауна для бесплатных замеров');
assert.strictEqual(+free[1], 30, 'бесплатный замер должен быть раз в 30 дней');
const paid = +w.match(/const PROG_COOLDOWN\s+= (\d+) \* 24 \* 3600e3/)[1];
assert.ok(paid < 30, 'у владельцев гайда ритм должен остаться чаще — это часть того, за что платят');

// ── Гейт замера ──
const gate = w.slice(w.indexOf('if (isMeasure) {'), w.indexOf('const freeAvail'));
assert.ok(/!hasGuide && !buyer/.test(gate), 'замеры по-прежнему только для владельцев гайда');
assert.ok(/measureCooldown = hasGuide \? PROG_COOLDOWN : PROG_FREE_COOLDOWN/.test(gate), 'ритм не зависит от наличия гайда');
assert.ok(!/Date\.now\(\) - plast\.t < PROG_COOLDOWN/.test(gate), 'в проверке остался жёсткий кулдаун владельца гайда');
assert.ok(/measureCooldown - \(Date\.now\(\) - plast\.t\)/.test(gate), 'остаток до замера считается по чужому ритму');

// ── Что отдаёт /progress ──
const st = w.slice(w.indexOf('const tracking = !hasGuide'), w.indexOf('// Персональный текст задания недели'));
assert.ok(/guide: hasGuide/.test(st), 'воркер выдаёт guide:true тем, кто гайд не покупал');
assert.ok(/tracking,/.test(st), 'нет флага урезанного режима');
assert.ok(/week: hasGuide \?/.test(st), 'план недели уходит тем, кто за него не платил');
assert.ok(/lastText: hasGuide &&/.test(st), 'текст гайда уходит тем, кто за него не платил');
assert.ok(/cooldownDays/.test(st), 'фронту не из чего взять ритм замеров');

// ── Фронт ──
assert.ok(/!d\.guide && !d\.tracking/.test(app), 'урезанный режим не пускается в «Ведение»');
assert.ok(/pgShowUnlocked\(!d\.guide\)/.test(app), 'фронт не знает, что показывать урезанно');
// pgShowLocked объявлена ВЫШЕ pgShowUnlocked — границу берём по следующей функции.
const showStart = app.indexOf('function pgShowUnlocked');
const show = app.slice(showStart, app.indexOf('\nfunction ', showStart + 10));
for (const id of ['p3', 'p4', 'weekCard']) assert.ok(show.includes(`'${id}'`), `блок ${id} не прячется без гайда`);
assert.ok(/#tabs \.tab/.test(show), 'вкладки плана и гайда остаются кликабельными');
assert.ok(/PG && PG\.cooldownDays/.test(app) || /PG\.cooldownDays/.test(show), 'подпись про ритм захардкожена');
assert.ok(html.includes('id="pgUpsell"'), 'нет блока про то, что ещё даёт гайд');

// ── Человек должен узнать, что замеры открылись ──
assert.strictEqual(w.split('trackingOpen').length - 1, 5, 'уведомление должно быть в обоих языках и на всех трёх способах оплаты');
assert.strictEqual(w.split("pack?.type !== 'guide' ? ").length - 1, 3, 'покупателям гайда это сообщение не нужно — проверка должна стоять на всех трёх способах оплаты');
assert.ok(/isFirst && pack\?\.type !== 'guide'/.test(w), 'уведомление шлётся не только при первой покупке');

console.log('замеры для плативших: все проверки прошли');
