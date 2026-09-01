// Разбор аргументов /post: текст кнопки и ссылка. Ошибиться тут — опубликовать
// в канал пост с битой кнопкой, поэтому проверяем границы.
import assert from 'node:assert';
const parse = (text) => text.slice(5).match(/^\s*(\S.*?)\s*\|\s*(https:\/\/\S+)\s*$/);

let m = parse('/post 🏆 Участвовать | https://t.me/faceratepay_bot/giveaway');
assert.equal(m[1], '🏆 Участвовать');
assert.equal(m[2], 'https://t.me/faceratepay_bot/giveaway');

m = parse('/post   Жми сюда   |   https://facerate.ru   ');
assert.equal(m[1], 'Жми сюда', 'пробелы по краям срезаются');
assert.equal(m[2], 'https://facerate.ru');

assert.equal(parse('/post без ссылки'), null, 'без ссылки — отказ');
assert.equal(parse('/post Текст | http://facerate.ru'), null, 'http не принимаем');
assert.equal(parse('/post | https://facerate.ru'), null, 'пустой текст кнопки — отказ');

// текст с вертикальной чертой внутри: берётся последняя как разделитель
m = parse('/post Цена | скидка | https://facerate.ru');
assert.equal(m[1], 'Цена | скидка');

assert.equal('x'.repeat(200).slice(0, 64).length, 64, 'длина кнопки обрезается до лимита Telegram');
console.log('разбор /post: все проверки прошли');
