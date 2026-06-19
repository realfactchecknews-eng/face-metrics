// Лимиты на IP, чтобы открытый воркер не слил OpenRouter-баланс.
const LIMIT_PER_DAY = 25;
const LIMIT_PER_HOUR = 8;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(null, 204);
    if (request.method !== 'POST') return cors('Method not allowed', 405);

    // Rate limit через KV (binding RATE_LIMIT). Нет binding → лимит отключён.
    if (env.RATE_LIMIT) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const reason = await checkRateLimit(env.RATE_LIMIT, ip);
      if (reason) {
        return cors(JSON.stringify({
          text: `Лимит запросов исчерпан (${reason}). Это бесплатный сервис — попробуй позже.`,
        }), 200, 'application/json');
      }
    }

    let body;
    try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
    if (!body.prompt) return cors('Missing prompt', 400);

    const messages = body.image
      ? [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${body.image}` } },
          { type: 'text', text: body.prompt }
        ]}]
      : [{ role: 'user', content: body.prompt }];

    // Базовое тело запроса. temperature умеренная (различает черты, не жмёт к ~5.7);
    // seed → одно фото даёт стабильный результат. allow_fallbacks → если провайдер
    // упал, OpenRouter пробует другого.
    function buildBody(withSeed) {
      const b = {
        model: 'qwen/qwen2.5-vl-72b-instruct',
        max_tokens: 2200,
        temperature: 0.7,
        top_p: 0.95,
        messages,
      };
      if (withSeed) b.seed = 1337;
      return JSON.stringify(b);
    }

    // До 3 попыток: при ошибке провайдера повторяем, на последней — без seed.
    let data, lastErr = 'unknown';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
          },
          body: buildBody(attempt < 2),
        });
        data = await res.json();
      } catch (err) {
        lastErr = err.message; data = null;
      }
      const hasText = data?.choices?.[0]?.message?.content;
      if (hasText) break;
      lastErr = data?.error?.message ?? lastErr;
      if (attempt < 2) await new Promise(r => setTimeout(r, 700));
    }

    if (!data?.choices?.[0]?.message?.content) {
      return cors(JSON.stringify({ text: `Сервис перегружен, попробуйте ещё раз. (${lastErr})` }), 200, 'application/json');
    }

    const text = data?.choices?.[0]?.message?.content ?? `Пустой ответ. Данные: ${JSON.stringify(data)}`;
    return cors(JSON.stringify({ text }), 200, 'application/json');
  },
};

// Возвращает причину если лимит превышен, иначе null. Инкрементит счётчики.
async function checkRateLimit(kv, ip) {
  const now = new Date();
  const dayKey = `d:${ip}:${now.toISOString().slice(0, 10)}`;
  const hourKey = `h:${ip}:${now.toISOString().slice(0, 13)}`;

  const [dayRaw, hourRaw] = await Promise.all([kv.get(dayKey), kv.get(hourKey)]);
  const day = parseInt(dayRaw || '0', 10);
  const hour = parseInt(hourRaw || '0', 10);

  if (day >= LIMIT_PER_DAY) return `${LIMIT_PER_DAY}/день`;
  if (hour >= LIMIT_PER_HOUR) return `${LIMIT_PER_HOUR}/час`;

  await Promise.all([
    kv.put(dayKey, String(day + 1), { expirationTtl: 90000 }),
    kv.put(hourKey, String(hour + 1), { expirationTtl: 5400 }),
  ]);
  return null;
}

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
