// Коллаб: вторым условием розыгрыша стоит подписка на канал ПАРТНЁРА, а пост владелец
// публикует сам (премиум-эмодзи боту недоступны). Проверяем разбор команды, живую
// проверку обоих каналов и то, что чужой канал не может сломать нам розыгрыш.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const cut = (from, to) => w.slice(w.indexOf(from), w.indexOf(to, w.indexOf(from)));

// ── Разбор хвоста команды: @канал и nopost отрезаются ДО лестницы.
const cmd = cut("startsWith('/newgiveaway')", "startsWith('/drawgiveaway')");
assert.match(cmd, /nopost\|безпоста/, 'флаг nopost не разбирается');
assert.match(cmd, /@\(\[A-Za-z\]\[A-Za-z0-9_\]\{3,31\}\)/, 'канал партнёра не разбирается');
assert.ok(cmd.indexOf('const mNo') < cmd.indexOf('const mOld'), 'хвост должен отрезаться до разбора лестницы');
assert.match(cmd, /const mOld = spec\.match/, 'старая форма разбирается по очищенной строке');
assert.match(cmd, /const mNew = spec\.match/, 'лестница разбирается по очищенной строке');

// ── Доступ к каналу проверяется ДО создания: узнать после поста — худший вариант.
assert.ok(cmd.indexOf('Розыгрыш не создан') > 0, 'без доступа к каналу розыгрыш всё равно создаётся');
assert.ok(cmd.indexOf("getChatMember', { chat_id: partner") < cmd.indexOf('const gw = {'),
  'проверка доступа должна идти до saveGiveaway');
assert.match(cmd, /entries: \[\], partner \}/, 'канал партнёра не сохраняется в розыгрыш');

// ── nopost: бот молчит, а владельцу отдаётся ссылка для его собственного поста.
assert.match(cmd, /const announced = noPost \? null :/, 'при nopost бот всё равно постит');
assert.match(cmd, /Пост НЕ публиковал/, 'владельцу не сказано, что пост за ним');

// ── Проверка подписки на чужой канал.
const helper = cut('async function partnerSubscribed', 'async function getGiveaway');
assert.match(helper, /if \(!gw \|\| !gw\.partner\) return true/, 'без партнёра проверка должна молчать');
assert.match(helper, /\['creator', 'administrator', 'member'\]/, 'статусы подписки считаются неверно');
// Главное: потеря доступа не блокирует людей — иначе чужой клик ломает наш розыгрыш.
assert.match(helper, /partnerAccessLost\(env, gw, [\s\S]*?\);\n\s*return true;/,
  'при потере доступа участников нельзя блокировать');
const alert = cut('async function partnerAccessLost', 'async function getGiveaway');
assert.match(alert, /gwPartnerAlert:\$\{gw\.id\}/, 'предупреждение админу должно слаться один раз на розыгрыш');

// ── Обе точки входа и сам розыгрыш проверяют канал партнёра.
assert.match(w, /await isSubscribed\(env, candidate, true\)\n\s*&& await partnerSubscribed\(env, gw, candidate\)/,
  'в момент розыгрыша канал партнёра не перепроверяется');
assert.ok(/partnerSubscribed\(env, gw, tgid\)/.test(cut("data === 'gw:join'", 'async function logPromoRedeem')),
  'участие из бота не проверяет канал партнёра');
assert.ok(/partnerSubscribed\(env, gw, tgid\)/.test(cut("action === 'join'", "action === 'create'")),
  'участие из мини-приложения не проверяет канал партнёра');

// ── Тексты: человек должен понимать, на какой канал ещё подписаться.
assert.match(w, /Быть подписанным на этот канал и на \$\{partner\}/, 'в посте не сказано про второй канал');
assert.match(w, /gw\.partner \? ` и на \$\{gw\.partner\}` : ''/, 'экран розыгрыша молчит про второй канал');

console.log('канал партнёра в розыгрыше: все проверки прошли');
