// INDGM: приём вебхуков. Пока только проверка подписи и приём события, выдача по ним подключается позже.
async function hmacHex(secret, data) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
  return [...new Uint8Array(s)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function eq(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

export async function indgmWebhook(env, req) {
  if (!env.INDGM_WEBHOOK_SECRET) return { status: 503, error: 'not configured' };
  const raw = await req.text();
  const ts = req.headers.get('X-INDGM-Timestamp') || '';
  const sig = (req.headers.get('X-INDGM-Signature') || '').replace(/^sha256=/i, '').toLowerCase();
  if (!ts || !sig) return { status: 400, error: 'bad request' };
  const t = Number(ts) > 1e12 ? Number(ts) : Number(ts) * 1000;
  if (!t || Math.abs(Date.now() - t) > 5 * 60 * 1000) return { status: 400, error: 'stale' };
  if (!eq(await hmacHex(env.INDGM_WEBHOOK_SECRET, ts + '.' + raw), sig)) return { status: 403, error: 'bad signature' };
  let ev = {}; try { ev = JSON.parse(raw); } catch (e) {}
  console.log('indgm webhook', ev.event || ev.type || '?');
  return { ok: true };
}
