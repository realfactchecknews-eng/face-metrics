// ─── FaceRate worker: анализ + аккаунты (Telegram) + квоты + Stars-платежи ───
//
// Роуты:
//   POST /            — анализ (нужен token сессии; 1 free/день за подписку на канал, дальше кредиты)
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

const CHANNEL = '@wwwfacerateru';        // канал, подписка на который даёт 1 free/день
const LAVA_MIN_RUB = 50;                 // минимальная сумма инвойса у Lava.top — ниже нельзя ни при какой скидке
const FREE_PER_DAY = 1;                  // бесплатных анализов в день подписчику
const ADMIN_USERNAMES = ['Matveyika'];   // кто может создавать промокоды в боте
const PACKS = {                          // тарифы: stars — XTR, rub — рубли (ЮKassa/CryptoBot)
  p1: { type: 'credits', credits: 1, stars: 29,  rub: 50,  label: '1 анализ', labelEn: '1 analysis' }, // 50₽ — минималка Lava.top
  p5: { type: 'credits', credits: 5, stars: 99,  rub: 149, label: '5 анализов', labelEn: '5 analyses' },
  // lavaRub — реальная цена, настроенная в личном кабинете Lava.top (специально выше rub,
  // чтобы карта/СБП стоили дороже Stars/крипты); без него кнопка в боте показывала бы
  // устаревшую сумму, а по факту с человека спишут другую.
  d1: { type: 'unlim',  hours: 24,   stars: 99,  rub: 149, lavaRub: 300, label: 'Безлимит на день', labelEn: 'Day unlimited' },
  // Разовый месяц (без автопродления). Чтобы включить Stars-подписку с автопродлением,
  // верни type:'sub' и period:2592000 — но сначала активируй подписки бота в @BotFather,
  // иначе Telegram вернёт SUBSCRIPTION_EXPORT_MISSING.
  m1: { type: 'unlim',  hours: 720,  stars: 499, rub: 749, lavaRub: 999, label: 'Безлимит на месяц', labelEn: 'Month unlimited' },
};
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
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(null, 204);
    if (request.method !== 'POST') return cors('Method not allowed', 405);
    const path = new URL(request.url).pathname;
    try {
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
      return await analyze(request, env);
    } catch (e) {
      return json({ error: 'server', text: 'Внутренняя ошибка: ' + e.message });
    }
  },
};

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

  // Квота: безлимит → подписка на канал (1 free/день) → кредиты.
  const unlimUntil = parseInt(await env.RATE_LIMIT.get(`unlim:${tgid}`) || '0', 10);
  const subscribed = await isSubscribed(env, tgid);
  const freeKey = `q:${tgid}:${today}`;
  const freeUsed = parseInt(await env.RATE_LIMIT.get(freeKey) || '0', 10);
  const credits = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);

  let mode = null;
  if (unlimUntil > Date.now()) mode = 'unlim';
  else if (subscribed && freeUsed < FREE_PER_DAY) mode = 'free';
  else if (credits > 0) mode = 'paid';
  else if (!subscribed) {
    return json({ error: 'sub', text: 'Подпишись на канал ' + CHANNEL + ' — это даёт 1 бесплатный анализ в день.', channel: CHANNEL });
  } else {
    return json({ error: 'pay', text: 'Бесплатный анализ на сегодня использован. Купи кредиты, чтобы продолжить.', packs: PACKS });
  }

  // Глобальный потолок БЕСПЛАТНЫХ анализов в сутки — защита бюджета OpenRouter.
  // Не блокирует уже оплативших (unlim/paid), чтобы платёж не пропадал впустую при наплыве трафика.
  if (env.RATE_LIMIT && mode === 'free') {
    const g = parseInt(await env.RATE_LIMIT.get(`g:${today}`) || '0', 10);
    if (g >= GLOBAL_DAILY_CAP) {
      return json({ error: 'global', text: 'Дневной лимит бесплатных анализов исчерпан. Загляните завтра или купи кредиты.', packs: PACKS });
    }
  }

  // Модель.
  const imgs = Array.isArray(body.images) && body.images.length
    ? body.images
    : (body.image ? [body.image] : []);
  const messages = imgs.length
    ? [{ role: 'user', content: [
        ...imgs.map((b64) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } })),
        { type: 'text', text: body.prompt },
      ]}]
    : [{ role: 'user', content: body.prompt }];

  const buildBody = (withSeed) => {
    const b = {
      model: 'x-ai/grok-4.3',
      max_tokens: 2200,
      temperature: 0.7,
      top_p: 0.95,
      reasoning: { effort: 'low' },
      messages,
    };
    if (withSeed) b.seed = 1337;
    return JSON.stringify(b);
  };

  let data, lastErr = 'unknown';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENROUTER_API_KEY}` },
        body: buildBody(attempt < 2),
      });
      data = await res.json();
    } catch (err) { lastErr = err.message; data = null; }
    if (data?.choices?.[0]?.message?.content) break;
    lastErr = data?.error?.message ?? lastErr;
    if (attempt < 2) await new Promise(r => setTimeout(r, 700));
  }
  if (!data?.choices?.[0]?.message?.content) {
    return json({ error: 'model', text: `Сервис перегружен, попробуйте ещё раз. (${lastErr})` });
  }

  // Списание ПОСЛЕ успеха: безлимит не тратится; free → счётчик дня; paid → минус кредит.
  let creditsLeft = credits, freeLeft = subscribed ? (FREE_PER_DAY - freeUsed) : 0;
  if (mode === 'free') {
    await env.RATE_LIMIT.put(freeKey, String(freeUsed + 1), { expirationTtl: 93600 });
    freeLeft = FREE_PER_DAY - freeUsed - 1;
  } else if (mode === 'paid') {
    creditsLeft = credits - 1;
    await env.RATE_LIMIT.put(`credits:${tgid}`, String(creditsLeft));
  }
  const g = parseInt(await env.RATE_LIMIT.get(`g:${today}`) || '0', 10);
  await env.RATE_LIMIT.put(`g:${today}`, String(g + 1), { expirationTtl: 93600 });

  return json({ text: data.choices[0].message.content, mode, creditsLeft, freeLeft, subscribed });
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
  const today = new Date().toISOString().slice(0, 10);
  const subscribed = await isSubscribed(env, user.id, fresh);
  const freeUsed = parseInt(await env.RATE_LIMIT.get(`q:${user.id}:${today}`) || '0', 10);
  const credits = parseInt(await env.RATE_LIMIT.get(`credits:${user.id}`) || '0', 10);
  const unlimUntil = parseInt(await env.RATE_LIMIT.get(`unlim:${user.id}`) || '0', 10);
  return {
    token, user, subscribed,
    freeLeft: subscribed ? Math.max(0, FREE_PER_DAY - freeUsed) : 0,
    credits, channel: CHANNEL, packs: PACKS, methods: enabledMethods(env),
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

// ─────────────────────────── Stars-платежи ───────────────────────────
async function buy(request, env) {
  let body; try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
  const sess = await getSession(env, body.token);
  if (!sess) return json({ error: 'auth', text: 'Сначала войдите через Telegram.' });
  const pack = PACKS[body.pack];
  if (!pack) return json({ error: 'pack', text: 'Неизвестный пакет.' });
  const L = body.lang === 'ru' ? 'ru' : 'en';
  const method = body.method || 'stars';

  const discPct = await buyerDiscountPct(env, sess.id);
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

// Создание инвойса-ссылки через Telegram. method: 'stars' (XTR) | 'rub' (карта РФ, ЮKassa).
async function createInvoice(env, tgid, packId, L, method = 'stars', discPct = 0) {
  const pack = PACKS[packId];
  const unlimRu = pack.hours >= 720 ? 'на месяц' : pack.hours >= 168 ? 'на неделю' : 'на 24 часа';
  const unlimEn = pack.hours >= 720 ? 'for a month' : pack.hours >= 168 ? 'for a week' : 'for 24 hours';
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
// Товары с "ценой по запросу через API" (isDynamicPrice:true) требуют явный amount
// в запросе на инвойс, иначе Lava.top отвечает "invoice cannot be created". Тянем
// актуальную цену прямо из их каталога — так правки цены в личном кабинете Lava.top
// подхватываются сами, без правки кода/деплоя.
async function lavaProductPrice(env, offerId) {
  const r = await fetch('https://gate.lava.top/api/v2/products?feedVisibility=ALL', {
    headers: { 'X-Api-Key': env.LAVA_API_KEY },
  }).then(x => x.json()).catch(() => null);
  for (const item of r?.items || []) {
    for (const offer of item.offers || []) {
      if (offer.id === offerId) {
        const p = (offer.prices || []).find(p => p.currency === 'RUB');
        // amount разрешён в /invoice ТОЛЬКО для offer'ов с isDynamicPrice:true —
        // на фикс-цену Lava.top отвечает "is not dynamic price", если его передать.
        return item.isDynamicPrice && p ? p.amount : null;
      }
    }
  }
  return null;
}
// sbp:true → провайдер PAY2ME/способ SBP (прямой QR-код СБП, найдено в их openapi-спеке
// gate.lava.top/docs/documentation.yaml — не описано в обычной документации).
// Без этого флага — провайдер по умолчанию SMART_GLOCAL (карта Visa/MC/МИР).
async function createLavaInvoice(env, tgid, packId, L, discPct = 0, sbp = false) {
  const offerId = lavaOfferIds(env)[packId];
  if (!offerId) return { ok: false, error: 'оффер для этого тарифа не настроен в Lava.top' };
  const amount = await lavaProductPrice(env, offerId);
  const body = {
    email: `tg${tgid}@facerate.ru`,
    offerId,
    currency: 'RUB',
    periodicity: 'ONE_TIME',
    buyerLanguage: L === 'ru' ? 'RU' : 'EN',
  };
  if (sbp) { body.paymentProvider = 'PAY2ME'; body.paymentMethod = 'SBP'; }
  // Скидку можно применить только у офферов с динамической ценой (amount != null) —
  // у фикс-цены Lava.top не даёт передавать amount вообще. LAVA_MIN_RUB — их минималка
  // по цене инвойса; ниже нельзя, иначе Lava.top отклонит запрос целиком.
  if (amount != null) body.amount = Math.max(LAVA_MIN_RUB, applyDiscount(amount, discPct));
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
    await env.RATE_LIMIT.put(seenKey, '1', { expirationTtl: 60 * 60 * 24 * 30 });
    const m = /^tg(\d+)@/.exec(upd.buyer?.email || '');
    const tgid = m ? m[1] : null;
    const offerIds = lavaOfferIds(env);
    const packId = Object.keys(offerIds).find((k) => offerIds[k] === upd.product?.id);
    const pack = PACKS[packId];
    if (!tgid || !pack) return new Response('ok');
    const L = await userLang(env, tgid);
    const note = await grantPack(env, tgid, pack, L);
    const orderId = await recordOrder(env, { tgid, pack: packId, method: 'card', amount: upd.amount, currency: upd.currency || 'RUB', username: '', name: '' });
    await trackReferralPurchase(env, tgid, pack, 'card');
    await tgApi(env, 'sendMessage', { chat_id: tgid, text: BL[L].payOk(note, orderId), reply_markup: menuKb(L), parse_mode: 'HTML' });
  } catch { /* payload сломан — игнор */ }
  return new Response('ok');
}

// ─────────────────────────── CryptoBot (Crypto Pay API) ───────────────────────────
// createInvoice в фиате RUB — оплата любой поддержанной криптой, курс считает CryptoBot.
async function createCryptoInvoice(env, tgid, packId, L, discPct = 0) {
  const pack = PACKS[packId];
  const descRu = pack.type === 'credits' ? `${pack.credits} AI-анализ(а) на facerate.ru`
    : pack.hours >= 720 ? 'Безлимит на месяц на facerate.ru' : 'Безлимит на день на facerate.ru';
  const descEn = pack.type === 'credits' ? `${pack.credits} AI analyses on facerate.ru`
    : pack.hours >= 720 ? 'Month unlimited on facerate.ru' : 'Day unlimited on facerate.ru';
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
    const orderId = await recordOrder(env, { tgid, pack: payload.pack || '', method: 'crypto', amount: upd.payload.amount, currency: upd.payload.asset || upd.payload.fiat, username: '', name: '' });
    await trackReferralPurchase(env, tgid, pack, 'crypto');
    await tgApi(env, 'sendMessage', { chat_id: tgid, text: BL[L].payOk(note, orderId), reply_markup: menuKb(L), parse_mode: 'HTML' });
  } catch { /* payload сломан — игнор */ }
  return new Response('ok');
}

function tgApi(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()).catch(e => ({ ok: false, description: e.message }));
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
    kbSub: '🔄 My subscription', kbGw: '🎉 Giveaways', kbSite: '🌐 Open FaceRate', kbLang: '🌍 Язык: Русский',
    kbSupport: '💬 Support',
    kbBack: '← Menu',
    shopTitle: '⭐ What are we getting?',
    shop1: (s) => `1 analysis — ${s}⭐`, shop5: (s) => `5 — ${s}⭐`,
    shopD: (s) => `🔥 Day unlimited — ${s}⭐`, shopM: (s) => `👑 Month unlimited — ${s}⭐`,
    loginOk: '✅ Logged in! Go back to the site — the page will pick up your account automatically.',
    hello: '🖤 FaceRate — AI face rating by looksmaxxing canons.\n\nSubscribe to ' + CHANNEL + ' = 1 free analysis per day.',
    statusHead: '💎 Your status:\n',
    statusUnlim: (d) => `👑 Unlimited until ${d}\n`,
    statusCredits: (n) => `⭐ Credits: ${n}\n`,
    statusSub: (n) => `✅ Subscribed to the channel — free today: ${n}\n`,
    statusNoSub: `❌ Not subscribed to ${CHANNEL} — subscribe for 1 free analysis per day\n`,
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
    promoBad: "That doesn't look like a promo code. Try again from the menu.",
    promoNo: '❌ No such promo code, or it has expired.',
    promoUsed: 'You already used this promo code 😉',
    promoOut: '😞 All activations of this code are gone.',
    promoOkCredits: (n) => `+${n} analyses`,
    promoOkUnlim: (h) => `unlimited for ${h}h`,
    promoOkDiscount: (p) => `${p}% off your next purchase (24h)`,
    promoOkRefcode: (c) => `🎉 Promo code activated! Your next purchase (within 24h) will count for partner ${c}.`,
    promoOk: (g) => `🎉 Promo code activated: ${g}! Open facerate.ru and enjoy.`,
    payCredits: (n) => `credits added: ${n}`,
    payUnlim: (d) => `👑 unlimited until ${d}`,
    paySub: (d) => `👑 month unlimited until ${d}`,
    payRec: ', auto-renewal is on',
    payOk: (n, id) => `✅ Payment received! ${n}.\nGo back to facerate.ru — everything is updated.${id ? `\n\nOrder ID: <code>${id}</code> (quote it if you write to support)` : ''}`,
    langSet: '🌍 Language set: English.',
    pickLang: '🌍 Choose language / Выбери язык:',
  },
  ru: {
    menu: 'Меню FaceRate:',
    kbStatus: '💎 Мой статус', kbShop: '⭐ Купить анализы / безлимит', kbOrders: '📦 Мои заказы', kbPromo: '🎁 Ввести промокод',
    kbSub: '🔄 Моя подписка', kbGw: '🎉 Розыгрыши', kbSite: '🌐 Открыть FaceRate', kbLang: '🌍 Language: English',
    kbSupport: '💬 Поддержка',
    kbBack: '← Меню',
    shopTitle: '⭐ Что берём?',
    shop1: (s) => `1 анализ — ${s}⭐`, shop5: (s) => `5 — ${s}⭐`,
    shopD: (s) => `🔥 Безлимит на день — ${s}⭐`, shopM: (s) => `👑 Безлимит на месяц — ${s}⭐`,
    loginOk: '✅ Вход выполнен! Возвращайся на сайт — страница подхватит аккаунт сама.',
    hello: '🖤 FaceRate — AI-оценка лица по канонам луксмаксинга.\n\nПодписка на ' + CHANNEL + ' = 1 бесплатный анализ в день.',
    statusHead: '💎 Твой статус:\n',
    statusUnlim: (d) => `👑 Безлимит до ${d}\n`,
    statusCredits: (n) => `⭐ Кредиты: ${n}\n`,
    statusSub: (n) => `✅ Подписан на канал — бесплатных сегодня: ${n}\n`,
    statusNoSub: `❌ Не подписан на ${CHANNEL} — подпишись и получай 1 бесплатный анализ в день\n`,
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
    promoBad: 'Это не похоже на промокод. Попробуй ещё раз через меню.',
    promoNo: '❌ Такого промокода нет или он истёк.',
    promoUsed: 'Ты уже активировал этот промокод 😉',
    promoOut: '😞 Увы, все активации этого промокода уже разобрали.',
    promoOkCredits: (n) => `+${n} анализ(а)`,
    promoOkUnlim: (h) => `безлимит на ${h} ч`,
    promoOkDiscount: (p) => `скидка ${p}% на следующую покупку (24ч)`,
    promoOkRefcode: (c) => `🎉 Промокод активирован! Твоя следующая покупка (в течение 24ч) засчитается партнёру ${c}.`,
    promoOk: (g) => `🎉 Промокод активирован: ${g}! Открывай facerate.ru и пользуйся.`,
    payCredits: (n) => `начислено анализов: ${n}`,
    payUnlim: (d) => `👑 безлимит до ${d}`,
    paySub: (d) => `👑 месячный безлимит до ${d}`,
    payRec: ', автопродление включено',
    payOk: (n, id) => `✅ Оплата получена! ${n}.\nВозвращайся на facerate.ru — всё уже обновлено.${id ? `\n\nID заказа: <code>${id}</code> (укажи его, если напишешь в поддержку)` : ''}`,
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
// Шаг 2: тарифы с ценой в валюте выбранного способа.
function packsKb(method, L) {
  const price = (p) => method === 'stars' ? `${p.stars}⭐` : (method === 'rub' || method === 'sbp') ? `${p.lavaRub || p.rub}₽` : `${p.rub}₽`;
  const row = (id, emoji) => [{ text: `${emoji}${packLabel(PACKS[id], L)} — ${price(PACKS[id])}`, callback_data: `pay:${id}:${method}` }];
  return { inline_keyboard: [
    row('p1', ''), row('p5', ''), row('d1', '🔥 '), row('m1', '👑 '),
    [{ text: BL[L].kbBack, callback_data: 'shop' }],
  ]};
}

async function tgWebhook(request, env) {
  // Проверка, что вебхук реально от Telegram (секретный заголовок).
  if (env.TG_WEBHOOK_SECRET && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TG_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  let upd; try { upd = await request.json(); } catch { return new Response('ok'); }

  // Подтверждаем оплату (в т.ч. продления подписки).
  if (upd.pre_checkout_query) {
    await tgApi(env, 'answerPreCheckoutQuery', { pre_checkout_query_id: upd.pre_checkout_query.id, ok: true });
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
      await attributeReferral(env, tgid, code.slice(4).toUpperCase());
      await tgApi(env, 'sendMessage', { chat_id: chat, text: b.hello, reply_markup: menuKb(L) });
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

  // ── Ожидание промокода (после кнопки 🎁) ──
  const waiting = await env.RATE_LIMIT.get(`pmstate:${tgid}`);
  if (waiting) {
    await env.RATE_LIMIT.delete(`pmstate:${tgid}`);
    await redeemPromo(env, chat, tgid, text.toUpperCase(), L);
    return new Response('ok');
  }

  await tgApi(env, 'sendMessage', { chat_id: chat, text: b.menu, reply_markup: menuKb(L) });
  return new Response('ok');
}

async function handleCallback(env, cq) {
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
    const today = new Date().toISOString().slice(0, 10);
    const credits = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
    const freeUsed = parseInt(await env.RATE_LIMIT.get(`q:${tgid}:${today}`) || '0', 10);
    const unlim = parseInt(await env.RATE_LIMIT.get(`unlim:${tgid}`) || '0', 10);
    const sub = await isSubscribed(env, tgid, true);
    let t = b.statusHead;
    if (unlim > Date.now()) t += b.statusUnlim(fmtDate(unlim, L));
    t += b.statusCredits(credits);
    t += sub ? b.statusSub(Math.max(0, FREE_PER_DAY - freeUsed)) : b.statusNoSub;
    await reply(t, menuKb(L));
  } else if (data === 'shop') {
    // Шаг 1: выбор способа оплаты.
    await reply(b.payPick, methodKb(L, env));
  } else if (data.startsWith('mth:')) {
    // Шаг 2: тарифы под выбранный способ.
    const method = data.slice(4);
    await reply(b.shopTitle, packsKb(method, L));
  } else if (data.startsWith('pay:')) {
    // Шаг 2: выставление счёта выбранным способом.
    const [, packId, method] = data.split(':');
    const pack = PACKS[packId];
    if (!pack) return;
    const discPct = await buyerDiscountPct(env, tgid);
    await env.RATE_LIMIT.delete(`pendingDiscount:${tgid}`); // промо-скидка одноразовая; реф-скидка не тут, а в самом ref-объекте
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
    await reply(
      b.gw,
      { inline_keyboard: [[{ text: b.kbChannel, url: 'https://t.me/wwwfacerateru' }], [{ text: b.kbBack, callback_data: 'menu' }]] },
    );
  }
}

async function redeemPromo(env, chat, tgid, code, L) {
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

  if (promo.refcode) {
    // Не даёт бонус покупателю — просто переключает, кому засчитается его следующая покупка
    // (перебивает обычную привязку по реф-ссылке, если она была; действует 24ч, одноразово).
    await env.RATE_LIMIT.put(`pendingRefCode:${tgid}`, promo.refcode, { expirationTtl: 60 * 60 * 24 });
    await tgApi(env, 'sendMessage', { chat_id: chat, text: b.promoOkRefcode(promo.refcode), reply_markup: menuKb(L) });
    return;
  }
  let grant;
  if (promo.discount) {
    // Скидка не начисляется сразу — применяется к следующей оплате в течение 24ч.
    await env.RATE_LIMIT.put(`pendingDiscount:${tgid}`, String(promo.discount), { expirationTtl: 60 * 60 * 24 });
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
    const payload = JSON.parse(sp.invoice_payload);
    const tgid = payload.tgid || msg.from.id;
    const pack = PACKS[payload.pack];
    let note = '';
    if (payload.credits && !pack) {
      // старый формат payload {tgid, credits}
      const cur = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
      await env.RATE_LIMIT.put(`credits:${tgid}`, String(cur + payload.credits));
      note = b.payCredits(payload.credits);
    } else {
      note = await grantPack(env, tgid, pack, L, sp);
    }
    const orderId = await recordOrder(env, {
      tgid, pack: payload.pack || '', method: sp.currency === 'XTR' ? 'stars' : 'rub',
      amount: sp.currency === 'XTR' ? sp.total_amount : sp.total_amount / 100, currency: sp.currency,
      username: msg.from.username || '', name: msg.from.first_name || '',
    });
    await trackReferralPurchase(env, tgid, pack, sp.currency === 'XTR' ? 'stars' : 'rub');
    await tgApi(env, 'sendMessage', { chat_id: msg.chat.id, text: b.payOk(note, orderId), reply_markup: menuKb(L || 'en'), parse_mode: 'HTML' });
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
    faq: '❓ FAQ\n\n• Free analysis — subscribe to @wwwfacerateru (1/day).\n• Paid — Telegram Stars or crypto in the payments bot.\n• No access after paying? Refresh facerate.ru; if it persists — tap “Call an operator”.\n• Promo codes — button in the payments bot; codes drop in channel giveaways.\n• Privacy — your photo is used only for the analysis and is not published.\n\nStill stuck? Just type your question here.',
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
    faq: '❓ Частые вопросы\n\n• Бесплатный анализ — подпишись на @wwwfacerateru (1 в день).\n• Платно — Telegram Stars или крипта в боте оплаты.\n• Не пришёл доступ после оплаты? Обнови facerate.ru; если не помогло — жми «Позвать оператора».\n• Промокоды — кнопка в боте оплаты; коды бывают в розыгрышах канала.\n• Приватность — фото используется только для анализа и не публикуется.\n\nНе нашёл ответа? Просто напиши вопрос сюда.',
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
    [{ text: '🔗 Для медийки (промо на процент)', callback_data: 'ptype:refcode' }],
    [{ text: '← Промокоды', callback_data: 'admpromo' }],
  ]};
}
const PROMO_AMOUNT_PRESETS = { credits: [1, 3, 5, 10], hours: [24, 72, 168, 720], discount: [10, 15, 20, 25, 30, 50] };
function promoAmountKb(type) {
  const fmt = (v) => type === 'discount' ? `${v}%` : type === 'hours' ? `${v}ч` : `${v}`;
  const rows = PROMO_AMOUNT_PRESETS[type].map((v) => ([{ text: fmt(v), callback_data: `pamt:${v}` }]));
  rows.push([{ text: '✏️ Другое число', callback_data: 'pamt:custom' }]);
  rows.push([{ text: '← Назад', callback_data: 'admpromoadd' }]);
  return { inline_keyboard: rows };
}
// Выбор существующего реф-кода для промо типа "для медийки" (или ручной ввод, если код ещё не создан).
async function refPickKb(env) {
  const list = await env.RATE_LIMIT.list({ prefix: 'ref:' });
  const codes = list.keys.map((k) => k.name.slice(4)).sort();
  const rows = codes.map((c) => ([{ text: `🔗 ${c}`, callback_data: `pamt:${c}` }]));
  rows.push([{ text: '✏️ Другой код', callback_data: 'pamt:custom' }]);
  rows.push([{ text: '← Назад', callback_data: 'admpromoadd' }]);
  return { inline_keyboard: rows };
}
const PROMO_USES_PRESETS = [1, 5, 10, 25, 50, 100];
function promoUsesKb() {
  const rows = PROMO_USES_PRESETS.map((v) => ([{ text: `${v}`, callback_data: `puses:${v}` }]));
  rows.push([{ text: '✏️ Другое число', callback_data: 'puses:custom' }]);
  return { inline_keyboard: rows };
}
async function promoListText(env) {
  const list = await env.RATE_LIMIT.list({ prefix: 'promo:' });
  const lines = [];
  for (const k of list.keys) {
    const raw = await env.RATE_LIMIT.get(k.name);
    if (!raw) continue;
    let p; try { p = JSON.parse(raw); } catch { continue; }
    const code = k.name.slice('promo:'.length);
    const gift = p.credits ? `+${p.credits} анализ(ов)` : p.hours ? `безлимит ${p.hours}ч` : p.discount ? `скидка ${p.discount}%` : p.refcode ? `засчитать партнёру ${p.refcode}` : '?';
    const used = p.max ? `${p.max - p.uses}/${p.max} использовано` : `осталось ${p.uses}`;
    lines.push(`🎟 ${code} — ${gift} — ${used}`);
  }
  if (!lines.length) return '🎁 Активных промокодов нет.';
  return `🎁 Активные промокоды (${lines.length}):\n\n` + lines.join('\n');
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
    const who = t.name || t.username ? `${t.name || ''}${t.username ? ' @' + t.username : ''}` : `id${t.tgid}`;
    const price = t.method === 'stars' ? `${t.amount}⭐` : t.method === 'crypto' ? `${t.amount} ${t.currency}` : `${t.amount}₽`;
    const id = t.id ? ` — ID <code>${t.id}</code>` : '';
    return `${dt} — ${who} — ${t.pack} — ${price} (${t.method})${id}`;
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
- Бесплатно: подписка на канал @wwwfacerateru даёт 1 бесплатный анализ в день.
- Платно: пакеты «1 анализ», «5 анализов», «безлимит на день», «безлимит на месяц». Оплата — Telegram Stars или криптой (через CryptoBot), цена в звёздах или рублях.
- Вход на сайте — через Telegram. После оплаты доступ появляется автоматически, обнови страницу.
- Промокоды: в боте кнопка «Ввести промокод»; коды бывают в розыгрышах в канале.
Отвечай кратко (2–4 предложения), на русском. Если вопрос про возврат денег, проблему с оплатой, доступ после оплаты, баг или что-то, в чём не уверен — не выдумывай, а попроси нажать «Позвать оператора».`,
  en: `You are the polite support agent for FaceRate (facerate.ru) — AI face rating by looksmaxxing canons (website + Telegram bot).
Facts:
- Free: subscribing to the @wwwfacerateru channel gives 1 free analysis per day.
- Paid: packages "1 analysis", "5 analyses", "day unlimited", "month unlimited". Payment via Telegram Stars or crypto (CryptoBot), priced in stars or rubles.
- Login on the site is via Telegram. After payment access appears automatically — refresh the page.
- Promo codes: the bot has an "Enter promo code" button; codes appear in channel giveaways.
Answer briefly (2–4 sentences), in English. For refunds, payment issues, access-after-payment, bugs, or anything you’re unsure about — do not make things up; ask them to tap "Call an operator".`,
};

