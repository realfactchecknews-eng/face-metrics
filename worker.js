// ─── FaceRate worker: анализ + аккаунты (Telegram) + квоты + Stars-платежи ───
//
// Роуты:
//   POST /            — анализ (нужен token сессии; 1 free/день за подписку на канал, дальше кредиты)
//   POST /auth        — вход через Telegram Login Widget (проверка hash)
//   POST /me          — статус аккаунта (квота, кредиты, подписка)
//   POST /buy         — создать Stars-инвойс (createInvoiceLink)
//   POST /tg-webhook  — вебхук бота: pre_checkout_query + successful_payment
//
// Секреты: OPENROUTER_API_KEY, TG_BOT_TOKEN, TG_WEBHOOK_SECRET. KV: RATE_LIMIT.

const CHANNEL = '@wwwfacerateru';        // канал, подписка на который даёт 1 free/день
const FREE_PER_DAY = 1;                  // бесплатных анализов в день подписчику
const ADMIN_USERNAMES = ['Matveyika'];   // кто может создавать промокоды в боте
const PACKS = {                          // тарифы за Stars (XTR)
  p1: { type: 'credits', credits: 1, stars: 30,  label: '1 анализ' },
  p5: { type: 'credits', credits: 5, stars: 100, label: '5 анализов' },
  d1: { type: 'unlim',  hours: 24,   stars: 100, label: 'Безлимит на день' },
  m1: { type: 'sub',    stars: 500,  label: 'Безлимит на месяц', period: 2592000 },
};
const IP_LIMIT_DAY = 40;                 // страховочный лимит по IP (анти-абьюз)
const GLOBAL_DAILY_CAP = 300;            // потолок на весь сайт в сутки

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(null, 204);
    if (request.method !== 'POST') return cors('Method not allowed', 405);
    const path = new URL(request.url).pathname;
    try {
      if (path === '/tg-webhook') return await tgWebhook(request, env);
      if (path === '/auth')       return await authTg(request, env);
      if (path === '/authpoll')   return await authPoll(request, env);
      if (path === '/me')         return await me(request, env);
      if (path === '/buy')        return await buy(request, env);
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

  // Глобальный потолок + страховка по IP.
  const today = new Date().toISOString().slice(0, 10);
  if (env.RATE_LIMIT) {
    const g = parseInt(await env.RATE_LIMIT.get(`g:${today}`) || '0', 10);
    if (g >= GLOBAL_DAILY_CAP) {
      return json({ error: 'global', text: 'Дневной лимит сервиса исчерпан. Загляните завтра.' });
    }
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
    credits, channel: CHANNEL, packs: PACKS,
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

  const d = await createInvoice(env, sess.id, body.pack);
  if (!d.ok) return json({ error: 'invoice', text: 'Не удалось создать счёт: ' + (d.description || '') });
  return json({ link: d.result });
}

// Создание Stars-инвойса (ссылкой). Для месячного тарифа — подписка с автопродлением.
async function createInvoice(env, tgid, packId) {
  const pack = PACKS[packId];
  const req = {
    title: `FaceRate: ${pack.label}`,
    description: pack.type === 'credits'
      ? `${pack.credits} AI-анализ(а) лица на facerate.ru`
      : pack.type === 'unlim'
        ? 'Безлимитные анализы на 24 часа на facerate.ru'
        : 'Безлимитные анализы на месяц (автопродление, отмена в любой момент)',
    payload: JSON.stringify({ tgid, pack: packId }),
    currency: 'XTR',
    prices: [{ label: pack.label, amount: pack.stars }],
  };
  if (pack.type === 'sub') req.subscription_period = pack.period;
  const r = await tgApi(env, 'createInvoiceLink', req);
  return r;
}

function tgApi(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()).catch(e => ({ ok: false, description: e.message }));
}

