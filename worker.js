export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return cors(null, 204);
    if (request.method !== 'POST') return cors('Method not allowed', 405);

    let body;
    try { body = await request.json(); } catch { return cors('Bad JSON', 400); }
    if (!body.prompt) return cors('Missing prompt', 400);

    const messages = body.image
      ? [{ role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${body.image}` } },
          { type: 'text', text: body.prompt }
        ]}]
      : [{ role: 'user', content: body.prompt }];

    let data;
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({ model: 'qwen/qwen2.5-vl-72b-instruct', max_tokens: 2200, messages }),
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
