// Потенциальный балл — единственное место в отчёте, где мы обещаем будущее.
// Завысить его = соврать человеку, поэтому границы проверяем.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pick = (re) => src.match(re)[0];
const { computePotential, shortRecs } = new Function(`
  ${pick(/var OVERALL_WEIGHTS = \{[\s\S]*?\n\};/)}
  ${pick(/^function computeOverall[\s\S]*?^\}/m)}
  ${pick(/var PSL_MAX = \d+;/)}
  ${pick(/var POTENTIAL_CEILING[\s\S]*?var POTENTIAL_BONUS\s+= \{[^\n]*\n/)}
  ${pick(/^function computePotential[\s\S]*?^\}/m)}
  ${pick(/^function shortRecs[\s\S]*?^\}/m)}
  return { computePotential, shortRecs };
`)();

const cats = (o) => ({
  "СИММЕТРИЯ": 5, "ГЛАЗА_CANTHAL_TILT": 5, "МИДФЕЙС_MAXILLA": 5,
  "ДЖОУЛАЙН_MANDIBLE": 5, "НОС_NOSE": 5, "ГУБЫ_СКУЛЫ": 5,
  "КОЖА": 5, "ГРУМИНГ_STYLE": 5, ...o,
});

// обычное лицо: рост есть, но скромный — кость держит 80% веса
// общий балл — PSL 0-8, категории — 0-10: рост по категориям переводится в PSL
let p = computePotential({ overall: 4.2, byKey: cats({}) });
assert.ok(p > 4.2 && p < 5.2, `рост должен быть умеренным, меньше одного SD, получили ${p}`);

// запущенные кожа и груминг — рост заметнее
const neglect = computePotential({ overall: 4.2, byKey: cats({ "КОЖА": 3, "ГРУМИНГ_STYLE": 3 }) });
assert.ok(neglect > p, 'у запущенных кожи и груминга потенциал выше');

// уже идеальные кожа и груминг — обещать нечего
assert.equal(
  computePotential({ overall: 6.6, byKey: cats({ "КОЖА": 9, "ГРУМИНГ_STYLE": 9, "ДЖОУЛАЙН_MANDIBLE": 9.5 }) }),
  null, 'расти некуда — блок скрыт');

// потолок: PSL 7 (Chad) и не выше — уходом за кожей выше не дотянуть
const top = computePotential({ overall: 6.9, byKey: cats({ "КОЖА": 2, "ГРУМИНГ_STYLE": 2 }) });
assert.ok(top <= 7, `потолок PSL 7, получили ${top}`);
assert.equal(computePotential({ overall: 7.2, byKey: cats({ "КОЖА": 2, "ГРУМИНГ_STYLE": 2 }) }), null, 'уже выше потолка — обещать нечего');

// Тизер отдаёт три категории из восьми, и блок всё равно должен показываться:
// неизвестным категориям подставляется общий балл.
const teaser = computePotential({ overall: 4.2, byKey: { "СИММЕТРИЯ": 5, "ГЛАЗА_CANTHAL_TILT": 5, "КОЖА": 5 } });
assert.ok(teaser !== null, 'в тизере блок виден');
const full = computePotential({ overall: 4.2, byKey: cats({}) });
assert.ok(Math.abs(teaser - full) <= 0.2, `тизер не должен расходиться с полным: ${teaser} против ${full}`);

// Но и в тизере, если расти некуда, обещать нечего: лицо уже у потолка PSL 7.
assert.equal(
  computePotential({ overall: 7.1, byKey: { "СИММЕТРИЯ": 9, "ГЛАЗА_CANTHAL_TILT": 9, "КОЖА": 9 } }),
  null, 'тизер у сильного лица тоже скрыт');

// Пропущенная категория в тизере — это уровень PSL + 1, а не сам PSL: иначе PSL 6.7
// выдавался за категорию 6.7 и лицу модельного уровня обещался рост по грумингу.
const strongTeaser = computePotential({ overall: 6.5, byKey: { "СИММЕТРИЯ": 8, "ГЛАЗА_CANTHAL_TILT": 8, "КОЖА": 8.5 } });
const strongFull = computePotential({ overall: 6.5, byKey: cats({ "СИММЕТРИЯ": 8, "ГЛАЗА_CANTHAL_TILT": 8, "КОЖА": 8.5, "МИДФЕЙС_MAXILLA": 7.5, "ДЖОУЛАЙН_MANDIBLE": 7.5, "НОС_NOSE": 7.5, "ГУБЫ_СКУЛЫ": 7.5, "ГРУМИНГ_STYLE": 7.5 }) });
assert.equal(strongTeaser, strongFull, `у сильного лица тизер и полный отчёт совпадают: ${strongTeaser} против ${strongFull}`);
assert.equal(computePotential({ overall: null, byKey: cats({}) }), null, 'нет балла → null');

// краткие рекомендации: только софтмакс, по первому предложению, не больше трёх
const r = shortRecs([
  'SOFTMAX — Стрижка с объёмом сверху. Это вытянет лицо и уравновесит челюсть.',
  'HARDMAX — Ортодонтия, 18 месяцев.',
  'SOFTMAX — Санскрин каждое утро. Без него всё остальное бессмысленно.',
  'SOFTMAX — Сон восемь часов.',
  'SOFTMAX — Четвёртый пункт, лишний.',
]);
assert.equal(r.length, 3, 'ровно три пункта');
assert.ok(!r.some((x) => /HARDMAX/i.test(x)), 'хардмакс сюда не попадает');
assert.equal(r[0], 'Стрижка с объёмом сверху.', 'режется по первому предложению');

// Кнопка не должна выставлять счёт напрямую: buyPack по умолчанию уходит в звёзды
// без выбора способа оплаты и предлагает купить гайд тем, у кого он уже есть.
const render = src.match(/^function renderPotential[\s\S]*?^\}/m)[0];
assert.ok(!/buyPack\(/.test(render), 'кнопка не зовёт buyPack напрямую');
assert.match(render, /fmOpenView\("progress"\)/, 'кнопка ведёт в раздел ведения');
assert.match(render, /potBtnOwned/, 'у владельца гайда своя подпись кнопки');
assert.match(src, /guide: \(await env/.test(readFileSync(new URL('./worker.js', import.meta.url), 'utf8')) ? /./ : /НЕТ_ФЛАГА_guide_В_statusFor/,
  'statusFor отдаёт флаг guide');

console.log('потенциал: все проверки прошли');
