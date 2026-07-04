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
const PACKS = {                          // пакеты кредитов за Stars (XTR)
  p1: { credits: 1, stars: 30,  label: '1 анализ' },
  p5: { credits: 5, stars: 100, label: '5 анализов' },
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

  // Квота: подписка на канал → 1 free/день; иначе кредиты.
  const subscribed = await isSubscribed(env, tgid);
  const freeKey = `q:${tgid}:${today}`;
  const freeUsed = parseInt(await env.RATE_LIMIT.get(freeKey) || '0', 10);
  const credits = parseInt(await env.RATE_LIMIT.get(`credits:${tgid}`) || '0', 10);

  let mode = null;
  if (subscribed && freeUsed < FREE_PER_DAY) mode = 'free';
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

  // Списание ПОСЛЕ успеха: free → счётчик дня; paid → минус кредит.
  let creditsLeft = credits, freeLeft = subscribed ? (FREE_PER_DAY - freeUsed) : 0;
  if (mode === 'free') {
    await env.RATE_LIMIT.put(freeKey, String(freeUsed + 1), { expirationTtl: 93600 });
    freeLeft = FREE_PER_DAY - freeUsed - 1;
  } else {
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

async function me(request, env) {
  let body; try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
  const sess = await getSession(env, body.token);
  if (!sess) return json({ error: 'auth' });
  return json(await statusFor(env, sess, body.token));
}

async function statusFor(env, user, token) {
  const today = new Date().toISOString().slice(0, 10);
  const subscribed = await isSubscribed(env, user.id);
  const freeUsed = parseInt(await env.RATE_LIMIT.get(`q:${user.id}:${today}`) || '0', 10);
  const credits = parseInt(await env.RATE_LIMIT.get(`credits:${user.id}`) || '0', 10);
  return {
    token, user, subscribed,
    freeLeft: subscribed ? Math.max(0, FREE_PER_DAY - freeUsed) : 0,
    credits, channel: CHANNEL, packs: PACKS,
  };
}

async function getSession(env, token) {
  if (!token || !env.RATE_LIMIT) return null;
  const raw = await env.RATE_LIMIT.get(`sess:${token}`);
  return raw ? JSON.parse(raw) : null;
}

// Подписка на канал (кэш 5 минут, чтобы не дёргать Bot API на каждый чих).
async function isSubscribed(env, tgid) {
  const cacheKey = `sub:${tgid}`;
  const cached = await env.RATE_LIMIT.get(cacheKey);
  if (cached !== null) return cached === '1';
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

  const r = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/createInvoiceLink`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `FaceRate: ${pack.label}`,
      description: `${pack.credits} AI-анализ(а) лица на facerate.ru`,
      payload: JSON.stringify({ tgid: sess.id, credits: pack.credits }),
      currency: 'XTR',
      prices: [{ label: pack.label, amount: pack.stars }],
    }),
  });
  const d = await r.json();
  if (!d.ok) return json({ error: 'invoice', text: 'Не удалось создать счёт: ' + (d.description || '') });
  return json({ link: d.result });
}

async function tgWebhook(request, env) {
  // Проверка, что вебхук реально от Telegram (секретный заголовок).
  if (env.TG_WEBHOOK_SECRET && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TG_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  let upd; try { upd = await request.json(); } catch { return new Response('ok'); }

  // Подтверждаем оплату.
  if (upd.pre_checkout_query) {
    await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/answerPreCheckoutQuery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pre_checkout_query_id: upd.pre_checkout_query.id, ok: true }),
    });
    return new Response('ok');
  }

  // Успешная оплата → начисляем кредиты.
  const sp = upd.message?.successful_payment;
  if (sp) {
    try {
      const payload = JSON.parse(sp.invoice_payload);
      const cur = parseInt(await env.RATE_LIMIT.get(`credits:${payload.tgid}`) || '0', 10);
      await env.RATE_LIMIT.put(`credits:${payload.tgid}`, String(cur + payload.credits));
      await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: upd.message.chat.id,
          text: `✅ Оплата получена! Начислено анализов: ${payload.credits}. Возвращайся на facerate.ru — баланс уже обновлён.`,
        }),
      });
    } catch { /* payload сломан — молча игнор */ }
  }
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
