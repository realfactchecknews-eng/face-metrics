# FaceRate — AI-оценка лица (looksmaxxing / PSL)

Веб-приложение: пользователь загружает фото, приложение считает геометрию лица
**локально** (MediaPipe), отправляет фото на ИИ и показывает PSL-оценку, разбор по
8 категориям и рекомендации. Есть сравнение двух лиц («who mogs»), аккаунты, оплата
(Telegram Stars / крипта / карта РФ) и отдельный бот техподдержки с AI-ответами и
панелью модератора.

- **Прод:** https://facerate.ru
- **Репо:** `realfactchecknews-eng/face-metrics`, рабочая ветка — **`master`**
  (это важно: есть старая фича-ветка `claude/face-geometry-tool-*` без бота и
  платежей — не путать, весь актуальный код только в `master`)
- **Бот оплаты:** [@faceratepay_bot](https://t.me/faceratepay_bot)
- **Бот поддержки:** [@FaceRateSupport_bot](https://t.me/FaceRateSupport_bot)
- **Канал:** @wwwfacerateru

> Развлекательный сервис. Оценка — субъективная эвристика ИИ, не диагноз и не истина.

---

## Стек и файлы

Чистые HTML/CSS/JS без сборки.

| Файл | Назначение |
|------|------------|
| `index.html` | Разметка сайта |
| `style.css` | Все стили |
| `app.js` | Вся логика фронта: детекция лица, гейт/пейволл, аккаунты, оплата, анализ, сравнение, карточки, i18n |
| `worker.js` + `wrangler.toml` | Cloudflare Worker: ОДИН воркер обслуживает и анализ (OpenRouter), и **оба Telegram-бота** (оплата + поддержка) через разные роуты/вебхуки |
| `glossary.html` / `glossary-en.html` | Луксмакс-словарь (RU/EN) |
| `terms.html` / `privacy.html` | Соглашение и политика (RU; в модали согласия текст локализован) |
| `og.png`, `favicon.svg`, `music.mp3` | Ассеты |
| `metrics.js`, `recommendations.js` | ⚠️ МЁРТВЫЙ КОД, не подключены в `index.html` |

- **Детекция:** `@mediapipe/tasks-vision` FaceLandmarker (IMAGE), 468 точек, локально в браузере.
- **ИИ-анализ:** Cloudflare Worker → OpenRouter, модель **`x-ai/grok-4.3`** (reasoning:low,
  temp 0.7, seed 1337, до 3 ретраев). Разрешительная к оценке внешности. Фронт и
  профиль шлются **отдельными изображениями** (`body.images`). Язык отчёта — по `lang()`.
- **i18n:** английский по умолчанию (`fm-lang`), переключатель RU/EN на сайте и в обоих
  ботах. Словарь строк: `I18N` в `app.js`, `BL` (бот оплаты) и `SUP` (бот поддержки) в `worker.js`.

## Деплой (полностью автоматический, push в master → всё едет само)

- **Сайт:** push в `master` → `.github/workflows/deploy.yml` (официальный Pages-пайплайн:
  `configure-pages` + `upload-pages-artifact` + `deploy-pages`). Публикует ТОЛЬКО статику —
  список файлов зашит в шаге «Stage static site»; **при добавлении нового файла на сайт
  дописать его туда**, иначе не задеплоится.
  - ⚠️ env `github-pages` должен разрешать деплой с ветки `master` (Settings → Environments).
  - ⚠️ `deploy-pages` иногда флейкует «try again later» — лечится ре-запуском workflow.
- **Worker:** push с изменением `worker.js`/`wrangler.toml` → `.github/workflows/deploy-worker.yml`
  (`npm i -g wrangler@4` → `wrangler deploy`). Нужен секрет `CLOUDFLARE_API_TOKEN` в GitHub.
  Ручной деплой (если нет доступа к Actions): `npx wrangler deploy` из корня репо.
- Кэш-бастинг: `?v=N` у `style.css`/`app.js` в `index.html` — поднимать при существенных изменениях.

## Один воркер — три роль-группы роутов

```
Анализ и аккаунты (сайт):     POST /            анализ (OpenRouter)
                               POST /auth        вход через Telegram Login Widget
                               POST /authpoll    вход через t.me/бот?start=код (поллинг)
                               POST /me          статус: квота, кредиты, unlim, доступные способы оплаты
                               POST /buy         создать инвойс: method=stars|rub|crypto
                               POST /sendcard    отправить share-карточку в личку боту оплаты

Бот оплаты (@faceratepay_bot): POST /tg-webhook       pre_checkout_query + successful_payment + меню бота
                               POST /crypto-webhook   вебхук CryptoBot: invoice_paid → начисление

Бот поддержки (@FaceRateSupport_bot):
                               POST /support-webhook  AI-FAQ, эскалация оператору, панель модератора
```

Все три группы читают/пишут в один и тот же KV `RATE_LIMIT` — поэтому язык, тарифы,
логика начисления шарятся между сайтом и обоими ботами без дублирования.

## Аккаунты, квоты, оплата

- **Вход:** кнопка на сайте → `t.me/faceratepay_bot?start=<uuid>` → бот ловит
  `/start код` → создаёт сессию; сайт поллит `/authpoll`. Без номера телефона.
  Есть и обычный Telegram Login Widget (`/auth`).
- **Квоты (в порядке приоритета):** активный безлимит (`unlim:tgid` = ms-expiry) →
  подписка на канал (`getChatMember`, кэш подписки 5 мин, `isSubscribed`) = **1
  бесплатный анализ/день** → кредиты (`credits:tgid`).
- **Тарифы** (`const PACKS` в `worker.js`) — цены сделаны «некруглыми» (charm pricing),
  ~1.5₽ за звезду:
  | id | что | Stars | ₽ |
  |----|-----|-------|---|
  | `p1` | 1 анализ | 29⭐ | 49₽ |
  | `p5` | 5 анализов | 99⭐ | 149₽ |
  | `d1` | безлимит на день (24ч) | 99⭐ | 149₽ |
  | `m1` | безлимит на месяц (720ч, разовая покупка) | 499⭐ | 749₽ |

  ⚠️ `m1` **намеренно НЕ** Stars-подписка (`type:'sub'`/`subscription_period`) —
  Telegram отдаёт `SUBSCRIPTION_EXPORT_MISSING`, пока подписки Stars не одобрены
  в @BotFather для этого бота. Пока это разовый `type:'unlim', hours:720`. Если
  включишь Stars-подписки в BotFather — можно вернуть `type:'sub', period:2592000`
  для автопродления (комментарий в коде рядом с `PACKS.m1`).

- **Способы оплаты** — стакаются по наличию секретов (`enabledMethods(env)`):
  - **Stars (XTR)** — всегда доступен, через `createInvoiceLink`/`sendInvoice`.
  - **Крипта** — CryptoBot (Crypto Pay API), включается наличием `CRYPTOBOT_TOKEN`.
    Цена берётся в рублях (`pack.rub`), CryptoBot сам показывает курс в крипте.
  - **Карта РФ** — через Telegram + провайдера ЮKassa, включается наличием
    `YUKASSA_PROVIDER_TOKEN` (взять в @BotFather → бот → Payments → ЮKassa).
    ⚠️ Пока НЕ подключено — ЮKassa требует юрлицо/ИП/самозанятость для регистрации.
    Как только появится провайдер-токен — просто прописать секрет, код уже готов.
  - И сайт (`app.js`, `showPaywall`), и бот оплаты (`methodKb`/`packsKb`) сначала
    спрашивают **способ**, потом показывают **тариф** в цене этого способа.

- **Меню бота оплаты** (inline-кнопки): статус / магазин (способ→тариф) / промокод /
  подписка (авто-продление вкл/выкл) / розыгрыши / язык / **поддержка** (ссылка на
  бот поддержки).
- **Промокоды:** админ (`ADMIN_USERNAMES = ['Matveyika']`, проверка по username)
  пишет боту `/addpromo КОД АКТИВАЦИЙ credits=3` или `hours=24`. Один код — один
  раз в руки на пользователя. Это же механика розыгрышей (кидаешь код в канал).
- **Лимиты-страховки:** `IP_LIMIT_DAY=40`, `GLOBAL_DAILY_CAP=300` (KV `g:date`, `d:ip:date`).

## Бот техподдержки (@FaceRateSupport_bot)

Отдельный Telegram-бот, отдельный токен, но тот же воркер и тот же KV.

- **AI-first:** любое сообщение пользователя без активной эскалации уходит в
  `supportAI()` (OpenRouter, `x-ai/grok-4.3`, системный промпт `SUP_FAQ` с фактами
  о сервисе). Ответ + кнопки «Позвать оператора» / «← Меню».
- **`/start`, `/menu`:** меню — FAQ / Позвать оператора / Открыть сайт / Купить
  (ссылка в бот оплаты) / смена языка / (только для админа) кнопка **⚙️ Admin**.
- **Эскалация:** кнопка «🧑 Позвать оператора» ставит `suphuman:<uid>` (сутки) —
  дальше все сообщения юзера идут прямиком тебе (`SUPPORT_ADMIN_ID`) и попадают
  в список открытых тикетов.
- **Панель модератора** (`/admin` или кнопка ⚙️ Admin, видна только
  `SUPPORT_ADMIN_ID`):
  - **📂 Открытые чаты** — кнопка на каждого юзера с превью последнего сообщения.
    Тапнул → следующий обычный текст (без реплая!) уходит именно этому юзеру,
    пока не откроешь другой чат или не закроешь этот («✖» рядом с чатом).
    Старый способ (реплай на пересланное сообщение) тоже по-прежнему работает.
  - **💳 Транзакции** — последние 20 из лога всех платежей (Stars/крипта/карта):
    время, кто, какой пакет, сумма, способ.
  - `/close <id>` — закрыть диалог с конкретным юзером текстовой командой.

## Секреты и KV

Секреты Cloudflare (`wrangler secret put ИМЯ`, никогда не класть в код):

| Секрет | Для чего |
|---|---|
| `OPENROUTER_API_KEY` | анализ лица + AI-ответы саппорт-бота |
| `TG_BOT_TOKEN` | бот оплаты @faceratepay_bot |
| `TG_WEBHOOK_SECRET` | проверка `/tg-webhook` |
| `CRYPTOBOT_TOKEN` | Crypto Pay API (крипта) |
| `YUKASSA_PROVIDER_TOKEN` | карта РФ через Telegram (пока не подключено) |
| `SUPPORT_BOT_TOKEN` | бот поддержки @FaceRateSupport_bot |
| `SUPPORT_ADMIN_ID` | твой Telegram id — куда падают эскалации и кому доступна панель модератора |
| `SUPPORT_WEBHOOK_SECRET` | проверка `/support-webhook` |

Не-секрет `BOT_USERNAME` (кнопка «вернуться в бота» после оплаты криптой) — в `[vars]` `wrangler.toml`.

KV namespace `RATE_LIMIT` (id — в `wrangler.toml`). Ключи:
- Сайт/аккаунты: `sess:token`, `authcode:code`, `lang:tgid`, `credits:tgid`,
  `unlim:tgid`, `sub:tgid` (кэш подписки), `q:tgid:date` (free-квота),
  `g:date` / `d:ip:date` (антиспам-лимиты).
- Промокоды: `promo:CODE`, `promoused:CODE:tgid`.
- Подписка Stars (если когда-нибудь включишь `type:'sub'`): `subchg:tgid`, `subrec:tgid`.
- Крипта: `cryptopaid:invoice_id` (идемпотентность вебхука).
- Поддержка: `suphuman:uid` (флаг эскалации), `supmap:message_id` (старый reply-flow),
  `suptickets` (JSON-массив открытых тикетов, ≤30), `admtarget:adminId` (кому сейчас
  «прилипающий» ответ), `translog` (JSON-массив последних 50 транзакций).

## Как проверить, что платёж реально даёт доступ (шпаргалка для дебага)

```bash
NS=<id из wrangler.toml>
# 1) создать тестовую сессию
npx wrangler kv key put --remote --namespace-id=$NS "sess:TESTTOKEN" \
  '{"id":999000001,"first_name":"T","username":"","photo_url":""}'
# 2) выдать безлимит (как это делает grantPack после оплаты)
npx wrangler kv key put --remote --namespace-id=$NS "unlim:999000001" "$(( ($(date +%s)+2592000)*1000 ))"
# 3) проверить статус и сам анализ
curl -s -X POST https://face-metrics-ai.realfactchecknews.workers.dev/me \
  -d '{"token":"TESTTOKEN"}'
curl -s -X POST https://face-metrics-ai.realfactchecknews.workers.dev/ \
  -d '{"token":"TESTTOKEN","prompt":"Ответь одним словом: работает?"}'
# 4) убрать за собой
npx wrangler kv key delete --remote --namespace-id=$NS "sess:TESTTOKEN"
npx wrangler kv key delete --remote --namespace-id=$NS "unlim:999000001"
```
⚠️ `wrangler kv key put` без `--remote` пишет в локальную эмуляцию, а не в боевой KV — легко потерять час на «почему изменения не видны».

## Фичи фронта

- **Поток:** интро → лендинг → полноэкранное меню (3D-пилюля за курсором) → анализ.
- **Анализ:** скан-анимация (локально, бесплатно) → пейволл (если нет квоты, способ→тариф) → отчёт.
- **Who mogs:** плитка меню → два лица → вердикт «A mogs B» + карточка с красной плашкой
  **MOGGED** на глазах проигравшего (1 кредит).
- **Share-карточка** (`buildShareCard`, `buildCompareCard`): 1080×1680/1350, кроп по рамке
  лица (`window._fmFaceBox`), бренд-пилюля, бары, POTENTIAL. Share + Send to TG (`/sendcard`).
- Дерзкий режим (роаст), история оценок (localStorage `fm-*`), звук/музыка.

## Формат ответа ИИ (критично для парсинга)

Анализ: `parseAIReport` ждёт русские метки `ОБЩИЙ_БАЛЛ:`, `СИММЕТРИЯ:`,
`ГЛАЗА_CANTHAL_TILT:`, `МИДФЕЙС_MAXILLA:`, `ДЖОУЛАЙН_MANDIBLE:`, `НОС_NOSE:`,
`ГУБЫ_СКУЛЫ:`, `КОЖА:`, `ГРУМИНГ_STYLE:`, `РЕКОМЕНДАЦИИ:`. **Ключи не переводить** —
меняется только язык описаний. Сравнение: `SCORE_A / SCORE_B / WINNER / VERDICT`.
Балл — дробный (промпт запрещает целые/`.0`), разброс ≥2.5 между категориями.

## Смена модели анализа

Одна строка `model` в `worker.js` (поле в `buildBody` внутри `analyze()`), задеплоить.
Модель обязана поддерживать vision. Альтернативы: `qwen/qwen2.5-vl-72b-instruct`
(дёшево, но кучкует баллы), `openai/gpt-4o` (сильно, но иногда отказывает),
`mistralai/pixtral-large-2411`. ⚠️ НЕ добавлять `provider:{allow_fallbacks}` —
ломает запрос («Provider returned error»).

## Локальный запуск

```bash
python3 -m http.server 8000   # http(s), не file:// (иначе не грузится MediaPipe)
```

## Известные ограничения / TODO

- ЮKassa (карта РФ) не подключена — нужен провайдер-токен, для регистрации ЮKassa
  нужно юрлицо/ИП/самозанятость. Код уже поддерживает `method:'rub'`, ждёт секрет.
- Рассматривался Lava.top как альтернатива ЮKassa для физлиц — не реализовано.
- `metrics.js`, `recommendations.js` — мёртвый код, безопасно удалить, но не подключены,
  так что и не мешают.

## Лицензия

MIT.
