// Шифрование данных для входа в аккаунты (AES-GCM). Ключ = SHA-256 от MARKET_KEY (если задан) или ADMIN_PASSWORD.
// Внимание: при смене ключа/пароля старые данные не расшифруются.
const enc = new TextEncoder(), dec = new TextDecoder();
async function key(env) {
  const raw = String(env.MARKET_KEY || env.ADMIN_PASSWORD || '');
  if (!raw) throw new Error('no key');
  const h = await crypto.subtle.digest('SHA-256', enc.encode('dk-market-v1:' + raw));
  return crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const toB64 = u8 => { let s = ''; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s); };
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function encryptJson(env, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(env), enc.encode(JSON.stringify(obj))));
  return toB64(iv) + '.' + toB64(ct);
}
export async function decryptJson(env, str) {
  const [a, b] = String(str || '').split('.'); if (!a || !b) return null;
  try { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(a) }, await key(env), fromB64(b)))); } catch (e) { return null; }
}
