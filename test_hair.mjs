// Советы по волосам вторичны: жалобы были на то, что бот всем подряд советует кроп.
// Модель слушается перечней, поэтому проверяем, что в обоих промптах стоят именно правила.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('./worker.js', import.meta.url), 'utf8');

assert.ok(!/Softmax first \(haircut\/style/.test(app), 'стрижка больше не стоит первой в списке софтмаксов');
assert.match(app, /THE FACE COMES FIRST/, 'в анализе советы про лицо идут раньше волос');
assert.match(app, /At most ONE recommendation about haircut or hairstyle/, 'в анализе не больше одного пункта про стрижку');
assert.match(app, /it is never item 1/, 'и не первым пунктом');
assert.match(app, /Do NOT recommend a crop, French crop or textured crop unless the photo shows a reason/, 'в анализе кроп только по причине');
assert.match(app, /If the current hair already suits the face/, 'подходящую причёску советуют оставить');

assert.match(worker, /ПРО ВОЛОСЫ - ОНИ ВТОРИЧНЫ/, 'в гайде есть правила про волосы');
assert.match(worker, /не больше ОДНОГО пункта, и только под меткой ГРУМИНГ_STYLE/, 'в гайде один пункт и только в груминге');
assert.match(worker, /не советуй кроп \(French crop, текстурный кроп\) по умолчанию/, 'в гайде кроп только по причине');
assert.ok(!/МИДФЕЙС_MAXILLA: не меняется, но объём волос сверху/.test(worker), 'мидфейс больше не толкает к стрижке');

console.log('волосы вторичны: все проверки прошли');
