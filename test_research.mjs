// Страница исследований и лицевые трети — то, что взято из дата-шита БЕЗ влияния на балл.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./research.html', import.meta.url), 'utf8');
const links = page.match(/href="https?:\/\/[^"]+"/g) || [];
assert.ok(links.length >= 50, 'на странице все работы: ' + links.length);
assert.ok(!/href="https?:\/\/[^"]*"(?![^>]*rel="noopener nofollow")/.test(page.replace(/href="https:\/\/facerate\.ru[^"]*"/g, '')),
  'внешние ссылки открываются безопасно и не передают вес');
assert.match(page, /chronicxm/, 'указан автор подборки');
assert.match(page, /Zeutor/, 'указан переводчик');
assert.match(page, /канониче|субъективной эвристикой/, 'честная оговорка: балл — не результат этих работ');

const deploy = readFileSync(new URL('./.github/workflows/deploy.yml', import.meta.url), 'utf8');
assert.match(deploy, /research\.html/, 'страница попадает в деплой: список файлов там явный');
assert.match(readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8'), /research\.html/, 'страница в карте сайта');
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
assert.ok((app.match(/research\.html/g) || []).length >= 2, 'ссылка в меню статей на обоих языках');

// Трети показываем человеку, но в промпт не кладём — это проверено замером.
assert.match(app, /\['thirds',\s+'Средняя треть к нижней'/, 'трети в таблице пропорций');
assert.match(app, /thirds:\s+thirdLow \? thirdMid \/ thirdLow : 0/, 'считаются по точкам');
assert.ok(!/Facial thirds/.test(app), 'в промпт модели трети не уходят');
assert.ok(!/Vertical fifths/.test(app), 'и пятые доли тоже');

console.log('исследования и трети: все проверки прошли');
