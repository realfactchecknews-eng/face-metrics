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
assert.ok(/buyPack\('guide'/.test(locked), 'кнопки должны вести на покупку гайда');

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

console.log('экран продажи гайда: все проверки прошли');
