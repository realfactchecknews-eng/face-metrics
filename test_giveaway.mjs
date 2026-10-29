// Розыгрыш с разными призами по местам. Раньше приз был один на всех, а «первое
// место — гайд» раздавалось руками. Здесь проверяем, что место знает свой приз
// и что гайд выдаётся ТОЙ ЖЕ функцией, что и настоящая покупка.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const w = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');
const pick = (re) => { const m = w.match(re); assert.ok(m, 'не нашёл в worker.js: ' + re); return m[0]; };
const { parseLadder, prizeLabel, ladderLines } = new Function(
  pick(/^function parseLadder[\s\S]*?^\}/m) + '\n' + pick(/^function prizeLabel[\s\S]*?^\}/m)
  + '\n' + pick(/^function ladderLines[\s\S]*?^\}/m)
  + '\nreturn { parseLadder, prizeLabel, ladderLines };')();

// Та самая лестница, ради которой всё затевалось.
const l = parseLadder('guide,10,5,1x10');
assert.equal(l.length, 13, 'мест должно быть 13');
assert.deepEqual(l[0], { pack: 'guide' }, 'первое место — гайд');
assert.deepEqual(l[1], { credits: 10 });
assert.deepEqual(l[2], { credits: 5 });
assert.ok(l.slice(3).every((p) => p.credits === 1), 'хвост — по одному анализу');

assert.equal(parseLadder('гайд,3').length, 2, 'слово по-русски тоже понимается');
assert.equal(parseLadder('2х3').length, 3, 'русская «х» в «2х3» работает: её легко набрать случайно');
assert.equal(parseLadder(''), null, 'пустая строка — не лестница');
assert.equal(parseLadder('abc'), null, 'мусор — не лестница');
assert.equal(parseLadder('0'), null, 'ноль анализов призом не бывает');
assert.equal(parseLadder('1x999'), null, 'защита от опечатки в тысячу мест');

assert.match(prizeLabel({ pack: 'guide' }, 'ru'), /гайд/);
assert.equal(prizeLabel({ credits: 1 }, 'ru'), '1 анализ', 'единственное число');
assert.equal(prizeLabel({ credits: 5 }, 'ru'), '5 анализов');
assert.match(prizeLabel({ credits: 5 }, 'en'), /5 analyses/);

// Выдача: гайд через grantPack, анализы — прибавкой к credits, каждому по своему месту.
const draw = pick(/^async function runGiveawayDraw[\s\S]*?^\}/m);
const drawFn = draw;
assert.match(draw, /const prize = ladder \? ladder\[i\] : \{ credits: gw\.credits \}/, 'приз берётся по номеру места');
assert.match(draw, /grantPack\(env, winnerId, PACKS\[prize\.pack\]/, 'гайд выдаётся как покупка, а не копией логики');
assert.match(draw, /const places = ladder \? ladder\.length : gw\.winners/, 'мест столько, сколько призов');
// Без лестницы всё должно работать как раньше: активный розыгрыш не должен сломаться.
assert.match(draw, /BL\[wL\]\.gwWinMsg\(prize\.credits\)/, 'старый розыгрыш шлёт прежнее письмо');

// Итоги: при лестнице перечисляем места, иначе прежний текст.
const post = pick(/^function giveawayResultsPost[\s\S]*?^\}/m);
assert.match(post, /\$\{i \+ 1\} место — \$\{who\(id, i\)\}/, 'в итогах видно, кто какое место занял');

// Доверие к розыгрышу: три вещи, которых не хватало после первого же публичного итога.
// 1. Победитель подписан ником, а не голым id — голый id читателю ничего не говорит.
assert.match(post, /const who = \(id, i\)/, 'победитель должен подписываться именем');
assert.match(post, /r\.names && r\.names\[i\]/, 'имя берётся из подготовленного списка');
assert.match(post, /\(id \$\{id\}\)/, 'id остаётся рядом с ником — по нему человек узнаёт себя');
assert.match(drawFn, /await userName\(env, id\)/, 'имена победителей резолвятся до публикации');
// 2. Сколько заявок отсеяла проверка подписки — видно читателю, а не только админу.
assert.match(post, /r\.unsubSkipped/, 'в итогах не видно, что подписка проверялась');
// 3. Админы не участвуют: 26.10.2026 владелец нажал «Участвовать» для проверки механики
//    и выиграл первое место — со стороны это выглядит как подкрутка.
assert.match(drawFn, /const admins = new Set\(\[String\(FACE_ADMIN_TGID\), \.\.\.adminIds\(env\)\]/,
  'админские id не исключаются из пула');
assert.match(drawFn, /gw\.entries\.filter\(\(id\) => !admins\.has\(String\(id\)\)\)/,
  'пул должен строиться без админов');
assert.match(drawFn, /totalEntries: gw\.entries\.length - adminSkipped/,
  'админские заявки не должны попадать в число участников');

// Команда понимает обе формы.
assert.match(w, /\/newgiveaway guide,10,5,1x10 7/, 'в подсказке есть готовый пример');
assert.match(w, /mOld = text\.match/, 'старая форма осталась');

// Пост: одинаковые места подряд собираются в диапазон, иначе «1 анализ» повторится
// десять раз. У диапазона дательный падеж — «по 1 анализу», а не «по 1 анализ».
const lines = ladderLines(parseLadder('guide,10,5,1x10')).split('\n');
assert.equal(lines.length, 4, 'тринадцать мест умещаются в четыре строки');
assert.equal(lines[3], '4-13 место — по 1 анализу');
assert.equal(ladderLines(parseLadder('3x2')), '1-2 место — по 3 анализа', 'два-четыре — «анализа»');
assert.equal(ladderLines(parseLadder('5x3')), '1-3 место — по 5 анализов', 'пять и больше — «анализов»');
assert.ok(!/по 1 анализ$/m.test(ladderLines(parseLadder('1x3'))), 'падеж не ломается');

// Анонс и итоги публикует бот: кнопку под постом Telegram даёт поставить только ему,
// а обещание «объявим здесь же» не должно зависеть от того, дошли ли руки скопировать.
const cmd = w.slice(w.indexOf("startsWith('/newgiveaway')"), w.indexOf("startsWith('/drawgiveaway')"));
assert.match(cmd, /chat_id: CHANNEL, text: post/, 'анонс уходит в канал сам');
assert.match(cmd, /inline_keyboard: \[\[\{ text: '🙋 Участвовать', url: link \}\]\]/, 'с кнопкой на бота');
assert.match(cmd, /gw\.postId = announced\.result\.message_id/, 'id анонса сохраняется');
assert.match(cmd, /В канал не ушло/, 'если не ушло — владельцу отдаётся текст, а не тишина');
assert.match(drawFn, /chat_id: CHANNEL, text: giveawayResultsPost\(r\)/, 'итоги уходят в канал');
assert.match(drawFn, /reply_to_message_id: gw\.postId/, 'итоги отвечают на анонс');
// Участнику нельзя показывать «приз каждому: 0 анализов» — при лестнице приз у места свой.
const land = pick(/^function gwActiveText[\s\S]*?^\}/m);
assert.match(land, /if \(!ladder\) return b\.gwActive/, 'без лестницы текст прежний');
assert.ok(!/b\.gwActive\(gw\.winners, gw\.credits/.test(w.replace(land, '')), 'старый текст больше нигде не зовётся напрямую');
console.log('розыгрыш: все проверки прошли');
