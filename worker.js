// ─── FaceRate worker: анализ + аккаунты (Telegram) + квоты + Stars-платежи ───
//
// Роуты:
//   POST /            — анализ (нужен token сессии; 1 free/неделю за подписку на канал, дальше кредиты)
//   POST /auth        — вход через Telegram Login Widget (проверка hash)
//   POST /me          — статус аккаунта (квота, кредиты, подписка)
//   POST /buy            — создать инвойс: method=stars|rub|crypto (по умолчанию stars)
//   POST /tg-webhook     — вебхук бота: pre_checkout_query + successful_payment
//   POST /crypto-webhook — вебхук CryptoBot: invoice_paid → начисление
//   POST /lava-webhook   — вебхук Lava.top: payment.success → начисление
//   POST /support-webhook— вебхук саппорт-бота: AI-ответ + эскалация оператору
//
// Секреты: OPENROUTER_API_KEY, TG_BOT_TOKEN, TG_WEBHOOK_SECRET,
//          LAVA_API_KEY + LAVA_OFFER_IDS + LAVA_WEBHOOK_LOGIN/LAVA_WEBHOOK_PASS (карта РФ,
//          приоритетный провайдер — см. блок Lava.top),
//          YUKASSA_PROVIDER_TOKEN (карты РФ через Telegram, фолбэк если Lava не настроена),
//          CRYPTOBOT_TOKEN (Crypto Pay API),
//          SUPPORT_BOT_TOKEN, SUPPORT_ADMIN_ID (куда падают обращения), SUPPORT_WEBHOOK_SECRET (опц.),
//          MEDIA_BOT_TOKEN (бот для медийных партнёров — своя статистика по реф-коду), MEDIA_WEBHOOK_SECRET (опц.).
// KV: RATE_LIMIT.

const CHANNEL = '@wwwfacerateru';        // канал, подписка на который даёт 1 free/неделю
const LAVA_MIN_RUB = 50;                 // минимальная сумма инвойса у Lava.top — ниже нельзя ни при какой скидке
const FREE_PER_WEEK = 1;                 // бесплатных анализов в неделю подписчику (у всех одинаковый ритм)
const CASHBACK_EVERY = 3;                // каждые N потраченных платных кредитов -> +1 анализ кешбэком
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function weekBucket() { return Math.floor(Date.now() / WEEK_MS); } // сброс раз в 7 дней от эпохи

// Флаг «когда-либо покупал» (ставится в recordOrder на любой реальный платёж, без TTL).
// Не путать с промокодами/розыгрышами — те начисляют credits/unlim напрямую и УЖЕ всегда
// дают полный отчёт (идут через mode='paid'/'unlim', тизер применяется только к mode='free').
async function isBuyer(env, tgid) {
  return !!(await env.RATE_LIMIT.get(`everBought:${tgid}`));
}
// Доступен ли сейчас бесплатный анализ — ритм ОДИНАКОВЫЙ для всех (раз в неделю, weekBucket).
// Разница между новичком и тем, кто уже покупал — не в частоте, а в ПОЛНОТЕ отчёта (см. isTeaser).
async function freeQuotaAvailable(env, tgid, buyer) {
  const freeUsed = parseInt(await env.RATE_LIMIT.get(`qw:${tgid}:${weekBucket()}`) || '0', 10);
  return freeUsed < FREE_PER_WEEK;
}
const ADMIN_USERNAMES = ['Matveyika'];   // кто может создавать промокоды в боте
const PACKS = {                          // тарифы: stars — XTR, rub — рубли (ЮKassa/CryptoBot)
  // lavaRub — целевая цена по карте/СБП. Для офферов с isDynamicPrice:true в Lava.top мы сами
  // передаём эту сумму в /invoice (см. createLavaInvoice) — их дашборд НЕ нужно трогать вручную,
  // цена всегда совпадает с тем, что показано на сайте/в боте. rub — цена для крипты (CryptoBot)
  // и запасного ЮKassa-инвойса, ей код тоже управляет напрямую.
  // p1.rub=62 — намеренно НЕ круглое число: при -20% (buyerDiscountPct/applyDiscount) даёт
  // ровно 62*0.8=49.6 → round() → 50₽, узнаваемая "старая" цена в чеке со скидкой.
  // old* — "обычная" цена ДО текущей недельной акции (см. SALE_ENDS_AT), показывается
  // зачёркнутой в packsKb()/пейволле сайта, пока акция активна.
  // Повышение цен 21.07.2026: поднят ТОЛЬКО p1 (самый ходовой тариф) — цель специально
  // сделать остальные опции выглядеть выгоднее НА ФОНЕ p1, а не поднять всё сразу. p5/h1/d1/m1
  // оставлены на прежнем уровне (h1/d1 почти не покупают, задирать их бессмысленно). old* у
  // p1 = фактическая предыдущая цена (зачёркивается пока активна акция, см. SALE_ENDS_AT).
  // У остальных old* равны текущей цене — зачёркивания не будет (packsKb: `old && old > cur`).
  p1: { type: 'credits', credits: 1, stars: 45,  rub: 70,   lavaRub: 70,   label: '1 анализ', labelEn: '1 analysis', oldStars: 39,   oldRub: 62,   oldLavaRub: 62 },
  p5: { type: 'credits', credits: 5, stars: 99,  rub: 149,  lavaRub: 149,  label: '5 анализов', labelEn: '5 analyses', oldStars: 99,   oldRub: 149,  oldLavaRub: 149 },
  h1: { type: 'unlim',  hours: 1,    stars: 139, rub: 199,  lavaRub: 199,  label: 'Безлимит на час', labelEn: 'Hour unlimited', oldStars: 139,  oldRub: 199,  oldLavaRub: 199 },
  d1: { type: 'unlim',  hours: 24,   stars: 219, rub: 299,  lavaRub: 299,  label: 'Безлимит на день', labelEn: 'Day unlimited', oldStars: 219,  oldRub: 299,  oldLavaRub: 299 },
  // Разовый месяц (без автопродления). Чтобы включить Stars-подписку с автопродлением,
  // верни type:'sub' и period:2592000 — но сначала активируй подписки бота в @BotFather,
  // иначе Telegram вернёт SUBSCRIPTION_EXPORT_MISSING.
  m1: { type: 'unlim',  hours: 720,  stars: 749,  rub: 999,  lavaRub: 999,  label: 'Безлимит на месяц', labelEn: 'Month unlimited', oldStars: 749, oldRub: 999, oldLavaRub: 999 },
  // Гайд + ведение 90 дней. Цена в дыре между d1 (299) и m1 (999), чтобы не
  // конкурировать с месячным безлимитом.
  guide: { type: 'guide', credits: 5, stars: 349, rub: 499, lavaRub: 499,
           label: 'Гайд + ведение 90 дней', labelEn: 'Guide + 90-day coaching',
           oldStars: 349, oldRub: 499, oldLavaRub: 499 },
};
// Недельная акция на новые цены выше — по истечении можно вернуть old*-значения в основные
// поля (или оставить как есть, тогда акция станет постоянной ценой). Таймер на сайте/в боте
// считает именно до этой даты. Поставь актуальную дату при продлении/завершении акции.
const SALE_ENDS_AT = Date.parse('2026-07-28T12:00:00+03:00');
// Способы оплаты, доступные при заданных секретах (stars — всегда).
function lavaConfigured(env) { return !!(env.LAVA_API_KEY && env.LAVA_OFFER_IDS); }
function enabledMethods(env) {
  const m = ['stars'];
  if (lavaConfigured(env) || env.YUKASSA_PROVIDER_TOKEN) m.push('rub'); // 'rub' = карта РФ, провайдер выбирается автоматически
  if (lavaConfigured(env)) m.push('sbp'); // СБП — только через Lava.top (PAY2ME), у ЮKassa нет прямого СБП в этом флоу
  if (env.CRYPTOBOT_TOKEN) m.push('crypto');
  return m;
}
function packLabel(pack, L) { return L === 'ru' ? pack.label : pack.labelEn; }
const IP_LIMIT_DAY = 40;                 // страховочный лимит по IP (анти-абьюз)
const GLOBAL_DAILY_CAP = 3000;           // потолок БЕСПЛАТНЫХ анализов в сутки (защита бюджета OpenRouter);
                                          // на оплативших (unlim/кредиты) не действует — см. analyze()

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return cors(null, 204);
    const path = new URL(request.url).pathname;
    // Единственный GET-роут во всём воркере — статичная HTML-страница статистики.
    // Сама она не содержит данных, только форму токена и JS, который дальше стучится
    // в /admin-stats/data (POST) — там уже настоящая проверка секрета.
    if (request.method === 'GET') {
      if (path === '/admin-stats') return adminStatsPage();
      return new Response('Not found', { status: 404 });
    }
    if (request.method !== 'POST') return cors('Method not allowed', 405);
    try {
      if (path === '/admin-stats/data') return await adminStatsData(request, env);
      if (path === '/setup-webhook') return await setupWebhook(request, env);
      if (path === '/tg-webhook') return await tgWebhook(request, env);
      if (path === '/crypto-webhook') return await cryptoWebhook(request, env);
      if (path === '/lava-webhook') return await lavaWebhook(request, env);
      if (path === '/support-webhook') return await supportWebhook(request, env);
      if (path === '/media-webhook')   return await mediaWebhook(request, env);
      if (path === '/auth')       return await authTg(request, env);
      if (path === '/authpoll')   return await authPoll(request, env);
      if (path === '/me')         return await me(request, env);
      if (path === '/buy')        return await buy(request, env);
      if (path === '/sendcard')   return await sendCard(request, env);
      if (path === '/feedback')   return await submitFeedback(request, env);
      if (path === '/partner-data')  return await partnerData(request, env);
      if (path === '/partner-admin') return await partnerAdmin(request, env);
      if (path === '/bulk-discount-once') return await bulkDiscountStart(request, env, ctx);
      if (path === '/progress')     return await progressGet(request, env);
      if (path === '/progress-tip') return await progressTip(request, env);
      return await analyze(request, env);
    } catch (e) {
      return json({ error: 'server', text: 'Внутренняя ошибка: ' + e.message });
    }
  },
  // Cron Trigger (см. [triggers] в wrangler.toml) — раз в час проверяет истёкшие розыгрыши.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkGiveawayDraw(env));
    ctx.waitUntil(progressCron(env));
    ctx.waitUntil(checkOpenRouterBalance(env));
  },
};

// Разовый вызов (защищён тем же секретом, что и сам вебхук) — перерегистрирует вебхук с
// allowed_updates, включающим chat_boost (Telegram не шлёт его по умолчанию). Нужно вызвать
// один раз после деплоя этой фичи: curl -X POST "<WORKER_URL>/setup-webhook?secret=<TG_WEBHOOK_SECRET>".
async function setupWebhook(request, env) {
  const secret = new URL(request.url).searchParams.get('secret');
  if (!env.TG_WEBHOOK_SECRET || secret !== env.TG_WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
  const r = await tgApi(env, 'setWebhook', {
    url: 'https://face-metrics-ai.realfactchecknews.workers.dev/tg-webhook',
    secret_token: env.TG_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'chat_boost'],
  });
  return json(r);
}

// ─────────────────────────── Анализ ───────────────────────────
async function analyze(request, env) {
  let body;
  try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
  if (!body.prompt) return cors('Missing prompt', 400);

  // Страховка по IP (анти-абьюз) — касается всех, включая оплативших.
  const today = new Date().toISOString().slice(0, 10);
  if (env.RATE_LIMIT) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipKey = `d:${ip}:${today}`;
    const ipCnt = parseInt(await env.RATE_LIMIT.get(ipKey) || '0', 10);
    if (ipCnt >= IP_LIMIT_DAY) return json({ error: 'ip', text: 'Слишком много запросов с вашей сети. Попробуйте завтра.' });
    await env.RATE_LIMIT.put(ipKey, String(ipCnt + 1), { expirationTtl: 90000 });
  }

  // Аккаунт обязателен.
  const sess = await getSession(env, body.token);
  if (!sess) return json({ error: 'auth', text: 'Войдите через Telegram, чтобы получить бесплатный анализ.' });
  const tgid = sess.id;

  // Квота: безлимит → подписка на канал (free, тизер новичкам / полный тем кто уже покупал) → кредиты.
  const unlimUntil = parseInt(await env.RATE_LIMIT.get(`unlim:${tgid}`) || '0', 10);
  const subscribed = await isSubscribed(env, tgid);
  const freeKey = `qw:${tgid}:${weekBucket()}`;
  const freeUsed = parseInt(await env.RATE_LIMIT.get(freeKey) || '0', 10);
  const credits = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
  const buyer = await isBuyer(env, tgid);

  // ── ВЕДЕНИЕ: режим замера. Идёт мимо квоты и кредитов, лимит отдельный. ──
  const hasGuide = (await env.RATE_LIMIT.get(`guide:${tgid}`)) === '1';
  const isMeasure = body.measure === true;
  if (isMeasure) {
    if (!hasGuide) return json({ error: 'guide', text: 'Замеры прогресса доступны после покупки гайда.', packs: { guide: PACKS.guide } });
    const plist = await progList(env, tgid);
    if (plist.length >= PROG_MAX) return json({ error: 'progmax', text: 'Достигнут лимит замеров. Напиши в поддержку.' });
    const plast = plist[plist.length - 1];
    if (plast && Date.now() - plast.t < PROG_COOLDOWN) {
      const leftH = Math.ceil((PROG_COOLDOWN - (Date.now() - plast.t)) / 3600e3);
      return json({ error: 'progwait', text: `Следующий замер через ${Math.ceil(leftH / 24)} дн. Чаще нет смысла: за меньший срок разница между фото это шум, а не ты.`, hoursLeft: leftH });
    }
  }
  const freeAvail = subscribed && await freeQuotaAvailable(env, tgid, buyer);

  // Who Moggs (сравнение двух лиц) НЕ входит в бесплатную квоту — только безлимит или платные кредиты.
  const freeUsable = freeAvail && !body.compare;

  let mode = null;
  if (isMeasure) mode = 'measure';
  else if (unlimUntil > Date.now()) mode = 'unlim';
  else if (freeUsable) mode = 'free';
  else if (credits > 0) mode = 'paid';
  else if (!subscribed) {
    return json({ error: 'sub', text: 'Подпишись на канал ' + CHANNEL + ' — это даёт 1 бесплатный анализ в неделю.', channel: CHANNEL });
  } else {
    return json({ error: 'pay', text: 'Бесплатный анализ уже использован. Купи кредиты, чтобы продолжить.', packs: PACKS, methods: enabledMethods(env), saleEndsAt: Date.now() < SALE_ENDS_AT ? SALE_ENDS_AT : 0 });
  }
  // Тизер (урезанный отчёт) — только для новичков, которые никогда не покупали.
  // Те, кто хоть раз покупал, получают ПОЛНЫЙ бесплатный анализ раз в 3 дня — бонус лояльности.
  const isTeaser = mode === 'free' && !buyer;

  // Глобальный потолок БЕСПЛАТНЫХ анализов в сутки — защита бюджета OpenRouter.
  // Не блокирует уже оплативших (unlim/paid), чтобы платёж не пропадал впустую при наплыве трафика.
  if (env.RATE_LIMIT && mode === 'free') {
    const g = parseInt(await env.RATE_LIMIT.get(`g:${today}`) || '0', 10);
    if (g >= GLOBAL_DAILY_CAP) {
      return json({ error: 'global', text: 'Дневной лимит бесплатных анализов исчерпан. Загляните завтра или купи кредиты.', packs: PACKS });
    }
  }

  // Модель.
  // Тизер (isTeaser, только новички без покупок): урезаем ответ ИИ до общего балла + 3 категорий,
  // без остальных 5 и без рекомендаций — экономит токены (меньше вывода) и мотивирует купить
  // полный разбор. Промпт после этого суффикса не меняем, просто просим модель не выводить лишнее.
  const FREE_TEASER_SUFFIX = "\n\nFREE TEASER MODE -- IMPORTANT OVERRIDE: this is a free-tier teaser report, not the full paid report. Output ONLY these sections, in this exact order, nothing else: ОБЩИЙ_БАЛЛ (full, as normal), СИММЕТРИЯ (full, as normal), ГЛАЗА_CANTHAL_TILT (full, as normal), КОЖА (full, as normal). Do NOT output МИДФЕЙС_MAXILLA, ДЖОУЛАЙН_MANDIBLE, НОС_NOSE, ГУБЫ_СКУЛЫ, ГРУМИНГ_STYLE or РЕКОМЕНДАЦИИ at all -- skip them completely, do not even write their labels. Stop right after КОЖА.";
  const promptText = isMeasure
    ? buildMeasurePrompt(body, await progTexts(env, tgid))
    : (isTeaser ? body.prompt + FREE_TEASER_SUFFIX : body.prompt);

  const imgs = Array.isArray(body.images) && body.images.length
    ? body.images
    : (body.image ? [body.image] : []);
  const messages = imgs.length
    ? [{ role: 'user', content: [
        ...imgs.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } })),
        { type: 'text', text: promptText },
      ]}]
    : [{ role: 'user', content: promptText }];

  // session_id: xAI-кэш промптов чувствителен к server affinity — без стабильного ключа
  // одинаковые запросы могут разлетаться по разным бэкендам и кэш статичной части промпта
  // (~2500 токенов калибровки, идёт ДО картинок/метрик в тексте) не срабатывает. Бакет по
  // языку — этого достаточно, весь общий текст промпта идентичен у всех RU/EN юзеров,
  // разница (метрики, фото, тизер-суффикс) всегда идёт ПОСЛЕ статичного блока.
  const sessionId = 'facerate-' + (body.lang === 'ru' ? 'ru' : 'en');

  const buildBody = (withSeed) => {
    const b = {
      model: 'x-ai/grok-4.3',
      // ВАЖНО: reasoning-токены Grok (~700-950 даже на effort:'low') считаются в этот же лимит.
      // На старых 900 у тизера reasoning съедал весь бюджет, content приходил пустым, и юзер
      // видел «Сервис перегружен (unknown)». Тизер всё равно короткий — реально потратится меньше,
      // лимит нужен только чтобы reasoning не отъедал весь ответ.
      max_tokens: isTeaser ? 1800 : 2200,
      temperature: 0.35,
      top_p: 0.85,
      reasoning: { effort: 'low' },
      session_id: sessionId,
      messages,
    };
    if (withSeed) b.seed = 1337;
    return JSON.stringify(b);
  };

  // emptyKind — почему пришёл пустой ответ, если сам запрос прошёл без ошибки:
  //   'length'  — модель упёрлась в max_tokens (обычно reasoning съел бюджет);
  //   'refusal' — модель отказалась описывать фото (явный refusal, content_filter,
  //               либо «тихий отказ» Grok: пустой content при finish_reason 'stop').
  // Это НЕ перегрузка, ретраи тут не помогают — выходим из цикла сразу, чтобы не жечь
  // токены и не держать юзера лишние 1.4 секунды.
  let data, lastErr = 'unknown', emptyKind = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let status = 0;
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}` },
        body: buildBody(attempt < 2),
      });
      status = res.status;
      const raw = await res.text();
      try { data = JSON.parse(raw); }
      catch { data = null; lastErr = `http ${status}: ${raw.slice(0, 120)}`; }
    } catch (err) { lastErr = err.message; data = null; }
    if (data?.choices?.[0]?.message?.content) break;

    // Диагностика в `wrangler tail`: без неё пустые ответы неотличимы друг от друга.
    console.log('AI empty response', JSON.stringify({
      attempt, status, isTeaser,
      finish: data?.choices?.[0]?.finish_reason ?? null,
      hasChoices: Array.isArray(data?.choices) ? data.choices.length : null,
      usage: data?.usage ?? null,
      raw: data ? JSON.stringify(data).slice(0, 400) : null,
    }));

    const choice = data?.choices?.[0];
    if (choice) {
      const fin = choice.finish_reason;
      if (choice.message?.refusal || fin === 'content_filter') emptyKind = 'refusal';
      else if (fin === 'length') emptyKind = 'length';
      // Пустой content при нормальном завершении — тихий отказ модели. Ретраить бесполезно.
      else if (fin === 'stop' || fin == null) emptyKind = 'refusal';
    }
    if (emptyKind) break;

    // error у OpenRouter приходит и объектом, и строкой — плюс отдельно тянем HTTP-статус,
    // иначе 429/502 от прокси схлопывались в бесполезное 'unknown'.
    const e = data?.error;
    const eMsg = (typeof e === 'string' ? e : e?.message) || (e?.code ? `code ${e.code}` : null);
    if (eMsg) lastErr = eMsg;
    else if (status && status !== 200) lastErr = `http ${status}`;

    if (attempt < 2) await new Promise(r => setTimeout(r, 700));
  }
  if (!data?.choices?.[0]?.message?.content) {
    if (emptyKind === 'refusal') {
      return json({ error: 'model', text: 'ИИ не смог разобрать это фото. Попробуйте другое: лицо крупно и анфас, хорошее освещение, без фильтров и посторонних людей в кадре.' });
    }
    if (emptyKind === 'length') {
      return json({ error: 'model', text: 'Ответ ИИ не поместился в лимит. Попробуйте ещё раз — если повторится, напишите в поддержку.' });
    }
    return json({ error: 'model', text: `Сервис перегружен, попробуйте ещё раз. (${lastErr})` });
  }

  // Списание ПОСЛЕ успеха: безлимит не тратится; free → счётчик недели (одинаковый для всех); paid → минус кредит.
  let creditsLeft = credits, freeLeft = subscribed ? (FREE_PER_WEEK - freeUsed) : 0, cashback = false;
  if (mode === 'free') {
    await env.RATE_LIMIT.put(freeKey, String(freeUsed + 1), { expirationTtl: 8 * 24 * 60 * 60 });
    freeLeft = FREE_PER_WEEK - freeUsed - 1;
  } else if (mode === 'paid') {
    creditsLeft = credits - 1;
    // Кешбэк лояльности: каждые CASHBACK_EVERY потраченных ПЛАТНЫХ кредита (накопительно,
    // без привязки к дням) — +1 анализ сверху. Считаем от общего числа потраченных кредитов
    // за всё время (spent:tgid), не от текущей покупки — так работает и растянуто по времени,
    // и если человек тратит кредиты пачкой за один раз.
    const spentKey = `spent:${tgid}`;
    const spent = parseInt(await env.RATE_LIMIT.get(spentKey) || '0', 10) + 1;
    await env.RATE_LIMIT.put(spentKey, String(spent));
    if (spent % CASHBACK_EVERY === 0) {
      creditsLeft += 1;
      cashback = true;
    }
    await env.RATE_LIMIT.put(`credits:${tgid}`, String(creditsLeft));
  } else if (mode === 'unlim') {
    // Счётчик анализов за текущую сессию безлимита (только для статистики, не влияет на лимиты).
    const unlimUseKey = `unlimUse:${tgid}:${unlimUntil}`;
    const unlimUseCnt = parseInt(await env.RATE_LIMIT.get(unlimUseKey) || '0', 10);
    await env.RATE_LIMIT.put(unlimUseKey, String(unlimUseCnt + 1), { expirationTtl: 60 * 60 * 24 * 7 });
  }
  const g = parseInt(await env.RATE_LIMIT.get(`g:${today}`) || '0', 10);
  await env.RATE_LIMIT.put(`g:${today}`, String(g + 1), { expirationTtl: 93600 });

  if (isMeasure) await progSave(env, tgid, data.choices[0].message.content);

  return json({ text: data.choices[0].message.content, mode, teaser: isTeaser, creditsLeft, freeLeft, subscribed, cashback });
}

// ─────────────────────────── Вход через Telegram ───────────────────────────
async function authTg(request, env) {
  let u;
  try { u = await request.json(); } catch { return cors('Bad JSON', 400); }
  if (!u || !u.hash || !u.id) return json({ error: 'auth', text: 'Некорректные данные входа.' });

  // Проверка подписи Login Widget: HMAC-SHA256(data_check_string, SHA256(bot_token)).
  const { hash, ...fields } = u;
  const dcs = Object.keys(fields).sort().map(k => `${k}=${fields[k]}`).join('\n');
  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.digest('SHA-256', enc.encode(env.TG_BOT_TOKEN));
  const hmacKey = await crypto.subtle.importKey('raw', secretKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', hmacKey, enc.encode(dcs));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex !== hash) return json({ error: 'auth', text: 'Подпись Telegram не сошлась.' });
  if (Date.now() / 1000 - Number(u.auth_date || 0) > 86400) {
    return json({ error: 'auth', text: 'Сессия входа устарела, попробуйте ещё раз.' });
  }

  const token = crypto.randomUUID() + '-' + crypto.randomUUID();
  const user = { id: u.id, first_name: u.first_name || '', username: u.username || '', photo_url: u.photo_url || '' };
  await env.RATE_LIMIT.put(`sess:${token}`, JSON.stringify(user), { expirationTtl: 60 * 60 * 24 * 30 });
  return json(await statusFor(env, user, token));
}

// Вход через сообщение боту: сайт открывает t.me/бот?start=КОД, юзер жмёт Start,
// вебхук привязывает КОД к сессии, сайт забирает её отсюда поллингом.
async function authPoll(request, env) {
  let body; try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
  const code = String(body.code || '');
  if (!/^[a-z0-9-]{10,80}$/i.test(code)) return json({ error: 'code' });
  const raw = await env.RATE_LIMIT.get(`authcode:${code}`);
  if (!raw) return json({ pending: true });
  await env.RATE_LIMIT.delete(`authcode:${code}`);
  const { token, user } = JSON.parse(raw);
  return json(await statusFor(env, user, token));
}

async function me(request, env) {
  let body; try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
  const sess = await getSession(env, body.token);
  if (!sess) return json({ error: 'auth' });
  return json(await statusFor(env, sess, body.token, !!body.fresh));
}

async function statusFor(env, user, token, fresh) {
  const subscribed = await isSubscribed(env, user.id, fresh);
  const buyer = await isBuyer(env, user.id);
  const freeLeft = subscribed && await freeQuotaAvailable(env, user.id, buyer) ? 1 : 0;
  const credits = parseInt(await env.RATE_LIMIT.get(`credits:${user.id}`) || '0', 10);
  const unlimUntil = parseInt(await env.RATE_LIMIT.get(`unlim:${user.id}`) || '0', 10);
  return {
    token, user, subscribed, freeLeft,
    credits, channel: CHANNEL, packs: PACKS, methods: enabledMethods(env),
    saleEndsAt: Date.now() < SALE_ENDS_AT ? SALE_ENDS_AT : 0,
    unlimUntil: unlimUntil > Date.now() ? unlimUntil : 0,
  };
}

async function getSession(env, token) {
  if (!token || !env.RATE_LIMIT) return null;
  const raw = await env.RATE_LIMIT.get(`sess:${token}`);
  return raw ? JSON.parse(raw) : null;
}

// Подписка на канал (кэш 5 минут; fresh=true — принудительная проверка,
// например после «Я подписался» на пейволле).
async function isSubscribed(env, tgid, fresh) {
  const cacheKey = `sub:${tgid}`;
  if (!fresh) {
    const cached = await env.RATE_LIMIT.get(cacheKey);
    if (cached !== null) return cached === '1';
  }
  let ok = false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(CHANNEL)}&user_id=${tgid}`);
    const d = await r.json();
    ok = d.ok && ['creator', 'administrator', 'member'].includes(d.result?.status);
  } catch { /* сеть — считаем не подписан, кэш короткий */ }
  await env.RATE_LIMIT.put(cacheKey, ok ? '1' : '0', { expirationTtl: 300 });
  return ok;
}

// ─────────────────────────── Розыгрыш (giveaway) ───────────────────────────
// giveaway:current — {id, endTs, credits, winners, entries:[tgid,...]}. Один активный
// розыгрыш одновременно. Участие — явный клик «Участвовать» + живая проверка подписки
// на канал (fresh=true, не из кэша), иначе засчитать могли бы и неподписанных.
async function getGiveaway(env) {
  const raw = await env.RATE_LIMIT.get('giveaway:current');
  return raw ? JSON.parse(raw) : null;
}
async function saveGiveaway(env, gw) {
  await env.RATE_LIMIT.put('giveaway:current', JSON.stringify(gw), { expirationTtl: 60 * 60 * 24 * 21 });
}

// Собственно розыгрыш: случайный выбор победителей из entries, с ЖИВОЙ повторной проверкой
// подписки перед начислением (человек мог отписаться после того, как нажал «Участвовать») —
// если отписался, пропускаем его и тянем следующего из пула вместо него. Начисляет credits,
// уведомляет каждого победителя лично, закрывает розыгрыш. Общая для /drawgiveaway (руками)
// и scheduled() (само по истечении срока).
async function runGiveawayDraw(env) {
  const gw = await getGiveaway(env);
  if (!gw) return { ok: false, reason: 'none' };
  if (!gw.entries.length) {
    await env.RATE_LIMIT.delete('giveaway:current');
    return { ok: false, reason: 'empty' };
  }
  const pool = [...gw.entries];
  const picked = [];
  let unsubSkipped = 0;
  while (picked.length < gw.winners && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    const candidate = pool.splice(idx, 1)[0];
    const stillSubscribed = await isSubscribed(env, candidate, true);
    if (!stillSubscribed) { unsubSkipped++; continue; }
    picked.push(candidate);
  }
  for (const winnerId of picked) {
    const cur = parseInt(await env.RATE_LIMIT.get(`credits:${winnerId}`) || '0', 10);
    await env.RATE_LIMIT.put(`credits:${winnerId}`, String(cur + gw.credits));
    const wL = await userLang(env, winnerId);
    await tgApi(env, 'sendMessage', { chat_id: winnerId, text: BL[wL].gwWinMsg(gw.credits) }).catch(() => {});
  }
  await env.RATE_LIMIT.delete('giveaway:current');
  return { ok: true, gw, picked, unsubSkipped, totalEntries: gw.entries.length };
}

function giveawayResultsPost(r) {
  return `🏆 Итоги розыгрыша!\n\nПобедители (по id): ${r.picked.join(', ')}\nКаждому начислено: ${r.gw.credits} бесплатных анализов.\n\nСпасибо всем, кто участвовал — новый розыгрыш скоро!`;
}

// Раз в час проверяет баланс OpenRouter (аккаунт, не дневной лимит ключа) и шлёт админам
// предупреждение, когда осталось меньше OR_LOW_BALANCE_USD. orLowBalanceAlerted — чтобы не
// спамить каждый час, пока баланс не пополнят (флаг сам снимается, когда баланс снова в норме).
const OR_LOW_BALANCE_USD = 3;
async function checkOpenRouterBalance(env) {
  if (!env.OPENROUTER_API_KEY) return;
  let r;
  try {
    r = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    }).then(x => x.json());
  } catch { return; }
  const total = r?.data?.total_credits, used = r?.data?.total_usage;
  if (typeof total !== 'number' || typeof used !== 'number') return;
  const remaining = total - used;
  if (remaining > OR_LOW_BALANCE_USD) {
    await env.RATE_LIMIT.delete('orLowBalanceAlerted');
    return;
  }
  if (await env.RATE_LIMIT.get('orLowBalanceAlerted')) return;
  await env.RATE_LIMIT.put('orLowBalanceAlerted', '1', { expirationTtl: 60 * 60 * 12 });
  const text = `⚠️ Баланс OpenRouter низкий: $${remaining.toFixed(2)} осталось.\nПополни на openrouter.ai/settings/credits, иначе AI-анализ перестанет работать.`;
  for (const adminId of adminIds(env)) {
    await tgApi(env, 'sendMessage', { chat_id: adminId, text }).catch(() => {});
  }
}

