// Cloudflare Worker — прокси к OpenRouter API для Face Metrics
//
// Деплой:
//   1. npm install -g wrangler
//   2. wrangler secret put OPENROUTER_API_KEY   (вставь свой ключ с openrouter.ai)
//   3. wrangler deploy
//
// После деплоя скопируй URL воркера в настройки сайта.

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return cors(null, 204);
    }
    if (request.method !== 'POST') {
      return cors('Method not allowed', 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return cors('Bad JSON', 400);
    }

    if (!body.prompt) return cors('Missing prompt', 400);

    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: body.prompt }],
      }),
    });

    const data = await upstream.json();
    const text = data?.choices?.[0]?.message?.content ?? 'Нет ответа от модели.';

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
