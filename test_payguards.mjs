// Четыре места, где деньги или выдача теряются молча. Все четыре уже ломались, причём
// три из них — потому что правку довезли до двух путей оплаты из трёх. Тест текстовый:
// настоящую проверку этих путей даст только прогон с фейковым KV, но это следующий шаг.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const body = (name) => {
  const i = w.indexOf('function ' + name);
  assert.ok(i > 0, name + ' не найдена');
  return w.slice(i, w.indexOf('\n}\n', i) + 2);
};
const code = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

// 1. Промо-скидка одноразовая, но гасить её можно только ПОСЛЕ оплаты. В сайтовом /buy
//    она гасилась в момент показа счёта: человек ушёл думать — скидка сгорела.
assert.ok(!/delete\(`pendingDiscount/.test(code(body('buy'))),
  '/buy снова гасит скидку при выставлении счёта, а не после оплаты');
for (const h of ['handlePayment', 'lavaWebhook', 'cryptoWebhook']) {
  const src = code(body(h));
  assert.ok(/delete\(`pendingDiscount/.test(src), h + ': скидка не гасится после оплаты');
  assert.ok(src.indexOf('grantPack') < src.indexOf('delete(`pendingDiscount'),
    h + ': скидка гасится раньше выдачи');
}

// 2. Тариф может исчезнуть из PACKS между счётом и оплатой. Тогда платёж НЕ помечаем
//    обработанным (иначе ретрай упрётся в дедуп и деньги пропадут) и зовём админа.
const crypto = code(body('cryptoWebhook'));
assert.ok(/if \(!pack\)/.test(crypto), 'крипта начисляет, не проверив тариф');
assert.ok(crypto.indexOf('if (!pack)') < crypto.indexOf('put(seenKey'),
  'крипта помечает платёж обработанным раньше, чем убедилась в тарифе');
assert.ok(/adminIds\(env\)/.test(crypto), 'о непризнанной оплате криптой никто не узнает');
assert.ok(/if \(!tgid \|\| !pack\)/.test(code(body('lavaWebhook'))), 'Lava потеряла проверку тарифа');
assert.ok(/if \(!pack && !payload\.credits\) return;/.test(code(body('handlePayment'))),
  'Stars потерял проверку тарифа');

// 3. Досрочный замер списывает кредит ДО запроса к модели, а в ответе об отказе написано
//    «анализ не списан». Либо возвращаем кредит, либо текст врёт.
const an = code(body('analyze'));
assert.ok(/if \(earlyPaid\) await env\.RATE_LIMIT\.put\(`credits:\$\{tgid\}`/.test(an),
  'кредит за досрочный замер не возвращается, когда модель не ответила');
assert.ok(an.indexOf('if (earlyPaid) await env.RATE_LIMIT.put(`credits:${tgid}`') < an.indexOf("code: 'E-REF'"),
  'возврат кредита стоит после веток отказа — до них дело не дойдёт');

// 4. Реквизиты партнёра — свободный текст, уходит админу с parse_mode HTML.
assert.ok(/Реквизиты: \$\{escHtml\(req\.requisites\)\}/.test(w),
  'реквизиты на выплату снова уходят админу без экранирования');

console.log('защита платежей: все проверки прошли');