function supportApi(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.SUPPORT_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).then(r => r.json()).catch(e => ({ ok: false, description: e.message }));
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
// Скидка покупателя: приоритет у промокода (pendingDiscount), иначе — скидка по реф-ссылке, если пришёл по ней.
async function buyerDiscountPct(env, tgid) {
  const pd = await env.RATE_LIMIT.get(`pendingDiscount:${tgid}`);
  if (pd) return parseInt(pd, 10) || 0;
  const code = await env.RATE_LIMIT.get(`refby:${tgid}`);
  if (!code) return 0;
  const ref = await getRef(env, code);
  return ref?.buyerPct || 0;
}
function applyDiscount(amount, pct) { return pct > 0 ? Math.max(1, Math.round(amount * (100 - pct) / 100)) : amount; }
// Первое касание — фиксируем реферера за пользователем один раз и считаем клик по ссылке.
async function attributeReferral(env, tgid, code) {
  const ref = await getRef(env, code);
  if (!ref) return; // код не создан админом — игнорируем мусорные ссылки
  const already = await env.RATE_LIMIT.get(`refby:${tgid}`);
  if (already) return;
  await env.RATE_LIMIT.put(`refby:${tgid}`, code);
  ref.clicks = (ref.clicks || 0) + 1;
  await env.RATE_LIMIT.put(`ref:${code}`, JSON.stringify(ref));
}
// Грубая оценка выручки в рублях для отчёта партнёру — не бухгалтерская точность, а ориентир.
function packRevenueRub(pack, method) {
  if (!pack) return 0;
  if (method === 'card' || method === 'rub') return pack.lavaRub || pack.rub || 0;
  return pack.rub || 0;
}
// Вызывается после любой успешной оплаты (Stars/ЮKassa, Lava.top, CryptoBot).
async function trackReferralPurchase(env, tgid, pack, method) {
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
    ref.revenueRub = (ref.revenueRub || 0) + packRevenueRub(pack, method);
    await env.RATE_LIMIT.put(`ref:${code}`, JSON.stringify(ref));
    if (override) await env.RATE_LIMIT.delete(`pendingRefCode:${tgid}`); // одноразовое переключение
  } catch { /* учёт рефералки не должен ронять оплату */ }
}
// Кликабельный список — по одной кнопке на код, вместо простыни текста.
async function refListKb(env, backCb) {
  const list = await env.RATE_LIMIT.list({ prefix: 'ref:' });
  const codes = list.keys.map((k) => k.name.slice(4)).sort();
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
  const list = await env.RATE_LIMIT.list({ prefix: 'ref:' });
  if (!list.keys.length) return '🔗 Реферальных ссылок пока нет.';
  const lines = [];
  for (const k of list.keys) {
    const r = await getRef(env, k.name.slice(4));
    if (!r) continue;
    const code = k.name.slice(4);
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
async function myRefStatsText(env, tgid) {
  const codes = await ownedCodes(env, tgid);
  if (!codes.length) return '📊 У тебя пока нет привязанных кодов. Нажми «🔑 Привязать код» и отправь код, который тебе выдали.';
  const lines = [];
  for (const code of codes) {
    const r = await getRef(env, code);
    if (!r) continue;
    lines.push(`🔗 ${code} — ${r.clicks || 0} переходов, ${r.purchases || 0} покупок\nТвоя доля: ~${refPayout(r)}₽ (${r.pct || 0}% от ~${r.revenueRub || 0}₽)`);
  }
  return `📊 Твоя статистика:\n\n` + lines.join('\n\n');
}
function mediaMenuKb(isAdmin) {
  const rows = [[{ text: '🔑 Привязать код', callback_data: 'claim' }], [{ text: '📊 Моя статистика', callback_data: 'mystats' }]];
  if (isAdmin) rows.push([{ text: '📋 Все рефералки', callback_data: 'alladmin' }]);
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
      await reply(await myRefStatsText(env, tgid), mediaMenuKb(isAdmin));
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
    await mediaApi(env, 'sendMessage', { chat_id: chat, text: `✅ Код ${code} привязан к тебе!\n\n` + await myRefStatsText(env, tgid), reply_markup: mediaMenuKb(isAdmin) });
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
  await putList(env, 'translog', list.slice(0, 50));
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
  list.unshift({ ...full, ts: Date.now() });
  await putList(env, key, list.slice(0, 20), 60 * 60 * 24 * 365);
  return id;
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
      await reply(await txSummaryText(env), { inline_keyboard: [[{ text: '🔎 Найти по ID', callback_data: 'admfindtx' }], [{ text: '← Admin', callback_data: 'admin' }]] }, { parse_mode: 'HTML' });
    } else if (data === 'admpromo' && isAdmin) {
      await reply(await promoListText(env), { inline_keyboard: [[{ text: '+ Добавить промокод', callback_data: 'admpromoadd' }], [{ text: '← Admin', callback_data: 'admin' }]] });
    } else if (data === 'admpromoadd' && isAdmin) {
      await env.RATE_LIMIT.delete(`admpromowiz:${fromId}`);
      await reply('🎁 Какой тип промокода?', promoTypeKb());
    } else if (data.startsWith('ptype:') && isAdmin) {
      const type = data.slice(6);
      await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify({ type }), { expirationTtl: 600 });
      if (type === 'refcode') {
        await reply('🔗 За какого партнёра засчитывать покупку по этому промокоду?', await refPickKb(env));
      } else {
        const ask = type === 'credits' ? '🎁 Сколько анализов даёт код?' : type === 'hours' ? '⏳ На сколько часов безлимит?' : '🎟 Какой процент скидки?';
        await reply(ask, promoAmountKb(type));
      }
    } else if (data.startsWith('pamt:') && isAdmin) {
      const wizRaw = await env.RATE_LIMIT.get(`admpromowiz:${fromId}`);
      if (!wizRaw) { await reply('⚠️ Сессия истекла, начни заново.', { inline_keyboard: [[{ text: '+ Добавить промокод', callback_data: 'admpromoadd' }]] }); return new Response('ok'); }
      const wiz = JSON.parse(wizRaw);
      const val = data.slice(5);
      if (val === 'custom') {
        wiz.step = 'amount_custom';
        await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify(wiz), { expirationTtl: 600 });
        await reply(wiz.type === 'refcode' ? '✏️ Отправь код реф-ссылки одним словом (например SHIZOFASHION).' : '✏️ Отправь число одним сообщением.');
      } else {
        wiz.amount = wiz.type === 'refcode' ? val : parseInt(val, 10);
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
      if (wiz.step === 'amount_custom' && wiz.type === 'refcode') {
        const code = text.trim().toUpperCase();
        if (!(await refExists(env, code))) {
          await supportApi(env, 'sendMessage', { chat_id: adminId, text: `⚠️ Реф-кода ${code} не существует — сначала создай его в «🔗 Рефералы».` });
          return new Response('ok');
        }
        wiz.amount = code; delete wiz.step;
        await env.RATE_LIMIT.put(`admpromowiz:${fromId}`, JSON.stringify(wiz), { expirationTtl: 600 });
        await supportApi(env, 'sendMessage', { chat_id: adminId, text: '🔢 Сколько активаций у кода?', reply_markup: promoUsesKb() });
        return new Response('ok');
      }
      if (wiz.step === 'amount_custom') {
        const n = parseInt(text, 10);
        if (!Number.isFinite(n) || n <= 0) {
          await supportApi(env, 'sendMessage', { chat_id: adminId, text: '⚠️ Нужно положительное число.' });
          return new Response('ok');
        }
        wiz.amount = n; delete wiz.step;
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
        promo[wiz.type] = wiz.amount;
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
    await createRef(env, code, m[3].trim(), Math.min(100, parseInt(m[2], 10)));
    await env.RATE_LIMIT.delete(`admrefwait:${fromId}`);
    const link = `https://t.me/${env.BOT_USERNAME || 'faceratepay_bot'}?start=ref_${code}`;
    await supportApi(env, 'sendMessage', {
      chat_id: adminId,
      text: `✅ Реферальная ссылка создана.\n\nОтдавай эту ссылку партнёру:\n${link}\n\n` + await refListText(env),
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
