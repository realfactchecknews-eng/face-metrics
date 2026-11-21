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
// 14.11.2026: пейволл начинается с тарифов и цен, способ оплаты — вторым шагом.
const pw = a.slice(a.indexOf('function showPaywall'), a.indexOf('function hidePaywall'));
assert.match(pw, /picked\(\); showMethods\(id\)/, 'первым шагом снова выбор способа без цен');
assert.match(pw, /function picked\(\) \{ fmStep\("pack_pick"\)/, 'выбор тарифа перестал считаться в воронке');
// 21.11.2026: «Открыть полный разбор» ведёт на свой экран, а после оплаты разбор того же фото запускается сам.
assert.match(a, /showPaywall\("pay", st, "teaser"\)/, 'кнопка на результате снова ведёт в общий список тарифов');
assert.match(pw, /function renderTeaser\(\)/, 'нет экрана «Полный разбор этого фото»');
assert.match(pw, /_pwMode === "teaser"\) \{ fmStep\("pw_teaser"\); pickStep = "tz_pick"; _afterGate = rerunFullReport; \}/, 'после оплаты с экрана разбора ничего не откроется');
assert.match(a, /_lastAnalysis = p;\s*callAI/, 'не запоминаем последний анализ — перезапускать нечего');
assert.match(a, /if \(frontImg && \(_pwMode === "teaser" \|\| _pendingAnalysis\)\) saveResumePhotos\(\);\s*window\.location\.href = d\.link/, 'уход на оплату картой снова теряет фото');
assert.match(a, /if \(_pwMode === "teaser"\) \{ hidePaywall\(\); _afterGate = null;/, 'крестик на экране разбора снова уводит с результата');
for (const st of ['pw_teaser', 'tz_pick', 'tz_rerun', 'pw_gate', 'gate_pick']) assert.ok(w.includes(`['${st}',`), 'воркер не считает шаг ' + st);
assert.ok(!pw.includes('function showPacks'), 'старый шаг «сначала способ» вернулся');
console.log('оффер результата: все проверки прошли');