// Вызывается раз в час из scheduled() — если срок активного розыгрыша истёк, сам разыгрывает
// и шлёт готовый пост-отчёт всем админам (SUPPORT_ADMIN_ID) в личку, постить в канал — руками.
async function checkGiveawayDraw(env) {
  const gw = await getGiveaway(env);
  if (!gw || gw.endTs > Date.now()) return;
  const r = await runGiveawayDraw(env);
  if (!r.ok) return;
  const notice = `⏰ Розыгрыш ${r.gw.id} завершён автоматически.\nУчастников: ${r.totalEntries}, победителей: ${r.picked.length}.${r.unsubSkipped ? ` (пропущено ${r.unsubSkipped} — отписались до розыгрыша)` : ''}\n\nГотовый пост для канала:\n\n---\n${giveawayResultsPost(r)}\n---`;
  for (const adminId of adminIds(env)) {
    await tgApi(env, 'sendMessage', { chat_id: adminId, text: notice }).catch(() => {});
  }
}

// ─────────────────────────── Stars-платежи ───────────────────────────
async function buy(request, env) {
  let body; try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
  const sess = await getSession(env, body.token);
  if (!sess) return json({ error: 'auth', text: 'Сначала войдите через Telegram.' });
  const pack = PACKS[body.pack];
  if (!pack) return json({ error: 'pack', text: 'Неизвестный пакет.' });
  const L = body.lang === 'ru' ? 'ru' : 'en';
  const method = body.method || 'stars';

  const discPct = await buyerDiscountPct(env, sess.id, body.pack);
  await env.RATE_LIMIT.delete(`pendingDiscount:${sess.id}`); // промо-скидка одноразовая

  if (method === 'crypto') {
    const d = await createCryptoInvoice(env, sess.id, body.pack, L, discPct);
    if (!d.ok) return json({ error: 'invoice', text: 'Не удалось создать счёт: ' + (d.error || '') });
    return json({ link: d.link });
  }
  if (method === 'rub' && lavaConfigured(env)) {
    const d = await createLavaInvoice(env, sess.id, body.pack, L, discPct, false);
    if (!d.ok) return json({ error: 'invoice', text: 'Не удалось создать счёт: ' + (d.error || '') });
    return json({ link: d.link });
  }
  if (method === 'sbp' && lavaConfigured(env)) {
    const d = await createLavaInvoice(env, sess.id, body.pack, L, discPct, true);
    if (!d.ok) return json({ error: 'invoice', text: 'Не удалось создать счёт: ' + (d.error || '') });
    return json({ link: d.link });
  }
  // stars | rub-через-ЮKassa — оба через Telegram createInvoiceLink (для rub нужен provider_token)
  const d = await createInvoice(env, sess.id, body.pack, L, method, discPct);
  if (!d.ok) return json({ error: 'invoice', text: 'Не удалось создать счёт: ' + (d.description || '') });
  return json({ link: d.result });
}

// Отправка share-карточки ботом в личку пользователя (PNG multipart).
async function sendCard(request, env) {
  let body; try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
  const sess = await getSession(env, body.token);
  if (!sess) return json({ error: 'auth' });
  if (!body.image || body.image.length > 2_800_000) return json({ error: 'img', text: 'Bad image' });
  const bin = Uint8Array.from(atob(body.image), (ch) => ch.charCodeAt(0));
  const L = await userLang(env, sess.id);
  const fd = new FormData();
  fd.append('chat_id', String(sess.id));
  fd.append('caption', L === 'ru' ? 'Твоя карточка FaceRate 🖤 facerate.ru' : 'Your FaceRate card 🖤 facerate.ru');
  fd.append('photo', new Blob([bin], { type: 'image/png' }), 'facerate.png');
  const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: fd })
    .then(x => x.json()).catch(e => ({ ok: false, description: e.message }));
  if (!r.ok) return json({ error: 'send', text: r.description || 'send failed' });
  return json({ ok: true });
}

// Форма обратной связи на сайте: 1 бесплатный анализ один раз за аккаунт, ответы падают админу в ЛС.
async function submitFeedback(request, env) {
  let body; try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
  const sess = await getSession(env, body.token);
  if (!sess) return json({ error: 'auth' });
  const tgid = sess.id;
  if (await env.RATE_LIMIT.get(`feedbackDone:${tgid}`)) {
    return json({ error: 'already', text: 'Вы уже проходили этот опрос.' });
  }
  const clamp10 = (v) => Math.min(10, Math.max(1, parseInt(v, 10) || 0));
  const design = clamp10(body.design);
  const features = clamp10(body.features);
  const analysis = clamp10(body.analysis);
  const suggestions = String(body.suggestions || '').slice(0, 2000).trim();
  const wantsCollab = !!body.collab;
  const contact = wantsCollab ? String(body.contact || '').slice(0, 300).trim() : '';

  await env.RATE_LIMIT.put(`feedbackDone:${tgid}`, '1', { expirationTtl: 60 * 60 * 24 * 365 });
  const cur = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
  await env.RATE_LIMIT.put(`credits:${tgid}`, String(cur + 1));

  const uname = sess.username ? '@' + sess.username : `id${tgid}`;
  let msg = `📝 Новый отзыв (${uname})\n\nДизайн: ${design}/10\nФункции: ${features}/10\nКачество анализа: ${analysis}/10`;
  if (suggestions) msg += `\n\nПредложения:\n${suggestions}`;
  if (wantsCollab) msg += `\n\n🤝 Хочет сотрудничать!${contact ? `\nКонтакт: ${contact}` : ''}`;
  for (const adminId of adminIds(env)) {
    await tgApi(env, 'sendMessage', { chat_id: adminId, text: msg }).catch(() => {});
  }
  return json({ ok: true });
}

// Создание инвойса-ссылки через Telegram. method: 'stars' (XTR) | 'rub' (карта РФ, ЮKassa).
async function createInvoice(env, tgid, packId, L, method = 'stars', discPct = 0) {
  const pack = PACKS[packId];
  const unlimRu = pack.hours >= 720 ? 'на месяц' : pack.hours >= 168 ? 'на неделю' : pack.hours >= 24 ? 'на 24 часа' : `на ${pack.hours} час`;
  const unlimEn = pack.hours >= 720 ? 'for a month' : pack.hours >= 168 ? 'for a week' : pack.hours >= 24 ? 'for 24 hours' : `for ${pack.hours} hour`;
  const descRu = pack.type === 'credits'
    ? `${pack.credits} AI-анализ(а) лица на facerate.ru`
    : pack.type === 'unlim'
      ? `Безлимитные анализы ${unlimRu} на facerate.ru`
      : 'Безлимитные анализы на месяц (автопродление, отмена в любой момент)';
  const descEn = pack.type === 'credits'
    ? `${pack.credits} AI face analyses on facerate.ru`
    : pack.type === 'unlim'
      ? `Unlimited analyses ${unlimEn} on facerate.ru`
      : 'Unlimited analyses for a month (auto-renews, cancel anytime)';
  const req = {
    title: `FaceRate: ${packLabel(pack, L)}`,
    description: L === 'ru' ? descRu : descEn,
    payload: JSON.stringify({ tgid, pack: packId }),
    currency: 'XTR',
    prices: [{ label: packLabel(pack, L), amount: applyDiscount(pack.stars, discPct) }],
  };
  if (method === 'rub') {
    // Карта РФ через ЮKassa: рубли в копейках + provider_token из BotFather.
    req.currency = 'RUB';
    req.provider_token = env.YUKASSA_PROVIDER_TOKEN;
    req.prices = [{ label: packLabel(pack, L), amount: applyDiscount(pack.rub, discPct) * 100 }];
    // Если ЮKassa требует фискальный чек (54-ФЗ) — добавь req.provider_data
    // с receipt (см. доку ЮKassa) и need_email/send_email_to_provider.
  } else if (pack.type === 'sub') {
    req.subscription_period = pack.period;
  }
  const r = await tgApi(env, 'createInvoiceLink', req);
  return r;
}

// ─────────────────────────── Lava.top (карта РФ, без ИП/самозанятости у продавца) ───────────────────────────
// Каждый тариф — отдельный «оффер» в личном кабинете Lava.top (создаётся руками в UI,
// цена там ДОЛЖНА совпадать с pack.rub). LAVA_OFFER_IDS — JSON {"p1":"uuid",...}.
// Реального email у нас нет (вход только через Telegram) — используем синтетический
// tg<tgid>@facerate.ru и потом парсим tgid обратно из него в вебхуке (без своей БД).
function lavaOfferIds(env) {
  try { return JSON.parse(env.LAVA_OFFER_IDS || '{}'); } catch { return {}; }
}
// Вебхук Lava.top шлёт product.id — это ID ТОВАРА, а не оффера (см. их openapi-спеку,
// gate.lava.top/docs/documentation.yaml, пример successful_purchase_webhook_payload).
// LAVA_OFFER_IDS хранит ID ОФФЕРА (нужен для /invoice), поэтому напрямую их сравнивать нельзя —
// раньше это тихо ломало начисление на каждой реальной оплате картой/СБП. Матчим через каталог.
async function lavaPackIdByProductId(env, productId) {
  if (!productId) return null;
  const r = await fetch('https://gate.lava.top/api/v2/products?feedVisibility=ALL', {
    headers: { 'X-Api-Key': env.LAVA_API_KEY },
  }).then(x => x.json()).catch(() => null);
  const item = (r?.items || []).find((i) => i.id === productId);
  const offerIds = lavaOfferIds(env);
  // Товар может иметь несколько офферов (напр. под разные способы оплаты) — раньше брали
  // только offers[0], и если LAVA_OFFER_IDS указывал на другой оффер того же товара, матч
  // не находился и платёж терялся молча. Проверяем все офферы товара.
  for (const offer of item?.offers || []) {
    const packId = Object.keys(offerIds).find((k) => offerIds[k] === offer.id);
    if (packId) return packId;
  }
  return null;
}
// Офферы с "ценой по запросу через API" (isDynamicPrice:true) требуют явный amount
// в запросе на инвойс — но зато мы сами решаем, сколько это будет стоить, без правки
// цены в личном кабинете Lava.top. На фикс-цену offer'ах amount передавать нельзя —
// Lava.top отвечает "is not dynamic price".
async function lavaOfferIsDynamic(env, offerId) {
  const r = await fetch('https://gate.lava.top/api/v2/products?feedVisibility=ALL', {
    headers: { 'X-Api-Key': env.LAVA_API_KEY },
  }).then(x => x.json()).catch(() => null);
  for (const item of r?.items || []) {
    for (const offer of item.offers || []) {
      if (offer.id === offerId) return !!item.isDynamicPrice;
    }
  }
  return false;
}
// sbp:true → провайдер PAY2ME/способ SBP (прямой QR-код СБП, найдено в их openapi-спеке
// gate.lava.top/docs/documentation.yaml — не описано в обычной документации).
// Без этого флага — провайдер по умолчанию SMART_GLOCAL (карта Visa/MC/МИР).
async function createLavaInvoice(env, tgid, packId, L, discPct = 0, sbp = false) {
  const offerId = lavaOfferIds(env)[packId];
  if (!offerId) return { ok: false, error: 'оффер для этого тарифа не настроен в Lava.top' };
  const pack = PACKS[packId];
  const dynamic = await lavaOfferIsDynamic(env, offerId);
  const body = {
    email: `tg${tgid}@facerate.ru`,
    offerId,
    currency: 'RUB',
    periodicity: 'ONE_TIME',
    buyerLanguage: L === 'ru' ? 'RU' : 'EN',
  };
  if (sbp) { body.paymentProvider = 'PAY2ME'; body.paymentMethod = 'SBP'; }
  // Цену задаём сами (pack.lavaRub) — так она всегда совпадает с тем, что показано
  // на сайте/в боте. LAVA_MIN_RUB — их минималка по цене инвойса, ниже нельзя.
  if (dynamic) body.amount = Math.max(LAVA_MIN_RUB, applyDiscount(pack.lavaRub, discPct));
  const r = await fetch('https://gate.lava.top/api/v3/invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': env.LAVA_API_KEY },
    body: JSON.stringify(body),
  }).then(x => x.json()).catch(e => ({ error: e.message }));
  if (!r.paymentUrl) return { ok: false, error: r.error?.message || r.message || JSON.stringify(r).slice(0, 200) };
  return { ok: true, link: r.paymentUrl };
}

// Вебхук Lava.top: аутентификация Basic (логин/пароль задаются при настройке вебхука в их кабинете),
// tgid достаём из синтетического email, пакет — обратным поиском offerId в LAVA_OFFER_IDS.
async function lavaWebhook(request, env) {
  if (env.LAVA_WEBHOOK_LOGIN) {
    const auth = request.headers.get('authorization') || '';
    const expected = 'Basic ' + btoa(`${env.LAVA_WEBHOOK_LOGIN}:${env.LAVA_WEBHOOK_PASS}`);
    if (auth !== expected) return new Response('forbidden', { status: 403 });
  }
  let upd; try { upd = await request.json(); } catch { return new Response('ok'); }
  if (upd.eventType !== 'payment.success') return new Response('ok');
  try {
    const seenKey = `lavapaid:${upd.contractId}`;
    if (await env.RATE_LIMIT.get(seenKey)) return new Response('ok');
    const m = /^tg(\d+)@/.exec(upd.buyer?.email || '');
    const tgid = m ? m[1] : null;
    const packId = await lavaPackIdByProductId(env, upd.product?.id);
    const pack = PACKS[packId];
    // Не помечаем как "обработано", если не смогли распознать покупателя/тариф — иначе
    // при сбое сопоставления платёж тихо теряется навсегда без шанса на ретрай/дозачисление.
    if (!tgid || !pack) return new Response('ok');
    await env.RATE_LIMIT.put(seenKey, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    const L = await userLang(env, tgid);
    const note = await grantPack(env, tgid, pack, L);
    await env.RATE_LIMIT.delete(`pendingDiscount:${tgid}`); // промо-скидка одноразовая, гасим ПОСЛЕ реальной оплаты
    const promoUsed = await peekOrderPromoCode(env, tgid);
    const { id: orderId, isFirst } = await recordOrder(env, { tgid, pack: packId, method: 'card', amount: upd.amount, currency: upd.currency || 'RUB', username: '', name: '', promo: promoUsed });
    if (!(await trackMediaPromoPurchase(env, tgid, pack, 'card', upd.amount))) await trackReferralPurchase(env, tgid, pack, 'card', upd.amount);
    const gotBonus = isFirst && await grantFirstPurchaseBonus(env, tgid);
    const extra = [gotBonus ? BL[L].firstBuyBonus(FIRST_BUY_DISCOUNT_PCT) : '', await m1UpsellText(env, tgid, pack, L)].filter(Boolean).join('\n\n');
    await tgApi(env, 'sendMessage', { chat_id: tgid, text: BL[L].payOk(note, orderId, extra), reply_markup: menuKb(L), parse_mode: 'HTML' });
  } catch { /* payload сломан — игнор */ }
  return new Response('ok');
}

// ─────────────────────────── CryptoBot (Crypto Pay API) ───────────────────────────
// createInvoice в фиате RUB — оплата любой поддержанной криптой, курс считает CryptoBot.
async function createCryptoInvoice(env, tgid, packId, L, discPct = 0) {
  const pack = PACKS[packId];
  const descRu = pack.type === 'credits' ? `${pack.credits} AI-анализ(а) на facerate.ru`
    : pack.hours >= 720 ? 'Безлимит на месяц на facerate.ru' : pack.hours >= 24 ? 'Безлимит на день на facerate.ru' : `Безлимит на ${pack.hours} час на facerate.ru`;
  const descEn = pack.type === 'credits' ? `${pack.credits} AI analyses on facerate.ru`
    : pack.hours >= 720 ? 'Month unlimited on facerate.ru' : pack.hours >= 24 ? 'Day unlimited on facerate.ru' : `${pack.hours}-hour unlimited on facerate.ru`;
  const r = await cryptoApi(env, 'createInvoice', {
    currency_type: 'fiat',
    fiat: 'RUB',
    amount: String(applyDiscount(pack.rub, discPct)),
    description: L === 'ru' ? descRu : descEn,
    payload: JSON.stringify({ tgid, pack: packId }),
    paid_btn_name: 'openBot',
    paid_btn_url: 'https://t.me/' + (env.BOT_USERNAME || 'facerate_bot'),
    expires_in: 3600,
  });
  if (!r.ok) return { ok: false, error: r.error?.name || JSON.stringify(r.error || 'error') };
  return { ok: true, link: r.result.pay_url || r.result.bot_invoice_url };
}

function cryptoApi(env, method, body) {
  return fetch('https://pay.crypt.bot/api/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Crypto-Pay-API-Token': env.CRYPTOBOT_TOKEN },
    body: JSON.stringify(body),
  }).then(r => r.json()).catch(e => ({ ok: false, error: { name: e.message } }));
}

// Вебхук CryptoBot: подпись — HMAC-SHA256(тело, SHA256(token)) в заголовке crypto-pay-api-signature.
async function cryptoWebhook(request, env) {
  const raw = await request.text();
  const sig = request.headers.get('crypto-pay-api-signature') || '';
  const enc = new TextEncoder();
  const secret = await crypto.subtle.digest('SHA-256', enc.encode(env.CRYPTOBOT_TOKEN));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(raw));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex !== sig) return new Response('forbidden', { status: 403 });

  let upd; try { upd = JSON.parse(raw); } catch { return new Response('ok'); }
  if (upd.update_type !== 'invoice_paid') return new Response('ok');
  try {
    const payload = JSON.parse(upd.payload.payload);
    const tgid = payload.tgid;
    const pack = PACKS[payload.pack];
    // Идемпотентность: один invoice начисляем один раз.
    const seenKey = `cryptopaid:${upd.payload.invoice_id}`;
    if (await env.RATE_LIMIT.get(seenKey)) return new Response('ok');
    await env.RATE_LIMIT.put(seenKey, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    const L = await userLang(env, tgid);
    const note = await grantPack(env, tgid, pack, L);
    await env.RATE_LIMIT.delete(`pendingDiscount:${tgid}`); // промо-скидка одноразовая, гасим ПОСЛЕ реальной оплаты
    const promoUsed = await peekOrderPromoCode(env, tgid);
    const { id: orderId, isFirst } = await recordOrder(env, { tgid, pack: payload.pack || '', method: 'crypto', amount: upd.payload.amount, currency: upd.payload.asset || upd.payload.fiat, username: '', name: '', promo: promoUsed });
    if (!(await trackMediaPromoPurchase(env, tgid, pack, 'crypto', Number(upd.payload.amount)))) await trackReferralPurchase(env, tgid, pack, 'crypto', Number(upd.payload.amount));
    const gotBonus = isFirst && await grantFirstPurchaseBonus(env, tgid);
    const extra = [gotBonus ? BL[L].firstBuyBonus(FIRST_BUY_DISCOUNT_PCT) : '', await m1UpsellText(env, tgid, pack, L)].filter(Boolean).join('\n\n');
    await tgApi(env, 'sendMessage', { chat_id: tgid, text: BL[L].payOk(note, orderId, extra), reply_markup: menuKb(L), parse_mode: 'HTML' });
  } catch { /* payload сломан — игнор */ }
  return new Response('ok');
}

// Кросс-сейл на m1 после оплаты разового пакета (p1/p5) — таргетирует уже платящих,
// самая дешёвая аудитория для допродажи. Безлимит/подписку не трогаем (там уже max тариф).
// Если у покупателя сейчас висит pendingDiscount (чаще всего — автопромо после первой покупки,
// см. grantFirstPurchaseBonus), явно напоминаем, что его можно применить именно к m1 —
// иначе скидка и апселл выглядят как два несвязанных сообщения.
async function m1UpsellText(env, tgid, pack, L) {
  if (!pack || pack.type !== 'credits') return '';
  const m1 = PACKS.m1;
  const discPct = parseInt(await env.RATE_LIMIT.get(`pendingDiscount:${tgid}`) || '0', 10);
  if (discPct > 0) {
    const discPrice = applyDiscount(m1.rub, discPct);
    return L === 'ru'
      ? `👑 Часто берёшь анализы? У тебя активна скидка ${discPct}% — успей применить её к безлимиту на месяц: ${discPrice}₽ вместо ${m1.rub}₽. Открой бота и жми «Купить».`
      : `👑 Analyzing often? Your ${discPct}% discount is active — use it on the monthly unlimited: ${discPrice}₽ instead of ${m1.rub}₽. Open the bot and tap "Buy".`;
  }
  return L === 'ru'
    ? `👑 Часто берёшь анализы? Безлимит на месяц — всего ${m1.rub}₽ вместо оплаты за каждый анализ по отдельности. Открой бота и жми «Купить».`
    : `👑 Analyzing often? Get unlimited for a month — just ${m1.rub}₽ instead of paying per analysis. Open the bot and tap "Buy".`;
}
// Экранирование для сообщений с parse_mode:'HTML'. Имя из Telegram может содержать
// < > & (популярное «<3») — без этого Telegram отклоняет ВСЁ сообщение целиком.
// Отдельная функция верхнего уровня: esc() внутри adminStatsPage() — это код
// HTML-страницы, из обработчиков бота он не виден.
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function tgApi(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()).then((r) => {
    // Раньше отказ Telegram (битый HTML, слишком длинный текст) уходил в тишину:
    // ok:false никто не проверял, воркер возвращал 200, в логах было «Ok».
    // Теперь он попадёт в логи — observability включена в wrangler.toml.
    if (!r.ok) console.log('TG API FAIL', method, r.error_code, r.description);
    return r;
  }).catch((e) => {
    console.log('TG API THROW', method, e.message);
    return { ok: false, description: e.message };
  });
}
// При навигации по кнопкам правим ТО ЖЕ сообщение вместо спама новых — apiFn это tgApi/supportApi/mediaApi,
// уже забинженный на нужный токен. messageId берётся из cq.message.message_id (навигация внутри callback).
// Падает откатом на sendMessage, если редактировать нечего (текст не поменялся, сообщение — инвойс/фото и т.п.).
async function editOrSend(apiFn, chat, messageId, text, replyMarkup, extra) {
  if (messageId) {
    const r = await apiFn('editMessageText', { chat_id: chat, message_id: messageId, text, reply_markup: replyMarkup, ...extra });
    if (r.ok) return r;
  }
  return apiFn('sendMessage', { chat_id: chat, text, reply_markup: replyMarkup, ...extra });
}

// ─────────────────────────── Вебхук бота: меню, промокоды, оплаты ───────────────────────────
// Язык пользователя бота: KV lang:tgid, по умолчанию английский.
async function userLang(env, tgid) {
  return (await env.RATE_LIMIT.get(`lang:${tgid}`)) === 'ru' ? 'ru' : 'en';
}

const BL = {
  en: {
    menu: 'FaceRate menu:',
    kbStatus: '💎 My status', kbShop: '⭐ Buy analyses / unlimited', kbOrders: '📦 My orders', kbPromo: '🎁 Enter promo code',
    kbMyRef: '🔗 My referral link',
    kbSub: '🔄 My subscription', kbGw: '🎉 Giveaways', kbSite: '🌐 Open FaceRate', kbLang: '🌍 Язык: Русский',
    kbSupport: '💬 Support',
    kbBack: '← Menu',
    shopTitle: '⭐ What are we getting?',
    shop1: (s) => `1 analysis — ${s}⭐`, shop5: (s) => `5 — ${s}⭐`,
    shopD: (s) => `🔥 Day unlimited — ${s}⭐`, shopM: (s) => `👑 Month unlimited — ${s}⭐`,
    loginOk: '✅ Logged in! Go back to the site — the page will pick up your account automatically.',
    hello: '🖤 FaceRate — AI face rating by looksmaxxing canons.\n\nSubscribe to ' + CHANNEL + ' = 1 free analysis per week.',
    statusHead: '💎 Your status:\n',
    statusUnlim: (d) => `👑 Unlimited until ${d}\n`,
    statusCredits: (n) => `⭐ Credits: ${n}\n`,
    statusSub: (n) => `✅ Subscribed to the channel — free this week: ${n}\n`,
    statusNoSub: `❌ Not subscribed to ${CHANNEL} — subscribe for 1 free analysis per week\n`,
    subDesc: 'Month unlimited. Auto-renews — cancel anytime in Telegram settings.',
    packDesc: (l) => l + ' on facerate.ru',
    invoiceFail: (e) => 'Could not create invoice: ' + e,
    payPick: 'How would you like to pay?',
    payStars: '⭐ Telegram Stars', payCard: '💳 Card (RUB)', paySbp: '📲 SBP (RUB)', payCrypto: '🪙 Crypto',
    cryptoBtn: '🪙 Pay in crypto', paySbpBtn: '📲 Pay via SBP',
    promoAsk: '🎁 Send the promo code as one message:',
    mysubActive: (d) => `👑 Unlimited active until ${d}.`,
    mysubRec: '\n\n🔄 Auto-renewal is ON. Turn off: Telegram settings → My Stars → subscriptions (or the button below).',
    mysubNoRec: '\n\nNo auto-renewal — just buy again when it ends.',
    mysubNone: 'No active unlimited. Grab one in the shop ⭐',
    kbUnsub: '⛔ Turn off auto-renewal',
    unsubOk: '⛔ Auto-renewal is off. Unlimited stays active until the paid period ends.',
    unsubFail: (e) => 'Failed: ' + e + '\nTurn it off in Telegram: Settings → My Stars.',
    unsubNone: 'Subscription not found.',
    gw: '🎉 Giveaways of free analyses and unlimited passes happen in ' + CHANNEL + '.\n\nCatch promo codes in posts and enter them here via «🎁 Enter promo code». First come, first served.',
    kbChannel: '📢 Open channel',
    kbGwJoin: '🙋 Enter the giveaway',
    gwActive: (n, c, d) => `🎉 Giveaway is on!\n\n🏆 ${n} winner(s), ${c} free analyses each\n⏳ Draw: ${d}\n\nTo enter: subscribe to ${CHANNEL} and tap the button below.`,
    gwNeedSub: `❌ You need to be subscribed to ${CHANNEL} to enter. Subscribe, then tap the button again.`,
    gwJoined: (n) => `✅ You're in! ${n} people are entered so far. Good luck — winners get notified right here.`,
    gwAlready: (n) => `✅ You're already entered (${n} participants so far). Sit tight, winners get notified here.`,
    gwNone: `🎉 No giveaway running right now. Watch ${CHANNEL} for the next one.`,
    gwWinMsg: (c) => `🏆 You won the FaceRate giveaway! +${c} free analyses have been added to your account. Enjoy!`,
    promoBad: "That doesn't look like a promo code. Try again from the menu.",
    promoNo: '❌ No such promo code, or it has expired.',
    promoUsed: 'You already used this promo code 😉',
    promoOut: '😞 All activations of this code are gone.',
    promoOkCredits: (n) => `+${n} analyses`,
    promoOkUnlim: (h) => `unlimited for ${h}h`,
    promoOkDiscount: (p) => `${p}% off your next purchase (24h)`,
    promoOkMedia: (d) => `🎉 Promo code activated!${d > 0 ? ` ${d}% off your next purchase (24h).` : ''} Open facerate.ru and enjoy.`,
    promoOk: (g) => `🎉 Promo code activated: ${g}! Open facerate.ru and enjoy.`,
    payCredits: (n) => `credits added: ${n}`,
    payUnlim: (d) => `👑 unlimited until ${d}`,
    paySub: (d) => `👑 month unlimited until ${d}`,
    payRec: ', auto-renewal is on',
    payOk: (n, id, bonus) => `✅ Payment received! ${n}.\nGo back to facerate.ru — everything is updated.${id ? `\n\nOrder ID: <code>${id}</code> (quote it if you write to support)` : ''}${bonus ? `\n\n${bonus}` : ''}`,
    firstBuyBonus: (p) => `🎁 Thanks for your first purchase! Here's ${p}% off your next one — it's already applied automatically, just buy within 30 days.`,
    pastBuyerBonus: (p) => `🎁 A little thank-you for being a customer! We've added ${p}% off your next purchase — it's already applied automatically, just buy within 30 days.`,
    langSet: '🌍 Language set: English.',
    pickLang: '🌍 Choose language / Выбери язык:',
  },
  ru: {
    menu: 'Меню FaceRate:',
    kbStatus: '💎 Мой статус', kbShop: '⭐ Купить анализы / безлимит', kbOrders: '📦 Мои заказы', kbPromo: '🎁 Ввести промокод',
    kbMyRef: '🔗 Моя реферальная ссылка',
    kbSub: '🔄 Моя подписка', kbGw: '🎉 Розыгрыши', kbSite: '🌐 Открыть FaceRate', kbLang: '🌍 Language: English',
    kbSupport: '💬 Поддержка',
    kbBack: '← Меню',
    shopTitle: '⭐ Что берём?',
    shop1: (s) => `1 анализ — ${s}⭐`, shop5: (s) => `5 — ${s}⭐`,
    shopD: (s) => `🔥 Безлимит на день — ${s}⭐`, shopM: (s) => `👑 Безлимит на месяц — ${s}⭐`,
    loginOk: '✅ Вход выполнен! Возвращайся на сайт — страница подхватит аккаунт сама.',
    hello: '🖤 FaceRate — AI-оценка лица по канонам луксмаксинга.\n\nПодписка на ' + CHANNEL + ' = 1 бесплатный анализ в неделю.',
    statusHead: '💎 Твой статус:\n',
    statusUnlim: (d) => `👑 Безлимит до ${d}\n`,
    statusCredits: (n) => `⭐ Кредиты: ${n}\n`,
    statusSub: (n) => `✅ Подписан на канал — бесплатных на этой неделе: ${n}\n`,
    statusNoSub: `❌ Не подписан на ${CHANNEL} — подпишись и получай 1 бесплатный анализ в неделю\n`,
    subDesc: 'Безлимит на месяц. Автопродление — отключается в настройках Telegram в любой момент.',
    packDesc: (l) => l + ' на facerate.ru',
    invoiceFail: (e) => 'Не удалось выставить счёт: ' + e,
    payPick: 'Как удобнее оплатить?',
    payStars: '⭐ Telegram Stars', payCard: '💳 Карта (₽)', paySbp: '📲 СБП (₽)', payCrypto: '🪙 Криптой',
    cryptoBtn: '🪙 Оплатить криптой', paySbpBtn: '📲 Оплатить через СБП',
    promoAsk: '🎁 Отправь промокод одним сообщением:',
    mysubActive: (d) => `👑 Безлимит активен до ${d}.`,
    mysubRec: '\n\n🔄 Автопродление ВКЛЮЧЕНО. Отключить: настройки Telegram → Мои звёзды → подписки (или кнопкой ниже).',
    mysubNoRec: '\n\nАвтопродления нет — по окончании просто купи снова.',
    mysubNone: 'Активного безлимита нет. Возьми в магазине ⭐',
    kbUnsub: '⛔ Отключить автопродление',
    unsubOk: '⛔ Автопродление отключено. Безлимит доработает оплаченный срок.',
    unsubFail: (e) => 'Не получилось: ' + e + '\nОтключи в Telegram: Настройки → Мои звёзды.',
    unsubNone: 'Подписка не найдена.',
    gw: '🎉 Розыгрыши бесплатных анализов и безлимитов проходят в канале ' + CHANNEL + '.\n\nЛови промокоды в постах и вводи их здесь через «🎁 Ввести промокод». Кто успел — того и анализы.',
    kbChannel: '📢 Открыть канал',
    kbGwJoin: '🙋 Участвовать в розыгрыше',
    gwActive: (n, c, d) => `🎉 Идёт розыгрыш!\n\n🏆 Победителей: ${n}, приз каждому: ${c} бесплатных анализов\n⏳ Итоги: ${d}\n\nЧтобы участвовать: подпишись на ${CHANNEL} и жми кнопку ниже.`,
    gwNeedSub: `❌ Чтобы участвовать, нужна подписка на ${CHANNEL}. Подпишись и нажми кнопку ещё раз.`,
    gwJoined: (n) => `✅ Ты участвуешь! Всего участников: ${n}. Держи кулачки — победителям напишем прямо сюда.`,
    gwAlready: (n) => `✅ Ты уже участвуешь (всего участников: ${n}). Итоги подведём и напишем сюда же.`,
    gwNone: `🎉 Сейчас розыгрыша нет. Следи за ${CHANNEL} — анонс будет там.`,
    gwWinMsg: (c) => `🏆 Ты выиграл(а) розыгрыш FaceRate! Начислили +${c} бесплатных анализов. Пользуйся на здоровье!`,
    promoBad: 'Это не похоже на промокод. Попробуй ещё раз через меню.',
    promoNo: '❌ Такого промокода нет или он истёк.',
    promoUsed: 'Ты уже активировал этот промокод 😉',
    promoOut: '😞 Увы, все активации этого промокода уже разобрали.',
    promoOkCredits: (n) => `+${n} анализ(а)`,
    promoOkUnlim: (h) => `безлимит на ${h} ч`,
    promoOkDiscount: (p) => `скидка ${p}% на следующую покупку (24ч)`,
    promoOkMedia: (d) => `🎉 Промокод активирован!${d > 0 ? ` Скидка ${d}% на следующую покупку (24ч).` : ''} Открывай facerate.ru и пользуйся.`,
    promoOk: (g) => `🎉 Промокод активирован: ${g}! Открывай facerate.ru и пользуйся.`,
    payCredits: (n) => `начислено анализов: ${n}`,
    payUnlim: (d) => `👑 безлимит до ${d}`,
    paySub: (d) => `👑 месячный безлимит до ${d}`,
    payRec: ', автопродление включено',
    payOk: (n, id, bonus) => `✅ Оплата получена! ${n}.\nВозвращайся на facerate.ru — всё уже обновлено.${id ? `\n\nID заказа: <code>${id}</code> (укажи его, если напишешь в поддержку)` : ''}${bonus ? `\n\n${bonus}` : ''}`,
    firstBuyBonus: (p) => `🎁 Спасибо за первую покупку! Дарим скидку ${p}% на следующую — она уже применена автоматически, просто купи в течение 30 дней.`,
    pastBuyerBonus: (p) => `🎁 Небольшой подарок за то, что ты с нами! Начислили скидку ${p}% на следующую покупку — она уже применена автоматически, просто купи в течение 30 дней.`,
    langSet: '🌍 Язык переключён: русский.',
    pickLang: '🌍 Choose language / Выбери язык:',
  },
};

