// Карточка-сторис (22.11.2026): защита от трёх конкретных прошлых ошибок, грепом по исходнику.
// Запуск: node test_sharecard.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const app = readFileSync('app.js', 'utf8'), worker = readFileSync('worker.js', 'utf8');
const card = app.slice(app.indexOf('function _buildShareCard'), app.indexOf('/* ═══════════ Иконки категорий'));

// 1. PNG 1080×1920 с крупным фото не влезал в лимит /sendcard (~2 МБ base64) — шлём JPEG.
assert.match(card, /c\.toBlob\(.*"image\/jpeg"/, 'карточка собирается в JPEG');
const lim = +worker.match(/body\.image\.length > ([\d_]+)/)[1].replace(/_/g, '');
assert.ok(lim >= 2_000_000, 'лимит /sendcard не урезан');
// и воркер не выдаёт JPEG за PNG
assert.match(worker, /bin\[0\] === 0xFF && bin\[1\] === 0xD8/, 'sendCard узнаёт JPEG');

// 2. Без текста-образца грузилась только латиница, кириллица шла запасным шрифтом.
assert.match(app, /document\.fonts\.load\(f, "[^"]*[А-Яа-я][^"]*"\)/, 'шрифты грузятся с кириллицей');

// 3. Цифры — Cinzel: у Georgia/Cormorant «4» уходит под строку, балл выглядел кривым.
assert.match(card, /g\.font = "400 112px " \+ CARD_NUM/, 'балл набран шрифтом с ровными цифрами');
assert.match(readFileSync('index.html', 'utf8'), /family=Cinzel/, 'Cinzel подключён на странице');

console.log('карточка: все проверки пройдены');