// ─────────────────────────── Вебхук бота: меню, промокоды, оплаты ───────────────────────────
const MENU_KB = {
  inline_keyboard: [
    [{ text: '💎 Мой статус', callback_data: 'status' }],
    [{ text: '⭐ Купить анализы / безлимит', callback_data: 'shop' }],
    [{ text: '🎁 Ввести промокод', callback_data: 'promo' }],
    [{ text: '🔄 Моя подписка', callback_data: 'mysub' }, { text: '🎉 Розыгрыши', callback_data: 'gw' }],
    [{ text: '🌐 Открыть FaceRate', url: 'https://facerate.ru' }],
  ],
};
const SHOP_KB = {
  inline_keyboard: [
    [{ text: `1 анализ — ${PACKS.p1.stars}⭐`, callback_data: 'buy:p1' }, { text: `5 — ${PACKS.p5.stars}⭐`, callback_data: 'buy:p5' }],
    [{ text: `🔥 Безлимит на день — ${PACKS.d1.stars}⭐`, callback_data: 'buy:d1' }],
    [{ text: `👑 Безлимит на месяц — ${PACKS.m1.stars}⭐/мес`, callback_data: 'buy:m1' }],
    [{ text: '← Меню', callback_data: 'menu' }],
  ],
};

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

  // ── Успешная оплата → начисление ──
  if (msg.successful_payment) {
    await handlePayment(env, msg);
    return new Response('ok');
  }

  const text = (msg.text || '').trim();

  // ── /start [код входа с сайта] ──
  if (text.startsWith('/start')) {
    const code = text.split(' ')[1] || '';
    if (/^[a-z0-9-]{10,80}$/i.test(code)) {
      const token = crypto.randomUUID() + '-' + crypto.randomUUID();
      const user = { id: tgid, first_name: msg.from.first_name || '', username: msg.from.username || '', photo_url: '' };
      await env.RATE_LIMIT.put(`sess:${token}`, JSON.stringify(user), { expirationTtl: 60 * 60 * 24 * 30 });
      await env.RATE_LIMIT.put(`authcode:${code}`, JSON.stringify({ token, user }), { expirationTtl: 600 });
      await tgApi(env, 'sendMessage', { chat_id: chat, text: '✅ Вход выполнен! Возвращайся на сайт — страница подхватит аккаунт сама.', reply_markup: MENU_KB });
    } else {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: '🖤 FaceRate — AI-оценка лица по канонам луксмаксинга.\n\nПодписка на ' + CHANNEL + ' = 1 бесплатный анализ в день.', reply_markup: MENU_KB });
    }
    return new Response('ok');
  }

  if (text === '/menu') {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Меню FaceRate:', reply_markup: MENU_KB });
    return new Response('ok');
  }

  // ── Админ: /addpromo КОД использований credits=N | hours=H ──
  if (text.startsWith('/addpromo') && ADMIN_USERNAMES.includes(msg.from.username || '')) {
    const m = text.match(/^\/addpromo\s+(\S+)\s+(\d+)\s+(credits|hours)=(\d+)/i);
    if (!m) {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Формат:\n/addpromo КОД КОЛ-ВО_АКТИВАЦИЙ credits=3\n/addpromo КОД КОЛ-ВО_АКТИВАЦИЙ hours=24' });
    } else {
      const promo = { uses: parseInt(m[2], 10) };
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
    await redeemPromo(env, chat, tgid, text.toUpperCase());
    return new Response('ok');
  }

  await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Меню FaceRate:', reply_markup: MENU_KB });
  return new Response('ok');
}

