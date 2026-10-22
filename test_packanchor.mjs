// Якорь на 5 анализов: пятёрка дороже одиночного числом (149 против 79), поэтому выгода
// читается только через цену за анализ. Проверяем, что подпись есть, считается от
// ПОКАЗАННОЙ цены и исчезает, если пятёрка перестала быть выгодной.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');
const packsOf = () => new Function(w.slice(w.indexOf('const PACKS = {'), w.indexOf('\n};', w.indexOf('const PACKS = {')) + 3) + '; return PACKS;')();
const src = w.slice(w.indexOf('function packsKb'), w.indexOf('\n}', w.indexOf('const cd = saleActive()')) + 2);
const build = (PACKS, L) => new Function('PACKS', 'LAVA_MIN_RUB', 'saleActive', 'saleCountdown', 'strike', 'packLabel', 'BL',
  src + '; return packsKb;')(PACKS, 50, () => false, () => '', (t) => '~' + t + '~',
  (p) => (L === 'en' ? p.labelEn : p.label), { ru: { kbBack: '← Меню' }, en: { kbBack: '← Menu' } });

const row = (kb, id) => kb.inline_keyboard.flat().find((b) => (b.callback_data || '').startsWith(`pay:${id}:`)).text;

for (const L of ['ru', 'en']) {
  const PACKS = packsOf();
  const kb = build(PACKS, L)('rub', L, 0, 0);
  const one = PACKS.p5.lavaRub / PACKS.p5.credits;        // 149 / 5 = 29.8

  assert.ok(row(kb, 'p5').includes(String(Math.round(one * 10) / 10)), `${L}: у пятёрки нет цены за анализ`);
  assert.ok(/×\d/.test(row(kb, 'p5')), `${L}: не показано, во сколько раз выгоднее`);
  assert.ok(!/×\d|\/анализ| ea/.test(row(kb, 'p1')), `${L}: у одиночного анализа подписи быть не должно`);
  assert.ok(!/×\d|\/анализ| ea/.test(row(kb, 'm1')), `${L}: у безлимита штук нет, подписи быть не должно`);

  // Со скидкой подпись пересчитывается, а не остаётся от прайсовой цены.
  const half = build(packsOf(), L)('rub', L, 50, 50);
  assert.ok(row(half, 'p5').includes(String(Math.round(Math.round(PACKS.p5.lavaRub / 2) / PACKS.p5.credits * 10) / 10)),
    `${L}: скидка не доехала до цены за анализ`);
}

// Если пятёрку сделают невыгодной, значок обязан исчезнуть — иначе UI начнёт врать.
const flat = packsOf();
flat.p5.lavaRub = flat.p5.rub = flat.p1.lavaRub * flat.p5.credits;
assert.ok(!/×\d/.test(row(build(flat, 'ru')('rub', 'ru', 0, 0), 'p5')),
  'при равной цене за анализ значок выгоды остался');

console.log('якорь на пятёрку: все проверки прошли');
