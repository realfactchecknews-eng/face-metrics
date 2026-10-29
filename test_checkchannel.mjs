// Проверка чужого канала перед коллабом. Узнать, видит ли бот подписку, надо ДО поста:
// Telegram отдаёт статус чужого пользователя только админу чата, а партнёр может
// добавить бота без прав, забыть или выгнать.
import { readFileSync } from 'node:fs';
import assert from 'node:assert';
const w = readFileSync('worker.js', 'utf8');

const i = w.indexOf("text.startsWith('/checkchannel')");
assert.ok(i > 0, 'команда /checkchannel пропала');
const cmd = w.slice(i, w.indexOf("startsWith('/lavaproducts')", i));

assert.match(cmd, /ADMIN_USERNAMES\.includes/, 'команда должна быть админской');
// Главный вопрос — видно ли подписку ЧУЖОГО человека, а не только статус бота:
// бот может числиться участником канала и всё равно не иметь права смотреть других.
assert.match(cmd, /getChatMember', \{ chat_id: target, user_id: msg\.from\.id \}/,
  'нет пробной проверки подписки живого человека');
assert.match(cmd, /const canSee = probe\?\.ok/, 'вывод должен строиться на пробе, а не на статусе бота');
assert.match(cmd, /getChatMember', \{ chat_id: target, user_id: botId \}/, 'статус самого бота тоже показываем');
assert.match(cmd, /split\(':'\)\[0\]/, 'id бота берётся из токена');
// Ответ обязан говорить, что делать, а не только «ошибка».
assert.match(cmd, /добавить бота в админы/, 'в отказе нет инструкции для партнёра');
assert.match(cmd, /Формат: \/checkchannel @канал/, 'без аргумента — подсказка, а не молчание');
// Название канала приходит от партнёра: это чужой текст в HTML-сообщении.
assert.match(cmd, /escHtml\(String\(title\)\)/, 'название канала уходит в HTML без экранирования');

console.log('проверка канала партнёра: все проверки прошли');