async function handleCallback(env, cq) {
  const chat = cq.message.chat.id, tgid = cq.from.id, data = cq.data || '';
  await tgApi(env, 'answerCallbackQuery', { callback_query_id: cq.id });

  if (data === 'menu') {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Меню FaceRate:', reply_markup: MENU_KB });
  } else if (data === 'status') {
    const today = new Date().toISOString().slice(0, 10);
    const credits = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
    const freeUsed = parseInt(await env.RATE_LIMIT.get(`q:${tgid}:${today}`) || '0', 10);
    const unlim = parseInt(await env.RATE_LIMIT.get(`unlim:${tgid}`) || '0', 10);
    const sub = await isSubscribed(env, tgid, true);
    let t = '💎 Твой статус:\n';
    if (unlim > Date.now()) t += `👑 Безлимит до ${new Date(unlim).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)\n`;
    t += `⭐ Кредиты: ${credits}\n`;
    t += sub ? `✅ Подписан на канал — бесплатных сегодня: ${Math.max(0, FREE_PER_DAY - freeUsed)}\n` : `❌ Не подписан на ${CHANNEL} — подпишись и получай 1 бесплатный анализ в день\n`;
    await tgApi(env, 'sendMessage', { chat_id: chat, text: t, reply_markup: MENU_KB });
  } else if (data === 'shop') {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: '⭐ Что берём?', reply_markup: SHOP_KB });
  } else if (data.startsWith('buy:')) {
    const packId = data.slice(4);
    if (PACKS[packId]) {
      const pack = PACKS[packId];
      const inv = {
        chat_id: chat,
        title: `FaceRate: ${pack.label}`,
        description: pack.type === 'sub' ? 'Безлимит на месяц. Автопродление — отключается в настройках Telegram в любой момент.' : pack.label + ' на facerate.ru',
        payload: JSON.stringify({ tgid, pack: packId }),
        currency: 'XTR',
        prices: [{ label: pack.label, amount: pack.stars }],
      };
      if (pack.type === 'sub') inv.subscription_period = pack.period;
      const r = await tgApi(env, 'sendInvoice', inv);
      if (!r.ok) await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Не удалось выставить счёт: ' + (r.description || '') });
    }
  } else if (data === 'promo') {
    await env.RATE_LIMIT.put(`pmstate:${tgid}`, '1', { expirationTtl: 300 });
    await tgApi(env, 'sendMessage', { chat_id: chat, text: '🎁 Отправь промокод одним сообщением:' });
  } else if (data === 'mysub') {
    const unlim = parseInt(await env.RATE_LIMIT.get(`unlim:${tgid}`) || '0', 10);
    const isRec = await env.RATE_LIMIT.get(`subrec:${tgid}`);
    let t;
    if (unlim > Date.now()) {
      t = `👑 Безлимит активен до ${new Date(unlim).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК).`;
      t += isRec === '1'
        ? '\n\n🔄 Автопродление ВКЛЮЧЕНО. Отключить: настройки Telegram → Мои звёзды → подписки (или кнопкой ниже).'
        : '\n\nАвтопродления нет — по окончании просто купи снова.';
    } else {
      t = 'Активного безлимита нет. Возьми в магазине ⭐';
    }
    const kb = { inline_keyboard: [] };
    if (isRec === '1') kb.inline_keyboard.push([{ text: '⛔ Отключить автопродление', callback_data: 'unsub' }]);
    kb.inline_keyboard.push([{ text: '← Меню', callback_data: 'menu' }]);
    await tgApi(env, 'sendMessage', { chat_id: chat, text: t, reply_markup: kb });
  } else if (data === 'unsub') {
    const chg = await env.RATE_LIMIT.get(`subchg:${tgid}`);
    if (chg) {
      const r = await tgApi(env, 'editUserStarSubscription', { user_id: tgid, telegram_payment_charge_id: chg, is_canceled: true });
      if (r.ok) {
        await env.RATE_LIMIT.put(`subrec:${tgid}`, '0');
        await tgApi(env, 'sendMessage', { chat_id: chat, text: '⛔ Автопродление отключено. Безлимит доработает оплаченный срок.', reply_markup: MENU_KB });
      } else {
        await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Не получилось: ' + (r.description || '') + '\nОтключи в Telegram: Настройки → Мои звёзды.', reply_markup: MENU_KB });
      }
    } else {
      await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Подписка не найдена.', reply_markup: MENU_KB });
    }
  } else if (data === 'gw') {
    await tgApi(env, 'sendMessage', {
      chat_id: chat,
      text: '🎉 Розыгрыши бесплатных анализов и безлимитов проходят в канале ' + CHANNEL + '.\n\nЛови промокоды в постах и вводи их здесь через «🎁 Ввести промокод». Кто успел — того и анализы.',
      reply_markup: { inline_keyboard: [[{ text: '📢 Открыть канал', url: 'https://t.me/wwwfacerateru' }], [{ text: '← Меню', callback_data: 'menu' }]] },
    });
  }
}