function fmtDate(ms, L) {
  return new Date(ms).toLocaleString(L === 'ru' ? 'ru-RU' : 'en-US', { timeZone: 'Europe/Moscow', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' (MSK)';
}

function menuKb(L) {
  const b = BL[L];
  return { inline_keyboard: [
    [{ text: b.kbStatus, callback_data: 'status' }],
    [{ text: b.kbShop, callback_data: 'shop' }],
    [{ text: b.kbOrders, callback_data: 'orders' }],
    [{ text: b.kbPromo, callback_data: 'promo' }],
    [{ text: b.kbMyRef, callback_data: 'myref' }],
    [{ text: b.kbSub, callback_data: 'mysub' }, { text: b.kbGw, callback_data: 'gw' }],
    [{ text: b.kbSite, url: 'https://facerate.ru' }, { text: b.kbSupport, url: 'https://t.me/FaceRateSupport_bot' }],
    [{ text: b.kbLang, callback_data: L === 'en' ? 'lang:ru' : 'lang:en' }],
  ]};
}
// Шаг 1: выбор способа оплаты.
function methodKb(L, env) {
  const b = BL[L];
  const rows = [[{ text: b.payStars, callback_data: 'mth:stars' }]];
  if (lavaConfigured(env) || env.YUKASSA_PROVIDER_TOKEN) rows.push([{ text: b.payCard, callback_data: 'mth:rub' }]);
  if (lavaConfigured(env)) rows.push([{ text: b.paySbp, callback_data: 'mth:sbp' }]);
  if (env.CRYPTOBOT_TOKEN) rows.push([{ text: b.payCrypto, callback_data: 'mth:crypto' }]);
  rows.push([{ text: b.kbBack, callback_data: 'menu' }]);
  return { inline_keyboard: rows };
}
// Шаг 2: тарифы с ценой в валюте выбранного способа. discPct>0 — показать зачёркнутую
// старую цену и цену со скидкой, чтобы применённое промо было видно ДО оплаты, а не
// сюрпризом в чеке (иначе выглядит как баг «сумма меньше ожидаемой»).
// U+0335 (короткий комбинирующий штрих) — тоньше и меньше "разъезжается" между цифрами
// в шрифте Telegram, чем U+0336 (длинный штрих), которым это было раньше.
const strike = (s) => String(s).split('').map((ch) => ch + '̵').join('');
function saleActive() { return Date.now() < SALE_ENDS_AT; }
// Человеко-читаемый остаток до конца акции (дни+часы, либо часы+минуты в последний день).
function saleCountdown(L) {
  const ms = SALE_ENDS_AT - Date.now();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86400000), hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return L === 'ru' ? `${days} дн ${hours} ч` : `${days}d ${hours}h`;
  const mins = Math.floor((ms % 3600000) / 60000);
  return L === 'ru' ? `${hours} ч ${mins} мин` : `${hours}h ${mins}m`;
}
function packsKb(method, L, discPct) {
  const raw = (p) => method === 'stars' ? p.stars : (method === 'rub' || method === 'sbp') ? (p.lavaRub || p.rub) : p.rub;
  const rawOld = (p) => method === 'stars' ? p.oldStars : (method === 'rub' || method === 'sbp') ? (p.oldLavaRub || p.oldRub) : p.oldRub;
  const unit = (p) => method === 'stars' ? '⭐' : '₽';
  const cardLike = method === 'rub' || method === 'sbp';
  const price = (p) => {
    const base = raw(p);
    // Lava.top (карта/СБП) не принимает инвойс дешевле LAVA_MIN_RUB ни при какой скидке —
    // если тариф уже на этом полу (самый дешёвый — ровно 50₽), скидка технически неприменима.
    const cur = discPct && !(cardLike && base <= LAVA_MIN_RUB) ? Math.max(1, Math.round(base * (100 - discPct) / 100)) : base;
    // Если активна персональная скидка — зачёркиваем ТЕКУЩУЮ базовую цену (base), а не старую
    // цену до недельного повышения (rawOld). Иначе два разных "было" сливаются в одно число и
    // выглядит как "подешевело с 39 до 38", хотя на самом деле "было 45 (база), стало 38 (со скидкой)".
    const old = discPct ? base : (saleActive() ? rawOld(p) : null);
    const oldTxt = old && old > cur ? `${strike(old + unit(p))} ` : '';
    return `${oldTxt}${cur}${unit(p)}`;
  };
  const row = (id, emoji, note) => {
    let label = `${emoji}${packLabel(PACKS[id], L)} — ${price(PACKS[id])}`;
    if (note) label += note;
    return [{ text: label, callback_data: `pay:${id}:${method}` }];
  };
  const rows = [row('p1', ''), row('p5', ''), row('h1', '⏱ '), row('d1', '🔥 '), row('m1', '👑 ', saleActive() ? ' 🔥ХИТ СКИДКИ' : ''), row('guide', '📕 ', ' НОВОЕ')];
  const cd = saleActive() ? saleCountdown(L) : null;
  if (cd) rows.unshift([{ text: (L === 'ru' ? `🔥 Цены недели! До повышения: ${cd}` : `🔥 Weekly prices! Ends in: ${cd}`), callback_data: 'noop' }]);
  if (discPct) rows.unshift([{ text: `🎁 Промо-скидка ${discPct}% уже применена`, callback_data: 'noop' }]);
  rows.push([{ text: BL[L].kbBack, callback_data: 'shop' }]);
  return { inline_keyboard: rows };
}

async function tgWebhook(request, env) {
  // Проверка, что вебхук реально от Telegram (секретный заголовок).
  if (env.TG_WEBHOOK_SECRET && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TG_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  let upd; try { upd = await request.json(); } catch { return new Response('ok'); }

  // Админ прислал файл боту - отвечаем его file_id. Нужно, чтобы забрать id гайда:
  // getUpdates при активном вебхуке недоступен, а отключать вебхук на боевом боте
  // ради одной операции - лишний риск потерять сообщения.
  if (upd.message?.document && isAdminId(env, upd.message.from?.id)) {
    const d = upd.message.document;
    await tgApi(env, 'sendMessage', {
      chat_id: upd.message.chat.id, parse_mode: 'HTML',
      text: `📎 <b>${escHtml(d.file_name || 'файл')}</b>\n`
          + `${Math.round((d.file_size || 0) / 1024)} КБ\n\n`
          + `<code>${escHtml(d.file_id)}</code>\n\n`
          + `Нажми на строку выше, чтобы скопировать.`,
    });
    return new Response('ok');
  }

  // Подтверждаем оплату (в т.ч. продления подписки).
  if (upd.pre_checkout_query) {
    await tgApi(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: upd.pre_checkout_query.id, ok: true });
    return new Response('ok');
  }

  // ── Буст канала → +1 бесплатный анализ (один раз на человека, не фармится снятием/повтором буста) ──
  if (upd.chat_boost) {
    try {
      const b = upd.chat_boost.boost;
      const chatUsername = upd.chat_boost.chat?.username ? '@' + upd.chat_boost.chat.username : '';
      const user = b?.source?.source === 'premium' ? b.source.user : null;
      if (user && !user.is_bot && chatUsername.toLowerCase() === CHANNEL.toLowerCase()) {
        const boosterTgid = user.id;
        const seenKey = `boosted:${boosterTgid}`;
        if (!(await env.RATE_LIMIT.get(seenKey))) {
          await env.RATE_LIMIT.put(seenKey, '1');
          const cur = parseInt(await env.RATE_LIMIT.get(`credits:${boosterTgid}`) || '0', 10);
          await env.RATE_LIMIT.put(`credits:${boosterTgid}`, String(cur + 1));
          const L = await userLang(env, boosterTgid);
          await tgApi(env, 'sendMessage', {
            chat_id: boosterTgid,
            text: L === 'ru' ? '🚀 Спасибо за буст канала! +1 анализ уже на счету.' : '🚀 Thanks for boosting the channel! +1 free analysis has been added.',
            reply_markup: menuKb(L),
          }).catch(() => {}); // юзер мог не запускать бота — сообщение не критично
        }
      }
    } catch { /* не роняем вебхук из-за буста */ }
    return new Response('ok');
  }

  // ── Кнопки меню ──
  if (upd.callback_query) {
    await handleCallback(env, upd.callback_query);
    return new Response('ok');
  }

  const msg = upd.message;
  if (!msg || !msg.from || msg.from.is_bot) return new Response('ok');
  const chat = msg.chat.id, tgid = msg.from.id;
  // Метка "этот tgid когда-либо писал боту" — нужна только для рассылок (/broadcast), без TTL.
  if (env.RATE_LIMIT) await env.RATE_LIMIT.put(`user:${tgid}`, '1');
  const L = await userLang(env, tgid);
  const b = BL[L];

  // ── Успешная оплата → начисление ──
  if (msg.successful_payment) {
    await handlePayment(env, msg, L);
    return new Response('ok');
  }

  const text = (msg.text || '').trim();

  // ── /start [код входа с сайта | ref_КОД реферальной ссылки] ──
  if (text.startsWith('/start')) {
    const code = text.split(' ')[1] || '';
    if (/^[a-z0-9-]{10,80}$/i.test(code)) {
      const token = crypto.randomUUID() + '-' + crypto.randomUUID();
      const user = { id: tgid, first_name: msg.from.first_name || '', username: msg.from.username || '', photo_url: '' };
      await env.RATE_LIMIT.put(`sess:${token}`, JSON.stringify(user), { expirationTtl: 60 * 60 * 24 * 30 });
      await env.RATE_LIMIT.put(`authcode:${code}`, JSON.stringify({ token, user }), { expirationTtl: 600 });
      await tgApi(env, 'sendMessage', { chat_id: chat, text: b.loginOk, reply_markup: menuKb(L) });
    } else if (/^ref_[a-z0-9_-]{1,40}$/i.test(code)) {
      const gotBonus = await attributeReferral(env, tgid, code.slice(4).toUpperCase());
      const greetText = gotBonus ? (L === 'ru' ? b.hello + '\n\n🎁 Тебе начислен +1 бесплатный анализ за переход по реферальной ссылке!' : b.hello + '\n\n🎁 You got +1 free analysis for joining via a referral link!') : b.hello;
      await tgApi(env, 'sendMessage', { chat_id: chat, text: greetText, reply_markup: menuKb(L) });
    } else if (code === 'shop') {
      // Диплинк из постов про акцию/цены — сразу к выбору способа оплаты, минуя меню.
      await tgApi(env, 'sendMessage', { chat_id: chat, text: b.payPick, reply_markup: methodKb(L, env) });
    } else if (code === 'giveaway') {
      const gw = await getGiveaway(env);
      if (gw && gw.endTs > Date.now()) {
        await tgApi(env, 'sendMessage', {
          chat_id: chat, text: b.gwActive(gw.winners, gw.credits, fmtDate(gw.endTs, L)),
          reply_markup: { inline_keyboard: [[{ text: b.kbGwJoin, callback_data: 'gw:join' }], [{ text: b.kbBack, callback_data: 'menu' }]] },
        });
      } else {
        await tgApi(env, 'sendMessage', { chat_id: chat, text: b.gwNone, reply_markup: menuKb(L) });
      }
    } else {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: b.hello, reply_markup: menuKb(L) });
    }
    return new Response('ok');
  }

  if (text === '/menu') {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: b.menu, reply_markup: menuKb(L) });
    return new Response('ok');
  }

  // ── Админ: /addpromo КОД использований credits=N | hours=H | discount=N ──
  if (text.startsWith('/addpromo') && ADMIN_USERNAMES.includes(msg.from.username || '')) {
    const m = text.match(/^\/addpromo\s+(\S+)\s+(\d+)\s+(credits|hours|discount)=(\d+)/i);
    if (!m) {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Формат:\n/addpromo КОД КОЛ-ВО_АКТИВАЦИЙ credits=3\n/addpromo КОД КОЛ-ВО_АКТИВАЦИЙ hours=24\n/addpromo КОД КОЛ-ВО_АКТИВАЦИЙ discount=20' });
    } else {
      const promo = { uses: parseInt(m[2], 10), max: parseInt(m[2], 10) };
      promo[m[3].toLowerCase()] = parseInt(m[4], 10);
      await env.RATE_LIMIT.put(`promo:${m[1].toUpperCase()}`, JSON.stringify(promo), { expirationTtl: 60 * 60 * 24 * 90 });
      await tgApi(env, 'sendMessage', { chat_id: chat, text: `✅ Промокод ${m[1].toUpperCase()} создан: ${m[2]} активаций, ${m[3]}=${m[4]}.\nКидай его в канал — это и есть розыгрыш.` });
    }
    return new Response('ok');
  }

  // ── Админ: /newgiveaway победителей приз_анализов дней — запускает розыгрыш
  // с явным участием (кнопка «Участвовать» + живая проверка подписки). Отдаёт готовый
  // текст для поста в канал (с диплинком на бота), постить туда — руками, как и промокоды.
  if (text.startsWith('/newgiveaway') && ADMIN_USERNAMES.includes(msg.from.username || '')) {
    const m = text.match(/^\/newgiveaway\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (!m) {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Формат:\n/newgiveaway ПОБЕДИТЕЛЕЙ АНАЛИЗОВ_В_ПРИЗ ДНЕЙ\nНапример: /newgiveaway 3 5 7' });
      return new Response('ok');
    }
    const winners = parseInt(m[1], 10), credits = parseInt(m[2], 10), days = parseInt(m[3], 10);
    const endTs = Date.now() + days * 24 * 60 * 60 * 1000;
    const gw = { id: crypto.randomUUID().slice(0, 8), endTs, credits, winners, entries: [] };
    await saveGiveaway(env, gw);
    const botUsername = env.BOT_USERNAME || 'faceratepay_bot';
    const link = `https://t.me/${botUsername}?start=giveaway`;
    const endDate = fmtDate(endTs, 'ru');
    const post = `🎉 РОЗЫГРЫШ!\n\nРазыгрываем ${credits} бесплатных анализов лица среди ${winners} победител${winners === 1 ? 'я' : 'ей'}.\n\nУсловия:\n1. Быть подписанным на этот канал\n2. Нажать «Участвовать» в боте\n\nИтоги подведём ${endDate}, победителей объявим здесь же.\n\n👉 ${link}`;
    await tgApi(env, 'sendMessage', {
      chat_id: chat,
      text: `✅ Розыгрыш запущен: id ${gw.id}, ${winners} победител${winners === 1 ? 'я' : 'ей'} по ${credits} анализов, итоги ${endDate}.\n\nГотовый пост для канала (добавь кнопку-ссылку на ${link} через редактор поста):\n\n---\n${post}\n---\n\nПо истечении срока розыгрыш подведётся сам (проверка раз в час) — я пришлю тебе готовый пост с победителями. Если нужно разыграть раньше срока вручную — команда /drawgiveaway.`,
    });
    return new Response('ok');
  }

  // ── Админ: /drawgiveaway — досрочно разыграть вручную (обычно не нужно: розыгрыш
  // сам подводит итоги по истечении срока, см. checkGiveawayDraw()/scheduled()).
  if (text.startsWith('/drawgiveaway') && ADMIN_USERNAMES.includes(msg.from.username || '')) {
    const r = await runGiveawayDraw(env);
    if (!r.ok) {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: r.reason === 'empty' ? 'Участников не было, розыгрыш закрыт без победителей.' : 'Активного розыгрыша нет.' });
      return new Response('ok');
    }
    await tgApi(env, 'sendMessage', {
      chat_id: chat,
      text: `✅ Разыграно среди ${r.totalEntries} участников, победителей: ${r.picked.length}.${r.unsubSkipped ? ` (пропущено ${r.unsubSkipped} — отписались)` : ''}\n\nГотовый пост для канала:\n\n---\n${giveawayResultsPost(r)}\n---`,
    });
    return new Response('ok');
  }

  // ── Админ: /broadcast ТЕКСТ — разослать сообщение всем известным пользователям бота
  // (собираем tgid из всех KV-следов: user:, orders:, unlim:, credits:, qw:, lang:).
  if (text.startsWith('/broadcast') && ADMIN_USERNAMES.includes(msg.from.username || '')) {
    const body = text.slice('/broadcast'.length).trim();
    if (!body) {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Формат:\n/broadcast ТЕКСТ СООБЩЕНИЯ' });
      return new Response('ok');
    }
    await tgApi(env, 'sendMessage', { chat_id: chat, text: '⏳ Собираю список пользователей и рассылаю...' });
    const ids = await collectAllUserIds(env);
    let sent = 0, failed = 0;
    for (const id of ids) {
      try {
        await tgApi(env, 'sendMessage', { chat_id: id, text: body });
        sent++;
      } catch { failed++; }
      await new Promise((r) => setTimeout(r, 40)); // мягкий троттлинг под лимиты Telegram
    }
    await tgApi(env, 'sendMessage', { chat_id: chat, text: `✅ Рассылка завершена: всего ${ids.length}, отправлено ${sent}, не доставлено ${failed} (заблокировали бота и т.п.).` });
    return new Response('ok');
  }

  // ── Админ: /lavaproducts — список офферов Lava.top (id + название + динамическая цена?)
  // и текущий LAVA_OFFER_IDS, чтобы найти offerId под новый тариф без похода в их API руками.
  if (text.startsWith('/lavaproducts') && ADMIN_USERNAMES.includes(msg.from.username || '')) {
    if (!env.LAVA_API_KEY) {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: 'LAVA_API_KEY не настроен.' });
      return new Response('ok');
    }
    const r = await fetch('https://gate.lava.top/api/v2/products?feedVisibility=ALL', {
      headers: { 'X-Api-Key': env.LAVA_API_KEY },
    }).then(x => x.json()).catch(e => ({ error: e.message }));
    let t = `🔑 Текущий LAVA_OFFER_IDS:\n<code>${env.LAVA_OFFER_IDS || '(пусто)'}</code>\n\n📦 Каталог Lava.top:\n`;
    for (const item of r?.items || []) {
      t += `\n<b>${item.title || item.name || '(без названия)'}</b> (product: <code>${item.id}</code>, dynamic: ${item.isDynamicPrice ? 'да' : 'нет'})\n`;
      for (const offer of item.offers || []) {
        const price = (offer.prices || []).find(p => p.currency === 'RUB');
        t += `  • offer: <code>${offer.id}</code>${offer.name ? ' — ' + offer.name : ''}${price ? ` (${price.amount}₽)` : ''}\n`;
      }
    }
    if (!r?.items?.length) t += r?.error ? `Ошибка: ${r.error}` : '(пусто)';
    await tgApi(env, 'sendMessage', { chat_id: chat, text: t.slice(0, 4000), parse_mode: 'HTML' });
    return new Response('ok');
  }

  // ── Админ: /cashbackbackfill — разовая ручная выдача кешбэка (14.07.2026) тем, кто
  // уже потратил 3+ платных кредита ДО того, как появилась автоматическая механика
  // кешбэка. Список и суммы посчитаны один раз вручную (orders: минус текущий баланс
  // credits:), захардкожены ниже — это не рекуррентная механика, просто разовый жест.
  // Идемпотентно по cashbackBackfillDone:tgid — безопасно запускать повторно.
  if (text.startsWith('/cashbackbackfill') && ADMIN_USERNAMES.includes(msg.from.username || '')) {
    const BACKFILL = { '1163642139': 2, '1839159272': 2, '753733837': 2, '8552442679': 2 };
    await tgApi(env, 'sendMessage', { chat_id: chat, text: '⏳ Выдаю кешбэк и рассылаю уведомления...' });
    let granted = 0, skipped = 0;
    for (const [buyerId, amount] of Object.entries(BACKFILL)) {
      if (await env.RATE_LIMIT.get(`cashbackBackfillDone:${buyerId}`)) { skipped++; continue; }
      await env.RATE_LIMIT.put(`cashbackBackfillDone:${buyerId}`, '1', { expirationTtl: 60 * 60 * 24 * 365 });
      const cur = parseInt(await env.RATE_LIMIT.get(`credits:${buyerId}`) || '0', 10);
      await env.RATE_LIMIT.put(`credits:${buyerId}`, String(cur + amount));
      const L = await userLang(env, buyerId);
      const msgText = L === 'ru'
        ? `🖤 Спасибо, что вы с нами!\n\nМы запустили кешбэк — теперь каждые 3 потраченных анализа возвращают +1 анализ автоматически. Вы уже успели потратить достаточно кредитов ДО того, как эта механика появилась — поэтому дарим вам ${amount} анализ${amount === 1 ? '' : 'а'} в знак благодарности за доверие.\n\nОн уже зачислен на ваш аккаунт — можно использовать прямо сейчас.\n\nAscend & Forget 🖤`
        : `🖤 Thank you for being with us!\n\nWe just launched cashback — every 3 spent analyses now return +1 analysis automatically. You'd already spent enough credits BEFORE this feature existed — so here's ${amount} analysis${amount === 1 ? '' : 'es'} on us, as a thank-you.\n\nAlready added to your account — ready to use right now.\n\nAscend & Forget 🖤`;
      await tgApi(env, 'sendMessage', { chat_id: buyerId, text: msgText });
      granted++;
    }
    await tgApi(env, 'sendMessage', { chat_id: chat, text: `✅ Готово: начислено ${granted}, пропущено (уже обработаны раньше) ${skipped}.` });
    return new Response('ok');
  }

  // ── Админ: /grantpastbuyers — разовая раздача скидки 20% всем, кто хоть раз покупал,
  // + уведомление им в личку. Не плюсуется поверх уже висящей скидки (промокод/рефералка).
  // Идемпотентно по courtesyNotified — безопасно запускать повторно, каждый покупатель
  // получает уведомление только один раз, даже если команду до этого уже вызывали.
  if (text.startsWith('/grantpastbuyers') && ADMIN_USERNAMES.includes(msg.from.username || '')) {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: '⏳ Раздаю скидку прошлым покупателям и рассылаю уведомления...' });
    let granted = 0, notified = 0, skipped = 0, cursor;
    do {
      const page = await env.RATE_LIMIT.list({ prefix: 'orders:', cursor });
      for (const k of page.keys) {
        const buyerId = k.name.slice('orders:'.length);
        if (await env.RATE_LIMIT.get(`courtesyNotified:${buyerId}`)) continue; // уже обработан в прошлый запуск
        await env.RATE_LIMIT.put(`courtesyNotified:${buyerId}`, '1', { expirationTtl: 60 * 60 * 24 * 365 });
        const justGranted = await grantFirstPurchaseBonus(env, buyerId);
        if (justGranted) granted++;
        const curDisc = justGranted ? String(FIRST_BUY_DISCOUNT_PCT) : await env.RATE_LIMIT.get(`pendingDiscount:${buyerId}`);
        if (curDisc === String(FIRST_BUY_DISCOUNT_PCT)) {
          const bl = BL[await userLang(env, buyerId)];
          await tgApi(env, 'sendMessage', { chat_id: buyerId, text: bl.pastBuyerBonus(FIRST_BUY_DISCOUNT_PCT), parse_mode: 'HTML' });
          notified++;
        } else {
          skipped++; // уже есть своя скидка другого размера — не трогаем и не пишем про несуществующий бонус
        }
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    await tgApi(env, 'sendMessage', { chat_id: chat, text: `✅ Готово: скидка выдана ${granted} покупателям, уведомлено ${notified}, пропущено ${skipped} (у них уже была своя скидка другого размера).` });
    return new Response('ok');
  }

  // ── Ожидание промокода (после кнопки 🎁) ──
  const waiting = await env.RATE_LIMIT.get(`pmstate:${tgid}`);
  if (waiting) {
    await env.RATE_LIMIT.delete(`pmstate:${tgid}`);
    await redeemPromo(env, chat, tgid, text.toUpperCase(), L, msg.from);
    return new Response('ok');
  }

  await tgApi(env, 'sendMessage', { chat_id: chat, text: b.menu, reply_markup: menuKb(L) });
  return new Response('ok');
}

async function handleCallback(env, cq) {
  if ((cq.data || '').startsWith('wk:')) return await progressCallback(env, cq);
  const chat = cq.message.chat.id, tgid = cq.from.id, data = cq.data || '';
  const mid = cq.message.message_id;
  const reply = (text, kb, extra) => editOrSend((m, bd) => tgApi(env, m, bd), chat, mid, text, kb, extra);
  await tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id });
  let L = await userLang(env, tgid);

  // Переключение языка
  if (data === 'lang:ru' || data === 'lang:en') {
    L = data.slice(5);
    await env.RATE_LIMIT.put(`lang:${tgid}`, L);
    await reply(BL[L].langSet, menuKb(L));
    return;
  }
  const b = BL[L];

  if (data === 'menu') {
    await reply(b.menu, menuKb(L));
  } else if (data === 'status') {
    const credits = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
    const unlim = parseInt(await env.RATE_LIMIT.get(`unlim:${tgid}`) || '0', 10);
    const sub = await isSubscribed(env, tgid, true);
    const buyerFlag = await isBuyer(env, tgid);
    const freeAvail = sub && await freeQuotaAvailable(env, tgid, buyerFlag);
    let t = b.statusHead;
    if (unlim > Date.now()) t += b.statusUnlim(fmtDate(unlim, L));
    t += b.statusCredits(credits);
    t += sub ? b.statusSub(freeAvail ? 1 : 0) : b.statusNoSub;
    await reply(t, menuKb(L));
  } else if (data === 'shop') {
    // Шаг 1: выбор способа оплаты.
    await reply(b.payPick, methodKb(L, env));
  } else if (data.startsWith('mth:')) {
    // Шаг 2: тарифы под выбранный способ.
    const method = data.slice(4);
    const listDiscPct = await buyerDiscountPct(env, tgid, null);
    await reply(b.shopTitle, packsKb(method, L, listDiscPct));
  } else if (data.startsWith('pay:')) {
    // Шаг 2: выставление счёта выбранным способом.
    const [, packId, method] = data.split(':');
    const pack = PACKS[packId];
    if (!pack) return;
    const discPct = await buyerDiscountPct(env, tgid, packId);
    // Скидку больше НЕ гасим здесь — раньше она пропадала уже при выставлении счёта, даже
    // если человек его не оплатил (просто посмотрел цену ещё раз). Теперь гасится только
    // после РЕАЛЬНОЙ успешной оплаты (handlePayment/lavaWebhook/cryptoWebhook), см. там.
    if (method === 'crypto') {
      const d = await createCryptoInvoice(env, tgid, packId, L, discPct);
      if (d.ok) await reply(b.payPick, { inline_keyboard: [[{ text: b.cryptoBtn, url: d.link }]] });
      else await reply(b.invoiceFail(d.error || ''), menuKb(L));
    } else if (method === 'rub' && lavaConfigured(env)) {
      const d = await createLavaInvoice(env, tgid, packId, L, discPct, false);
      if (d.ok) await reply(b.payPick, { inline_keyboard: [[{ text: b.payCard, url: d.link }]] });
      else await reply(b.invoiceFail(d.error || ''), menuKb(L));
    } else if (method === 'sbp' && lavaConfigured(env)) {
      const d = await createLavaInvoice(env, tgid, packId, L, discPct, true);
      if (d.ok) await reply(b.payPick, { inline_keyboard: [[{ text: b.paySbpBtn, url: d.link }]] });
      else await reply(b.invoiceFail(d.error || ''), menuKb(L));
    } else {
      const inv = {
        chat_id: chat,
        title: `FaceRate: ${packLabel(pack, L)}`,
        description: pack.type === 'sub' ? b.subDesc : b.packDesc(packLabel(pack, L)),
        payload: JSON.stringify({ tgid, pack: packId }),
        currency: 'XTR',
        prices: [{ label: packLabel(pack, L), amount: applyDiscount(pack.stars, discPct) }],
      };
      if (method === 'rub') {
        inv.currency = 'RUB';
        inv.provider_token = env.YUKASSA_PROVIDER_TOKEN;
        inv.prices = [{ label: packLabel(pack, L), amount: applyDiscount(pack.rub, discPct) * 100 }];
      } else if (pack.type === 'sub') {
        inv.subscription_period = pack.period;
      }
      // sendInvoice — отдельное системное сообщение Telegram, его нельзя "починить в то же" — но
      // старое сообщение с тарифами больше не нужно, поэтому просто убираем с него кнопки.
      await tgApi(env, 'editMessageReplyMarkup', { chat_id: chat, message_id: mid, reply_markup: { inline_keyboard: [] } });
      const r = await tgApi(env, 'sendInvoice', inv);
      if (!r.ok) await tgApi(env, 'sendMessage', { chat_id: chat, text: b.invoiceFail(r.description || ''), reply_markup: menuKb(L) });
    }
  } else if (data === 'orders') {
    await reply(await ordersText(env, tgid, L), { inline_keyboard: [[{ text: b.kbBack, callback_data: 'menu' }]] }, { parse_mode: 'HTML' });
  } else if (data === 'promo') {
    await env.RATE_LIMIT.put(`pmstate:${tgid}`, '1', { expirationTtl: 300 });
    await reply(b.promoAsk, { inline_keyboard: [[{ text: b.kbBack, callback_data: 'menu' }]] });
  } else if (data === 'myref') {
    await reply(await myPersonalRefText(env, tgid, L), { inline_keyboard: [[{ text: b.kbBack, callback_data: 'menu' }]] });
  } else if (data === 'mysub') {
    const unlim = parseInt(await env.RATE_LIMIT.get(`unlim:${tgid}`) || '0', 10);
    const isRec = await env.RATE_LIMIT.get(`subrec:${tgid}`);
    let t;
    if (unlim > Date.now()) {
      t = b.mysubActive(fmtDate(unlim, L));
      t += isRec === '1' ? b.mysubRec : b.mysubNoRec;
    } else {
      t = b.mysubNone;
    }
    const kb = { inline_keyboard: [] };
    if (isRec === '1') kb.inline_keyboard.push([{ text: b.kbUnsub, callback_data: 'unsub' }]);
    kb.inline_keyboard.push([{ text: b.kbBack, callback_data: 'menu' }]);
    await reply(t, kb);
  } else if (data === 'unsub') {
    const chg = await env.RATE_LIMIT.get(`subchg:${tgid}`);
    if (chg) {
      const r = await tgApi(env, 'editUserStarSubscription', { user_id: tgid, telegram_payment_charge_id: chg, is_canceled: true });
      if (r.ok) {
        await env.RATE_LIMIT.put(`subrec:${tgid}`, '0');
        await reply(b.unsubOk, menuKb(L));
      } else {
        await reply(b.unsubFail(r.description || ''), menuKb(L));
      }
    } else {
      await reply(b.unsubNone, menuKb(L));
    }
  } else if (data === 'gw') {
    const gw = await getGiveaway(env);
    if (gw && gw.endTs > Date.now()) {
      await reply(
        b.gwActive(gw.winners, gw.credits, fmtDate(gw.endTs, L)),
        { inline_keyboard: [[{ text: b.kbGwJoin, callback_data: 'gw:join' }], [{ text: b.kbChannel, url: 'https://t.me/wwwfacerateru' }], [{ text: b.kbBack, callback_data: 'menu' }]] },
      );
    } else {
      await reply(
        b.gw,
        { inline_keyboard: [[{ text: b.kbChannel, url: 'https://t.me/wwwfacerateru' }], [{ text: b.kbBack, callback_data: 'menu' }]] },
      );
    }
  } else if (data === 'gw:join') {
    const gw = await getGiveaway(env);
    if (!gw || gw.endTs <= Date.now()) {
      await reply(b.gwNone, { inline_keyboard: [[{ text: b.kbChannel, url: 'https://t.me/wwwfacerateru' }], [{ text: b.kbBack, callback_data: 'menu' }]] });
      return;
    }
    if (gw.entries.includes(tgid)) {
      await reply(b.gwAlready(gw.entries.length), { inline_keyboard: [[{ text: b.kbBack, callback_data: 'menu' }]] });
      return;
    }
    const subscribed = await isSubscribed(env, tgid, true);
    if (!subscribed) {
      await reply(b.gwNeedSub, { inline_keyboard: [[{ text: b.kbChannel, url: 'https://t.me/wwwfacerateru' }], [{ text: b.kbGwJoin, callback_data: 'gw:join' }], [{ text: b.kbBack, callback_data: 'menu' }]] });
      return;
    }
    gw.entries.push(tgid);
    await saveGiveaway(env, gw);
    await reply(b.gwJoined(gw.entries.length), { inline_keyboard: [[{ text: b.kbBack, callback_data: 'menu' }]] });
  }
}

