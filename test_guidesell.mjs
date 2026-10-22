// Экран продажи гайда. Две вещи, которые уже ломались: цена на экране расходилась
// со счётом (литерал 299₽/199⭐ при настоящих 999) и экран продавал «раздел сайта»
// вместо того разрыва в балле, за которым человек кликнул.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const app = readFileSync('app.js', 'utf8');
const w = readFileSync('worker.js', 'utf8');

const fn = (src, name) => {
  const i = src.indexOf('function ' + name);
  assert.ok(i > 0, name + ' не найдена');
  return src.slice(i, src.indexOf('\n}', i) + 2);
};

const locked = fn(app, 'pgShowLocked');
// Комментарии выкидываем: в них те самые старые цифры упомянуты как история.
const lockedCode = locked.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

// 1. Цена только от сервера: пак из аргумента, из ответа /progress или из /status.
assert.ok(/pack \|\|/.test(locked) && /PG && PG\.pack/.test(locked) && /packs\.guide/.test(locked),
  'цена гайда должна браться из ответа сервера, а не из литерала');
assert.ok(!/\b(299|199)\b/.test(lockedCode),
  'в экране продажи гайда снова зашита цена — она разойдётся со счётом');
// Нет цены — ничего не выставляем: догадка хуже отказа.
assert.ok(/if \(!rub \|\| !stars\)/.test(locked), 'без цены экран обязан честно сказать, а не угадывать');
assert.ok(/buyPack\(packId/.test(locked) && /mkStar\('Ведение /.test(locked),
  'кнопки должны вести на покупку гайда');

// 2. Персональный разрыв из блока потенциала доезжает до экрана продажи.
assert.ok(/window\._fmPotential = pot/.test(fn(app, 'renderPotential')),
  'renderPotential больше не сохраняет потенциал — экран продажи останется безличным');
assert.ok(/_fmPotential/.test(locked), 'экран продажи не читает потенциал');
assert.ok(/pot\.max - pot\.now/.test(locked), 'разрыв между «сейчас» и «достижимо» не показан');

// 3. Воркер отдаёт ПЕРСОНАЛЬНУЮ цену на обоих путях: и тем, кто ничего не покупал,
//    и тем, у кого урезанное ведение (там владелец PDF и его скидка).
const prog = w.slice(w.indexOf('async function progressGet'), w.indexOf('\n}\n', w.indexOf('async function progressGet')));
const packLines = prog.split('\n').filter((l) => /pack:/.test(l));
assert.equal(packLines.length, 2, 'ожидались два места, где отдаётся цена гайда');
for (const l of packLines) {
  assert.ok(/guidePackFor\(env, tgid\)/.test(l), 'цена гайда отдана без персональной скидки: ' + l.trim());
}

// 4. Две двери: PDF за 399 и ведение за 999 — с таблицей, что именно добавляет вторая.
//    Без неё человек выбирает по цене, то есть всегда дешёвое.
assert.ok(/pg-cmp/.test(locked), 'нет таблицы сравнения PDF и ведения');
assert.ok(/buyPack\(packId \|\| 'guide'/.test(locked) && /'gpdf'/.test(locked),
  'с экрана нельзя купить PDF — вторая дверь не работает');
assert.ok(/ownsPdf/.test(locked), 'владельцу PDF всё ещё предлагается купить PDF');
// Цена PDF и цена апгрейда — только с сервера: округление скидки считается там же, где счёт.
assert.ok(/PG\.gpdf/.test(locked) && /packs\.gpdf/.test(locked), 'цена PDF берётся не от сервера');
assert.ok(/PG\.upgradeRub/.test(locked), 'цена доплаты за ведение считается на клиенте');
assert.ok(!/\b(399|999|599)\b/.test(lockedCode), 'в экране зашита цена гайда — разойдётся со счётом');

// Воркер обязан эту цену присылать, и считать теми же функциями, что и счёт.
assert.ok(/upgradeRub: applyDiscount\(PACKS\.guide\.lavaRub, guideUpgradePct\(\)\)/.test(w),
  'воркер не отдаёт цену доплаты или считает её отдельной формулой');
assert.ok(/gpdfOwned/.test(prog) && /gpdf: PACKS\.gpdf/.test(prog), 'воркер не отдаёт вторую дверь');

console.log('экран продажи гайда: все проверки прошли');