async function redeemPromo(env, chat, tgid, code) {
  if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Это не похоже на промокод. Попробуй ещё раз через меню.', reply_markup: MENU_KB });
    return;
  }
  const raw = await env.RATE_LIMIT.get(`promo:${code}`);
  if (!raw) {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: '❌ Такого промокода нет или он истёк.', reply_markup: MENU_KB });
    return;
  }
  // Один промокод — один раз в руки.
  if (await env.RATE_LIMIT.get(`promoused:${code}:${tgid}`)) {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: 'Ты уже активировал этот промокод 😉', reply_markup: MENU_KB });
    return;
  }
  const promo = JSON.parse(raw);
  if (promo.uses <= 0) {
    await tgApi(env, 'sendMessage', { chat_id: chat, text: '😞 Увы, все активации этого промокода уже разобрали.', reply_markup: MENU_KB });
    return;
  }
  promo.uses -= 1;
  await env.RATE_LIMIT.put(`promo:${code}`, JSON.stringify(promo), { expirationTtl: 60 * 60 * 24 * 90 });
  await env.RATE_LIMIT.put(`promoused:${code}:${tgid}`, '1', { expirationTtl: 60 * 60 * 24 * 90 });

  let grant;
  if (promo.credits) {
    const cur = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
    await env.RATE_LIMIT.put(`credits:${tgid}`, String(cur + promo.credits));
    grant = `+${promo.credits} анализ(а)`;
  } else {
    const cur = parseInt(await env.RATE_LIMIT.get(`unlim:${tgid}`) || '0', 10);
    const base = Math.max(cur, Date.now());
    await env.RATE_LIMIT.put(`unlim:${tgid}`, String(base + (promo.hours || 24) * 3600 * 1000));
    grant = `безлимит на ${promo.hours || 24} ч`;
  }
  await tgApi(env, 'sendMessage', { chat_id: chat, text: `🎉 Промокод активирован: ${grant}! Открывай facerate.ru и пользуйся.`, reply_markup: MENU_KB });
}

async function handlePayment(env, msg) {
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
      note = `начислено анализов: ${payload.credits}`;
    } else if (pack?.type === 'credits') {
      const cur = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);
      await env.RATE_LIMIT.put(`credits:${tgid}`, String(cur + pack.credits));
      note = `начислено анализов: ${pack.credits}`;
    } else if (pack?.type === 'unlim') {
      const cur = parseInt(await env.RATE_LIMIT.get(`unlim:${tgid}`) || '0', 10);
      const until = Math.max(cur, Date.now()) + pack.hours * 3600 * 1000;
      await env.RATE_LIMIT.put(`unlim:${tgid}`, String(until));
      note = `👑 безлимит до ${new Date(until).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)`;
    } else if (pack?.type === 'sub') {
      const until = (sp.subscription_expiration_date ? sp.subscription_expiration_date * 1000 : Date.now() + 30 * 24 * 3600 * 1000);
      await env.RATE_LIMIT.put(`unlim:${tgid}`, String(until));
      await env.RATE_LIMIT.put(`subchg:${tgid}`, sp.telegram_payment_charge_id || '');
      await env.RATE_LIMIT.put(`subrec:${tgid}`, sp.is_recurring ? '1' : '0');
      note = `👑 месячный безлимит до ${new Date(until).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК)` + (sp.is_recurring ? ', автопродление включено' : '');
    }
    await tgApi(env, 'sendMessage', { chat_id: msg.chat.id, text: `✅ Оплата получена! ${note}.\nВозвращайся на facerate.ru — всё уже обновлено.`, reply_markup: MENU_KB });
  } catch { /* payload сломан — молча игнор */ }
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