async function logPromoRedeem(env, code, u) {
  try {
    const list = await getList(env, 'promolog');
    list.unshift({ code, tgid: u?.id, username: u?.username || '', name: u?.first_name || '', ts: Date.now() });
    await putList(env, 'promolog', list.slice(0, 80));
  } catch { /* лог не должен ронять активацию промокода */ }
}

async function redeemPromo(env, chat, tgid, code, L, u) {
  const b = BL[L || 'en'];
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: b.promoBad, reply_markup: menuKb(L) });
    return;
  }
  const raw = await env.RATE_LIMIT.get(`promo:${code}`);
  if (!raw) {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: b.promoNo, reply_markup: menuKb(L) });
    return;
  }
  // Один промокод — один раз в руки.
  if (await env.RATE_LIMIT.get(`promoused:${code}:${tgid}`)) {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: b.promoUsed, reply_markup: menuKb(L) });
    return;
  }
  const promo = JSON.parse(raw);
  if (promo.uses <= 0) {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: b.promoOut, reply_markup: menuKb(L) });
    return;
  }
  promo.uses -= 1;
  await env.RATE_LIMIT.put(`promo:${code}`, JSON.stringify(promo), { expirationTtl: 60 * 60 * 24 * 90 });
  await env.RATE_LIMIT.put(`promoused:${code}:${tgid}`, '1', { expirationTtl: 60 * 60 * 24 * 90 });
  await logPromoRedeem(env, code, u);

  if (promo.mediaPct != null) {
    // Медиа-промо: полностью отдельная сущность от ref:-системы (см. trackMediaPromoPurchase).
    // НЕ трогает refby/pendingRefCode — если человек до этого пришёл по чьей-то реф-ссылке,
    // она перебивается медиа-промокодом на эту одну покупку, а не суммируется с ней.
    await env.RATE_LIMIT.put(`pendingMediaPromo:${tgid}`, code, { expirationTtl: 60 * 60 * 24 });
    if (promo.discount > 0) {
      await env.RATE_LIMIT.put(`pendingDiscount:${tgid}`, String(promo.discount), { expirationTtl: 60 * 60 * 24 });
    }
    await tgApi(env, 'sendMessage', { chat_id: chat, text: b.promoOkMedia(promo.discount || 0), reply_markup: menuKb(L) });
    return;
  }
  let grant;
  if (promo.discount) {
    // Скидка не начисляется сразу — применяется к следующей оплате в течение 24ч.
    await env.RATE_LIMIT.put(`pendingDiscount:${tgid}`, String(promo.discount), { expirationTtl: 60 * 60 * 24 });
    // Отдельно от pendingDiscount (которая гасится сразу при создании счёта) — доживает до
    // самой оплаты, чтобы в истории покупок было видно, каким именно промокодом воспользовались.
    await env.RATE_LIMIT.put(`pendingPromoCodeForOrder:${tgid}`, code, { expirationTtl: 60 * 60 * 24 });
    grant = b.promoOkDiscount(promo.discount);
  } else if (promo.credits) {
    const cur = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
    await env.RATE_LIMIT.put(`credits:${tgid}`, String(cur + promo.credits));
    grant = b.promoOkCredits(promo.credits);
  } else {
    const cur = parseInt(await env.RATE_LIMIT.get(`unlim:${tgid}`) || '0', 10);
    const base = Math.max(cur, Date.now());
    await env.RATE_LIMIT.put(`unlim:${tgid}`, String(base + (promo.hours || 24) * 3600 * 1000));
    grant = b.promoOkUnlim(promo.hours || 24);
  }
  await tgApi(env, 'sendMessage', { chat_id: chat, text: b.promoOk(grant), reply_markup: menuKb(L) });
}

async function handlePayment(env, msg, L) {
  const b = BL[L || 'en'];
  const sp = msg.successful_payment;
  try {
    // Telegram ретраит доставку successful_payment, если вебхук не ответил вовремя/200 —
    // без дедупа это тихо теряет начисление при гонке двух параллельных обработок одного
    // и того же платежа (recordOrder пишется дважды, а credits/unlim — только один раз,
    // т.к. оба чтения credits видят одно и то же старое значение). Дедуп как у Lava/CryptoBot.
    const seenKey = `starspaid:${sp.telegram_payment_charge_id}`;
    if (await env.RATE_LIMIT.get(seenKey)) return;
    await env.RATE_LIMIT.put(seenKey, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    const payload = JSON.parse(sp.invoice_payload);
    const tgid = payload.tgid || msg.from.id;
    const pack = PACKS[payload.pack];
    if (!pack && !payload.credits) return; // тариф не найден (напр. каталог изменился после выставления счёта) — не логируем заказ без начисления
    let note = '';
    if (payload.credits && !pack) {
      // старый формат payload {tgid, credits}
      const cur = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
      await env.RATE_LIMIT.put(`credits:${tgid}`, String(cur + payload.credits));
      note = b.payCredits(payload.credits);
    } else {
      note = await grantPack(env, tgid, pack, L, sp);
    }
    await env.RATE_LIMIT.delete(`pendingDiscount:${tgid}`); // промо-скидка одноразовая, гасим ПОСЛЕ реальной оплаты
    const paidAmount = sp.currency === 'XTR' ? sp.total_amount : sp.total_amount / 100;
    const promoUsed = await peekOrderPromoCode(env, tgid);
    const { id: orderId, isFirst } = await recordOrder(env, {
      tgid, pack: payload.pack || '', method: sp.currency === 'XTR' ? 'stars' : 'rub',
      amount: paidAmount, currency: sp.currency,
      username: msg.from.username || '', name: msg.from.first_name || '',
      promo: promoUsed,
    });
    const payMethod = sp.currency === 'XTR' ? 'stars' : 'rub';
    if (!(await trackMediaPromoPurchase(env, tgid, pack, payMethod, paidAmount))) await trackReferralPurchase(env, tgid, pack, payMethod, paidAmount);
    const gotBonus = isFirst && await grantFirstPurchaseBonus(env, tgid);
    const extra = [gotBonus ? b.firstBuyBonus(FIRST_BUY_DISCOUNT_PCT) : '', await m1UpsellText(env, tgid, pack, L || 'en')].filter(Boolean).join('\n\n');
    await tgApi(env, 'sendMessage', { chat_id: msg.chat.id, text: b.payOk(note, orderId, extra), reply_markup: menuKb(L || 'en'), parse_mode: 'HTML' });
  } catch { /* payload сломан — молча игнор */ }
}

// Начисление тарифа. sp — successful_payment (только для Stars-подписки), может отсутствовать.
async function grantPack(env, tgid, pack, L, sp) {
  const b = BL[L || 'en'];
  if (pack?.type === 'credits') {
    const cur = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
    await env.RATE_LIMIT.put(`credits:${tgid}`, String(cur + pack.credits));
    return b.payCredits(pack.credits);
  }
  if (pack?.type === 'unlim') {
    const cur = parseInt(await env.RATE_LIMIT.get(`unlim:${tgid}`) || '0', 10);
    const until = Math.max(cur, Date.now()) + pack.hours * 3600 * 1000;
    await env.RATE_LIMIT.put(`unlim:${tgid}`, String(until));
    return b.payUnlim(fmtDate(until, L || 'en'));
  }
  if (pack?.type === 'guide') {
    await env.RATE_LIMIT.put(`guide:${tgid}`, '1');
    const cur = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
    await env.RATE_LIMIT.put(`credits:${tgid}`, String(cur + pack.credits));
    await env.RATE_LIMIT.put(`gstart:${tgid}`, String(Date.now()));
    const gl = await guideMembers(env);
    if (!gl.includes(String(tgid))) { gl.push(String(tgid)); await env.RATE_LIMIT.put('guidelist', JSON.stringify(gl)); }
    if (env.GUIDE_FILE_ID) {
      await tgApi(env, 'sendDocument', { chat_id: tgid, document: env.GUIDE_FILE_ID,
        caption: '📕 Твой гайд на 25 страниц.\n\nВедение уже открыто на facerate.ru - вкладка «Ведение». Там замеры прогресса, разбор всех параметров и план на 90 дней.\n\nЗадания буду присылать сюда раз в неделю.' }).catch(() => {});
    }
    return `✅ Гайд отправлен файлом выше, ведение открыто на сайте. Плюс ${pack.credits} анализов на счёт.`;
  }
  if (pack?.type === 'sub') {
    const until = (sp?.subscription_expiration_date ? sp.subscription_expiration_date * 1000 : Date.now() + 30 * 24 * 3600 * 1000);
    await env.RATE_LIMIT.put(`unlim:${tgid}`, String(until));
    await env.RATE_LIMIT.put(`subchg:${tgid}`, sp?.telegram_payment_charge_id || '');
    await env.RATE_LIMIT.put(`subrec:${tgid}`, sp?.is_recurring ? '1' : '0');
    return b.paySub(fmtDate(until, L || 'en')) + (sp?.is_recurring ? b.payRec : '');
  }
  return '';
}

// ─────────────────────────── Бот техподдержки (отдельный токен) ───────────────────────────
const SUP = {
  en: {
    hello: '👋 FaceRate Support. Ask your question — I’ll answer right away. Or pick an option below.',
    menu: 'How can I help?',
    human: '🧑 Call an operator', kbFaq: '📖 FAQ', kbSite: '🌐 Open FaceRate', kbBuy: '⭐ Buy / prices',
    kbLang: '🌍 Язык: Русский', kbBack: '← Menu',
    humanOn: '✅ Passed to an operator. Write your question — a human will reply here.',
    sent: '✅ Sent to the operator. Please wait for a reply.',
    noAdmin: 'Operator is temporarily unavailable, please try later.',
    langSet: '🌍 Language set: English.',
    faq: '❓ FAQ\n\n• Free analysis — subscribe to @wwwfacerateru (1/week).\n• Paid — Telegram Stars or crypto in the payments bot.\n• No access after paying? Refresh facerate.ru; if it persists — tap “Call an operator”.\n• Promo codes — button in the payments bot; codes drop in channel giveaways.\n• Privacy — your photo is used only for the analysis and is not published.\n\nStill stuck? Just type your question here.',
  },
  ru: {
    hello: '👋 Поддержка FaceRate. Задай вопрос — отвечу сразу. Или выбери пункт ниже.',
    menu: 'Чем помочь?',
    human: '🧑 Позвать оператора', kbFaq: '📖 FAQ', kbSite: '🌐 Открыть FaceRate', kbBuy: '⭐ Купить / тарифы',
    kbLang: '🌍 Language: English', kbBack: '← Меню',
    humanOn: '✅ Передаю оператору. Опиши вопрос — человек ответит здесь.',
    sent: '✅ Отправлено оператору. Дождись ответа.',
    noAdmin: 'Оператор временно недоступен, попробуй позже.',
    langSet: '🌍 Язык переключён: русский.',
    faq: '❓ Частые вопросы\n\n• Бесплатный анализ — подпишись на @wwwfacerateru (1 в неделю).\n• Платно — Telegram Stars или крипта в боте оплаты.\n• Не пришёл доступ после оплаты? Обнови facerate.ru; если не помогло — жми «Позвать оператора».\n• Промокоды — кнопка в боте оплаты; коды бывают в розыгрышах канала.\n• Приватность — фото используется только для анализа и не публикуется.\n\nНе нашёл ответа? Просто напиши вопрос сюда.',
  },
};
function supMenuKb(L, isAdmin) {
  const b = SUP[L];
  const rows = [
    [{ text: b.kbFaq, callback_data: 'faq' }],
    [{ text: b.human, callback_data: 'human' }],
    [{ text: b.kbSite, url: 'https://facerate.ru' }, { text: b.kbBuy, url: 'https://t.me/faceratepay_bot' }],
    [{ text: b.kbLang, callback_data: L === 'en' ? 'lang:ru' : 'lang:en' }],
  ];
  if (isAdmin) rows.push([{ text: '⚙️ Admin', callback_data: 'admin' }]);
  return { inline_keyboard: rows };
}

// ─── Админ-панель модератора (SUPPORT_ADMIN_ID — один id или несколько через запятую) ───
function adminIds(env) {
  return String(env.SUPPORT_ADMIN_ID || '').split(',').map(s => s.trim()).filter(Boolean);
}
function isAdminId(env, id) { return adminIds(env).includes(String(id)); }

function adminPanelKb() {
  return { inline_keyboard: [
    [{ text: '📂 Открытые чаты', callback_data: 'admtickets' }],
    [{ text: '💳 Транзакции', callback_data: 'admtx' }],
    [{ text: '🎁 Промокоды', callback_data: 'admpromo' }],
    [{ text: '🔗 Рефералы', callback_data: 'admref' }],
    [{ text: '← Меню', callback_data: 'menu' }],
  ]};
}
// Мастер создания промокода — полностью кнопками, кроме самого кода (уникальная строка).
function promoTypeKb() {
  return { inline_keyboard: [
    [{ text: '🎁 Кредиты (анализы)', callback_data: 'ptype:credits' }],
    [{ text: '⏳ Безлимит (часы)', callback_data: 'ptype:hours' }],
    [{ text: '🎟 Скидка (%)', callback_data: 'ptype:discount' }],
    [{ text: '📣 Медиа-промо (% + скидка партнёру)', callback_data: 'ptype:media' }],
    [{ text: '← Промокоды', callback_data: 'admpromo' }],
  ]};
}
const PROMO_AMOUNT_PRESETS = { credits: [1, 3, 5, 10], hours: [24, 72, 168, 720], discount: [10, 15, 20, 25, 30, 50], media: [20, 25, 30, 40, 50] };
function promoAmountKb(type) {
  const fmt = (v) => (type === 'discount' || type === 'media') ? `${v}%` : type === 'hours' ? `${v}ч` : `${v}`;
  const rows = PROMO_AMOUNT_PRESETS[type].map((v) => ([{ text: fmt(v), callback_data: `pamt:${v}` }]));
  rows.push([{ text: '✏️ Другое число', callback_data: 'pamt:custom' }]);
  rows.push([{ text: '← Назад', callback_data: 'admpromoadd' }]);
  return { inline_keyboard: rows };
}
// Шаг 2 для медиа-промо: скидка покупателю (0 = без скидки).
const MEDIA_DISCOUNT_PRESETS = [0, 5, 10, 15, 20];
function mediaDiscountKb() {
  const rows = MEDIA_DISCOUNT_PRESETS.map((v) => ([{ text: v === 0 ? 'Без скидки' : `${v}%`, callback_data: `pmdisc:${v}` }]));
  rows.push([{ text: '✏️ Другое число', callback_data: 'pmdisc:custom' }]);
  return { inline_keyboard: rows };
}
const PROMO_USES_PRESETS = [1, 5, 10, 25, 50, 100];
function promoUsesKb() {
  const rows = PROMO_USES_PRESETS.map((v) => ([{ text: `${v}`, callback_data: `puses:${v}` }]));
  rows.push([{ text: '✏️ Другое число', callback_data: 'puses:custom' }]);
  return { inline_keyboard: rows };
}
// Текст описания начисления промокода — общий для списка и детальной карточки.
function promoGiftLabel(p) {
  if (p.mediaPct != null) {
    const earned = Math.round((p.revenueRub || 0) * p.mediaPct / 100);
    return `медиа-промо: ${p.mediaPct}% партнёру${p.discount ? `, скидка покупателю ${p.discount}%` : ''} — покупок: ${p.purchases || 0}, начислено ${earned}₽`;
  }
  if (p.credits) return `+${p.credits} анализ(ов)`;
  if (p.hours) return `безлимит ${p.hours}ч`;
  if (p.discount) return `скидка ${p.discount}%`;
  if (p.refcode) return `засчитать партнёру ${p.refcode}`;
  return '?';
}
async function promoListText(env) {
  const list = await env.RATE_LIMIT.list({ prefix: 'promo:' });
  const lines = [];
  for (const k of list.keys) {
    const raw = await env.RATE_LIMIT.get(k.name);
    if (!raw) continue;
    let p; try { p = JSON.parse(raw); } catch { continue; }
    const code = k.name.slice('promo:'.length);
    const used = p.max ? `${p.max - p.uses}/${p.max} использовано` : `осталось ${p.uses}`;
    lines.push(`🎟 ${code} — ${promoGiftLabel(p)} — ${used}`);
  }
  if (!lines.length) return '🎁 Активных промокодов нет.';
  return `🎁 Активные промокоды (${lines.length}):\n\n` + lines.join('\n');
}
// Одноразовая миграция старых промокодов «для медийки» (promo.refcode → ref:<CODE> с общей
// статистикой) в новый изолированный формат promo.mediaPct. Код и лимит активаций (uses/max)
// сохраняются как есть; % и накопленные purchases/revenueRub переносятся из ref:-объекта, на
// который ссылался промокод — ничего не обнуляется. Сам ref:-объект не трогаем (на случай если
// у него ещё есть отдельные клики по прямой ссылке) — просто отвязываем от него промокод.
async function migrateOldMediaPromos(env) {
  const list = await env.RATE_LIMIT.list({ prefix: 'promo:' });
  const migrated = [];
  const skipped = [];
  for (const k of list.keys) {
    const raw = await env.RATE_LIMIT.get(k.name);
    if (!raw) continue;
    let p; try { p = JSON.parse(raw); } catch { continue; }
    if (!p.refcode) continue;
    const code = k.name.slice('promo:'.length);
    const ref = await getRef(env, p.refcode);
    if (!ref) { skipped.push(`${code} (реф-код ${p.refcode} не найден)`); continue; }
    const migratedPromo = {
      uses: p.uses, max: p.max,
      mediaPct: ref.pct || 0,
      discount: ref.buyerPct || 0,
      revenueRub: ref.revenueRub || 0,
      purchases: ref.purchases || 0,
    };
    await env.RATE_LIMIT.put(k.name, JSON.stringify(migratedPromo), { expirationTtl: 60 * 60 * 24 * 90 });
    migrated.push(`${code}: ${ref.pct || 0}% медийке, скидка ${ref.buyerPct || 0}%, сохранено ${ref.purchases || 0} покупок / ${ref.revenueRub || 0}₽ оборота`);
  }
  if (!migrated.length && !skipped.length) return '🔁 Старых медиа-промо (refcode) не найдено — переносить нечего.';
  let out = migrated.length ? `✅ Перенесено (${migrated.length}):\n\n` + migrated.join('\n') : '✅ Переносить было нечего.';
  if (skipped.length) out += `\n\n⚠️ Пропущено:\n\n` + skipped.join('\n');
  return out;
}
// Список кодов кнопками — открыть детальную карточку с удалением/изменением количества.
async function promoManageKb(env) {
  const list = await env.RATE_LIMIT.list({ prefix: 'promo:' });
  const codes = list.keys.map((k) => k.name.slice('promo:'.length)).sort();
  const rows = codes.map((c) => ([{ text: `🎟 ${c}`, callback_data: `promoedit:${c}` }]));
  if (!rows.length) rows.push([{ text: 'Промокодов нет', callback_data: 'admpromo' }]);
  rows.push([{ text: '← Промокоды', callback_data: 'admpromo' }]);
  return { inline_keyboard: rows };
}
async function promoDetailText(env, code) {
  const raw = await env.RATE_LIMIT.get(`promo:${code}`);
  if (!raw) return `❌ Код ${code} не найден (возможно, уже удалён или истёк).`;
  let p; try { p = JSON.parse(raw); } catch { return `❌ Код ${code} повреждён.`; }
  const used = p.max ? `${p.max - p.uses}/${p.max} использовано (осталось ${p.uses})` : `осталось ${p.uses}`;
  return `🎟 <b>${code}</b>\n\n${promoGiftLabel(p)}\n${used}`;
}
function promoDetailKb(code) {
  return { inline_keyboard: [
    [{ text: '✏️ Изменить количество', callback_data: `promoqty:${code}` }],
    [{ text: '🗑 Удалить код', callback_data: `promodelask:${code}` }],
    [{ text: '← Все коды', callback_data: 'admpromomanage' }],
  ]};
}
async function promoLogText(env) {
  const list = await getList(env, 'promolog');
  if (!list.length) return '📜 Пока никто не вводил промокоды.';
  const line = (t) => {
    const d = new Date(t.ts).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const who = t.name || t.username ? `${t.name || ''}${t.username ? ' @' + t.username : ''}` : `id${t.tgid}`;
    return `${d} — <b>${t.code}</b> — ${who} (id ${t.tgid})`;
  };
  return `📜 Последние вводы промокодов (${list.length}):\n\n` + list.map(line).join('\n');
}
const ADMIN_BTN = '⚙️ Admin';
// Постоянная клавиатура внизу экрана — не пропадает между сообщениями,
// поэтому админу никогда не нужно печатать /admin или /close руками.
function adminReplyKb() {
  return { keyboard: [[{ text: ADMIN_BTN }]], resize_keyboard: true, is_persistent: true };
}
async function showTicketsKb(env) {
  const list = await getList(env, 'suptickets');
  if (!list.length) return { text: '📂 Открытых чатов нет.', kb: { inline_keyboard: [[{ text: '← Admin', callback_data: 'admin' }]] } };
  const rows = list.map(t => ([
    { text: `👤 ${t.name || t.uid}${t.username ? ' @' + t.username : ''} — ${t.preview}`, callback_data: `admopen:${t.uid}` },
    { text: '✖', callback_data: `admclose:${t.uid}` },
  ]));
  rows.push([{ text: '← Admin', callback_data: 'admin' }]);
  return { text: `📂 Открытые чаты (${list.length}):`, kb: { inline_keyboard: rows } };
}
async function txSummaryText(env) {
  const list = await getList(env, 'translog');
  if (!list.length) return '💳 Транзакций пока нет.';
  const top = list.slice(0, 20);
  // Lava.top/CryptoBot вебхуки не несут имя/юзернейм покупателя (только tgid) — подтягиваем
  // через getChat лениво, только для тех записей, где его нет.
  await Promise.all(top.map(async (t) => {
    if (t.name || t.username) return;
    const r = await tgApi(env, 'getChat', { chat_id: t.tgid });
    if (r.ok) { t.name = r.result.first_name || ''; t.username = r.result.username || ''; }
  }));
  const line = (t) => {
    const d = new Date(t.ts);
    const dt = d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    // Имя из Telegram может содержать < > & (популярное «<3»). Без экранирования
    // Telegram отклоняет ВСЁ сообщение с can't parse entities, а tgApi раньше
    // глотал эту ошибку — кнопка «крутилась» и ничего не показывала.
    const who = t.name || t.username
      ? `${escHtml(t.name || '')}${t.username ? ' @' + escHtml(t.username) : ''}`
      : `id${escHtml(t.tgid)}`;
    const price = t.method === 'stars' ? `${t.amount}⭐` : t.method === 'crypto' ? `${t.amount} ${escHtml(t.currency)}` : `${t.amount}₽`;
    const id = t.id ? ` — ID <code>${escHtml(t.id)}</code>` : '';
    const promo = t.promo ? ` — 🎟 ${escHtml(t.promo)}` : '';
    return `${dt} — ${who} — ${escHtml(t.pack)} — ${price} (${escHtml(t.method)})${id}${promo}`;
  };
  return `💳 Последние транзакции (${top.length}):\n\n` + top.map(line).join('\n');
}
// Ищет платёж по короткому ID среди последних 50 транзакций (translog) — не по всей истории,
// это на случай "клиент написал в саппорт с ID, найди что купил".
async function findOrderById(env, id) {
  const list = await getList(env, 'translog');
  const t = list.find((x) => x.id === id.toUpperCase());
  if (!t) return `❌ Заказ с ID ${id.toUpperCase()} не найден (ищем только среди последних 50 транзакций).`;
  if (!t.name && !t.username) {
    const r = await tgApi(env, 'getChat', { chat_id: t.tgid });
    if (r.ok) { t.name = r.result.first_name || ''; t.username = r.result.username || ''; }
  }
  const d = new Date(t.ts).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const who = t.name || t.username ? `${t.name || ''}${t.username ? ' @' + t.username : ''} (id ${t.tgid})` : `id ${t.tgid}`;
  const price = t.method === 'stars' ? `${t.amount}⭐` : t.method === 'crypto' ? `${t.amount} ${t.currency}` : `${t.amount}₽`;
  return `🔎 Заказ <code>${t.id}</code>\n\nПокупатель: ${who}\nТариф: ${t.pack}\nСумма: ${price} (${t.method})\nДата: ${d}`;
}
const SUP_FAQ = {
  ru: `Ты — вежливый саппорт сервиса FaceRate (facerate.ru) — это AI-оценка лица по канонам луксмаксинга (сайт + Telegram-бот).
Факты:
- Бесплатно: подписка на канал @wwwfacerateru даёт 1 бесплатный анализ в неделю.
- Платно: пакеты «1 анализ», «5 анализов», «безлимит на день», «безлимит на месяц». Оплата — Telegram Stars или криптой (через CryptoBot), цена в звёздах или рублях.
- Вход на сайте — через Telegram. После оплаты доступ появляется автоматически, обнови страницу.
- Промокоды: в боте кнопка «Ввести промокод»; коды бывают в розыгрышах в канале.
Отвечай кратко (2–4 предложения), на русском. Если вопрос про возврат денег, проблему с оплатой, доступ после оплаты, баг или что-то, в чём не уверен — не выдумывай, а попроси нажать «Позвать оператора».`,
  en: `You are the polite support agent for FaceRate (facerate.ru) — AI face rating by looksmaxxing canons (website + Telegram bot).
Facts:
- Free: subscribing to the @wwwfacerateru channel gives 1 free analysis per week.
- Paid: packages "1 analysis", "5 analyses", "day unlimited", "month unlimited". Payment via Telegram Stars or crypto (CryptoBot), priced in stars or rubles.
- Login on the site is via Telegram. After payment access appears automatically — refresh the page.
- Promo codes: the bot has an "Enter promo code" button; codes appear in channel giveaways.
Answer briefly (2–4 sentences), in English. For refunds, payment issues, access-after-payment, bugs, or anything you’re unsure about — do not make things up; ask them to tap "Call an operator".`,
};

function supportApi(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.SUPPORT_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json()).then((r) => {
    // Без этого отказ Telegram (битая HTML-разметка, слишком длинный текст)
    // уходил в тишину: кнопка «крутилась», а в логах было ровно «Ok».
    if (!r.ok) console.log('SUPPORT API FAIL', method, r.error_code, r.description);
    return r;
  }).catch((e) => {
    console.log('SUPPORT API THROW', method, e.message);
    return { ok: false, description: e.message };
  });
}

