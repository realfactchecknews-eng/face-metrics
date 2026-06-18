# FaceRate — AI-анализ лица (looksmaxxing / PSL)

Веб-приложение: пользователь загружает фото лица, приложение находит
геометрию лица **локально в браузере** (MediaPipe), отправляет фото + числовые
метрики на ИИ-модель через прокси и показывает оценку внешности по 10-балльной
шкале с разбором по категориям и персональными рекомендациями (softmax/hardmax).

- **Прод:** https://facerate.ru
- **Репозиторий:** `realfactchecknews-eng/face-metrics`
- **Хостинг:** GitHub Pages (ветка `gh-pages`), ИИ-прокси — Cloudflare Worker.

> ⚠️ **Это не медицинский/диагностический инструмент и не объективная истина.**
> Оценка — развлекательная эвристика на основе ИИ.

---

## Как это работает (поток данных)

1. Пользователь грузит **фронтальное фото** (обязательно) и опционально **профиль**.
2. **MediaPipe Tasks `FaceLandmarker`** (`runningMode: "IMAGE"`) находит 468/478
   точек лица — **на устройстве, в браузере** (WASM + модель тянутся с CDN).
3. `computeFaceMetrics()` считает геометрию (ширина скул/челюсти/лба, fWHR,
   симметрия), `classifyFaceShape()` определяет форму лица. Всё локально.
4. Запускается анимация сканирования (canvas: луч, сетка, замеры).
5. `callAI()` собирает текстовый промпт (форма лица, симметрия %, fWHR, ширины)
   + **само фото в base64** и шлёт `POST` на **Cloudflare Worker**.
6. Worker (`worker.js`) подставляет секретный `OPENROUTER_API_KEY` и проксирует
   запрос в **OpenRouter** → vision-модель.
7. Модель возвращает отчёт строго заданного текстового формата; `parseAIReport()`
   разбирает его и рисует баллы, шкалы и рекомендации.

### ⚠️ Про приватность (честно)
Геометрия считается локально, но для ИИ-оценки **само изображение отправляется**
на Worker и далее в OpenRouter (в base64). То есть фото покидает устройство.
Не пишите в UI, что «фото никуда не уходит» — это неверно для ИИ-части.

---

## Стек

- **Фронтенд:** чистые HTML/CSS/JS, **без сборки и фреймворков**. Просто статика.
- **Детекция лица:** `@mediapipe/tasks-vision` `FaceLandmarker`, режим `IMAGE`,
  грузится через динамический `import()` в `app.js` (CDN jsDelivr). Модель —
  `face_landmarker.task` со storage.googleapis.com.
- **ИИ:** Cloudflare Worker → OpenRouter (chat/completions, vision).
- **Шрифт:** Google Fonts — Cormorant Garamond (300/400).
- **Акцент:** золото `#c4a46b` (CSS-переменная `--accent`).

---

## Структура файлов

| Файл | Назначение |
|------|------------|
| `index.html` | Вся разметка: интро-оверлей, лендинг, загрузка фото, анализ, результаты |
| `style.css` | Все стили и анимации |
| `app.js` | **Вся логика**: загрузка фото, FaceLandmarker, метрики, анимация canvas, вызов ИИ, парсинг и рендер отчёта |
| `worker.js` | Cloudflare Worker — прокси к OpenRouter (хранит ключ, добавляет CORS) |
| `wrangler.toml` | Конфиг воркера (`name = "face-metrics-ai"`, `main = "worker.js"`) |
| `favicon.svg` | Иконка |
| `CLAUDE.md` | Контекст проекта для ИИ-ассистентов |
| `metrics.js`, `recommendations.js` | ⚠️ **МЁРТВЫЙ КОД** — не подключены в `index.html`, вся логика живёт в `app.js`. Можно удалить. |

---

## Деплой

### Сайт (фронтенд) — автоматически
Push в ветку **`master`** → GitHub Actions (`.github/workflows/deploy.yml`,
`peaceiris/actions-gh-pages@v4`) собирает и публикует в ветку **`gh-pages`**.
Домен `facerate.ru` подключён через файл `CNAME` в `gh-pages`.

```bash
git add -A && git commit -m "..." && git push origin master
# через ~1-2 мин обновится facerate.ru (браузер: Ctrl+F5 от кэша)
```

### Worker (ИИ) — вручную, отдельно
Изменения в `worker.js` (модель, max_tokens, логика) **НЕ** деплоятся через Pages.
Нужен Wrangler:

```bash
npm install -g wrangler      # один раз
wrangler login               # один раз (откроет браузер)
wrangler deploy              # выкатить worker.js
```

Воркер публикуется на URL, прописанный во фронте: `WORKER_URL` в начале `app.js`
(`https://face-metrics-ai.realfactchecknews.workers.dev`).

