// Первый экран бота — момент, когда решается 87% покупок. Проверяем, что новичок
// видит дверь, а не панель приборов, и что кнопка анализа стоит первой у всех.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
// В ESM eval не заводит биндинги в области модуля — собираем куски в одну функцию.
const pick = (re) => src.match(re)[0];
const { menuKb, BL } = new Function(`
  const CHANNEL = '@wwwfacerateru';
  ${pick(/const BL = \{[\s\S]*?\n\};/)}
  ${pick(/const FACE_T = \{[\s\S]*?\n\};/)}
  ${pick(/^function menuKb[\s\S]*?^\}/m)}
  return { menuKb, BL };
`)();

for (const L of ['ru', 'en']) {
  const short = menuKb(L, true).inline_keyboard;
  const full  = menuKb(L, false).inline_keyboard;

  assert.ok(short.length <= 4, `${L}: новичку — не больше четырёх кнопок`);
  assert.equal(short[0][0].url, 'https://facerate.ru', `${L}: первая кнопка ведёт на анализ`);
  assert.equal(full[0][0].url, 'https://facerate.ru', `${L}: и в полном меню анализ первый`);
  assert.ok(full.length > short.length, `${L}: полное меню шире короткого`);

  // ссылка на сайт не должна дублироваться двумя кнопками
  const site = full.flat().filter((b) => b.url === 'https://facerate.ru');
  assert.equal(site.length, 1, `${L}: кнопка сайта одна`);

  // приветствие обязано объяснять действие, а не только называть сервис
  assert.match(BL[L].hello, /8/, `${L}: в приветствии есть суть — 8 параметров`);
  // и называть условие бесплатного разбора: без подписки его не будет
  assert.match(BL[L].hello, /@wwwfacerateru/, `${L}: в приветствии есть канал`);
  assert.ok(short.some((r) => r.some((btn) => btn.url === 'https://t.me/wwwfacerateru')),
    `${L}: у новичка есть кнопка канала`);
}
console.log('меню и приветствие: все проверки прошли');
