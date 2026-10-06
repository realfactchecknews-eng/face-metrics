// Блок потенциала — единственное место в отчёте, где мы обещаем будущее.
// Соврать тут = пообещать рост, которого человек не получит.
// С 06.10.2026 блок говорит НЕ про PSL: балл считается по геометрии кости и от ухода
// не двигается вовсе. Потенциал считается по appeal — та же формула дата-шита, но
// вместе с кожей и волосами, которые человек реально меняет.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pick = (re) => { const m = src.match(re); assert.ok(m, 'не нашёл в app.js: ' + re); return m[0]; };
const F = new Function(`
  ${pick(/var PSL_MAX = \d+;/)}
  ${pick(/var APPEAL_FEATURE_WEIGHTS = \{[^}]*\};/)}
  ${pick(/var FEATURE_WEIGHTS = \{[^}]*\};/)}
  ${pick(/var PILLAR_WEIGHTS = \{[^}]*\};/)}
  ${pick(/var PSL_FROM_METHOD = [\d.]+;/)}
  ${pick(/var METHOD_KEYS = \[[^\]]*\];/)}
  ${pick(/^function scoreFromValues[\s\S]*?^\}/m)}
  ${pick(/^function appealFromValues[\s\S]*?^\}/m)}
  ${pick(/var POTENTIAL_CEILING = \{[^}]*\};/)}
  ${pick(/var POTENTIAL_ANGULARITY = \{[^}]*\};/)}
  ${pick(/^function computePotential[\s\S]*?^\}/m)}
  ${pick(/^function shortRecs[\s\S]*?^\}/m)}
  return F_EXPORTS();
  function F_EXPORTS() { return { computePotential, shortRecs, scoreFromValues, appealFromValues }; }
`)();

const ten = (o) => ({
  HARMONY: 5, DIMORPHISM: 5, ANGULARITY: 5, SKIN: 5, HAIR: 5,
  MOUTH: 5, EYES: 5, SYMMETRY: 5, NOSE: 5, EARS: 5, ...o,
});
const of = (o) => { const p = ten(o); return { pillars: p, overall: F.scoreFromValues(p) }; };

// Обычный человек должен видеть блок: ради этого он и существует.
const ordinary = F.computePotential(of({}));
assert.ok(ordinary, 'у обычного лица блок обязан показываться');
assert.ok(ordinary.max - ordinary.now >= 0.4, 'и прибавка должна быть заметной, вышло ' + (ordinary.max - ordinary.now).toFixed(2));

// Внешний вид у среднего лица равен PSL: при оценках 5 обе формулы дают 4.0.
assert.equal(ordinary.now, of({}).overall, 'при ровных оценках внешний вид совпадает с баллом');

// Плохая кожа тянет внешний вид вниз, но PSL не трогает вовсе.
const bad = of({ SKIN: 2, HAIR: 2 });
assert.equal(bad.overall, of({}).overall, 'кожа и волосы на PSL не влияют');
assert.ok(F.appealFromValues(bad.pillars) < F.appealFromValues(of({}).pillars), 'а на внешний вид влияют');
const badPot = F.computePotential(bad);
assert.ok(badPot.max - badPot.now > ordinary.max - ordinary.now, 'кому есть что чинить, тому и обещаем больше');

// Потолок: у кого кожа, волосы и угловатость уже наверху, обещать нечего.
assert.equal(F.computePotential(of({ SKIN: 9, HAIR: 9, ANGULARITY: 8.5 })), null, 'на потолке блок скрыт');

// Кость не трогаем: обещать рост гармонии или диморфизма значит врать.
const boney = F.computePotential(of({ HARMONY: 2, DIMORPHISM: 2 }));
// Допуск 0.1: оба числа округляются до десятых, и граница округления гуляет.
assert.ok(Math.abs((boney.max - boney.now) - (ordinary.max - ordinary.now)) <= 0.1,
  'слабая кость размер обещания не меняет');

// Без десяти оценок (старый отчёт из кэша) блок просто не показывается.
assert.equal(F.computePotential({ overall: 4.2 }), null, 'нет оценок — нет обещаний');
assert.equal(F.computePotential({ overall: 4.2, pillars: { HARMONY: 5 } }), null, 'неполные оценки — тоже нет');

// Короткие пункты для блока: только софтмакс и только первое предложение.
assert.deepEqual(F.shortRecs(['SOFTMAX — Убери отёк. Это вторая фраза.', 'HARDMAX — Операция.', 'SOFTMAX — Сбрось 3 кг.']),
  ['Убери отёк.', 'Сбрось 3 кг.'], 'в блок идут только софтмаксы, по одному предложению');

console.log('потенциал: все проверки прошли');
