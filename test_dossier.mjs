// Досье до входа (A/B, 23.11.2026): связки с гейтом, которые легко потерять при правках.
// Поведение проверено вживую (headless Chrome); здесь — защита от тихих поломок грепом.
// Запуск: node test_dossier.mjs
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const app = readFileSync('app.js', 'utf8'), worker = readFileSync('worker.js', 'utf8'), html = readFileSync('index.html', 'utf8');
const gate = app.slice(app.indexOf('function gateThenAI'), app.indexOf('function runAfterGate'));

// Досье — только на гейте входа и только при выпавшем варианте; не открылось — прежний гейт.
assert.match(gate, /if \(st\.error\) \{[\s\S]*fmStep\("gate_auth"\);[\s\S]*dossierOn\(\) && fmDossier\.show\(\)[\s\S]*showPaywall\("auth"\)/, 'гейт входа: досье или прежний пейволл');
// Прошёл гейт — досье закрывается, иначе анализ пойдёт под ним.
assert.match(app, /function runAfterGate\(\) \{ fmDossier\.close\(\);/, 'runAfterGate закрывает досье');
// Крестик входа поверх досье не выбрасывает человека к загрузке.
assert.match(app, /if \(fmDossier\.isOpen\(\)\) \{ hidePaywall\(\); return; \}/, 'крестик входа возвращает в досье');
// Мини-апп и английский — без досье (там нет гейта входа / нет перевода).
assert.match(app, /function dossierOn\(\) \{\s*if \(TG_MINI \|\| lang\(\) !== "ru"\) return false;/, 'досье только на сайте и по-русски');
// Шаги A/B есть в воронке воркера — иначе /funnel их молча выбросит.
for (const s of ['gate_auth_d', 'dos_cta', 'auth_ok_d']) assert.ok(worker.includes(`['${s}',`), `шаг ${s} в FUNNEL_STEPS`);
assert.equal((app.match(/fmStep\("auth_ok"\); if \(dossierSeen\(\)\) fmStep\("auth_ok_d"\);/g) || []).length, 2, 'вход после досье считается в обоих путях входа');
// Разметка на месте.
for (const id of ['dossier', 'dsGl', 'dsCta', 'dsCta2', 'dsAgain', 'dsPlates']) assert.ok(html.includes(`id="${id}"`), `#${id} в index.html`);

console.log('досье: все проверки пройдены');
