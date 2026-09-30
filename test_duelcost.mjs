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

// Кешбэк: при шаге в 2 кредита проверка `spent % N === 0` перепрыгивала рубеж.
const src = w.slice(w.indexOf('async function chargeQuota'), w.indexOf('// ─────────────────────────── Анализ'));
assert.ok(!/spent % CASHBACK_EVERY === 0/.test(src), 'кешбэк снова считается остатком от деления');
const every = parseInt(w.match(/CASHBACK_EVERY = (\d+)/)[1], 10);
const bonus = (was, cost) => Math.floor((was + cost) / every) - Math.floor(was / every);
// Разбор за разбором рубеж не пропускается.
let was = 0, total = 0;
for (let i = 0; i < 12; i++) { total += bonus(was, 1); was += 1; }
assert.strictEqual(total, Math.floor(12 / every), 'поштучная трата даёт не тот кешбэк');
// Дуэлями — тоже: рубеж засчитывается при перепрыгивании.
was = 0; total = 0;
for (let i = 0; i < 6; i++) { total += bonus(was, 2); was += 2; }
assert.strictEqual(total, Math.floor(12 / every), 'дуэль съедает кешбэк, перепрыгивая рубеж');
assert.strictEqual(bonus(2, 2), 1, 'перепрыгнутый рубеж не засчитан');

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
