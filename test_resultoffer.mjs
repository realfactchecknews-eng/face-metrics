// Оффер на экране результата (13.11.2026): цена в пейволле сайта обязана совпадать с тем,
// что воркер выставит в счёт, иначе человек увидит одну сумму, а заплатит другую.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const a = readFileSync('app.js', 'utf8');
const w = readFileSync('worker.js', 'utf8');
const applyDiscount = new Function('return ' + w.match(/^function applyDiscount[^\n]*/m)[0])();
const offerPrice = new Function('return ' + a.match(/^function offerPrice[\s\S]*?^\}/m)[0])();
const LAVA_MIN = +w.match(/const LAVA_MIN_RUB = (\d+)/)[1];
const pct = +w.match(/const RESULT_OFFER_PCT = (\d+)/)[1];
assert.ok(pct > 0 && pct < 50, 'оффер ' + pct + '% — проверь, что так задумано');
for (const v of [79, 99, 149, 199, 299, 399, 999, 45, 60]) {
  assert.equal(offerPrice(v, pct, 'stars'), applyDiscount(v, pct), 'звёзды ' + v);
  assert.equal(offerPrice(v, pct, 'rub'), Math.max(LAVA_MIN, applyDiscount(v, pct)), 'карта ' + v);
}
const bdp = w.match(/^async function buyerDiscountPct[\s\S]*?^\}/m)[0];
assert.match(bdp, /packId !== 'guide' && await resultOfferUntil/, 'оффер должен идти в цену счёта, кроме ведения');
assert.ok(bdp.indexOf('resultOfferUntil') < bdp.indexOf('pendingDiscount'), 'промокод не должен перебивать оффер');
assert.match(w, /teaser: isTeaser,\s*offerEndsAt: isTeaser \? await startResultOffer/, 'кэш-ответ без оффера');
assert.match(w, /const offerEndsAt = isTeaser \? await startResultOffer/, 'ответ модели без оффера');
assert.match(w.match(/^async function startResultOffer[\s\S]*?^\}/m)[0], /resoffergiven:/, 'оффер без ограничения раз в неделю');
assert.match(a, /showError\(t\("errNoFace"\), true\)/, '«лицо не найдено» снова без кнопки');
console.log('оффер результата: все проверки прошли');
