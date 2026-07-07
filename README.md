# FaceRate — AI-оценка лица (looksmaxxing / PSL)

Веб-приложение: пользователь загружает фото, приложение считает геометрию лица
**локально** (MediaPipe), отправляет фото на ИИ и показывает PSL-оценку, разбор по
8 категориям и рекомендации. Есть сравнение двух лиц («who mogs»), аккаунты и оплата
через Telegram Stars.

- **Прод:** https://facerate.ru
- **Репо:** `realfactchecknews-eng/face-metrics`
- **Бот:** [@faceratepay_bot](https://t.me/faceratepay_bot) · **Канал:** @wwwfacerateru

> Развлекательный сервис. Оценка — субъективная эвристика ИИ, не диагноз и не истина.

---

## Стек и файлы

Чистые HTML/CSS/JS без сборки. Всё в трёх файлах: `index.html`, `style.css`, `app.js`.

| Файл | Назначение |
|------|------------|
| `app.js` | Вся логика фронта: детекция лица, гейт/пейволл, аккаунты, анализ, сравнение, карточки, i18n |
| `worker.js` + `wrangler.toml` | Cloudflare Worker: прокси к OpenRouter + аккаунты/квоты/оплаты Telegram |
| `glossary.html` / `glossary-en.html` | Луксмакс-словарь (RU/EN) |
| `terms.html` / `privacy.html` | Соглашение и политика (только RU; в модали согласия текст локализован) |
| `og.png`, `favicon.svg`, `music.mp3` | Ассеты |
| `metrics.js`, `recommendations.js` | ⚠️ МЁРТВЫЙ КОД, не подключены |

- **Детекция:** `@mediapipe/tasks-vision` FaceLandmarker (IMAGE), 468 точек, локально.
- **ИИ:** Cloudflare Worker → OpenRouter, модель **`x-ai/grok-4.3`** (reasoning:low,
  temp 0.7, seed 1337). Разрешительная к оценке внешности, различает черты. Фронт и
  профиль шлются **отдельными изображениями** (`body.images`). Отчёт/язык — по `lang()`.
- **i18n:** английский по умолчанию (`fm-lang`, дефолт en), переключатель RU/EN на сайте
  и в боте. Словарь строк `I18N` в app.js, `BL` в worker.js, атрибуты `data-i18n`.

## Деплой

- **Сайт:** push в `master` → `.github/workflows/deploy.yml` (официальный Pages-пайплайн:
  `configure-pages` + `upload-pages-artifact` + `deploy-pages`). Публикует ТОЛЬКО статику
  (список файлов в шаге «Stage static site» — при добавлении нового файла дописать туда!).
  - ⚠️ env `github-pages` должен разрешать деплой с ветки `master` (Settings → Environments).
  - ⚠️ `deploy-pages` иногда флейкует «try again later» — лечится ре-запуском workflow.
- **Worker:** push с изменением `worker.js`/`wrangler.toml` → `deploy-worker.yml`
  (npm i -g wrangler@4 → `wrangler deploy`). Нужен секрет `CLOUDFLARE_API_TOKEN`.
- Кэш-бастинг: `?v=N` у style.css/app.js в index.html — поднимать при изменениях.

## Аккаунты, квоты, оплата (всё в worker.js, без отдельного хостинга)

Вебхук бота указывает на `WORKER_URL/tg-webhook`. Роуты воркера:
`/` анализ · `/authpoll` вход · `/me` статус · `/buy` инвойс · `/sendcard` карточка в личку · `/tg-webhook`.

- **Вход:** кнопка → `t.me/faceratepay_bot?start=<uuid>` → бот ловит `/start код` → сессия;
  сайт поллит `/authpoll`. Без номера телефона.
- **Квоты:** подписка на канал (`getChatMember`, кэш 5 мин) = **1 бесплатный/день**;
  далее **кредиты**; **безлимит** день/месяц (`unlim:tgid` = ms-expiry).
- **Тарифы** (const `PACKS`): p1 1/30⭐, p5 5/100⭐, d1 день/100⭐, m1 месяц/500⭐
  (Stars-подписка `subscription_period`, автопродление; отмена `editUserStarSubscription`).
- **Меню бота** (inline-кнопки): статус / магазин / промокод / подписка / розыгрыши / язык.
- **Промокоды:** админ (`ADMIN_USERNAMES`=['Matveyika']) пишет боту
  `/addpromo КОД АКТИВАЦИЙ credits=3` или `hours=24`. Один код — один раз в руки. Это же
  механика розыгрышей (кидаешь код в канал).
- **Лимиты-страховки:** `IP_LIMIT_DAY=40`, `GLOBAL_DAILY_CAP=200` (KV `g:date`).

## Секреты и KV

- Секреты Cloudflare: `OPENROUTER_API_KEY`, `TG_BOT_TOKEN`, `TG_WEBHOOK_SECRET`. В код НЕ класть.
- KV namespace `RATE_LIMIT` (id в wrangler.toml). Ключи: `sess:token`, `authcode:code`,
  `lang:tgid`, `credits:tgid`, `unlim:tgid`, `sub:tgid` (кэш подписки), `q:tgid:date` (free),
  `promo:CODE`, `promoused:CODE:tgid`, `subchg/subrec:tgid`, `g:date`, `d:/h:ip:date`.

## Фичи фронта

- **Поток:** интро → лендинг → полноэкранное меню (3D-пилюля за курсором) → анализ.
- **Анализ:** скан-анимация (локально, бесплатно) → пейволл (если нет квоты) → отчёт.
- **Who mogs:** плитка меню → два лица → вердикт «A mogs B» + карточка с красной плашкой
  **MOGGED** на глазах проигравшего (1 кредит).
- **Share-карточка** (`buildShareCard`, `buildCompareCard`): люкс-дизайн 1080×1680/1350,
  кроп по рамке лица (`window._fmFaceBox`), бренд-пилюля, бары, POTENTIAL. Share + Send to TG.
- Дерзкий режим (роаст), история оценок (localStorage `fm-*`), звук/музыка.

## Формат ответа ИИ (критично для парсинга)

Анализ: `parseAIReport` ждёт русские метки `ОБЩИЙ_БАЛЛ:`, `СИММЕТРИЯ:`,
`ГЛАЗА_CANTHAL_TILT:`, `МИДФЕЙС_MAXILLA:`, `ДЖОУЛАЙН_MANDIBLE:`, `НОС_NOSE:`,
`ГУБЫ_СКУЛЫ:`, `КОЖА:`, `ГРУМИНГ_STYLE:`, `РЕКОМЕНДАЦИИ:`. **Ключи не переводить** —
меняется только язык описаний. Сравнение: `SCORE_A / SCORE_B / WINNER / VERDICT`.
Балл — дробный (промпт запрещает целые/`.0`), разброс ≥2.5 между категориями.

## Смена модели

Одна строка `model` в `worker.js` (поле в `buildBody`), задеплоить. Модель обязана
поддерживать vision. Альтернативы: `qwen/qwen2.5-vl-72b-instruct` (дёшево, но кучкует баллы),
`openai/gpt-4o` (сильно, но иногда отказывает), `mistralai/pixtral-large-2411`.
⚠️ НЕ добавлять `provider:{allow_fallbacks}` — ломает запрос («Provider returned error»).

## Локальный запуск

```bash
python3 -m http.server 8000   # http(s), не file:// (иначе не грузится MediaPipe)
```

## Лицензия

MIT.
