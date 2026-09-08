// Разбор аргументов /testgrant: второй аргумент — необязательный tgid получателя.
// Ошибка тут = приз уедет не тому, поэтому проверяем границы.
import assert from 'node:assert';
const SELF = '1031760975';
const parse = (text) => {
  const parts = text.split(/\s+/);
  return { id: (parts[1] || '').trim(),
           target: /^\d+$/.test(parts[2] || '') ? parts[2] : SELF };
};

assert.deepEqual(parse('/testgrant guide'), { id: 'guide', target: SELF }, 'без tgid — себе');
assert.deepEqual(parse('/testgrant guide 1772090749'), { id: 'guide', target: '1772090749' });
assert.deepEqual(parse('/testgrant p5   6198371722'), { id: 'p5', target: '6198371722' }, 'лишние пробелы');
assert.equal(parse('/testgrant guide @someone').target, SELF, 'не-цифры игнорируются, не уедет чужому');
assert.equal(parse('/testgrant guide -5').target, SELF, 'отрицательный id игнорируется');
assert.equal(parse('/testgrant').id, '', 'без пака — покажем справку');

console.log('разбор /testgrant: все проверки прошли');
