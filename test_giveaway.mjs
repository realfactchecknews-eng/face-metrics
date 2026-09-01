// Проверка, что мини-приложение не даёт постороннему создавать розыгрыши и не
// пускает неподписанного в участники. Логика скопирована из giveawayApi.
import assert from 'node:assert';

const ADMIN_USERNAMES = ['humblemogg'], FACE_ADMIN_TGID = 1031760975;
const isAdmin = (u) => u.id === FACE_ADMIN_TGID || ADMIN_USERNAMES.includes(u.username || '');

assert.equal(isAdmin({ id: 1031760975, username: '' }), true,  'админ по id');
assert.equal(isAdmin({ id: 5, username: 'humblemogg' }), true, 'админ по username');
assert.equal(isAdmin({ id: 5, username: 'stranger' }), false,  'посторонний не админ');
assert.equal(isAdmin({ id: 5 }), false,                        'без username не админ');

// границы значений при создании
const clamp = (b) => ({
  winners: Math.max(1, Math.min(50, parseInt(b.winners, 10) || 1)),
  credits: Math.max(0, Math.min(100, parseInt(b.credits, 10) || 0)),
  days:    Math.max(1, Math.min(60, parseInt(b.days, 10) || 7)),
});
assert.deepEqual(clamp({ winners: 999, credits: -5, days: 0 }), { winners: 50, credits: 0, days: 7 });
assert.deepEqual(clamp({ winners: 'x', credits: 'x', days: 'x' }), { winners: 1, credits: 0, days: 7 });
assert.deepEqual(clamp({ winners: 3, credits: 5, days: 7 }), { winners: 3, credits: 5, days: 7 });

// призы обрезаются по числу победителей и по длине
const prizes = (arr, winners) => arr.slice(0, winners).map((p) => String(p).slice(0, 120));
assert.equal(prizes(['a', 'b', 'c', 'd'], 3).length, 3, 'лишние призы отброшены');
assert.equal(prizes(['x'.repeat(500)], 1)[0].length, 120, 'длина приза ограничена');

console.log('все проверки прошли');

// Регрессия: инлайновый display перебивал класс .hide, и админская форма была
// видна всем. Проверяем, что на скрываемых блоках нет атрибута style с display.
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./giveaway.html', import.meta.url), 'utf8');
for (const id of ['live', 'admin', 'pastBox']) {
  const tag = html.match(new RegExp(`<div id="${id}"[^>]*>`))[0];
  assert.ok(tag.includes('class="') && tag.includes('hide'), `${id}: должен стартовать скрытым`);
  assert.ok(!/style="[^"]*display/.test(tag), `${id}: инлайновый display перебьёт .hide`);
}
// Раскладка задана по id (#live, #admin) — это сильнее класса, поэтому .hide обязано
// быть !important, иначе блок останется видимым. Ровно это и ломалось дважды.
assert.match(html, /\.hide\s*\{[^}]*display\s*:\s*none\s*!important/,
  '.hide должен перебивать раскладку по id');
console.log('скрытые блоки: проверка прошла');
