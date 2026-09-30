// Дуэль стоит два анализа: три вызова модели против одного у обычного разбора.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const app = readFileSync('app.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

assert.match(w, /const cost = body\.compare \? 2 : 1;/, 'цена дуэли не задана');
assert.match(w, /else if \(credits >= cost\) mode = 'paid';/, 'гейт пускает с недостаточным балансом');
assert.ok(w.includes('creditsLeft = credits - cost;'), 'списывается фиксированная единица');
assert.ok(/q = \{[^}]*cost \}/.test(w), 'цена не доходит до chargeQuota');

// Кешбэк. Проверяем ту же арифметику, что в chargeQuota: считаем по cbe/cbg, а не по spent.
const src = w.slice(w.indexOf('async function chargeQuota'), w.indexOf('// ─────────────────────────── Анализ'));
assert.ok(!/spent % CASHBACK_EVERY === 0/.test(src), 'кешбэк снова считается остатком от деления');
assert.ok(/cbe:\$\{tgid\}/.test(src) && /cbg:\$\{tgid\}/.test(src), 'нет отдельных счётчиков кешбэка');
assert.ok(/Math\.max\(0, cbe - cbg\)/.test(src), 'бонусные кредиты не вычитаются — будет кешбэк на кешбэк');
const every = parseInt(w.match(/CASHBACK_EVERY = (\d+)/)[1], 10);
assert.strictEqual(every, 5, 'шаг кешбэка должен быть 5');

// Модель кошелька: тратим, пока есть что, и смотрим, сколько бонусов накапало.
function run(bought, cost) {
  let credits = bought, cbe = 0, cbg = 0, granted = 0;
  while (credits >= cost) {
    credits -= cost;
    cbe += cost;
    const bonus = Math.max(0, Math.floor(Math.max(0, cbe - cbg) / every) - cbg);
    if (bonus > 0) { credits += bonus; cbg += bonus; granted += bonus; }
  }
  return { granted, left: credits };
}
// Купил 10 — заработал ровно 2 бонуса, не больше: бонусные траты новых бонусов не дают.
assert.strictEqual(run(10, 1).granted, 2, 'кешбэк на кешбэк вернулся');
assert.strictEqual(run(5, 1).granted, 1, '5 купленных должны дать 1 бонус');
assert.strictEqual(run(4, 1).granted, 0, 'бонус выдан раньше рубежа');
// Тот, кто купил 25, получает 5 — и ни одного сверху за потраченные бонусные.
assert.strictEqual(run(25, 1).granted, 5, 'кешбэк с 25 купленных посчитан неверно');
// Главное свойство: бонусов НИКОГДА не больше, чем один на CASHBACK_EVERY купленных —
// сколько бы ни было итераций. Именно это ломал кешбэк на кешбэк.
for (const bought of [1, 4, 5, 9, 10, 17, 25, 50, 100]) {
  for (const cost of [1, 2]) {
    const { granted } = run(bought, cost);
    assert.ok(granted <= Math.floor(bought / every),
      `купил ${bought}, тратил по ${cost}: выдано ${granted} бонусов вместо максимум ${Math.floor(bought / every)}`);
  }
}
// Дуэлями по 2 кредита рубеж тоже не перепрыгивается, но невыброшенный бонусный кредит
// придерживает следующий рубеж — он засчитается, когда человек этот кредит потратит.
// Это не потеря: вычитаем ВЫДАННЫЕ бонусы, а отличить потраченный бонусный кредит от
// купленного в общем балансе нечем.
assert.strictEqual(run(10, 2).granted, 1, 'кешбэк при тратах по два посчитан неверно');
assert.strictEqual(run(10, 2).left, 1, 'остаток после дуэлей посчитан неверно');

// Отдельный текст, когда кредиты есть, но на дуэль не хватает.
assert.ok(/body\.compare && credits > 0/.test(w), 'нет отдельного ответа на «кредитов мало»');
assert.ok(/Дуэль стоит \$\{cost\} анализа/.test(w), 'в тексте отказа не названа цена');

// Цена видна ДО нажатия, на обоих языках.
assert.ok(html.includes('id="cmpCost"'), 'цены нет в разметке дуэли');
assert.strictEqual(app.split('cmpCost:').length - 1, 2, 'строка цены должна быть в обоих языках');
assert.ok(/cmpRunBtn"\)\.classList\.remove\("hidden"\); \$\("cmpCost"\)/.test(app), 'цена не показывается вместе с кнопкой');

// Бесплатная квота дуэль по-прежнему не покрывает.
assert.match(w, /const freeUsable = freeAvail && !body\.compare;/, 'дуэль попала в бесплатную квоту');
console.log('цена дуэли: все проверки прошли');