async function supportAI(env, question, L) {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}` },
      body: JSON.stringify({ model: 'x-ai/grok-4.3', max_tokens: 500, temperature: 0.3,
        messages: [{ role: 'system', content: SUP_FAQ[L] || SUP_FAQ.en }, { role: 'user', content: question || 'hi' }] }),
    });
    const d = await res.json();
    return d?.choices?.[0]?.message?.content || (L === 'ru' ? 'Не смог ответить — нажми «Позвать оператора».' : 'Could not answer — tap “Call an operator”.');
  } catch { return L === 'ru' ? 'Ошибка, попробуй позже или позови оператора.' : 'Error, try later or call an operator.'; }
}

async function forwardToAdmin(env, msg, L) {
  const b = SUP[L];
  const ids = adminIds(env);
  if (!ids.length) { await supportApi(env, 'sendMessage', { chat_id: msg.chat.id, text: b.noAdmin }); return; }
  const u = msg.from;
  await addTicket(env, u, msg.text || '[нетекстовое сообщение]');
  for (const admin of ids) {
    const sent = await supportApi(env, 'sendMessage', {
      chat_id: admin,
      text: `💬 ${u.first_name || ''} @${u.username || ''} (id ${u.id}):\n\n${msg.text || '[нетекстовое сообщение]'}\n\n↩️ Ответь реплаем, или открой «📂 Открытые чаты» в /admin.`,
    });
    if (sent.ok) await env.RATE_LIMIT.put(`supmap:${admin}:${sent.result.message_id}`, String(u.id), { expirationTtl: 60 * 60 * 24 * 3 });
  }
  await supportApi(env, 'sendMessage', { chat_id: msg.chat.id, text: b.sent });
}

// ─── Реферальные ссылки для медийных партнёров ───
// ref:КОД        — { label, pct, clicks, purchases, revenueRub, createdAt }, TTL нет (живёт пока не удалят).
// pct            — % от revenueRub, который причитается медийке (её реальная комиссия, не наш доход).
// refby:tgid     — код реферера, приаттачился при первом /start ref_КОД (first-touch, не перезаписывается).
async function refExists(env, code) { return !!(await env.RATE_LIMIT.get(`ref:${code}`)); }
async function getRef(env, code) {
  const raw = await env.RATE_LIMIT.get(`ref:${code}`);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function createRef(env, code, label, pct) {
  // buyerPct — скидка, которую получает покупатель, пришедший по этой ссылке (0 = без скидки).
  await env.RATE_LIMIT.put(`ref:${code}`, JSON.stringify({ label: label || '', pct: pct || 0, buyerPct: 0, clicks: 0, purchases: 0, revenueRub: 0, createdAt: Date.now() }));
}
async function setRefPct(env, code, pct) {
  const ref = await getRef(env, code);
  if (!ref) return false;
  ref.pct = pct;
  await env.RATE_LIMIT.put(`ref:${code}`, JSON.stringify(ref));
  return true;
}
async function setRefBuyerPct(env, code, pct) {
  const ref = await getRef(env, code);
  if (!ref) return false;
  ref.buyerPct = pct;
  await env.RATE_LIMIT.put(`ref:${code}`, JSON.stringify(ref));
  return true;
}
function refPayout(ref) { return Math.round((ref.revenueRub || 0) * (ref.pct || 0) / 100); }
// Скидка покупателя: приоритет у промокода (pendingDiscount), иначе — максимум из:
// (а) скидки по реф-ссылке, если пришёл по чужой ссылке, (б) скидки владельцу СВОЕЙ персональной
// ссылки, если по ней уже прошло 5+ покупок — тогда владелец сам покупает со скидкой.
// Персональные ссылки: как только по ссылке прошло 5 ЛЮБЫХ покупок (суммарно по ссылке, не только
// этого покупателя), дальнейшие покупки по ней получают скидку 10% на любой тариф.
const PERSONAL_REF_DISCOUNT_THRESHOLD = 5;
const PERSONAL_REF_DISCOUNT_PCT = 10;
const PERSONAL_REF_OWNER_DISCOUNT_PCT = 15;
async function buyerDiscountPct(env, tgid, packId) {
  const pd = await env.RATE_LIMIT.get(`pendingDiscount:${tgid}`);
  if (pd) return parseInt(pd, 10) || 0;
  let best = 0;
  const code = await env.RATE_LIMIT.get(`refby:${tgid}`);
  if (code) {
    const ref = await getRef(env, code);
    if (ref) best = Math.max(best, ref.personal ? ((ref.purchases || 0) >= PERSONAL_REF_DISCOUNT_THRESHOLD ? PERSONAL_REF_DISCOUNT_PCT : 0) : (ref.buyerPct || 0));
  }
  const myCode = await env.RATE_LIMIT.get(`myrefcode:${tgid}`);
  if (myCode) {
    const myRef = await getRef(env, myCode);
    if ((myRef?.purchases || 0) >= PERSONAL_REF_DISCOUNT_THRESHOLD) best = Math.max(best, PERSONAL_REF_OWNER_DISCOUNT_PCT);
  }
  return best;
}
function applyDiscount(amount, pct) { return pct > 0 ? Math.max(1, Math.round(amount * (100 - pct) / 100)) : amount; }

// ─── Персональная реферальная ссылка (каждый пользователь может сделать свою) ───
// myrefcode:tgid — код, который принадлежит этому пользователю (один на юзера, создаётся один раз).
// ref:<CODE> для такого кода дополнительно содержит personal:true и ownerTgid.
// Награда — НЕ % от выручки, а +1 анализ владельцу ссылки за каждую покупку любого тарифа по ней.
async function getOrCreateMyRef(env, tgid) {
  const existing = await env.RATE_LIMIT.get(`myrefcode:${tgid}`);
  if (existing) return existing;
  const code = 'U' + BigInt(tgid).toString(36).toUpperCase();
  await env.RATE_LIMIT.put(`myrefcode:${tgid}`, code);
  if (!(await refExists(env, code))) {
    await env.RATE_LIMIT.put(`ref:${code}`, JSON.stringify({
      label: '', pct: 0, buyerPct: 0, personal: true, ownerTgid: String(tgid),
      clicks: 0, purchases: 0, revenueRub: 0, creditsEarned: 0, createdAt: Date.now(),
    }));
  }
  return code;
}
async function myPersonalRefText(env, tgid, L) {
  const code = await getOrCreateMyRef(env, tgid);
  const r = await getRef(env, code) || {};
  const link = refLink(env, code);
  const left = Math.max(0, PERSONAL_REF_DISCOUNT_THRESHOLD - (r.purchases || 0));
  if (L === 'ru') {
    return `🔗 Твоя реферальная ссылка:\n${link}\n\n🎁 Приведи друга — и вы ОБА сразу получаете по 1 бесплатному анализу, как только он перейдёт по ссылке.\n\nЕсть и бонус за объём: после ${PERSONAL_REF_DISCOUNT_THRESHOLD} покупок по ссылке (суммарно) — тем, кто покупает по ней, скидка ${PERSONAL_REF_DISCOUNT_PCT}%, а ТЕБЕ САМОМУ на все свои покупки — скидка ${PERSONAL_REF_OWNER_DISCOUNT_PCT}%.\n\nПереходов: ${r.clicks || 0}\nПокупок: ${r.purchases || 0}${left > 0 ? `\nДо скидок: ещё ${left} покупок(и)` : `\nСкидки уже активны`}\nЗаработано анализов: ${r.creditsEarned || 0}`;
  }
  return `🔗 Your personal referral link:\n${link}\n\n🎁 Bring a friend — you BOTH instantly get 1 free analysis the moment they open the link.\n\nThere's also a volume bonus: once ${PERSONAL_REF_DISCOUNT_THRESHOLD} purchases have gone through this link (total), buyers get ${PERSONAL_REF_DISCOUNT_PCT}% off, and YOU get ${PERSONAL_REF_OWNER_DISCOUNT_PCT}% off all your own purchases.\n\nClicks: ${r.clicks || 0}\nPurchases: ${r.purchases || 0}${left > 0 ? `\nPurchases until discounts unlock: ${left}` : `\nDiscounts are already active`}\nAnalyses earned: ${r.creditsEarned || 0}`;
}
// Разовая ручная акция (21.07.2026): всем известным пользователям начисляем персональную
// скидку 15% на следующую покупку (не суммируется и не перетирает уже висящую БОЛЬШУЮ скидку —
// берём max) и уведомляем личным сообщением. Одноразовый HTTP-роут, защищён отдельным секретом
// BULK_ACTION_SECRET (не тем же, что остальные роуты) — предполагается снести после использования.
// Батч вместо одного гигантского цикла — предыдущая версия молча умирала в районе 144/3775
// (похоже на лимит выполнения Workers для waitUntil), зависая в статусе 'running' навсегда.
// Теперь каждый вызов обрабатывает не больше BATCH пользователей и ЗАПОМИНАЕТ, кого уже
// уведомил (bulkNotified:tgid) — можно смело дёргать эндпоинт повторно, продолжит с места
// остановки, а не будет слать дубли.
async function bulkDiscountStart(request, env, ctx) {
  let body; try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!env.BULK_ACTION_SECRET || body.secret !== env.BULK_ACTION_SECRET) return new Response('forbidden', { status: 403 });
  const pct = parseInt(body.pct, 10) || 15;
  const BATCH = 400;
  const ids = await collectAllUserIds(env);
  const todo = [];
  for (const id of ids) {
    if (!(await env.RATE_LIMIT.get(`bulkNotified:${id}`))) todo.push(id);
    if (todo.length >= BATCH) break;
  }
  await env.RATE_LIMIT.put('bulkDiscountResult', JSON.stringify({ status: 'running', batchSize: todo.length, totalKnown: ids.length, startedAt: Date.now() }));
  ctx.waitUntil(bulkDiscountRun(env, pct, todo, ids.length));
  return json({ status: 'started', pct, batchSize: todo.length, totalKnown: ids.length });
}
async function bulkDiscountRun(env, pct, todo, totalKnown) {
  // Упрощено для скорости (аудитория практически вся русскоязычная): без чтения текущей
  // скидки/языка на юзера — просто ставим pct и шлём русский текст. 3 операции на юзера
  // вместо 5 (было: get pendingDiscount, put pendingDiscount, get lang, sendMessage, put bulkNotified).
  const text = (finalPct) => `🎁 Тебе персонально начислена скидка ${finalPct}% на следующую покупку — уже применена, ничего вводить не нужно. Просто выбери тариф в «⭐ Купить анализы / безлимит», скидка сработает автоматически. Действует 30 дней.`;
  let sent = 0, failed = 0, discounted = 0;
  for (const id of todo) {
    try {
      await env.RATE_LIMIT.put(`pendingDiscount:${id}`, String(pct), { expirationTtl: 60 * 60 * 24 * 30 });
      discounted++;
      await tgApi(env, 'sendMessage', { chat_id: id, text: text(pct) });
      await env.RATE_LIMIT.put(`bulkNotified:${id}`, '1', { expirationTtl: 60 * 60 * 24 * 30 });
      sent++;
    } catch { failed++; }
    await new Promise((r) => setTimeout(r, 40));
  }
  await env.RATE_LIMIT.put('bulkDiscountResult', JSON.stringify({ status: 'batch_done', batch: todo.length, discounted, sent, failed, totalKnown, finishedAt: Date.now() }));
}