Секрет с ключом OpenRouter уже задан; задать/обновить:
```bash
wrangler secret put OPENROUTER_API_KEY    # ключ берётся на openrouter.ai/keys
```

---

## Смена ИИ-модели

Поменять одну строку в `worker.js` (поле `model`) и сделать `wrangler deploy`.
Модель **обязана поддерживать vision** (приём изображений).

Текущая модель: **`qwen/qwen2.5-vl-72b-instruct`** — выбрана потому, что хорошо
описывает лица и **не отказывается** оценивать внешность (Gemini/GPT-4o склонны
отказываться по «этическим» соображениям на looksmaxxing-запросы).

Альтернативы (id для OpenRouter):
- `qwen/qwen2.5-vl-72b-instruct` — текущая; дёшево, послушная, хорошее зрение.
- `meta-llama/llama-4-maverick` — послушная, но комментарии шаблоннее.
- `mistralai/pixtral-large-2411` — хорошее зрение, довольно свободная.
- `x-ai/grok-2-vision-1212` — сильная и пермиссивная (проверьте цену/доступность).
- `google/gemini-2.5-flash`, `openai/gpt-4o` — сильное зрение, но **часто отказывают**.

---

## Формат ответа ИИ (КРИТИЧНО для парсинга)

`parseAIReport()` в `app.js` ищет **точные русские метки**. Если изменить их
текст в промпте — парсинг сломается и отчёт не отрисуется. Метки:

```
ОБЩИЙ_БАЛЛ: X/10
[текст]

СИММЕТРИЯ: X/10
ГЛАЗА_CANTHAL_TILT: X/10
МИДФЕЙС_MAXILLA: X/10
ДЖОУЛАЙН_MANDIBLE: X/10
НОС_NOSE: X/10
ГУБЫ_СКУЛЫ: X/10
КОЖА: X/10
ГРУМИНГ_STYLE: X/10

РЕКОМЕНДАЦИИ:
1. Softmax: ...
2. ...
```

- Каждая категория: `МЕТКА: число/10` на своей строке, затем текст.
- Рекомендации: только **пронумерованные строки** идут в список (парсер
  отбрасывает всё остальное), по одной рекомендации на строку.
- Промпт целиком собирается в функции `callAI()` (`app.js`). Калибровка баллов,
  привязка симметрии к измеренному `%` и запрет шаблонных фраз — там же.

---

## Ключевые функции и DOM (для навигации)

- `initFaceLandmarker()` — ленивая инициализация MediaPipe (dynamic import).
- `loadFrontFile()` / `loadSideFile()` — загрузка фото, превью, показ кнопки анализа.
- `processImage(img, sideImage)` — `FaceLandmarker.detect()` (синхронно в IMAGE),
  метрики, форма лица, запуск анимации, затем `callAI()`.
- `computeFaceMetrics(lm)` → `{ cheekboneWidth, jawWidth, foreheadWidth, faceHeight, widthHeightRatio, symmetryScore }`.
- `classifyFaceShape(metrics)` → `{ shape }` (oval/round/square/heart/diamond/oblong).
- Анимация canvas: `animateScan`, `drawScanLine`, `drawMeshUpTo`, `drawFullMesh`,
  `drawScannerCrosshairs`, `animateMeasurements` (+ `draw*Line/Label`).
- ИИ: `callAI()`, `startAIHUD()/stopAIHUD()`, `canvasToBase64()/compositeToBase64()`,
  `parseAIReport()`, `renderAIReport()`.
- `clearReport()` — обнуляет блок результатов при старте нового анализа.
- Утилита: глобальный класс `.hidden { display:none }` прячет элементы; многие
  состояния переключаются добавлением/снятием этого класса.

Основные DOM id: `frontArea/sideArea`, `fileInput/sideInput`, `analyzeBtn`,
`canvas`, `loading`, `results`, `aiLoading` (HUD), `aiReport`, `overallScoreNum`,
`categoryScores`, `aiRecs/recsList`, `aiError`, `errorBox`, `resetBtn`.

---

## Локальный запуск

`import()` модели работает только по http(s), не по `file://`:

```bash
cd face-metrics
python -m http.server 8000
# открыть http://localhost:8000
```

ИИ-часть требует рабочего воркера (URL в `WORKER_URL`). Без него геометрия и
анимация работают, а ИИ-отчёт покажет ошибку.

---

## Частые правки

- **Сменить модель / лимит токенов:** `worker.js` → `wrangler deploy`.
- **Изменить промпт/калибровку оценок:** функция `callAI()` в `app.js`.
- **НЕ менять** русские метки формата (см. выше) без правки `parseAIReport()`.
- **Сменить домен:** файл `CNAME` в ветке `gh-pages`.

## Лицензия
MIT.
