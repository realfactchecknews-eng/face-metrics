// Cloudflare Worker — прокси к OpenRouter API для Face Metrics
//
// Деплой:
//   1. npm install -g wrangler
//   2. wrangler secret put OPENROUTER_API_KEY   (вставь свой ключ с openrouter.ai)
//   3. wrangler deploy

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(null, 204);
    if (request.method !== 'POST') return cors('Method not allowed', 405);

    let body;
    try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
    if (!body.prompt) return cors('Missing prompt', 400);

    let data;
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-haiku',
          max_tokens: 1024,
          messages: [{ role: 'user', content: body.prompt }],
        }),
      });
      data = await res.json();
    } catch (err) {
      return cors(JSON.stringify({ text: `Ошибка воркера: ${err.message}` }), 200, 'application/json');
    }

    if (data?.error) {
      return cors(JSON.stringify({ text: `OpenRouter: ${data.error.message ?? JSON.stringify(data.error)}` }), 200, 'application/json');
    }

    const text = data?.choices?.[0]?.message?.content ?? `Пустой ответ. Данные: ${JSON.stringify(data)}`;
    return cors(JSON.stringify({ text }), 200, 'application/json');
  },
};

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