// Первое касание — фиксируем реферера за пользователем один раз и считаем клик по ссылке.
// Собирает уникальные tgid из всех KV-префиксов, где встречается id пользователя —
// используется только для /broadcast. Новых пользователей (после деплоя этой фичи) полностью
// покрывает user:tgid (пишется на каждое входящее сообщение); задним числом подтягиваем ещё
// из orders:/unlim:/credits:/qw:/lang: — так рассылка захватит и тех, кто писал боту раньше.
async function collectAllUserIds(env) {
  const ids = new Set();
  const prefixes = ['user:', 'orders:', 'unlim:', 'credits:', 'lang:'];
  for (const prefix of prefixes) {
    let cursor;
    do {
      const page = await env.RATE_LIMIT.list({ prefix, cursor });
      for (const k of page.keys) {
        const rest = k.name.slice(prefix.length);
        const id = rest.split(':')[0];
        if (/^\d+$/.test(id)) ids.add(id);
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
  let cursor;
  do {
    const page = await env.RATE_LIMIT.list({ prefix: 'qw:', cursor });
    for (const k of page.keys) {
      const parts = k.name.split(':'); // qw:tgid:weekBucket
      if (parts[1] && /^\d+$/.test(parts[1])) ids.add(parts[1]);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return [...ids];
}

async function attributeReferral(env, tgid, code) {
  const ref = await getRef(env, code);
  if (!ref) return; // код не создан админом — игнорируем мусорные ссылки
  if (ref.personal && String(ref.ownerTgid) === String(tgid)) return; // нельзя рефералить самого себя
  const already = await env.RATE_LIMIT.get(`refby:${tgid}`);
  if (already) return;
  await env.RATE_LIMIT.put(`refby:${tgid}`, code);
  ref.clicks = (ref.clicks || 0) + 1;
  let gaveJoinBonus = false;
  if (ref.personal) {
    // Мгновенная награда за переход по личной реф-ссылке: и другу, и владельцу ссылки — по 1 анализу.
    const friendCur = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
    await env.RATE_LIMIT.put(`credits:${tgid}`, String(friendCur + 1));
    const ownerCur = parseInt(await env.RATE_LIMIT.get(`credits:${ref.ownerTgid}`) || '0', 10);
    await env.RATE_LIMIT.put(`credits:${ref.ownerTgid}`, String(ownerCur + 1));
    ref.creditsEarned = (ref.creditsEarned || 0) + 1;
    gaveJoinBonus = true;
  }
  await env.RATE_LIMIT.put(`ref:${code}`, JSON.stringify(ref));
  return gaveJoinBonus;
}
// Выручка в рублях для отчёта партнёру — по фактически уплаченной сумме (с учётом скидки), если она
// известна и уже в рублях (card/rub/crypto); для stars (не рублёвая валюта) — приблизительно
// масштабируем номинал по факту оплаченных звёзд, чтобы скидка тоже отражалась пропорционально.
function packRevenueRub(pack, method, paidAmount) {
  if (!pack) return 0;
  if (method === 'card' || method === 'rub' || method === 'crypto') return paidAmount != null ? paidAmount : (pack.lavaRub || pack.rub || 0);
  if (method === 'stars' && pack.stars && paidAmount != null) return Math.round((pack.rub || 0) * paidAmount / pack.stars);
  return pack.rub || 0;
}
// Какой промокод (если был) привёл к этой покупке — только ДЛЯ ОТОБРАЖЕНИЯ в истории/статистике,
// не влияет на начисления (те уже посчитаны выше по pendingDiscount/pendingMediaPromo). Читаем
// pendingMediaPromo, НЕ удаляя его — это сделает trackMediaPromoPurchase сам чуть позже.
async function peekOrderPromoCode(env, tgid) {
  const media = await env.RATE_LIMIT.get(`pendingMediaPromo:${tgid}`);
  if (media) return media;
  const code = await env.RATE_LIMIT.get(`pendingPromoCodeForOrder:${tgid}`);
  if (code) await env.RATE_LIMIT.delete(`pendingPromoCodeForOrder:${tgid}`);
  return code || null;
}
// Медиа-промокод (тип «media», отдельный от ref:-системы) — если у покупателя есть отложенный
// код, засчитываем всю выручку/комиссию ЕМУ и возвращаем true, чтобы вызывающий код НЕ дёргал
// ещё и trackReferralPurchase — так одна покупка не оплачивается дважды двум разным медийкам.
async function trackMediaPromoPurchase(env, tgid, pack, method, paidAmount) {
  try {
    const code = await env.RATE_LIMIT.get(`pendingMediaPromo:${tgid}`);
    if (!code) return false;
    await env.RATE_LIMIT.delete(`pendingMediaPromo:${tgid}`);
    const raw = await env.RATE_LIMIT.get(`promo:${code}`);
    if (!raw) return true; // код удалили админом между активацией и оплатой — не начисляем никому
    const promo = JSON.parse(raw);
    if (promo.mediaPct == null) return true;
    promo.purchases = (promo.purchases || 0) + 1;
    promo.revenueRub = (promo.revenueRub || 0) + packRevenueRub(pack, method, paidAmount);
    await env.RATE_LIMIT.put(`promo:${code}`, JSON.stringify(promo), { expirationTtl: 60 * 60 * 24 * 90 });
    return true;
  } catch { return false; }
}
// Вызывается после любой успешной оплаты (Stars/ЮKassa, Lava.top, CryptoBot).
async function trackReferralPurchase(env, tgid, pack, method, paidAmount) {
  try {
    // pendingRefCode (из промокода «для медийки») перебивает обычную привязку по реф-ссылке —
    // именно эта покупка засчитается указанному в промокоде партнёру, а не тому, чья ссылка
    // была использована при первом заходе (если она вообще была).
    const override = await env.RATE_LIMIT.get(`pendingRefCode:${tgid}`);
    const code = override || await env.RATE_LIMIT.get(`refby:${tgid}`);
    if (!code) return;
    const ref = await getRef(env, code);
    if (!ref) return;
    ref.purchases = (ref.purchases || 0) + 1;
    if (ref.personal) {
      // Награда владельцу персональной ссылки — +1 анализ за любую покупку по ней (не % от суммы).
      if (String(ref.ownerTgid) !== String(tgid)) {
        const cur = parseInt(await env.RATE_LIMIT.get(`credits:${ref.ownerTgid}`) || '0', 10);
        await env.RATE_LIMIT.put(`credits:${ref.ownerTgid}`, String(cur + 1));
        ref.creditsEarned = (ref.creditsEarned || 0) + 1;
      }
    } else {
      ref.revenueRub = (ref.revenueRub || 0) + packRevenueRub(pack, method, paidAmount);
    }
    await env.RATE_LIMIT.put(`ref:${code}`, JSON.stringify(ref));
    if (override) await env.RATE_LIMIT.delete(`pendingRefCode:${tgid}`); // одноразовое переключение
  } catch { /* учёт рефералки не должен ронять оплату */ }
}
// Персональные ссылки (каждый пользователь может сделать свою в главном боте) не показываем
// в админ-панели медийок — иначе список зарастёт сотнями пользовательских кодов.
async function nonPersonalRefCodes(env) {
  const list = await env.RATE_LIMIT.list({ prefix: 'ref:' });
  const codes = list.keys.map((k) => k.name.slice(4)).sort();
  const flags = await Promise.all(codes.map((c) => getRef(env, c)));
  return codes.filter((_, i) => !flags[i]?.personal);
}
// Кликабельный список — по одной кнопке на код, вместо простыни текста.
async function refListKb(env, backCb) {
  const codes = await nonPersonalRefCodes(env);
  const rows = codes.map((code) => ([{ text: `🔗 ${code}`, callback_data: `refview:${code}` }]));
  rows.push([{ text: '+ Создать реф-ссылку', callback_data: 'admrefadd' }]);
  rows.push([{ text: '← Admin', callback_data: backCb || 'admin' }]);
  return { text: codes.length ? `🔗 Реферальные ссылки (${codes.length}) — жми на код для деталей:` : '🔗 Реферальных ссылок пока нет.', kb: { inline_keyboard: rows } };
}
function refLink(env, code) { return `https://t.me/${env.BOT_USERNAME || 'faceratepay_bot'}?start=ref_${code}`; }
// Полная карточка одного кода — ссылка + все цифры, для админа (в обоих ботах).
async function refDetailText(env, code) {
  const r = await getRef(env, code);
  if (!r) return `Код ${code} не найден.`;
  const owner = await refOwner(env, code);
  return `🔗 <b>${code}</b>${r.label ? ' — ' + r.label : ''}\n\n`
    + `Ссылка: ${refLink(env, code)}\n\n`
    + `Переходов: ${r.clicks || 0}\n`
    + `Покупок: ${r.purchases || 0}\n`
    + `Выручка: ~${r.revenueRub || 0}₽\n`
    + `Комиссия медийки: ${r.pct || 0}% → ~${refPayout(r)}₽\n`
    + `Скидка покупателю по ссылке: ${r.buyerPct || 0}%\n`
    + `Владелец в @FaceRateMedia_bot: ${owner ? 'id ' + owner : 'ещё не привязал'}\n`
    + `Создан: ${new Date(r.createdAt || 0).toLocaleDateString('ru-RU')}`;
}
async function refListText(env) {
  const codes = await nonPersonalRefCodes(env);
  if (!codes.length) return '🔗 Реферальных ссылок пока нет.';
  const lines = [];
  for (const code of codes) {
    const r = await getRef(env, code);
    if (!r) continue;
    lines.push(`🔗 ${code}${r.label ? ' (' + r.label + ')' : ''} — ${r.clicks || 0} перех., ${r.purchases || 0} покупок, ~${r.revenueRub || 0}₽, ${r.pct || 0}% → ~${refPayout(r)}₽ медийке`);
  }
  return `🔗 Реферальные ссылки (${lines.length}):\n\n` + lines.join('\n');
}

// ─── Привязка реф-кода к аккаунту медийщика (для бота @media-бот, самостоятельная статистика) ───
// refowner:КОД     — tgid медийщика, которому принадлежит код (один раз, не переписывается).
// refowned:tgid    — JSON-массив кодов, привязанных этим медийщиком (можно несколько).
async function refOwner(env, code) { return await env.RATE_LIMIT.get(`refowner:${code}`); }
async function ownedCodes(env, tgid) {
  const raw = await env.RATE_LIMIT.get(`refowned:${tgid}`);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
async function claimRef(env, tgid, code) {
  await env.RATE_LIMIT.put(`refowner:${code}`, String(tgid));
  const list = await ownedCodes(env, tgid);
  if (!list.includes(code)) list.push(code);
  await env.RATE_LIMIT.put(`refowned:${tgid}`, JSON.stringify(list));
}
// ─── Промокоды, которые медийщик создаёт СЕБЕ сам в @media-боте (без админа) ───
// promoowned:tgid — JSON-массив кодов, созданных этим медийщиком. % медийке (mediaPct)
// ВСЕГДА наследуется от его уже привязанного реф-кода (ref.pct) — сам медийщик процент
// себе назначить не может, только выбирает скидку покупателю и текст самого кода.
async function ownedPromoCodes(env, tgid) {
  const raw = await env.RATE_LIMIT.get(`promoowned:${tgid}`);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
async function addOwnedPromo(env, tgid, code) {
  const list = await ownedPromoCodes(env, tgid);
  if (!list.includes(code)) list.push(code);
  await env.RATE_LIMIT.put(`promoowned:${tgid}`, JSON.stringify(list));
}
// ─── Заработок и выплаты медийщика — считаем ОБА источника (реф-ссылки + свои промокоды)
// в одну сумму, чтобы «доступно к выводу» было честным итогом, а не двумя разрозненными числами. ───
const PAYOUT_MIN_RUB = 100;
async function myPaidOut(env, tgid) { return parseInt(await env.RATE_LIMIT.get(`mediaPaidOut:${tgid}`) || '0', 10); }
async function myEarnedTotal(env, tgid) {
  let total = 0;
  for (const code of await ownedCodes(env, tgid)) {
    const r = await getRef(env, code);
    if (r) total += refPayout(r);
  }
  for (const code of await ownedPromoCodes(env, tgid)) {
    const raw = await env.RATE_LIMIT.get(`promo:${code}`);
    if (!raw) continue;
    let p; try { p = JSON.parse(raw); } catch { continue; }
    total += Math.round((p.revenueRub || 0) * (p.mediaPct || 0) / 100);
  }
  return total;
}
// Резервируем уже поданные, но ещё не одобренные заявки этого же медийщика — иначе можно
// подать несколько заявок подряд, каждая по отдельности укладывается в баланс, а вместе
// в сумме превышают заработанное (если админ одобрит все).
async function myPendingPayoutTotal(env, tgid) {
  const pending = await pendingPayouts(env);
  return pending.filter((p) => String(p.tgid) === String(tgid)).reduce((s, p) => s + p.amount, 0);
}
async function myAvailableBalance(env, tgid) {
  const reserved = await myPendingPayoutTotal(env, tgid);
  return Math.max(0, (await myEarnedTotal(env, tgid)) - (await myPaidOut(env, tgid)) - reserved);
}
async function myEarningsText(env, tgid) {
  const refCodes = await ownedCodes(env, tgid);
  const promoCodes = await ownedPromoCodes(env, tgid);
  if (!refCodes.length && !promoCodes.length) {
    return '📊 У тебя пока нет привязанных кодов. Нажми «🔑 Привязать код» и отправь код, который тебе выдали.';
  }
  const lines = [];
  let total = 0;
  for (const code of refCodes) {
    const r = await getRef(env, code);
    if (!r) continue;
    const payout = refPayout(r);
    total += payout;
    lines.push(`🔗 ${code} — ${r.clicks || 0} переходов, ${r.purchases || 0} покупок\nЗаработано: ~${payout}₽ (${r.pct || 0}% от ~${r.revenueRub || 0}₽)`);
  }
  for (const code of promoCodes) {
    const raw = await env.RATE_LIMIT.get(`promo:${code}`);
    if (!raw) continue;
    let p; try { p = JSON.parse(raw); } catch { continue; }
    const earned = Math.round((p.revenueRub || 0) * (p.mediaPct || 0) / 100);
    total += earned;
    lines.push(`🎟 ${code} — ${p.purchases || 0} покупок по промокоду\nЗаработано: ~${earned}₽ (${p.mediaPct || 0}% от ~${p.revenueRub || 0}₽)${p.discount ? `, скидка покупателю ${p.discount}%` : ''}`);
  }
  const paid = await myPaidOut(env, tgid);
  const reserved = await myPendingPayoutTotal(env, tgid);
  const available = Math.max(0, total - paid - reserved);
  return `📊 Твоя статистика:\n\n` + lines.join('\n\n') +
    `\n\n💰 Всего заработано: ~${total}₽\n💸 Уже выведено: ${paid}₽` +
    (reserved > 0 ? `\n⏳ В заявках на рассмотрении: ${reserved}₽` : '') +
    `\n✅ Доступно к выводу: ${available}₽`;
}
// ─── Заявки на вывод ─── payout:<ID> — сама заявка; payoutqueue — JSON-массив ID
// заявок в статусе pending (для панели админа). Списание с баланса медийщика
// (mediaPaidOut:tgid) происходит ТОЛЬКО при одобрении — до этого заявка ни на что
// не влияет и её можно отклонить без последствий.
async function createPayoutRequest(env, tgid, amount, requisites) {
  const id = genOrderId();
  const req = { id, tgid: String(tgid), amount, requisites, ts: Date.now(), status: 'pending' };
  await env.RATE_LIMIT.put(`payout:${id}`, JSON.stringify(req), { expirationTtl: 60 * 60 * 24 * 90 });
  const queue = await getList(env, 'payoutqueue');
  queue.unshift(id);
  await putList(env, 'payoutqueue', queue.slice(0, 50));
  return req;
}
async function pendingPayouts(env) {
  const queue = await getList(env, 'payoutqueue');
  const pending = [];
  for (const id of queue) {
    const raw = await env.RATE_LIMIT.get(`payout:${id}`);
    if (!raw) continue;
    const r = JSON.parse(raw);
    if (r.status === 'pending') pending.push(r);
  }
  return pending;
}
async function payoutQueueKb(env) {
  const pending = await pendingPayouts(env);
  if (!pending.length) return { text: '💳 Заявок на вывод в ожидании нет.', kb: { inline_keyboard: [[{ text: '← Меню', callback_data: 'menu' }]] } };
  const line = (r) => {
    const d = new Date(r.ts).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `💳 <b>${r.id}</b> — ${r.amount}₽ — id ${r.tgid} — ${d}\nРеквизиты: ${r.requisites}`;
  };
  const rows = pending.map((r) => ([
    { text: `✅ ${r.id} (${r.amount}₽)`, callback_data: `payoutapprove:${r.id}` },
    { text: '❌', callback_data: `payoutreject:${r.id}` },
  ]));
  rows.push([{ text: '← Меню', callback_data: 'menu' }]);
  return { text: `💳 Заявки на вывод в ожидании (${pending.length}):\n\n` + pending.map(line).join('\n\n'), kb: { inline_keyboard: rows } };
}
async function approvePayout(env, id) {
  const raw = await env.RATE_LIMIT.get(`payout:${id}`);
  if (!raw) return { ok: false, text: `❌ Заявка ${id} не найдена.` };
  const r = JSON.parse(raw);
  if (r.status !== 'pending') return { ok: false, text: `⚠️ Заявка ${id} уже обработана (${r.status}).` };
  r.status = 'approved';
  await env.RATE_LIMIT.put(`payout:${id}`, JSON.stringify(r), { expirationTtl: 60 * 60 * 24 * 90 });
  const paid = await myPaidOut(env, r.tgid);
  await env.RATE_LIMIT.put(`mediaPaidOut:${r.tgid}`, String(paid + r.amount));
  return { ok: true, text: `✅ Заявка ${id} одобрена, ${r.amount}₽ списано с баланса id ${r.tgid}.`, tgid: r.tgid, amount: r.amount };
}
async function rejectPayout(env, id) {
  const raw = await env.RATE_LIMIT.get(`payout:${id}`);
  if (!raw) return { ok: false, text: `❌ Заявка ${id} не найдена.` };
  const r = JSON.parse(raw);
  if (r.status !== 'pending') return { ok: false, text: `⚠️ Заявка ${id} уже обработана (${r.status}).` };
  r.status = 'rejected';
  await env.RATE_LIMIT.put(`payout:${id}`, JSON.stringify(r), { expirationTtl: 60 * 60 * 24 * 90 });
  return { ok: true, text: `❌ Заявка ${id} отклонена, баланс id ${r.tgid} не тронут.`, tgid: r.tgid, amount: r.amount };
}
function mediaMenuKb(isAdmin) {
  const rows = [
    [{ text: '🔑 Привязать код', callback_data: 'claim' }],
    [{ text: '➕ Создать промокод', callback_data: 'newpromo' }],
    [{ text: '📊 Моя статистика', callback_data: 'mystats' }],
    [{ text: '💸 Запросить вывод', callback_data: 'withdraw' }],
  ];
  if (isAdmin) {
    rows.push([{ text: '📋 Все рефералки', callback_data: 'alladmin' }]);
    rows.push([{ text: '💳 Заявки на вывод', callback_data: 'payoutqueue' }]);
  }
  return { inline_keyboard: rows };
}
function mediaApi(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.MEDIA_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json()).catch(e => ({ ok: false, description: e.message }));
}
// Бот для медийных партнёров: привязывают выданный им реф-код и сами следят за статистикой
// (переходы/покупки/выручка), без обращения в поддержку каждый раз.
async function mediaWebhook(request, env) {
  if (env.MEDIA_WEBHOOK_SECRET && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.MEDIA_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  let upd; try { upd = await request.json(); } catch { return new Response('ok'); }

  if (upd.callback_query) {
    const cq = upd.callback_query;
    const chat = cq.message.chat.id, tgid = String(cq.from.id), data = cq.data || '';
    const isAdmin = isAdminId(env, tgid);
    const reply = (text, kb, extra) => editOrSend((m, bd) => mediaApi(env, m, bd), chat, cq.message.message_id, text, kb, extra);
    await mediaApi(env, 'answerCallbackQuery', { callback_query_id: cq.id });
    if (data === 'claim') {
      await env.RATE_LIMIT.put(`medwait:${tgid}`, '1', { expirationTtl: 600 });
      await reply('🔑 Отправь одним сообщением код, который тебе дали (например ANNA).');
    } else if (data === 'mystats') {
      await reply(await myEarningsText(env, tgid), mediaMenuKb(isAdmin));
    } else if (data === 'newpromo') {
      const codes = await ownedCodes(env, tgid);
      if (!codes.length) {
        await reply('⚠️ Сначала привяжи свой реф-код через «🔑 Привязать код» — процент для промокода наследуется от него.', mediaMenuKb(isAdmin));
        return new Response('ok');
      }
      if (codes.length === 1) {
        await env.RATE_LIMIT.put(`medpromowiz:${tgid}`, JSON.stringify({ baseCode: codes[0] }), { expirationTtl: 600 });
        await reply('🎟 Скидка покупателю по этому промокоду?', mediaDiscountKb());
      } else {
        const rows = codes.map((c) => ([{ text: c, callback_data: `newpromobase:${c}` }]));
        rows.push([{ text: '← Меню', callback_data: 'menu' }]);
        await reply('🔗 На основе какого твоего кода создать промокод? (комиссия наследуется от него)', { inline_keyboard: rows });
      }
    } else if (data.startsWith('newpromobase:')) {
      const baseCode = data.slice(13);
      if (!(await ownedCodes(env, tgid)).includes(baseCode)) { await reply('⚠️ Это не твой код.', mediaMenuKb(isAdmin)); return new Response('ok'); }
      await env.RATE_LIMIT.put(`medpromowiz:${tgid}`, JSON.stringify({ baseCode }), { expirationTtl: 600 });
      await reply('🎟 Скидка покупателю по этому промокоду?', mediaDiscountKb());
    } else if (data.startsWith('pmdisc:')) {
      const wizRaw = await env.RATE_LIMIT.get(`medpromowiz:${tgid}`);
      if (!wizRaw) { await reply('⚠️ Сессия истекла, начни заново через «➕ Создать промокод».', mediaMenuKb(isAdmin)); return new Response('ok'); }
      const wiz = JSON.parse(wizRaw);
      const val = data.slice(7);
      if (val === 'custom') {
        await env.RATE_LIMIT.put(`medpromodiscwait:${tgid}`, '1', { expirationTtl: 600 });
        await reply('✏️ Отправь число от 0 до 30 одним сообщением.');
      } else {
        wiz.discount = parseInt(val, 10);
        await env.RATE_LIMIT.put(`medpromowiz:${tgid}`, JSON.stringify(wiz), { expirationTtl: 600 });
        await env.RATE_LIMIT.put(`medpromocodewait:${tgid}`, '1', { expirationTtl: 600 });
        await reply('🔤 Отправь код одним словом (например ANNA10).');
      }
    } else if (data === 'withdraw') {
      const available = await myAvailableBalance(env, tgid);
      if (available < PAYOUT_MIN_RUB) {
        await reply(`⚠️ Доступно к выводу: ${available}₽. Минимальная сумма вывода — ${PAYOUT_MIN_RUB}₽.`, mediaMenuKb(isAdmin));
        return new Response('ok');
      }
      await env.RATE_LIMIT.put(`medwithdrawamtwait:${tgid}`, '1', { expirationTtl: 600 });
      await reply(`💸 Доступно к выводу: ${available}₽.\n\nСколько рублей вывести? (минимум ${PAYOUT_MIN_RUB}₽)`);
    } else if (data === 'payoutqueue' && isAdmin) {
      const { text: pt, kb } = await payoutQueueKb(env);
      await reply(pt, kb, { parse_mode: 'HTML' });
    } else if (data.startsWith('payoutapprove:') && isAdmin) {
      const id = data.slice(14);
      const res = await approvePayout(env, id);
      const { text: pt, kb } = await payoutQueueKb(env);
      await reply(res.text + '\n\n' + pt, kb, { parse_mode: 'HTML' });
      if (res.ok) await mediaApi(env, 'sendMessage', { chat_id: res.tgid, text: `✅ Твоя заявка на вывод ${res.amount}₽ одобрена и будет отправлена по указанным реквизитам.` });
    } else if (data.startsWith('payoutreject:') && isAdmin) {
      const id = data.slice(13);
      const res = await rejectPayout(env, id);
      const { text: pt, kb } = await payoutQueueKb(env);
      await reply(res.text + '\n\n' + pt, kb, { parse_mode: 'HTML' });
      if (res.ok) await mediaApi(env, 'sendMessage', { chat_id: res.tgid, text: `❌ Твоя заявка на вывод ${res.amount}₽ отклонена. Напиши мне, если это ошибка.` });
    } else if (data === 'alladmin' && isAdmin) {
      const { text: rt, kb } = await refListKb(env, 'alladmin');
      kb.inline_keyboard[kb.inline_keyboard.length - 1] = [{ text: '← Меню', callback_data: 'menu' }];
      await reply(rt, kb);
    } else if (data.startsWith('refview:') && isAdmin) {
      await reply(await refDetailText(env, data.slice(8)), { inline_keyboard: [[{ text: '← Все рефералки', callback_data: 'alladmin' }]] }, { parse_mode: 'HTML' });
    } else if (data === 'menu') {
      await reply('👋 Меню:', mediaMenuKb(isAdmin));
    }
    return new Response('ok');
  }

  const msg = upd.message;
  if (!msg || !msg.from || msg.from.is_bot) return new Response('ok');
  const chat = msg.chat.id, tgid = String(msg.from.id);
  const text = (msg.text || '').trim();
  const isAdmin = isAdminId(env, tgid);

  if (text === '/start' || text === '/menu') {
    await mediaApi(env, 'sendMessage', {
      chat_id: chat,
      text: '👋 Привет! Это бот для партнёров FaceRate.\n\nПривяжи свой реф-код, чтобы видеть переходы, покупки и выручку по своей ссылке в любой момент.',
      reply_markup: mediaMenuKb(isAdmin),
    });
    return new Response('ok');
  }

  if (await env.RATE_LIMIT.get(`medwait:${tgid}`)) {
    await env.RATE_LIMIT.delete(`medwait:${tgid}`);
    const code = text.replace(/^ref_/i, '').toUpperCase().trim();
    if (!/^[A-Z0-9_-]{1,40}$/.test(code) || !(await refExists(env, code))) {
      await mediaApi(env, 'sendMessage', { chat_id: chat, text: '❌ Такого кода нет. Проверь и попробуй ещё раз через «🔑 Привязать код».', reply_markup: mediaMenuKb(isAdmin) });
      return new Response('ok');
    }
    const owner = await refOwner(env, code);
    if (owner && owner !== tgid) {
      await mediaApi(env, 'sendMessage', { chat_id: chat, text: '❌ Этот код уже привязан к другому аккаунту. Напиши в поддержку, если это ошибка.', reply_markup: mediaMenuKb(isAdmin) });
      return new Response('ok');
    }
    await claimRef(env, tgid, code);
    await mediaApi(env, 'sendMessage', { chat_id: chat, text: `✅ Код ${code} привязан к тебе!\n\n` + await myEarningsText(env, tgid), reply_markup: mediaMenuKb(isAdmin) });
    return new Response('ok');
  }

  if (await env.RATE_LIMIT.get(`medpromodiscwait:${tgid}`)) {
    await env.RATE_LIMIT.delete(`medpromodiscwait:${tgid}`);
    const wizRaw = await env.RATE_LIMIT.get(`medpromowiz:${tgid}`);
    if (!wizRaw) { await mediaApi(env, 'sendMessage', { chat_id: chat, text: '⚠️ Сессия истекла, начни заново.', reply_markup: mediaMenuKb(isAdmin) }); return new Response('ok'); }
    const n = parseInt(text, 10);
    if (!Number.isFinite(n) || n < 0 || n > 30) {
      await mediaApi(env, 'sendMessage', { chat_id: chat, text: '⚠️ Нужно число от 0 до 30.', reply_markup: mediaMenuKb(isAdmin) });
      return new Response('ok');
    }
    const wiz = JSON.parse(wizRaw);
    wiz.discount = n;
    await env.RATE_LIMIT.put(`medpromowiz:${tgid}`, JSON.stringify(wiz), { expirationTtl: 600 });
    await env.RATE_LIMIT.put(`medpromocodewait:${tgid}`, '1', { expirationTtl: 600 });
    await mediaApi(env, 'sendMessage', { chat_id: chat, text: '🔤 Отправь код одним словом (например ANNA10).' });
    return new Response('ok');
  }

  if (await env.RATE_LIMIT.get(`medpromocodewait:${tgid}`)) {
    await env.RATE_LIMIT.delete(`medpromocodewait:${tgid}`);
    const wizRaw = await env.RATE_LIMIT.get(`medpromowiz:${tgid}`);
    await env.RATE_LIMIT.delete(`medpromowiz:${tgid}`);
    if (!wizRaw) { await mediaApi(env, 'sendMessage', { chat_id: chat, text: '⚠️ Сессия истекла, начни заново.', reply_markup: mediaMenuKb(isAdmin) }); return new Response('ok'); }
    const wiz = JSON.parse(wizRaw);
    const code = text.trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
      await mediaApi(env, 'sendMessage', { chat_id: chat, text: '⚠️ Код может быть только латиницей/цифрами, 2-32 символа.', reply_markup: mediaMenuKb(isAdmin) });
      return new Response('ok');
    }
    if (await env.RATE_LIMIT.get(`promo:${code}`)) {
      await mediaApi(env, 'sendMessage', { chat_id: chat, text: `⚠️ Код ${code} уже занят, попробуй другой через «➕ Создать промокод».`, reply_markup: mediaMenuKb(isAdmin) });
      return new Response('ok');
    }
    const baseRef = await getRef(env, wiz.baseCode);
    const pct = baseRef?.pct || 0;
    const promo = { uses: 9999, max: 9999, mediaPct: pct, discount: wiz.discount || 0, revenueRub: 0, purchases: 0, ownerTgid: tgid };
    await env.RATE_LIMIT.put(`promo:${code}`, JSON.stringify(promo), { expirationTtl: 60 * 60 * 24 * 90 });
    await addOwnedPromo(env, tgid, code);
    await mediaApi(env, 'sendMessage', {
      chat_id: chat,
      text: `✅ Промокод ${code} создан!\n\nОтдавай его своей аудитории — при вводе в главном боте (@faceratepay_bot → «🎁 Ввести промокод») он даст${wiz.discount ? ` скидку ${wiz.discount}%` : ''} покупателю, а тебе — ${pct}% с этой покупки.\n\n` + await myEarningsText(env, tgid),
      reply_markup: mediaMenuKb(isAdmin),
    });
    return new Response('ok');
  }

  if (await env.RATE_LIMIT.get(`medwithdrawamtwait:${tgid}`)) {
    await env.RATE_LIMIT.delete(`medwithdrawamtwait:${tgid}`);
    const available = await myAvailableBalance(env, tgid);
    const amount = parseInt(text.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(amount) || amount < PAYOUT_MIN_RUB) {
      await mediaApi(env, 'sendMessage', { chat_id: chat, text: `⚠️ Минимальная сумма вывода — ${PAYOUT_MIN_RUB}₽. Попробуй ещё раз через «💸 Запросить вывод».`, reply_markup: mediaMenuKb(isAdmin) });
      return new Response('ok');
    }
    if (amount > available) {
      await mediaApi(env, 'sendMessage', { chat_id: chat, text: `⚠️ Доступно только ${available}₽ — ты запросил больше. Попробуй ещё раз через «💸 Запросить вывод».`, reply_markup: mediaMenuKb(isAdmin) });
      return new Response('ok');
    }
    await env.RATE_LIMIT.put(`medwithdrawreqwait:${tgid}`, String(amount), { expirationTtl: 600 });
    await mediaApi(env, 'sendMessage', { chat_id: chat, text: '💳 Отправь реквизиты для перевода одним сообщением (карта/телефон/что угодно).' });
    return new Response('ok');
  }

  if (await env.RATE_LIMIT.get(`medwithdrawreqwait:${tgid}`)) {
    const amountRaw = await env.RATE_LIMIT.get(`medwithdrawreqwait:${tgid}`);
    await env.RATE_LIMIT.delete(`medwithdrawreqwait:${tgid}`);
    const amount = parseInt(amountRaw, 10);
    // Пересчитываем баланс на момент подтверждения — вдруг он успел измениться (например
    // уже запросил вывод параллельно) или уйти в минус из-за одобренной другой заявки.
    const available = await myAvailableBalance(env, tgid);
    if (!text.trim() || amount > available) {
      await mediaApi(env, 'sendMessage', { chat_id: chat, text: `⚠️ Что-то пошло не так (доступно ${available}₽). Начни заново через «💸 Запросить вывод».`, reply_markup: mediaMenuKb(isAdmin) });
      return new Response('ok');
    }
    const req = await createPayoutRequest(env, tgid, amount, text.trim().slice(0, 300));
    await mediaApi(env, 'sendMessage', { chat_id: chat, text: `✅ Заявка ${req.id} на вывод ${amount}₽ отправлена, жди одобрения.`, reply_markup: mediaMenuKb(isAdmin) });
    for (const adminId of adminIds(env)) {
      await mediaApi(env, 'sendMessage', {
        chat_id: adminId,
        text: `💳 Новая заявка на вывод\n\n<b>${req.id}</b> — ${amount}₽ — id ${tgid}\nРеквизиты: ${req.requisites}`,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '✅ Одобрить', callback_data: `payoutapprove:${req.id}` }, { text: '❌ Отклонить', callback_data: `payoutreject:${req.id}` }]] },
      });
    }
    return new Response('ok');
  }

  await mediaApi(env, 'sendMessage', { chat_id: chat, text: '👋 Используй кнопки ниже.', reply_markup: mediaMenuKb(isAdmin) });
  return new Response('ok');
}

// ─── Тикеты (открытые обращения) и лог транзакций — общие JSON-списки в KV ───
async function getList(env, key) {
  const raw = await env.RATE_LIMIT.get(key);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
async function putList(env, key, list, ttl) {
  await env.RATE_LIMIT.put(key, JSON.stringify(list), ttl ? { expirationTtl: ttl } : undefined);
}
async function addTicket(env, u, preview) {
  const list = (await getList(env, 'suptickets')).filter(t => t.uid !== u.id);
  list.unshift({ uid: u.id, name: u.first_name || '', username: u.username || '', preview: String(preview).slice(0, 60), ts: Date.now() });
  await putList(env, 'suptickets', list.slice(0, 30));
}
async function removeTicket(env, uid) {
  const list = (await getList(env, 'suptickets')).filter(t => t.uid !== Number(uid));
  await putList(env, 'suptickets', list);
}
async function logTx(env, entry) {
  const list = await getList(env, 'translog');
  list.unshift({ ...entry, ts: Date.now() });
  await putList(env, 'translog', list.slice(0, 3000));
}
// Короткий ID заказа — даём покупателю в подтверждении, он же виден админу в транзакциях,
// чтобы можно было сослаться на конкретный платёж в переписке с поддержкой.
function genOrderId() { return crypto.randomUUID().slice(0, 8).toUpperCase(); }
// Пишет и в общий лог транзакций (для админа), и в личную историю заказов покупателя.
async function recordOrder(env, entry) {
  const id = entry.id || genOrderId();
  const full = { ...entry, id };
  await logTx(env, full);
  const key = `orders:${entry.tgid}`;
  const list = await getList(env, key);
  const isFirst = list.length === 0;
  list.unshift({ ...full, ts: Date.now() });
  await putList(env, key, list.slice(0, 20), 60 * 60 * 24 * 365);
  // Постоянный флаг «хоть раз реально покупал» — даёт полный (не тизерный) бесплатный
  // анализ раз в 3 дня вместо тизера раз в неделю (см. analyze()). Без TTL.
  await env.RATE_LIMIT.put(`everBought:${entry.tgid}`, '1');
  return { id, isFirst };
}

// Автопромо: 20% на следующую покупку после самой первой — начисляется через тот же
// механизм pendingDiscount, что и ручные промокоды/рефералка (buyerDiscountPct его подхватит).
// TTL длиннее обычных 24ч (30 дней), т.к. это награда, а не срочный купон.
const FIRST_BUY_DISCOUNT_PCT = 20;
// Не плюсуется и не перетирает уже висящую скидку (промокод/рефералка) — если там уже
// что-то есть, оставляем как есть, чтобы не срезать более щедрую скидку и не задваивать.
async function grantFirstPurchaseBonus(env, tgid) {
  const existing = await env.RATE_LIMIT.get(`pendingDiscount:${tgid}`);
  if (existing) return false;
  await env.RATE_LIMIT.put(`pendingDiscount:${tgid}`, String(FIRST_BUY_DISCOUNT_PCT), { expirationTtl: 60 * 60 * 24 * 30 });
  return true;
}
async function ordersText(env, tgid, L) {
  const list = await getList(env, `orders:${tgid}`);
  if (!list.length) return L === 'ru' ? '📦 Заказов пока нет.' : '📦 No orders yet.';
  const methodName = { stars: '⭐', rub: '💳', sbp: '📲', crypto: '🪙', card: '💳' };
  const line = (o) => {
    const d = new Date(o.ts).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const price = o.method === 'stars' ? `${o.amount}⭐` : `${o.amount} ${o.currency || 'RUB'}`;
    return `${methodName[o.method] || ''} ${packLabelById(o.pack, L)} — ${price} — ${d}\nID: <code>${o.id}</code>`;
  };
  const head = L === 'ru' ? `📦 Твои заказы (${list.length}):\n\n` : `📦 Your orders (${list.length}):\n\n`;
  const foot = L === 'ru' ? '\n\nЕсть вопрос по заказу? Напиши в поддержку и укажи ID.' : '\n\nQuestion about an order? Message support and quote the ID.';
  return head + list.map(line).join('\n\n') + foot;
}
function packLabelById(packId, L) { const p = PACKS[packId]; return p ? packLabel(p, L) : (packId || '?'); }

async function supportWebhook(request, env) {
  if (env.SUPPORT_WEBHOOK_SECRET && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.SUPPORT_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  let upd; try { upd = await request.json(); } catch { return new Response('ok'); }

  // Кнопки меню саппорт-бота.
  if (upd.callback_query) {
    const cq = upd.callback_query;
    const chat = cq.message.chat.id, fromId = String(cq.from.id), data = cq.data || '';
    const reply = (text, kb, extra) => editOrSend((m, bd) => supportApi(env, m, bd), chat, cq.message.message_id, text, kb, extra);
    await supportApi(env, 'answerCallbackQuery', { callback_query_id: cq.id });
    const isAdmin = isAdminId(env, fromId);
    let L = await userLang(env, cq.from.id);
    if (data === 'lang:ru' || data === 'lang:en') {
      L = data.slice(5);
      await env.RATE_LIMIT.put(`lang:${fromId}`, L);
      await reply(SUP[L].langSet, supMenuKb(L, isAdmin));
    } else if (data === 'menu') {
      await reply(SUP[L].menu, supMenuKb(L, isAdmin));
    } else if (data === 'faq') {
      await reply(SUP[L].faq, { inline_keyboard: [[{ text: SUP[L].human, callback_data: 'human' }], [{ text: SUP[L].kbBack, callback_data: 'menu' }]] });
    } else if (data === 'human') {
      await env.RATE_LIMIT.put(`suphuman:${fromId}`, '1', { expirationTtl: 60 * 60 * 24 });
      await reply(SUP[L].humanOn);
      const ids = adminIds(env);
      if (ids.length) {
        const u = cq.from;
        await addTicket(env, u, '(нажал «Позвать оператора»)');
        for (const admin of ids) {
          await supportApi(env, 'sendMessage', { chat_id: admin, text: `🆘 ${u.first_name || ''} @${u.username || ''} (id ${fromId}) просит оператора.`, reply_markup: { inline_keyboard: [[{ text: '💬 Открыть чат', callback_data: `admopen:${fromId}` }]] } });
        }
      }
    } else if (data === 'admin' && isAdmin) {
      await reply('⚙️ Панель модератора:', adminPanelKb());
    } else if (data === 'admtickets' && isAdmin) {
      const { text: tt, kb } = await showTicketsKb(env);
      await reply(tt, kb);
    } else if (data === 'admtx' && isAdmin) {
      {
        const txKb = { inline_keyboard: [[{ text: '🔎 Найти по ID', callback_data: 'admfindtx' }], [{ text: '← Admin', callback_data: 'admin' }]] };
        const txTxt = await txSummaryText(env);
        const txRes = await reply(txTxt, txKb, { parse_mode: 'HTML' });
        // Если Telegram всё же не принял разметку — шлём обычным текстом.
        // Лучше без моноширинных ID, чем пустой экран.
        if (!txRes?.ok) await reply(txTxt.replace(/<\/?code>/g, ''), txKb);
      }
    } else if (data === 'admpromo' && isAdmin) {
      await reply(await promoListText(env), { inline_keyboard: [
        [{ text: '+ Добавить промокод', callback_data: 'admpromoadd' }],
        [{ text: '🗑 Управление кодами', callback_data: 'admpromomanage' }],
        [{ text: '📜 История вводов', callback_data: 'admpromolog' }],
        [{ text: '🔁 Перенести старые медиа-промо', callback_data: 'admpromomigrate' }],
        [{ text: '← Admin', callback_data: 'admin' }],
      ] });
    } else if (data === 'admpromomigrate' && isAdmin) {
      await reply(await migrateOldMediaPromos(env), { inline_keyboard: [[{ text: '← Промокоды', callback_data: 'admpromo' }]] });
    } else if (data === 'admpromolog' && isAdmin) {
      await reply(await promoLogText(env), { inline_keyboard: [[{ text: '← Промокоды', callback_data: 'admpromo' }]] }, { parse_mode: 'HTML' });
    } else if (data === 'admpromomanage' && isAdmin) {
      await reply('🗑 Выбери код для управления:', await promoManageKb(env));
    } else if (data.startsWith('promoedit:') && isAdmin) {
      const code = data.slice(10);
      await reply(await promoDetailText(env, code), promoDetailKb(code), { parse_mode: 'HTML' });
    } else if (data.startsWith('promoqty:') && isAdmin) {
      const code = data.slice(9);
      await env.RATE_LIMIT.put(`admpromoqtywait:${fromId}`, code, { expirationTtl: 600 });
      await reply(`✏️ Отправь новое количество активаций для ${code} одним числом (это станет и новым "осталось", и новым "всего").`);
    } else if (data.startsWith('promodelask:') && isAdmin) {
      const code = data.slice(12);
      await reply(`⚠️ Точно удалить промокод ${code}? Действие необратимо.`, { inline_keyboard: [
        [{ text: '✅ Да, удалить', callback_data: `promodel:${code}` }],
        [{ text: '❌ Отмена', callback_data: `promoedit:${code}` }],
      ] });
    } else if (data.startsWith('promodel:') && isAdmin) {
      const code = data.slice(9);
      await env.RATE_LIMIT.delete(`promo:${code}`);
      await reply(`✅ Код ${code} удалён.`, await promoManageKb(env));
    } else if (data === 'admpromoadd' && isAdmin) {
      await env.RATE_LIMIT.delete(`admpromowiz:${fromId}`);
      await reply('🎁 Какой тип промокода?', promoTypeKb());
    } else if (data.startsWith('ptype:') && isAdmin) {
      const type = data.slice(6);
      await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify({ type }), { expirationTtl: 600 });
      const ask = type === 'credits' ? '🎁 Сколько анализов даёт код?' : type === 'hours' ? '⏳ На сколько часов безлимит?' : type === 'media' ? '📣 Какой процент выручки медийке?' : '🎟 Какой процент скидки?';
      await reply(ask, promoAmountKb(type));
    } else if (data.startsWith('pamt:') && isAdmin) {
      const wizRaw = await env.RATE_LIMIT.get(`admpromowiz:${fromId}`);
      if (!wizRaw) { await reply('⚠️ Сессия истекла, начни заново.', { inline_keyboard: [[{ text: '+ Добавить промокод', callback_data: 'admpromoadd' }]] }); return new Response('ok'); }
      const wiz = JSON.parse(wizRaw);
      const val = data.slice(5);
      if (val === 'custom') {
        wiz.step = 'amount_custom';
        await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify(wiz), { expirationTtl: 600 });
        await reply('✏️ Отправь число одним сообщением.');
      } else {
        wiz.amount = parseInt(val, 10);
        await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify(wiz), { expirationTtl: 600 });
        if (wiz.type === 'media') {
          await reply('🎟 Скидка покупателю по этому промокоду?', mediaDiscountKb());
        } else {
          await reply('🔢 Сколько активаций у кода?', promoUsesKb());
        }
      }
    } else if (data.startsWith('pmdisc:') && isAdmin) {
      const wizRaw = await env.RATE_LIMIT.get(`admpromowiz:${fromId}`);
      if (!wizRaw) { await reply('⚠️ Сессия истекла, начни заново.', { inline_keyboard: [[{ text: '+ Добавить промокод', callback_data: 'admpromoadd' }]] }); return new Response('ok'); }
      const wiz = JSON.parse(wizRaw);
      const val = data.slice(7);
      if (val === 'custom') {
        wiz.step = 'discount_custom';
        await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify(wiz), { expirationTtl: 600 });
        await reply('✏️ Отправь число (0-90) одним сообщением.');
      } else {
        wiz.discount = parseInt(val, 10);
        await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify(wiz), { expirationTtl: 600 });
        await reply('🔢 Сколько активаций у кода?', promoUsesKb());
      }
    } else if (data.startsWith('puses:') && isAdmin) {
      const wizRaw = await env.RATE_LIMIT.get(`admpromowiz:${fromId}`);
      if (!wizRaw) { await reply('⚠️ Сессия истекла, начни заново.', { inline_keyboard: [[{ text: '+ Добавить промокод', callback_data: 'admpromoadd' }]] }); return new Response('ok'); }
      const wiz = JSON.parse(wizRaw);
      const val = data.slice(6);
      if (val === 'custom') {
        wiz.step = 'uses_custom';
        await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify(wiz), { expirationTtl: 600 });
        await reply('✏️ Отправь число одним сообщением.');
      } else {
        wiz.uses = parseInt(val, 10);
        wiz.step = 'code';
        await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify(wiz), { expirationTtl: 600 });
        await reply('🔤 Отправь код одним словом (например SALE20).');
      }
    } else if (data === 'admref' && isAdmin) {
      const { text: rt, kb } = await refListKb(env, 'admin');
      kb.inline_keyboard.splice(-1, 0, [{ text: '✏️ Комиссия медийке', callback_data: 'admrefpct' }], [{ text: '🎟 Скидка покупателю', callback_data: 'admrefbuyerpct' }]);
      await reply(rt, kb);
    } else if (data.startsWith('refview:') && isAdmin) {
      await reply(await refDetailText(env, data.slice(8)), { inline_keyboard: [[{ text: '← Рефералы', callback_data: 'admref' }]] }, { parse_mode: 'HTML' });
    } else if (data === 'admrefadd' && isAdmin) {
      await env.RATE_LIMIT.put(`admrefwait:${fromId}`, '1', { expirationTtl: 600 });
      await reply('🔗 Отправь одним сообщением:\n\nКОД ПРОЦЕНТ Название\n\nНапример: ANNA 20 Анна Иванова (блогер)\n\nКод — латиницей/цифрами, без пробелов, станет частью ссылки. Процент — сколько % от выручки причитается медийке.');
    } else if (data === 'admrefpct' && isAdmin) {
      await env.RATE_LIMIT.put(`admrefpctwait:${fromId}`, '1', { expirationTtl: 600 });
      await reply('✏️ Отправь одним сообщением:\n\nКОД ПРОЦЕНТ\n\nНапример: ANNA 25');
    } else if (data === 'admrefbuyerpct' && isAdmin) {
      await env.RATE_LIMIT.put(`admrefbuyerwait:${fromId}`, '1', { expirationTtl: 600 });
      await reply('🎟 Отправь одним сообщением:\n\nКОД ПРОЦЕНТ\n\nНапример: ANNA 10 — покупатели по ссылке ANNA получат скидку 10%.\nРаботает для Stars/крипты и для карты только у тарифов с динамической ценой в Lava.top (сейчас это «1 анализ» и «Месяц»).');
    } else if (data === 'admfindtx' && isAdmin) {
      await env.RATE_LIMIT.put(`admfindtxwait:${fromId}`, '1', { expirationTtl: 600 });
      await reply('🔎 Отправь ID заказа одним сообщением (клиент присылает его из своего подтверждения оплаты).');
    } else if (data.startsWith('admopen:') && isAdmin) {
      const uid = data.slice(8);
      await env.RATE_LIMIT.put(`admtarget:${fromId}`, uid, { expirationTtl: 60 * 30 });
      const uL = await userLang(env, uid);
      await reply(`✏️ Теперь пишешь пользователю ${uid}. Просто отправляй текст (без реплая). Закрыть: «✖» в списке чатов.\nЕго язык: ${uL}.`);
    } else if (data.startsWith('admclose:') && isAdmin) {
      const uid = data.slice(9);
      await removeTicket(env, uid);
      await env.RATE_LIMIT.delete(`suphuman:${uid}`);
      const cur = await env.RATE_LIMIT.get(`admtarget:${fromId}`);
      if (cur === uid) await env.RATE_LIMIT.delete(`admtarget:${fromId}`);
      const { text: tt, kb } = await showTicketsKb(env);
      await reply('✅ Чат закрыт.\n\n' + tt, kb);
    }
    return new Response('ok');
  }

  const msg = upd.message;
  if (!msg || !msg.from || msg.from.is_bot) return new Response('ok');
  const fromId = String(msg.from.id);
  const adminId = fromId; // используем chat_id самого пишущего админа для ответов ему
  const L = await userLang(env, msg.from.id);
  const text = (msg.text || '').trim();

  const isAdmin = isAdminId(env, fromId);

  if (isAdmin && (text === '/admin' || text === ADMIN_BTN)) {
    // Тап по кнопке снимает «прилипающий» ответ конкретному юзеру, чтобы не отправить туда случайный текст.
    await env.RATE_LIMIT.delete(`admtarget:${fromId}`);
    await supportApi(env, 'sendMessage', { chat_id: msg.chat.id, text: '⚙️ Панель модератора:', reply_markup: adminPanelKb() });
    return new Response('ok');
  }
  // Оператор закрывает диалог: /close <id> (текстовая команда — оставлена для подстраховки, основной способ — кнопка ✖)
  if (isAdmin && text.startsWith('/close')) {
    const uid = (text.split(' ')[1] || '').trim();
    if (uid) {
      await env.RATE_LIMIT.delete(`suphuman:${uid}`);
      await removeTicket(env, uid);
      const cur = await env.RATE_LIMIT.get(`admtarget:${fromId}`);
      if (cur === uid) await env.RATE_LIMIT.delete(`admtarget:${fromId}`);
      await supportApi(env, 'sendMessage', { chat_id: adminId, text: 'Диалог с ' + uid + ' закрыт.' });
    }
    return new Response('ok');
  }
  // Мастер создания промокода кнопками: тип/сумма/активации выбираются кнопками,
  // единственный шаг текстом — сам код (это уникальная строка, кнопкой не выбрать).
  if (isAdmin && !msg.reply_to_message) {
    const wizRaw = await env.RATE_LIMIT.get(`admpromowiz:${fromId}`);
    if (wizRaw) {
      const wiz = JSON.parse(wizRaw);
      if (wiz.step === 'amount_custom') {
        const n = parseInt(text, 10);
        if (!Number.isFinite(n) || n <= 0) {
          await supportApi(env, 'sendMessage', { chat_id: adminId, text: '⚠️ Нужно положительное число.' });
          return new Response('ok');
        }
        wiz.amount = n; delete wiz.step;
        await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify(wiz), { expirationTtl: 600 });
        if (wiz.type === 'media') {
          await supportApi(env, 'sendMessage', { chat_id: adminId, text: '🎟 Скидка покупателю по этому промокоду?', reply_markup: mediaDiscountKb() });
        } else {
          await supportApi(env, 'sendMessage', { chat_id: adminId, text: '🔢 Сколько активаций у кода?', reply_markup: promoUsesKb() });
        }
        return new Response('ok');
      }
      if (wiz.step === 'discount_custom') {
        const n = parseInt(text, 10);
        if (!Number.isFinite(n) || n < 0 || n > 90) {
          await supportApi(env, 'sendMessage', { chat_id: adminId, text: '⚠️ Нужно число от 0 до 90.' });
          return new Response('ok');
        }
        wiz.discount = n; delete wiz.step;
        await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify(wiz), { expirationTtl: 600 });
        await supportApi(env, 'sendMessage', { chat_id: adminId, text: '🔢 Сколько активаций у кода?', reply_markup: promoUsesKb() });
        return new Response('ok');
      }
      if (wiz.step === 'uses_custom') {
        const n = parseInt(text, 10);
        if (!Number.isFinite(n) || n <= 0) {
          await supportApi(env, 'sendMessage', { chat_id: adminId, text: '⚠️ Нужно положительное число.' });
          return new Response('ok');
        }
        wiz.uses = n; wiz.step = 'code';
        await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify(wiz), { expirationTtl: 600 });
        await supportApi(env, 'sendMessage', { chat_id: adminId, text: '🔤 Отправь код одним словом (например SALE20).' });
        return new Response('ok');
      }
      if (wiz.step === 'code') {
        const code = text.trim().toUpperCase().replace(/\s+/g, '');
        if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
          await supportApi(env, 'sendMessage', { chat_id: adminId, text: '⚠️ Код может быть только латиницей/цифрами, 2-32 символа.' });
          return new Response('ok');
        }
        const promo = { uses: wiz.uses, max: wiz.uses };
        if (wiz.type === 'media') {
          promo.mediaPct = wiz.amount;
          promo.discount = wiz.discount || 0;
          promo.revenueRub = 0;
          promo.purchases = 0;
        } else {
          promo[wiz.type] = wiz.amount;
        }
        await env.RATE_LIMIT.put(`promo:${code}`, JSON.stringify(promo), { expirationTtl: 60 * 60 * 24 * 90 });
        await env.RATE_LIMIT.delete(`admpromowiz:${fromId}`);
        await supportApi(env, 'sendMessage', {
          chat_id: adminId,
          text: `✅ Промокод ${code} создан.\n\n` + await promoListText(env),
          reply_markup: { inline_keyboard: [[{ text: '+ Добавить ещё', callback_data: 'admpromoadd' }], [{ text: '← Admin', callback_data: 'admin' }]] },
        });
        return new Response('ok');
      }
    }
  }
  // Оператор в процессе создания реферальной ссылки (нажал «+ Создать реф-ссылку»).
  if (isAdmin && !msg.reply_to_message && await env.RATE_LIMIT.get(`admrefwait:${fromId}`)) {
    const m = text.match(/^([a-z0-9_-]{1,40})\s+(\d{1,3})\s*(.*)$/i);
    if (!m) {
      await supportApi(env, 'sendMessage', { chat_id: adminId, text: '⚠️ Формат: КОД ПРОЦЕНТ Название. Пример: ANNA 20 Анна Иванова' });
      return new Response('ok');
    }
    const code = m[1].toUpperCase();
    if (await refExists(env, code)) {
      await supportApi(env, 'sendMessage', { chat_id: adminId, text: `⚠️ Код ${code} уже занят.` });
      return new Response('ok');
    }
    const pct = Math.min(100, parseInt(m[2], 10));
    await createRef(env, code, m[3].trim(), pct);
    await env.RATE_LIMIT.delete(`admrefwait:${fromId}`);
    const link = `https://t.me/${env.BOT_USERNAME || 'faceratepay_bot'}?start=ref_${code}`;
    // Готовый текст для отправки партнёру — копируй и кидай как есть.
    await supportApi(env, 'sendMessage', {
      chat_id: adminId,
      text: `Привет! Вот твоя реферальная ссылка на FaceRate:\n👉 ${link}\n\nЧто с ней делать:\n\nПросто кидай эту ссылку своей аудитории вместо обычной ссылки на бота — она ведёт в тот же бот оплаты, но "запоминает", что человек пришёл от тебя.\nУсловия: ${pct}% от выручки с каждой покупки тех, кто пришёл по твоей ссылке — тебе на счёт.\nКак самому смотреть статистику (сколько людей купило и сколько ты заработал):\n\nОткрой отдельного бота — @FaceRateMedia_bot\nНажми /start, потом кнопку "🔑 Привязать код"\nОтправь код: ${code}\nГотово — дальше в любой момент жми "📊 Моя статистика" и увидишь: сколько переходов по ссылке, сколько покупок, и сколько тебе причитается (уже посчитано с твоими ${pct}%).\nВыплаты — отдельно, по договорённости (уточняй у меня), бот только показывает цифры для прозрачности.`,
    });
    await supportApi(env, 'sendMessage', {
      chat_id: adminId,
      text: `✅ Реферальная ссылка создана (сообщение для партнёра — выше, готово к копированию).\n\n` + await refListText(env),
      reply_markup: { inline_keyboard: [[{ text: '+ Создать ещё', callback_data: 'admrefadd' }], [{ text: '← Admin', callback_data: 'admin' }]] },
    });
    return new Response('ok');
  }
  // Оператор в процессе изменения % медийке (нажал «✏️ Изменить %»).
  if (isAdmin && !msg.reply_to_message && await env.RATE_LIMIT.get(`admrefpctwait:${fromId}`)) {
    const m = text.match(/^([a-z0-9_-]{1,40})\s+(\d{1,3})/i);
    const code = m ? m[1].toUpperCase() : '';
    if (!m || !(await setRefPct(env, code, Math.min(100, parseInt(m[2], 10))))) {
      await supportApi(env, 'sendMessage', { chat_id: adminId, text: `⚠️ Не понял формат или код ${code} не найден. Пример: ANNA 25` });
      return new Response('ok');
    }
    await env.RATE_LIMIT.delete(`admrefpctwait:${fromId}`);
    await supportApi(env, 'sendMessage', {
      chat_id: adminId,
      text: `✅ Процент для ${code} обновлён.\n\n` + await refListText(env),
      reply_markup: { inline_keyboard: [[{ text: '✏️ Изменить ещё', callback_data: 'admrefpct' }], [{ text: '← Admin', callback_data: 'admin' }]] },
    });
    return new Response('ok');
  }
  // Оператор в процессе изменения скидки покупателю (нажал «🎟 Скидка покупателю»).
  if (isAdmin && !msg.reply_to_message && await env.RATE_LIMIT.get(`admrefbuyerwait:${fromId}`)) {
    const m = text.match(/^([a-z0-9_-]{1,40})\s+(\d{1,3})/i);
    const code = m ? m[1].toUpperCase() : '';
    if (!m || !(await setRefBuyerPct(env, code, Math.min(100, parseInt(m[2], 10))))) {
      await supportApi(env, 'sendMessage', { chat_id: adminId, text: `⚠️ Не понял формат или код ${code} не найден. Пример: ANNA 10` });
      return new Response('ok');
    }
    await env.RATE_LIMIT.delete(`admrefbuyerwait:${fromId}`);
    await supportApi(env, 'sendMessage', {
      chat_id: adminId,
      text: `✅ Скидка покупателю для ${code} обновлена.\n\n` + await refDetailText(env, code),
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '🎟 Изменить ещё', callback_data: 'admrefbuyerpct' }], [{ text: '← Admin', callback_data: 'admin' }]] },
    });
    return new Response('ok');
  }
  // Оператор в процессе изменения количества активаций промокода (нажал «✏️ Изменить количество»).
  if (isAdmin && !msg.reply_to_message) {
    const qtyCode = await env.RATE_LIMIT.get(`admpromoqtywait:${fromId}`);
    if (qtyCode) {
      const n = parseInt(text, 10);
      if (!Number.isFinite(n) || n < 0) {
        await supportApi(env, 'sendMessage', { chat_id: adminId, text: '⚠️ Нужно неотрицательное число.' });
        return new Response('ok');
      }
      const raw = await env.RATE_LIMIT.get(`promo:${qtyCode}`);
      if (!raw) {
        await env.RATE_LIMIT.delete(`admpromoqtywait:${fromId}`);
        await supportApi(env, 'sendMessage', { chat_id: adminId, text: `❌ Код ${qtyCode} не найден — возможно, уже удалён.` });
        return new Response('ok');
      }
      const p = JSON.parse(raw);
      p.uses = n; p.max = n;
      await env.RATE_LIMIT.put(`promo:${qtyCode}`, JSON.stringify(p), { expirationTtl: 60 * 60 * 24 * 90 });
      await env.RATE_LIMIT.delete(`admpromoqtywait:${fromId}`);
      await supportApi(env, 'sendMessage', {
        chat_id: adminId,
        text: `✅ Количество активаций ${qtyCode} обновлено на ${n}.\n\n` + await promoDetailText(env, qtyCode),
        parse_mode: 'HTML',
        reply_markup: promoDetailKb(qtyCode),
      });
      return new Response('ok');
    }
  }
  // Оператор в процессе поиска заказа по ID (нажал «🔎 Найти по ID»).
  if (isAdmin && !msg.reply_to_message && await env.RATE_LIMIT.get(`admfindtxwait:${fromId}`)) {
    await env.RATE_LIMIT.delete(`admfindtxwait:${fromId}`);
    await supportApi(env, 'sendMessage', {
      chat_id: adminId,
      text: await findOrderById(env, text.trim()),
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: '🔎 Искать ещё', callback_data: 'admfindtx' }], [{ text: '← Admin', callback_data: 'admin' }]] },
    });
    return new Response('ok');
  }
  // Оператор выбрал чат кнопкой «📂 Открытые чаты» → пишет без реплая, летит выбранному uid.
  if (isAdmin && !msg.reply_to_message) {
    const target = await env.RATE_LIMIT.get(`admtarget:${fromId}`);
    if (target) {
      const uL = await userLang(env, target);
      await supportApi(env, 'sendMessage', { chat_id: target, text: (uL === 'ru' ? '🛠 Поддержка: ' : '🛠 Support: ') + text });
      return new Response('ok');
    }
  }
  // Ответ оператора реплаем (старый способ, всё ещё работает) → пересылаем пользователю.
  if (isAdmin && msg.reply_to_message) {
    const uid = await env.RATE_LIMIT.get(`supmap:${adminId}:${msg.reply_to_message.message_id}`);
    if (uid) {
      const uL = await userLang(env, uid);
      await supportApi(env, 'sendMessage', { chat_id: uid, text: (uL === 'ru' ? '🛠 Поддержка: ' : '🛠 Support: ') + text });
      await supportApi(env, 'sendMessage', { chat_id: adminId, text: '✅ Отправлено пользователю ' + uid });
    }
    return new Response('ok');
  }

  if (text === '/start' || text === '/menu') {
    await supportApi(env, 'sendMessage', { chat_id: msg.chat.id, text: SUP[L].hello, reply_markup: supMenuKb(L, isAdmin) });
    // Отдельным сообщением — постоянная кнопка «⚙️ Admin» внизу экрана (не пропадает, живёт независимо от инлайн-кнопок).
    if (isAdmin) await supportApi(env, 'sendMessage', { chat_id: msg.chat.id, text: '⌨️ Кнопка модератора закреплена внизу.', reply_markup: adminReplyKb() });
    return new Response('ok');
  }

  // Пользователь уже переключён на оператора → пересылаем всё оператору.
  if (await env.RATE_LIMIT.get(`suphuman:${fromId}`)) {
    await forwardToAdmin(env, msg, L);
    return new Response('ok');
  }

  // Иначе — AI-ответ по FAQ + кнопка эскалации.
  const answer = await supportAI(env, text, L);
  await supportApi(env, 'sendMessage', {
    chat_id: msg.chat.id, text: answer,
    reply_markup: { inline_keyboard: [[{ text: SUP[L].human, callback_data: 'human' }], [{ text: SUP[L].kbBack, callback_data: 'menu' }]] },
  });
  return new Response('ok');
}

