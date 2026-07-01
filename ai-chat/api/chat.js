export const config = { runtime: 'nodejs' };

// Available models on Cerebras free tier.
const ALLOWED_MODELS = new Set(['gpt-oss-120b', 'llama-3.3-70b', 'llama-3.1-8b']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  // Vercel parses JSON bodies automatically, but fall back just in case.
  let body = req.body;
  if (!body || typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      body = {};
    }
  }
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const model = ALLOWED_MODELS.has(body?.model) ? body.model : 'gpt-oss-120b';
  const temperature = clampNumber(body?.temperature, 0, 2, 0.85);
  const topP = clampNumber(body?.top_p, 0, 1, 0.97);
  // Effectively unlimited under the hood — Cerebras models top out around 32k
  // for completion, so 32768 is the practical ceiling without changing providers.
  const maxTokens = clampNumber(body?.max_tokens, 64, 32768, 32768);

  // Attachment metadata is sent by the client so we can mention it in the
  // streaming demo reply. We validate it conservatively \u2014 text content is
  // already embedded inside the `messages` payload by the client, so we
  // never forward raw data URLs to the model API.
  const attachments = Array.isArray(body?.attachments)
    ? body.attachments.slice(0, 20).map((a) => ({
        name: String(a?.name || 'file').slice(0, 200),
        mime: String(a?.mime || '').slice(0, 100),
        size: clampNumber(a?.size, 0, 100 * 1024 * 1024, 0),
        kind: ['image', 'pdf', 'text', 'binary'].includes(a?.kind) ? a.kind : 'binary',
      }))
    : [];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const send = (text) => res.write(`data: ${JSON.stringify({ text })}\n\n`);
  const done = () => {
    res.write('data: [DONE]\n\n');
    res.end();
  };

  const apiKey = process.env.CEREBRAS_API_KEY;

  // ── Demo mode: no API key configured ──
  if (!apiKey) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const question = (lastUser?.content || 'your message').trim();
    const shortQ = question.length > 80 ? question.slice(0, 80) + '…' : question;
    const sysPrompt = (messages.find((m) => m.role === 'system')?.content || '').toLowerCase();

    // Tally what the user attached, so we can mention it in the demo reply.
    const attachedCounts = attachments.reduce((acc, a) => {
      acc[a.kind] = (acc[a.kind] || 0) + 1;
      return acc;
    }, {});
    const attachmentLine = attachments.length
      ? ' ✦ You sent ' + attachments.length + ' attachment' + (attachments.length === 1 ? '' : 's') +
        ' (' + Object.entries(attachedCounts).map(([k, v]) => `${v} ${k}`).join(', ') + ').' +
        ' In live mode, the model would see the extracted text content alongside your question.'
      : '';

    const intro = sysPrompt.includes('coder')
      ? "Sure, here's what I'd build."
      : sysPrompt.includes('tutor')
      ? "Great question — let's break it down step by step."
      : sysPrompt.includes('writer')
      ? "Here is a thoughtful draft."
      : sysPrompt.includes('analyst')
      ? "Here's the breakdown with the numbers:"
      : 'Hi!';
    const reply =
      `${intro} You wrote: "${shortQ}".${attachmentLine} ` +
      `I'm currently running in demo mode without an AI API key, so this is a sample streamed reply. ` +
      `Once a CEREBRAS_API_KEY is added in the Vercel project settings, real AI answers will stream here. ` +
      `Everything else — attachment extraction, streaming, themes, and shortcuts — is fully live. Enjoy exploring! ✦`;

    const words = reply.split(' ');
    for (const word of words) {
      send(word + ' ');
      await new Promise((r) => setTimeout(r, 45));
    }
    done();
    return;
  }

  // ── Real mode: stream from Cerebras (OpenAI-compatible /v1/chat/completions) ──
  try {
    const Cerebras = (await import('@cerebras/cerebras_cloud_sdk')).default;
    const cerebras = new Cerebras({ apiKey });

    const result = await cerebras.chat.completions.create({
      model,
      messages,
      stream: true,
      temperature,
      top_p: topP,
      max_completion_tokens: maxTokens,
    });

    for await (const chunk of result) {
      const text = chunk.choices?.[0]?.delta?.content || '';
      if (text) send(text);
    }
    done();
  } catch (err) {
    console.error('Cerebras error:', err);
    send(`⚠️ Sorry, something went wrong reaching the AI service: ${err?.message || 'unknown error'}`);
    done();
  }
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
