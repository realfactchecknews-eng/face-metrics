// Список тарифов в боте: порядок по возрастанию цены и честность подписей.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const PACKS = new Function(w.slice(w.indexOf('const PACKS = {'), w.indexOf('\n};', w.indexOf('const PACKS = {')) + 3) + '; return PACKS;')();
const src = w.slice(w.indexOf('function packsKb'), w.indexOf('\n}', w.indexOf('const cd = saleActive()')) + 2);
const build = (sale) => new Function('PACKS', 'LAVA_MIN_RUB', 'saleActive', 'saleCountdown', 'strike', 'packLabel', 'BL',
  src + '; return packsKb;')(PACKS, 50, () => sale, () => '4 дн', (t) => '~' + t + '~', (p) => p.label, { ru: { kbBack: '← Меню' } });

// Строки тарифов (без шапок и кнопки «Меню»).
const lines = (kb) => kb.inline_keyboard
  .filter((r) => /^pay:|^guide$/.test(r[0].callback_data || ''))
  .map((r) => ({ text: r[0].text, num: parseInt((r[0].text.match(/(\d+)[₽⭐](?!~)/g) || []).pop(), 10) }));

for (const [name, kb] of [
  ['карта без скидок', build(true)('rub', 'ru', 0, 0)],
  ['владелец PDF-гайда', build(true)('rub', 'ru', 0, 40)],
  ['промо 25% звёздами', build(true)('stars', 'ru', 25, 25)],
  ['без акции', build(false)('rub', 'ru', 0, 0)],
]) {
  const l = lines(kb);
  assert.ok(l.length >= 6, `${name}: тарифов в списке неожиданно мало`);
  for (let i = 1; i < l.length; i++) {
    assert.ok(l[i].num >= l[i - 1].num,
      `${name}: порядок сбит — «${l[i - 1].text}» стоит перед «${l[i].text}»`);
  }
}

// Гайд со скидкой обязан подняться выше месячного безлимита: иначе сортировка смотрит
// на прайс, а не на то, что человек реально видит.
const disc = lines(build(true)('rub', 'ru', 0, 40)).map((x) => x.text);
assert.ok(disc.findIndex((t) => /Гайд \+ ведение/.test(t)) < disc.findIndex((t) => /Безлимит на месяц/.test(t)),
  'подешевевший гайд не поднялся в списке');
// И цена там должна быть личная, а не прайсовая.
assert.ok(/599/.test(disc.find((t) => /Гайд \+ ведение/.test(t))), 'в списке у владельца PDF цена гайда не персональная');

// «Хит скидки» — только когда месяц ДЕЙСТВИТЕЛЬНО подешевел.
const saleNoDisc = lines(build(true)('rub', 'ru', 0, 0)).map((x) => x.text).join('\n');
assert.ok(!/ХИТ СКИДКИ/.test(saleNoDisc), 'подпись «хит скидки» висит при неизменной цене месяца');
const withDisc = lines(build(true)('stars', 'ru', 25, 25)).map((x) => x.text).join('\n');
assert.ok(/ХИТ СКИДКИ/.test(withDisc), 'при реальной скидке подпись пропала');

// Персональная скидка на ведение должна доезжать до списка отдельным аргументом.
assert.ok(/packsKb\(method, L, discPct, guidePct = discPct\)/.test(w), 'список не принимает цену гайда отдельно');
assert.ok(/packsKb\(method, L, listDiscPct, guideDiscPct\)/.test(w), 'в список не передаётся скидка на ведение');
console.log('список тарифов: все проверки прошли');