// ─────────────────────────── Приватная страница статистики ───────────────────────────
// Данные не встроены в HTML — сама страница просит токен (хранит в localStorage браузера)
// и отдельным POST-запросом с этим токеном тянет JSON из /admin-stats/data. Так статику
// можно смело отдавать по GET без риска — без верного ADMIN_STATS_TOKEN там пусто.
async function adminStatsData(request, env) {
  let body; try { body = await request.json(); } catch { return json({ error: 'bad request' }); }
  if (!env.ADMIN_STATS_TOKEN || body.token !== env.ADMIN_STATS_TOKEN) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  const translog = await getList(env, 'translog');
  const refList = await env.RATE_LIMIT.list({ prefix: 'ref:' });
  const refs = [];
  for (const k of refList.keys) {
    const raw = await env.RATE_LIMIT.get(k.name);
    if (!raw) continue;
    let r; try { r = JSON.parse(raw); } catch { continue; }
    refs.push({ code: k.name.slice(4), ...r, payout: refPayout(r) });
  }
  const promoList = await env.RATE_LIMIT.list({ prefix: 'promo:' });
  const promos = [];
  for (const k of promoList.keys) {
    const raw = await env.RATE_LIMIT.get(k.name);
    if (!raw) continue;
    let p; try { p = JSON.parse(raw); } catch { continue; }
    if (p.mediaPct == null) continue; // только медиа-промо — остальные типы (кредиты/скидки) сюда не относятся
    promos.push({ code: k.name.slice(6), ...p, earned: Math.round((p.revenueRub || 0) * (p.mediaPct || 0) / 100) });
  }
  const payoutIds = await getList(env, 'payoutqueue');
  const payouts = [];
  for (const id of payoutIds) {
    const raw = await env.RATE_LIMIT.get(`payout:${id}`);
    if (raw) { try { payouts.push(JSON.parse(raw)); } catch {} }
  }
  return json({ translog, refs, promos, payouts, generatedAt: Date.now() });
}
function adminStatsPage() {
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>FaceRate — статистика</title>
<style>
  :root{--gold:#c4a46b;--gold-hi:#e8cf96;--bg:#050505;--card:#12100c;--txt:#e8e2d6;--dim:#8a7f6a;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--txt);font-family:-apple-system,Segoe UI,Arial,sans-serif;padding:20px}
  h1{font-weight:600;letter-spacing:1px;color:var(--gold-hi);font-size:22px}
  h2{color:var(--gold);font-size:16px;margin-top:36px;border-bottom:1px solid #2a251c;padding-bottom:8px}
  .card{background:var(--card);border:1px solid #2a251c;border-radius:10px;padding:16px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #221f18;white-space:nowrap}
  th{color:var(--dim);font-weight:500;position:sticky;top:0;background:var(--card)}
  tr:hover td{background:#1a1710}
  .tablewrap{overflow-x:auto;max-height:60vh}
  .stat{display:inline-block;margin-right:28px}
  .stat b{display:block;font-size:22px;color:var(--gold-hi)}
  .stat span{color:var(--dim);font-size:12px}
  input,button{font-size:14px;padding:8px 12px;border-radius:8px;border:1px solid #2a251c;background:#1a1710;color:var(--txt)}
  button{background:var(--gold);color:#1a1710;border:none;cursor:pointer;font-weight:600}
  #gate{max-width:360px;margin:120px auto;text-align:center}
  #gate input{width:100%;margin-bottom:10px}
  .hidden{display:none}
  .pos{color:#8fce8f}.neg{color:#e07a7a}
  a{color:var(--gold-hi)}
</style></head><body>

<div id="gate">
  <h1>FACERATE STATS</h1>
  <p style="color:var(--dim)">Введи токен доступа</p>
  <input id="tokenInput" type="password" placeholder="Токен">
  <button onclick="login()">Войти</button>
  <p id="gateErr" style="color:#e07a7a"></p>
</div>

<div id="app" class="hidden">
  <h1>FACERATE STATS <button style="float:right" onclick="logout()">Выйти</button></h1>
  <div class="card" id="summary"></div>

  <h2>Медиа-промокоды</h2>
  <div class="card tablewrap"><table id="promoTable"></table></div>

  <h2>Реферальные ссылки</h2>
  <div class="card tablewrap"><table id="refTable"></table></div>

  <h2>Заявки на вывод</h2>
  <div class="card tablewrap"><table id="payoutTable"></table></div>

  <h2>Последние покупки</h2>
  <div class="card tablewrap"><table id="txTable"></table></div>

  <div id="detail" class="card hidden"></div>
</div>

<script>
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function login(){
  var t = document.getElementById('tokenInput').value.trim();
  if (!t) return;
  localStorage.setItem('fm_stats_token', t);
  load();
}
function logout(){ localStorage.removeItem('fm_stats_token'); location.reload(); }
function load(){
  var token = localStorage.getItem('fm_stats_token');
  if (!token) return;
  fetch('/admin-stats/data', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token: token }) })
    .then(function(r){ if (r.status === 403) throw new Error('forbidden'); return r.json(); })
    .then(render)
    .catch(function(){
      document.getElementById('gateErr').textContent = 'Неверный токен.';
      localStorage.removeItem('fm_stats_token');
      document.getElementById('gate').classList.remove('hidden');
      document.getElementById('app').classList.add('hidden');
    });
}
function render(d){
  document.getElementById('gate').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  var totalRevenue = d.refs.reduce(function(s,r){return s+(r.revenueRub||0);},0) + d.promos.reduce(function(s,p){return s+(p.revenueRub||0);},0);
  var totalCommission = d.refs.reduce(function(s,r){return s+(r.payout||0);},0) + d.promos.reduce(function(s,p){return s+(p.earned||0);},0);
  var pendingPayouts = d.payouts.filter(function(p){return p.status==='pending';});
  document.getElementById('summary').innerHTML =
    '<div class="stat"><b>'+d.translog.length+'</b><span>покупок (последние)</span></div>' +
    '<div class="stat"><b>'+d.refs.length+'</b><span>реф-ссылок</span></div>' +
    '<div class="stat"><b>'+d.promos.length+'</b><span>медиа-промокодов</span></div>' +
    '<div class="stat"><b>'+Math.round(totalCommission)+'₽</b><span>начислено партнёрам</span></div>' +
    '<div class="stat"><b>'+pendingPayouts.length+'</b><span>заявок на вывод в ожидании</span></div>';

  var pt = '<tr><th>Код</th><th>Владелец</th><th>%</th><th>Скидка</th><th>Покупок</th><th>Оборот</th><th>Начислено</th></tr>';
  d.promos.sort(function(a,b){return (b.earned||0)-(a.earned||0);}).forEach(function(p){
    pt += '<tr style="cursor:pointer" data-code="'+esc(p.code)+'"><td>'+esc(p.code)+'</td><td>'+esc(p.ownerTgid||'—')+'</td><td>'+(p.mediaPct||0)+'%</td><td>'+(p.discount||0)+'%</td><td>'+(p.purchases||0)+'</td><td>'+(p.revenueRub||0)+'₽</td><td class="pos">'+(p.earned||0)+'₽</td></tr>';
  });
  document.getElementById('promoTable').innerHTML = pt;

  var rt = '<tr><th>Код</th><th>Название</th><th>%</th><th>Скидка</th><th>Переходов</th><th>Покупок</th><th>Оборот</th><th>Начислено</th></tr>';
  d.refs.sort(function(a,b){return (b.payout||0)-(a.payout||0);}).forEach(function(r){
    rt += '<tr style="cursor:pointer" data-code="'+esc(r.code)+'"><td>'+esc(r.code)+'</td><td>'+esc(r.label||(r.personal?'(личная)':''))+'</td><td>'+(r.pct||0)+'%</td><td>'+(r.buyerPct||0)+'%</td><td>'+(r.clicks||0)+'</td><td>'+(r.purchases||0)+'</td><td>'+(r.revenueRub||0)+'₽</td><td class="pos">'+(r.payout||0)+'₽</td></tr>';
  });
  document.getElementById('refTable').innerHTML = rt;
  [document.getElementById('promoTable'), document.getElementById('refTable')].forEach(function(tbl){
    tbl.onclick = function(e){
      var tr = e.target.closest('tr[data-code]');
      if (tr) location.hash = tr.getAttribute('data-code');
    };
  });

  var payt = '<tr><th>ID</th><th>Сумма</th><th>Кому (tgid)</th><th>Реквизиты</th><th>Статус</th><th>Дата</th></tr>';
  d.payouts.forEach(function(p){
    var cls = p.status==='approved' ? 'pos' : p.status==='rejected' ? 'neg' : '';
    payt += '<tr><td>'+esc(p.id)+'</td><td>'+p.amount+'₽</td><td>'+esc(p.tgid)+'</td><td>'+esc(p.requisites)+'</td><td class="'+cls+'">'+esc(p.status)+'</td><td>'+new Date(p.ts).toLocaleString('ru-RU')+'</td></tr>';
  });
  document.getElementById('payoutTable').innerHTML = payt;

  var tt = '<tr><th>ID</th><th>Дата</th><th>Тариф</th><th>Сумма</th><th>Способ</th><th>Промо</th><th>Кто</th></tr>';
  d.translog.forEach(function(t){
    tt += '<tr><td>'+esc(t.id||'')+'</td><td>'+new Date(t.ts).toLocaleString('ru-RU')+'</td><td>'+esc(t.pack)+'</td><td>'+esc(t.amount)+' '+esc(t.currency||'')+'</td><td>'+esc(t.method)+'</td><td>'+(t.promo ? '<span class="pos">'+esc(t.promo)+'</span>' : '—')+'</td><td>'+esc(t.name||'')+' '+(t.username?'@'+esc(t.username):'')+' (id '+esc(t.tgid)+')</td></tr>';
  });
  document.getElementById('txTable').innerHTML = tt;

  // "Отдельная страница" на промокод/код через #hash — не требует отдельного роута на сервере.
  var hash = decodeURIComponent(location.hash.slice(1));
  if (hash) {
    var found = d.promos.find(function(p){return p.code===hash;}) || d.refs.find(function(r){return r.code===hash;});
    var det = document.getElementById('detail');
    if (found) {
      det.classList.remove('hidden');
      det.innerHTML = '<h2 style="margin-top:0">'+esc(hash)+'</h2><pre style="white-space:pre-wrap;color:var(--txt)">'+esc(JSON.stringify(found,null,2))+'</pre>';
    }
  }
}
window.addEventListener('hashchange', load);
(function(){
  var saved = localStorage.getItem('fm_stats_token');
  if (saved) load();
})();
</script>
</body></html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ─────────────────────── Портал медиапартнёров (facerate.online) ───────────────────────
// Партнёр = уже существующий медиа-промокод (promo:CODE с mediaPct). Отдельный PIN
// (partnerpin:CODE) даёт партнёру доступ ТОЛЬКО к своей карточке, без ADMIN_STATS_TOKEN.
// Задачи (ptasks:CODE) — простой JSON-массив, управляется мной через /partner-admin.
async function partnerData(request, env) {
  let body; try { body = await request.json(); } catch { return json({ error: 'bad request' }); }
  const code = String(body.code || '').toUpperCase().trim();
  const pin = String(body.pin || '').trim();
  if (!code || !pin) return json({ error: 'forbidden' });
  const savedPin = await env.RATE_LIMIT.get(`partnerpin:${code}`);
  if (!savedPin || savedPin !== pin) return json({ error: 'forbidden' });
  const raw = await env.RATE_LIMIT.get(`promo:${code}`);
  if (!raw) return json({ error: 'forbidden' });
  let p; try { p = JSON.parse(raw); } catch { return json({ error: 'forbidden' }); }
  if (p.mediaPct == null) return json({ error: 'forbidden' });
  const tasksRaw = await env.RATE_LIMIT.get(`ptasks:${code}`);
  let tasks = []; try { tasks = tasksRaw ? JSON.parse(tasksRaw) : []; } catch { tasks = []; }
  return json({
    code, label: p.label || '', mediaPct: p.mediaPct, discount: p.discount || 0,
    purchases: p.purchases || 0, revenueRub: p.revenueRub || 0,
    earned: Math.round((p.revenueRub || 0) * (p.mediaPct || 0) / 100),
    tasks,
  });
}
// Единая админ-точка для управления партнёрским порталом — защищена тем же секретом,
// что и /admin-stats/data (ADMIN_STATS_TOKEN), чтобы не заводить ещё один секрет.
async function partnerAdmin(request, env) {
  let body; try { body = await request.json(); } catch { return json({ error: 'bad request' }); }
  if (!env.ADMIN_STATS_TOKEN || body.token !== env.ADMIN_STATS_TOKEN) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
  const code = String(body.code || '').toUpperCase().trim();
  if (body.action === 'setPin') {
    if (!code) return json({ error: 'no code' });
    const pin = body.pin ? String(body.pin).trim() : String(Math.floor(100000 + Math.random() * 900000));
    await env.RATE_LIMIT.put(`partnerpin:${code}`, pin);
    return json({ ok: true, code, pin });
  }
  if (body.action === 'addTask') {
    if (!code || !body.text) return json({ error: 'no code/text' });
    const raw = await env.RATE_LIMIT.get(`ptasks:${code}`);
    let tasks = []; try { tasks = raw ? JSON.parse(raw) : []; } catch { tasks = []; }
    tasks.unshift({ text: String(body.text), done: false, ts: Date.now() });
    await env.RATE_LIMIT.put(`ptasks:${code}`, JSON.stringify(tasks.slice(0, 30)));
    return json({ ok: true, tasks });
  }
  if (body.action === 'toggleTask') {
    if (!code || body.idx == null) return json({ error: 'no code/idx' });
    const raw = await env.RATE_LIMIT.get(`ptasks:${code}`);
    let tasks = []; try { tasks = raw ? JSON.parse(raw) : []; } catch { tasks = []; }
    if (tasks[body.idx]) tasks[body.idx].done = !tasks[body.idx].done;
    await env.RATE_LIMIT.put(`ptasks:${code}`, JSON.stringify(tasks));
    return json({ ok: true, tasks });
  }
  if (body.action === 'deleteTask') {
    if (!code || body.idx == null) return json({ error: 'no code/idx' });
    const raw = await env.RATE_LIMIT.get(`ptasks:${code}`);
    let tasks = []; try { tasks = raw ? JSON.parse(raw) : []; } catch { tasks = []; }
    tasks.splice(body.idx, 1);
    await env.RATE_LIMIT.put(`ptasks:${code}`, JSON.stringify(tasks));
    return json({ ok: true, tasks });
  }
  if (body.action === 'get') {
    if (!code) return json({ error: 'no code' });
    const raw = await env.RATE_LIMIT.get(`promo:${code}`);
    if (!raw) return json({ error: 'not found' });
    let p; try { p = JSON.parse(raw); } catch { return json({ error: 'bad promo' }); }
    const tasksRaw = await env.RATE_LIMIT.get(`ptasks:${code}`);
    let tasks = []; try { tasks = tasksRaw ? JSON.parse(tasksRaw) : []; } catch { tasks = []; }
    const pin = await env.RATE_LIMIT.get(`partnerpin:${code}`);
    return json({
      code, label: p.label || '', mediaPct: p.mediaPct || 0, discount: p.discount || 0,
      purchases: p.purchases || 0, revenueRub: p.revenueRub || 0,
      earned: Math.round((p.revenueRub || 0) * (p.mediaPct || 0) / 100),
      pin: pin || null, tasks,
    });
  }
  if (body.action === 'list') {
    const promoList = await env.RATE_LIMIT.list({ prefix: 'promo:' });
    const partners = [];
    for (const k of promoList.keys) {
      const raw = await env.RATE_LIMIT.get(k.name);
      if (!raw) continue;
      let p; try { p = JSON.parse(raw); } catch { continue; }
      if (p.mediaPct == null) continue;
      const c = k.name.slice('promo:'.length);
      const pin = await env.RATE_LIMIT.get(`partnerpin:${c}`);
      partners.push({ code: c, label: p.label || '', hasPin: !!pin, purchases: p.purchases || 0, revenueRub: p.revenueRub || 0 });
    }
    return json({ partners });
  }
  return json({ error: 'unknown action' });
}

// ─────────────────────────── Утилиты ───────────────────────────
function json(obj) { return cors(JSON.stringify(obj), 200, 'application/json'); }

function cors(body, status = 200, contentType = 'text/plain') {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ci-trigger


/* ════════════ ВЕДЕНИЕ (гайд + 90 дней) ════════════ */
// Восемь категорий отчёта - порядок фиксирован, по нему строятся графики.
const PROG_CATS = [
  'СИММЕТРИЯ', 'ГЛАЗА_CANTHAL_TILT', 'МИДФЕЙС_MAXILLA', 'ДЖОУЛАЙН_MANDIBLE',
  'НОС_NOSE', 'ГУБЫ_СКУЛЫ', 'КОЖА', 'ГРУМИНГ_STYLE',
];
const PROG_MAX       = 60;                  // потолок замеров на юзера
const PROG_TXT_MAX   = 3;                   // сколько полных текстов храним для сравнения
const PROG_COOLDOWN  = 10 * 24 * 3600e3;    // ровно один замер в 10 дней
const PLAN_WEEKS     = 13;

// ВАЖНО ПРО ФОТО.
// Мы НЕ храним фотографии замеров на сервере - это прямо обещано в privacy.html
// («не ведёт постоянного хранилища загруженных фотографий») и это биометрические
// персональные данные по 152-ФЗ, для хранения которых нужно отдельное письменное
// согласие. Поэтому в KV лежат только: дата замера, баллы и ТЕКСТ описания от ИИ.
// Фото нигде не сохраняются вообще: ни у нас, ни в браузере. Для коллажа
// «до/после» человек выбирает два снимка вручную в момент сборки, картинка
// рисуется на canvas и сразу скачивается. Менять пользовательское соглашение
// под это не нужно - мы ничего не собираем и не храним.


/* ---------- хранилище замеров ---------- */

async function progList(env, tgid) {
  try { return JSON.parse(await env.RATE_LIMIT.get(`prog:${tgid}`) || '[]'); }
  catch { return []; }
}

async function progTexts(env, tgid) {
  try { return JSON.parse(await env.RATE_LIMIT.get(`progtxt:${tgid}`) || '[]'); }
  catch { return []; }
}

// Достаём баллы из отчёта: «ОБЩИЙ_БАЛЛ: 6.5/10» и восемь категорий.
function parseScores(text) {
  const num = (label) => {
    const re = new RegExp(label + '\\s*:\\s*([0-9]+(?:[.,][0-9])?)\\s*/\\s*10', 'i');
    const m = text.match(re);
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  };
  const cats = {};
  for (const c of PROG_CATS) {
    const v = num(c);
    if (v !== null) cats[c] = v;
  }
  // Оценка сопоставимости съёмки - по ней на сайте помечаем «замер под вопросом».
  const q = text.match(/КАЧЕСТВО_СЪЁМКИ\s*:\s*([А-ЯЁ ]+)/i);
  const quality = q ? q[1].trim().toUpperCase() : '';
  return { overall: num('ОБЩИЙ_БАЛЛ'), cats, quality };
}

async function progSave(env, tgid, text) {
  const { overall, cats, quality } = parseScores(text);
  if (overall === null && !Object.keys(cats).length) return;   // мусор не пишем

  const list = await progList(env, tgid);
  // t - дата замера. Именно она рисует ось времени на графике и по ней же
  // считается кулдаун и напоминания бота.
  list.push({ t: Date.now(), overall, cats, quality });
  await env.RATE_LIMIT.put(`prog:${tgid}`, JSON.stringify(list.slice(-PROG_MAX)));

  // Полные тексты - только последние N, чтобы влезать в лимит значения KV.
  const texts = await progTexts(env, tgid);
  texts.push({ t: Date.now(), text: text.slice(0, 4000) });
  await env.RATE_LIMIT.put(`progtxt:${tgid}`, JSON.stringify(texts.slice(-PROG_TXT_MAX)));

  // Персональные советы для заданий бота.
  const tips = extractTips(text);
  if (Object.keys(tips).length) {
    await env.RATE_LIMIT.put(`tips:${tgid}`, JSON.stringify(tips));
  }
}

/* ---------- ПРОМПТ ЗАМЕРА (отдельный от обычного анализа) ---------- */

// Задача здесь другая, чем в обычном анализе. Обычный промпт откалиброван под
// «оценить лицо и заинтересовать». Замер - это измерительный инструмент: главный
// риск не в том, что модель занизит, а в том, что она НАРИСУЕТ ПРОГРЕСС, которого
// нет, потому что второе фото просто удачнее. Поэтому весь промпт построен вокруг
// отделения реального изменения от артефакта съёмки.

const MEASURE_BASE = `Ты - измерительный инструмент для отслеживания изменений внешности во времени.
Это НЕ развлекательная оценка и НЕ отчёт для продажи. Твоя задача - точность, а не мотивация.

ЯЗЫК И ОБРАЩЕНИЕ.
Обращайся к человеку на «ты», как в остальном сервисе: «спи», «убери», «наноси».
Никакого «вы» и никакого «Вам». Пиши просто и по делу, без канцелярита.

ЖЁСТКИЕ ПРАВИЛА:
1. Оценивай ТОЛЬКО то, что видно. Не додумывай и не льсти.
2. НИКОГДА не завышай баллы, чтобы человек увидел прогресс. Отсутствие изменений - нормальный,
   ожидаемый и полезный результат. Выдуманный прогресс обесценивает весь инструмент.
3. Если стало хуже - так и пиши прямо, без смягчения.
4. Разница в съёмке (свет, ракурс, дистанция, качество камеры, бьюти-режим) даёт сдвиг
   до 1.5 балла на ровном месте. Всегда проверяй эту гипотезу ПЕРВОЙ, прежде чем
   объявить изменение реальным.
5. Костная структура (мидфейс, форма носа, gonial angle, canthal tilt) у взрослого
   человека не меняется. Если по этим параметрам «изменение» - это почти наверняка ракурс.
   Так и пиши.
6. Реально и быстро меняются: кожа, отёк, вес и жир, груминг. Изменения там правдоподобны.
7. ВСЕГДА определяй способ съёмки, это критично. Признаки селфи с вытянутой руки:
   близкая дистанция, зеркальное изображение (надписи на одежде читаются наоборот),
   вытянутая к камере рука или её тень, ракурс сверху, край телефона или зеркало в кадре.
   Фронтальная камера широкоугольная: с близкого расстояния она увеличивает нос и центр
   лица и сужает всё остальное. Это искажение оптики, а не внешность человека.
8. Если кадр СЕЛФИ - баллы за НОС_NOSE, МИДФЕЙС_MAXILLA и ДЖОУЛАЙН_MANDIBLE недостоверны.
   Всё равно поставь их, но предупреждение об этом обязано стоять прямо в секции
   СПОСОБ_СЪЁМКИ, второй строкой (см. формат выше).
   При сравнении двух замеров, снятых РАЗНЫМИ способами, изменения по этим трём параметрам
   объявляй артефактом съёмки, а не прогрессом - даже если разница большая.
9. Опущенный или задранный подбородок и наклон головы меняют видимую линию челюсти
   и симметрию. Заметил - скажи об этом и не записывай разницу в прогресс.

ФОРМАТ ОТВЕТА - простой текст, без markdown, строго в этом порядке:

ОБЩИЙ_БАЛЛ: X/10
[2-3 предложения о текущем состоянии]

СИММЕТРИЯ: X/10
ГЛАЗА_CANTHAL_TILT: X/10
МИДФЕЙС_MAXILLA: X/10
ДЖОУЛАЙН_MANDIBLE: X/10
НОС_NOSE: X/10
ГУБЫ_СКУЛЫ: X/10
КОЖА: X/10
ГРУМИНГ_STYLE: X/10

СПОСОБ_СЪЁМКИ: [одно из: ОСНОВНАЯ КАМЕРА / СЕЛФИ / НЕ ОПРЕДЕЛЁН]
[по каким признакам определил, есть ли наклон или поворот головы.
ЕСЛИ СЕЛФИ - здесь же обязательна вторая строка ровно такого смысла: «баллам за нос,
мидфейс и джоулайн с этого кадра доверять нельзя, близкая дистанция их искажает;
следующий замер сними основной камерой с 1.5-2 метров». Без неё отчёт неполный.]

КАЧЕСТВО_СЪЁМКИ: [одно из: СОПОСТАВИМО / ЕСТЬ РАЗЛИЧИЯ / НЕСОПОСТАВИМО]
[одна строка: что именно отличается от прошлого фото - свет, ракурс, дистанция, обработка.
Если это первый замер - оцени пригодность фото как точки отсчёта.]

ДИНАМИКА:
[см. инструкцию ниже]

РЕКОМЕНДАЦИИ:
1. [КАТЕГОРИЯ] текст рекомендации
2. [КАТЕГОРИЯ] текст рекомендации
...

ЗАПРЕЩЁННЫЕ РЕКОМЕНДАЦИИ.
Этот сервис продаётся вместе с гайдом, где перечисленное ниже разобрано как вредное или
бесполезное. Советовать это нельзя ни при каких условиях - продукт будет противоречить сам себе,
а человек получит вред:
- жевательная резинка, жевательные тренажёры, любая "тренировка челюсти". Расширяет нижнюю
  треть лица, даёт риск для височно-нижнечелюстного сустава, а форма лица от неё не меняется;
- мьюинг и любые обещания изменить кости у взрослого;
- bone smashing, удары, давление на кости - категорически;
- заклейка рта на ночь - риск удушья при нераспознанном апноэ;
- мочегонные, "жиросжигающие стеки", йохимбин и прочая фармакология;
- солярий, сода и уголь для зубов, дермароллер дома;
- голодание и дефицит жёстче 500 ккал, цель по жиру ниже 12% у мужчин;
- назначение конкретных аптечных и рецептурных препаратов;
- кислоты или ретиноиды ДВАЖДЫ В ДЕНЬ, утром, либо "на всё лицо" по умолчанию. Это сожжённый
  барьер, после которого кожа выглядит хуже, чем до начала. Кислоты и ретиноиды - только
  на ночь и точечно либо на проблемную зону;
- два и более активных компонента одновременно. Строго один за раз, следующий не раньше
  чем через 2-3 недели;
- скрабы и агрессивное очищение "до скрипа".

ОБЯЗАТЕЛЬНО ПРИ СОВЕТАХ ПО КОЖЕ:
- если советуешь любой актив, в том же или соседнем пункте упомяни SPF утром;
- при выраженном акне, куперозе, рубцах или сомнениях - отправляй к дерматологу,
  а не расписывай схему;
- средство называй по типу (ниацинамид, азелаиновая кислота), без марок, дозировок
  курсами и схем лечения.

ПРО «НЕУПРАВЛЯЕМЫЕ» ПАРАМЕТРЫ - ВАЖНО.
Не скатывайся в «параметр не управляем, действий не требуется». Это отписка, за которую
человек заплатил. Костная база действительно не меняется, но почти у каждого параметра
есть управляемая часть, и советовать надо именно её:
- ГЛАЗА_CANTHAL_TILT: сам наклон врождённый, но восприятие взгляда меняют сон, снятие
  отёка и форма бровей (убрать монобровь, не истончать сверху);
- ДЖОУЛАЙН_MANDIBLE: угол челюсти костный, но видимость линии почти целиком определяется
  процентом жира, отёком и осанкой;
- МИДФЕЙС_MAXILLA: не меняется, но объём волос сверху и снижение жира меняют восприятие;
- ГУБЫ_СКУЛЫ: форма врождённая, но сухие потрескавшиеся губы читаются как неухоженность
  и лечатся бальзамом за пару дней; скулы проявляются при снижении жира;
- НОС_NOSE: не меняется без хирурга, зато сильно зависит от дистанции съёмки и ракурса;
- СИММЕТРИЯ: костная асимметрия остаётся, но часть перекоса даёт сон лицом в подушку,
  односторонний отёк и наклон головы. Правильный совет тут - спать НА СПИНЕ (чередовать
  бока НЕЛЬЗЯ советовать, это не убирает причину), убрать соль и алкоголь, следить за
  положением головы за компьютером.
Формулируй так: сначала честно скажи, что именно не изменится, потом дай то, что реально
можно сделать. Пункт без действия допустим только если управляемой части правда нет.
И не выдумывай упражнений ради заполнения - смотри список запрещённого выше.

Про формат рекомендаций: ровно 8 пунктов, по одному на каждую категорию, каждый начинается с метки категории в квадратных
скобках. Допустимы только эти метки, ровно в таком написании:
СИММЕТРИЯ, ГЛАЗА_CANTHAL_TILT, МИДФЕЙС_MAXILLA, ДЖОУЛАЙН_MANDIBLE, НОС_NOSE,
ГУБЫ_СКУЛЫ, КОЖА, ГРУМИНГ_STYLE.
Дай хотя бы по одному пункту на каждую категорию, где балл ниже 6.5 - эти рекомендации
потом раскладываются по неделям плана, и без метки пункт потеряется.
Каждый пункт конкретный и выполнимый, без общих слов вроде «следи за питанием».
Текст пункта начинай с заглавной буквы и заканчивай точкой.`;

function buildMeasurePrompt(body, prev) {
  const metrics = body.metrics ? `\n\nИЗМЕРЕННЫЕ ГЕОМЕТРИЧЕСКИЕ ДАННЫЕ (с устройства, объективны):\n${body.metrics}` : '';

  if (!prev.length) {
    return MEASURE_BASE + metrics + `

ЭТО ПЕРВЫЙ ЗАМЕР - точка отсчёта, сравнивать не с чем.

В секции ДИНАМИКА напиши:
- что это точка отсчёта;
- 2-3 параметра, которые у ЭТОГО лица наиболее управляемы и где реально ждать сдвига за 10 дней;
- 1-2 параметра, которые не изменятся никогда, чтобы человек на них не тратил силы.
В КАЧЕСТВО_СЪЁМКИ оцени, годится ли фото как эталон: если свет плохой или есть обработка,
прямо скажи переснять - иначе все последующие сравнения будут испорчены.`;
  }

  // Из прошлого отчёта берём ТОЛЬКО баллы и описание. Рекомендации вырезаем:
  // если оставить, модель видит свежий пример собственного ответа последним
  // и копирует его дословно, игнорируя новые правила формата.
  const strip = (t) => {
    const i = t.search(/РЕКОМЕНДАЦИИ\s*:/i);
    return (i < 0 ? t : t.slice(0, i)).trim();
  };
  const last = prev[prev.length - 1];
  const days = Math.max(1, Math.round((Date.now() - last.t) / 864e5));
  const dw = days % 10 === 1 && days % 100 !== 11 ? 'день' : 'дн.';
  const history = prev.length > 1
    ? `\n\nБолее ранние замеры (только баллы, для понимания тренда):\n` +
      prev.slice(0, -1).map((p) => `- ${Math.max(1, Math.round((Date.now() - p.t) / 864e5))} дн. назад:\n${strip(p.text).slice(0, 700)}`).join('\n')
    : '';

  return MEASURE_BASE + metrics + `

ЭТО ПОВТОРНЫЙ ЗАМЕР. Прошлый разбор ЭТОГО ЖЕ человека, ${days} ${dw} назад.
Это СПРАВКА ДЛЯ СРАВНЕНИЯ, а не образец ответа. Рекомендации из него намеренно вырезаны:
не копируй прошлые формулировки, пиши новые под то, что видишь сейчас.
"""
${strip(last.text)}
"""${history}

Сначала оцени НОВОЕ фото независимо - не подглядывай в прошлые баллы, чтобы не якориться.
Только потом сравнивай.

В секции ДИНАМИКА:
- по каждому изменившемуся на 0.3+ балла параметру: что именно изменилось визуально;
- для КАЖДОГО изменения укажи в скобках причину: (реальное изменение) или (вероятно, съёмка);
- если параметр костный, а балл изменился - это (съёмка), других вариантов нет;
- отдельной строкой: что НЕ изменилось, хотя человек над этим работал;
- в конце 1-2 предложения: на чём сосредоточиться следующие 10 дней.

За ${days} ${dw} реалистичный сдвиг - 0.2-0.5 балла по управляемым параметрам.
Если ты видишь +1.5 и больше, это почти наверняка разница фото, а не человека - так и скажи.
Если изменений нет - напиши, что за такой срок это нормально, и не выдумывай прогресс.

НАПОСЛЕДОК, ЭТО ВАЖНЕЕ ВСЕГО ОСТАЛЬНОГО:
Секции выводи ровно в том порядке, что задан выше, включая СПОСОБ_СЪЁМКИ и КАЧЕСТВО_СЪЁМКИ.
Рекомендации пиши заново, с метками категорий, соблюдая список запрещённого.
Прошлый разбор выше - это данные для сравнения, а не шаблон для копирования.`;
}

/* ---------- персональные советы → задания недели ---------- */

// Раскладываем строки блока РЕКОМЕНДАЦИИ по восьми категориям.
// Грубо, по ключевым словам - зато не трогает основной откалиброванный промпт.
const TIP_KEYS = {
  'КОЖА':               ['кож', 'акне', 'spf', 'ретино', 'ниацин', 'пор', 'высыпан', 'постакне', 'увлажн', 'умыв'],
  'ГРУМИНГ_STYLE':      ['стрижк', 'волос', 'бород', 'бров', 'груминг', 'одежд', 'стил', 'триммер', 'ногт'],
  'ДЖОУЛАЙН_MANDIBLE':  ['челюст', 'jawline', 'подбородок', 'осанк', 'шея', 'жир', 'отёк', 'отек'],
  'ГЛАЗА_CANTHAL_TILT': ['глаз', 'взгляд', 'круг', 'веко', 'сон', 'выспа'],
  'СИММЕТРИЯ':          ['симметр', 'асимметр', 'перекос', 'наклон голов'],
  'МИДФЕЙС_MAXILLA':    ['мидфейс', 'midface', 'средняя треть', 'скул'],
  'НОС_NOSE':           ['нос', 'профил'],
  'ГУБЫ_СКУЛЫ':         ['губ', 'бальзам', 'улыбк', 'зуб'],
};

function extractTips(text) {
  const i = text.search(/РЕКОМЕНДАЦИИ\s*:/i);
  if (i < 0) return {};
  const lines = text.slice(i).split('\n')
    .map((s) => s.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter((s) => s.length > 12 && !/^РЕКОМЕНДАЦИИ/i.test(s));

  const out = {};
  const push = (cat, line) => { (out[cat] = out[cat] || []).push(line.slice(0, 220)); };

  for (const line of lines) {
    // Основной путь: модель сама поставила метку в промпте замера.
    const tag = line.match(/^\[([А-ЯЁA-Z_]+)\]\s*(.+)$/);
    if (tag && PROG_CATS.includes(tag[1])) { push(tag[1], tag[2].trim()); continue; }

    // Запасной путь: рекомендации из ОБЫЧНОГО анализа, где меток нет
    // (главный промпт мы намеренно не трогаем). Раскладываем по ключевым словам.
    const low = line.toLowerCase();
    for (const [cat, keys] of Object.entries(TIP_KEYS)) {
      if (keys.some((k) => low.includes(k))) { push(cat, line); break; }
    }
  }
  return out;
}

// Какая категория «ведущая» на каждой неделе плана - к ней и цепляем личный совет.
const WEEK_CAT = {
  1: 'ГЛАЗА_CANTHAL_TILT',   // сон и вода
  2: 'КОЖА',
  3: 'ДЖОУЛАЙН_MANDIBLE',    // питание, жир
  4: 'ГРУМИНГ_STYLE',
  5: 'КОЖА',
  6: 'ДЖОУЛАЙН_MANDIBLE',
  7: 'СИММЕТРИЯ',            // осанка
  8: null,                   // контрольная точка - совет по слабейшему параметру
  9: 'ГРУМИНГ_STYLE',
  10: 'КОЖА',
  11: 'НОС_NOSE',            // фото и ракурс
  12: 'ГУБЫ_СКУЛЫ',          // зубы, врачи
  13: null,                  // финал - совет по слабейшему параметру
};


/* ---------- стрик выполнения ---------- */

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// Вызывать из обработчика callback_query в tgWebhook:
//   if (cq.data?.startsWith('wk:')) return await progressCallback(env, cq);
async function progressCallback(env, cq) {
  const [, done, week] = cq.data.split(':');
  const tgid = cq.from.id;

  let streak = parseInt(await env.RATE_LIMIT.get(`streak:${tgid}`) || '0', 10);
  let best   = parseInt(await env.RATE_LIMIT.get(`best:${tgid}`) || '0', 10);

  let text;
  if (done === '1') {
    streak += 1;
    if (streak > best) { best = streak; await env.RATE_LIMIT.put(`best:${tgid}`, String(best)); }
    await env.RATE_LIMIT.put(`streak:${tgid}`, String(streak));
    text = streak >= 4
      ? `🔥 ${streak} ${plural(streak, 'неделя', 'недели', 'недель')} подряд. На этом этапе большинство уже бросает - ты нет.`
      : `Записал. Серия: ${streak} ${plural(streak, 'неделя', 'недели', 'недель')} подряд.`;
  } else {
    // Серию обнуляем, но без нравоучений: пристыдить = потерять человека.
    await env.RATE_LIMIT.put(`streak:${tgid}`, '0');
    text = best > 1
      ? `Бывает. Серия обнулилась, твой рекорд - ${best} ${plural(best, 'неделя', 'недели', 'недель')}. Начинаем заново со следующей.`
      : `Бывает. Неделя не обязана быть идеальной, пропуск одной ничего не ломает - главное не бросать совсем.`;
  }

  await tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
  await tgApi(env, 'sendMessage', { chat_id: tgid, text }).catch(() => {});
  // Лог для админ-статистики: видно, на какой неделе люди отваливаются.
  await env.RATE_LIMIT.put(`wdone:${tgid}:${week}`, done, { expirationTtl: 180 * 86400 });
  return new Response('ok');
}

/* ---------- выбор персонального совета ---------- */

// Порядок такой: сначала категория недели (совет по теме задания), а если по ней
// модель ничего не написала - берём самый слабый параметр человека. Так неделя без
// своей категории (контрольные точки, гардероб) всё равно получает личный совет,
// а не общий текст для всех.
async function pickTip(env, tgid, week) {
  let tips = {};
  try { tips = JSON.parse(await env.RATE_LIMIT.get(`tips:${tgid}`) || '{}'); } catch {}
  if (!Object.keys(tips).length) return null;

  const cat = WEEK_CAT[week];
  if (cat && tips[cat]?.length) return { cat, tip: tips[cat][0], onTopic: true };

  // запасной путь: самая низкая категория последнего замера
  const list = await progList(env, tgid);
  const last = list[list.length - 1];
  if (last?.cats) {
    const weakest = Object.entries(last.cats)
      .filter(([c]) => tips[c]?.length)
      .sort((a, b) => a[1] - b[1])[0];
    if (weakest) return { cat: weakest[0], tip: tips[weakest[0]][0], onTopic: false };
  }

  // совсем запасной: любой непустой совет
  const any = Object.entries(tips).find(([, v]) => v.length);
  return any ? { cat: any[0], tip: any[1][0], onTopic: false } : null;
}

// Человекочитаемые названия категорий - для подписи совета.
const CAT_RU = {
  'СИММЕТРИЯ': 'симметрия', 'ГЛАЗА_CANTHAL_TILT': 'глаза',
  'МИДФЕЙС_MAXILLA': 'мидфейс', 'ДЖОУЛАЙН_MANDIBLE': 'линия челюсти',
  'НОС_NOSE': 'нос', 'ГУБЫ_СКУЛЫ': 'губы и скулы',
  'КОЖА': 'кожа', 'ГРУМИНГ_STYLE': 'груминг',
};

/* ---------- API для сайта ---------- */

async function progressGet(request, env) {
  let body; try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
  const sess = await getSession(env, body.token);
  if (!sess) return json({ error: 'auth' });
  const tgid = sess.id;

  const hasGuide = (await env.RATE_LIMIT.get(`guide:${tgid}`)) === '1';
  if (!hasGuide) return json({ guide: false, pack: PACKS.guide });

  const list = await progList(env, tgid);
  const texts = await progTexts(env, tgid);
  const week = parseInt(await env.RATE_LIMIT.get(`planw:${tgid}`) || '1', 10);
  const last = list[list.length - 1];
  const cooldownLeft = last ? Math.max(0, PROG_COOLDOWN - (Date.now() - last.t)) : 0;

  const streak = parseInt(await env.RATE_LIMIT.get(`streak:${tgid}`) || '0', 10);
  const best   = parseInt(await env.RATE_LIMIT.get(`best:${tgid}`) || '0', 10);

  return json({
    guide: true,
    streak, best,
    week: Math.min(week, PLAN_WEEKS),
    points: list,
    lastText: texts.length ? texts[texts.length - 1].text : '',
    cooldownLeft,
    left: Math.max(0, PROG_MAX - list.length),
  });
}

// Персональный текст задания недели: базовый пункт плана + личный совет из анализа.
async function progressTip(request, env) {
  let body; try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
  const sess = await getSession(env, body.token);
  if (!sess) return json({ error: 'auth' });

  const week = Math.min(Math.max(parseInt(body.week, 10) || 1, 1), PLAN_WEEKS);
  const picked = await pickTip(env, sess.id, week);
  if (!picked) return json({ tip: '' });
  const p = PLAN[week - 1];
  return json({
    tip: picked.tip,
    cat: picked.cat,
    catRu: CAT_RU[picked.cat] || picked.cat,
    onTopic: picked.onTopic,
    chapter: p ? { n: p.ch, title: p.cht, page: p.pg } : null,
  });
}


/* ============================================================================
   [10] РАССЫЛКА БОТА · план недели и напоминание о замере
   ----------------------------------------------------------------------------
   Крон уже стоит раз в час ([triggers] в wrangler.toml), новый не нужен.
   В scheduled() добавить:  ctx.waitUntil(progressCron(env));
   ========================================================================= */

// Список активных участников ведения. Пишется при покупке гайда.
//   guidelist  → JSON [tgid, ...]
async function guideMembers(env) {
  try { return JSON.parse(await env.RATE_LIMIT.get('guidelist') || '[]'); }
  catch { return []; }
}
// вызывать в grantPack ветке guide:
//   const gl = await guideMembers(env);
//   if (!gl.includes(tgid)) { gl.push(tgid); await env.RATE_LIMIT.put('guidelist', JSON.stringify(gl)); }

// Тексты плана - 13 недель. Задание + зачем + как понять, что сделано.
const PLAN = [
  { t:'Сон и вода',            task:'Фиксированное время отбоя, 7–9 часов, 2–2.5 л воды равномерно за день.', why:'Отёк уходит быстрее всего остального - результат виден за 3–5 дней.', check:'Пять ночей подряд лёг в одно время (±30 мин).', ch:'04', cht:'Сон, вода, соль, алкоголь', pg:'10' },
  { t:'Кожа: базовая рутина',  task:'Очищение утром и вечером, увлажнение, SPF 30+ каждое утро. Активы пока не трогаем.', why:'Без базы активы не работают, а сожжённый барьер делает кожу хуже, чем было.', check:'SPF нанесён 7 дней из 7.', ch:'02', cht:'Кожа: фундамент всего', pg:'5' },
  { t:'Питание',               task:'Посчитать норму калорий, дефицит 300–500 ккал, белок 1.6–2 г/кг. Убрать алкоголь.', why:'Процент жира - главный рычаг для челюсти и скул.', check:'Взвесился в один и тот же день недели, утром.', ch:'03', cht:'Процент жира и лицо', pg:'8' },
  { t:'Груминг',               task:'Стрижка у хорошего мастера с 3–4 референсами. Брови. Триммер. Записаться на гигиену.', why:'Самая быстрая отдача: восприятие меняется за один визит.', check:'Стрижка сделана, референсы показаны мастеру.', ch:'05', cht:'Груминг: волосы, борода, брови', pg:'11' },
  { t:'Первый актив',          task:'Ниацинамид или ретинол 2 раза в неделю, только на ночь.', why:'Кожа обновляется за 28 дней - раньше оценивать бессмысленно.', check:'Ни одного вечера с двумя активами сразу.', ch:'02', cht:'Кожа: активы', pg:'7' },
  { t:'Силовые',               task:'3 тренировки в неделю, акцент на плечи и спину. Плюс 8–10 тыс. шагов.', why:'Сохраняет мышцы в дефиците и расширяет силуэт.', check:'3 тренировки и в среднем 8 тыс. шагов.', ch:'08', cht:'Тело и одежда', pg:'15' },
  { t:'Осанка',                task:'Chin tuck ежедневно, растяжка грудных, монитор на уровень глаз.', why:'Поза вперёд головой прячет челюсть и укорачивает шею.', check:'Chin tuck 3 подхода в день, 5 дней из 7.', ch:'07', cht:'Осанка, шея, линия челюсти', pg:'14' },
  { t:'Контрольная точка',     task:'Замер в тех же условиях. Сравнить с точкой отсчёта.', why:'Здесь обычно кажется, что ничего не изменилось - а сравнение показывает обратное.', check:'Замер сделан.', ch:'09', cht:'Фотогеничность', pg:'16' },
  { t:'Гардероб',              task:'Убрать всё не по размеру. Собрать базу из 8–10 однотонных вещей.', why:'Посадка вещей влияет сильнее большинства деталей лица.', check:'В шкафу не осталось вещей не по размеру.', ch:'08', cht:'Тело и одежда', pg:'15' },
  { t:'Второй актив',          task:'Если кожа приняла первый - добавить кислоту в другие дни. При раздражении откатиться.', why:'Наслаивать активы можно только по одному и только на спокойной коже.', check:'Нет покраснения третий день подряд.', ch:'02', cht:'Кожа: активы', pg:'7' },
  { t:'Фото-навык',            task:'Отработать ракурсы из главы 09. Найти рабочий угол и свет.', why:'Половина «плохой внешности на фото» - это оптика и свет.', check:'Серия из 20+ кадров, выбран рабочий ракурс.', ch:'09', cht:'Фотогеничность', pg:'16' },
  { t:'Долгосрочное',          task:'Консультация ортодонта при вопросах к прикусу. Дерматолог, если акне не ушло.', why:'Через 90 дней есть режим, в который такие истории встраиваются.', check:'Записан хотя бы на одну консультацию.', ch:'06', cht:'Зубы и улыбка', pg:'13' },
  { t:'Финальный замер',       task:'Замер в тех же условиях. Сравнение всех точек.', why:'Сравнение с собой в день 0 - единственная честная метрика.', check:'Все точки сравнены.', ch:'12', cht:'План на 90 дней', pg:'20' },
];

async function progressCron(env) {
  const members = await guideMembers(env);
  const now = Date.now();

  for (const tgid of members) {
    try {
      // ── 1. Задание недели: раз в 7 дней от момента покупки ──
      const startedAt = parseInt(await env.RATE_LIMIT.get(`gstart:${tgid}`) || '0', 10);
      if (startedAt) {
        const weekNow = Math.min(Math.floor((now - startedAt) / (7 * 864e5)) + 1, PLAN_WEEKS);
        const weekSent = parseInt(await env.RATE_LIMIT.get(`wsent:${tgid}`) || '0', 10);
        if (weekNow > weekSent) {
          const p = PLAN[weekNow - 1];
          const picked = await pickTip(env, tgid, weekNow);
          const tip = picked
            ? (picked.onTopic
                ? `\n\n<b>Лично тебе - из твоего анализа:</b>\n${picked.tip}`
                : `\n\n<b>Твоё слабое место сейчас (${CAT_RU[picked.cat] || picked.cat}):</b>\n${picked.tip}`)
            : '';
          await tgApi(env, 'sendMessage', {
            chat_id: tgid, parse_mode: 'HTML',
            text: `<b>Неделя ${weekNow} из ${PLAN_WEEKS} · ${p.t}</b>\n\n`
                + `<b>Задание.</b> ${p.task}\n\n`
                + `<b>Зачем.</b> ${p.why}\n\n`
                + `<b>Как понять, что сделано.</b> ${p.check}${tip}\n\n`
                + `📕 Подробно в гайде: глава ${p.ch} «${p.cht}», стр. ${p.pg}.\n`
                + `Весь план и разбор параметров - на facerate.ru, вкладка «Ведение».`,
          }).catch(() => {});
          await env.RATE_LIMIT.put(`wsent:${tgid}`, String(weekNow));
          await env.RATE_LIMIT.put(`planw:${tgid}`, String(weekNow));
          await env.RATE_LIMIT.put(`wask:${tgid}`, '0');   // на эту неделю ещё не спрашивали
        }
      }

      // ── 1b. Опрос в конце недели: сделал или нет ──
      // Спрашиваем на 6-й день, чтобы человек ещё успел дожать, а мы узнали,
      // что он отвалился, до того как он молча исчезнет.
      if (startedAt) {
        const weekNow = Math.min(Math.floor((now - startedAt) / (7 * 864e5)) + 1, PLAN_WEEKS);
        const dayInWeek = Math.floor(((now - startedAt) % (7 * 864e5)) / 864e5);
        const asked = (await env.RATE_LIMIT.get(`wask:${tgid}`)) === '1';
        if (!asked && dayInWeek >= 5 && weekNow <= PLAN_WEEKS) {
          const streak = parseInt(await env.RATE_LIMIT.get(`streak:${tgid}`) || '0', 10);
          await tgApi(env, 'sendMessage', {
            chat_id: tgid, parse_mode: 'HTML',
            text: `Неделя ${weekNow} подходит к концу. Справился с заданием?`
                + (streak > 1 ? `\n\nСейчас серия: ${streak} ${plural(streak, 'неделя', 'недели', 'недель')} подряд.` : ''),
            reply_markup: { inline_keyboard: [[
              { text: '✅ Сделал', callback_data: `wk:1:${weekNow}` },
              { text: '✗ Не вышло', callback_data: `wk:0:${weekNow}` },
            ]] },
          }).catch(() => {});
          await env.RATE_LIMIT.put(`wask:${tgid}`, '1');
        }
      }

      // ── 2. Напоминание о замере: когда прошли 10 дней ──
      const list = await progList(env, tgid);
      const last = list[list.length - 1];
      const since = last ? now - last.t : (startedAt ? now - startedAt : 0);
      if (since >= PROG_COOLDOWN) {
        const remKey = `prem:${tgid}`;
        const lastRem = parseInt(await env.RATE_LIMIT.get(remKey) || '0', 10);
        // не чаще раза в 3 дня, чтобы не превратиться в спам
        if (now - lastRem > 3 * 864e5) {
          await tgApi(env, 'sendMessage', {
            chat_id: tgid, parse_mode: 'HTML',
            text: last
              ? `📸 <b>Пора на замер</b>\n\nС прошлого прошло ${Math.floor(since / 864e5)} дней - можно снимать.\n\n`
                + `Главное: тот же свет, та же дистанция, то же время суток. Иначе сравнишь не себя, а освещение.\n\n`
                + `facerate.ru → «Ведение» → «Сделать замер»`
              : `📸 <b>Сделай точку отсчёта</b>\n\nБез неё через 90 дней не с чем будет сравнивать - к своему лицу глаз привыкает моментально.\n\n`
                + `facerate.ru → «Ведение» → «Сделать замер»`,
          }).catch(() => {});
          await env.RATE_LIMIT.put(remKey, String(now));
        }
      }
    } catch { /* один сломанный юзер не должен рушить рассылку остальным */ }
  }
}


