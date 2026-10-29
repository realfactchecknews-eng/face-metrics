// Промокод, который отдаёт целый тариф (коллаб: гайд в подарок за покупку у партнёра).
// Это раздача товара, а не скидка, поэтому важны две вещи: выдача идёт тем же путём,
// что и покупка, и число активаций ограничивает раздачу.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const cut = (from, to) => w.slice(w.indexOf(from), w.indexOf(to, w.indexOf(from)));

const add = cut("startsWith('/addpromo')", "startsWith('/testgrant')");
assert.match(add, /pack=\(\\w\+\)/, 'тип pack не разбирается');
assert.match(add, /if \(!PACKS\[packId\]\)/, 'несуществующий пак создаёт мёртвый промокод');
assert.match(add, /uses: parseInt\(mPack\[2\], 10\)/, 'число активаций не ограничивает раздачу');
assert.match(add, /РАЗДАЧА товара/, 'админа надо предупредить, что это не скидка');

const red = cut('async function redeemPromo', 'async function handlePayment');
assert.match(red, /if \(promo\.pack\)/, 'активация пакового промокода не обрабатывается');
assert.match(red, /grantPack\(env, tgid, pack, L, null\)/, 'пак должен выдаваться тем же grantPack, что и покупка');
assert.ok(red.indexOf('if (promo.pack)') < red.indexOf('if (promo.discount)'),
  'ветка пака должна идти до скидки, иначе промокод без discount/credits уйдёт в безлимит');
// Человеку надо сказать, что он получил: grantPack шлёт только файл гайда.
assert.match(red, /b\.promoOk\(grant\)/, 'активация должна отвечать человеку');
// Один код — один раз в руки: это общая защита промокодов, она не должна потеряться.
assert.match(red, /promoused:\$\{code\}:\$\{tgid\}/, 'повторная активация одним человеком не закрыта');

console.log('промокод-пак: все проверки прошли');
