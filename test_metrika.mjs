// Счётчик Метрики на всех страницах сайта и метка Telegram в ссылках ботов. Без первого
// не видно, ведут ли статьи на анализ; без второго Telegram прячется в прямых заходах.
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert';
const pages = readdirSync('.').filter((f) => f.endsWith('.html') && !/^(_|yandex_|google)/.test(f));
for (const p of pages) {
  const s = readFileSync(p, 'utf8');
  assert.equal((s.match(/ym\(110520471, 'init'/g) || []).length, 1, p + ': счётчика нет или он дважды');
  if (p !== 'index.html') {
    assert.match(s, /if \(window\.top === window\)/, p + ': в iframe приложения счётчик не должен срабатывать');
    assert.ok(!/webvisor/.test(s), p + ': вебвизор только на главной');
  }
}
for (const f of readdirSync('.').filter((f) => /^(yandex_|google).*\.html$/.test(f))) {
  assert.ok(!/mc\.yandex/.test(readFileSync(f, 'utf8')), f + ': файл подтверждения прав трогать нельзя');
}
const w = readFileSync('worker.js', 'utf8');
const bare = w.match(/url: 'https:\/\/facerate\.ru(\/#\w+)?'/g);
assert.equal(bare, null, 'ссылка бота на сайт без метки Telegram: ' + bare);
console.log(`метрика на ${pages.length} страницах и метки Telegram: все проверки прошли`);
