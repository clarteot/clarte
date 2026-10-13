import baseWorker from './index.js';

const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/redeem' && request.method === 'POST') {
      return redeemSafely(request, env);
    }
    return baseWorker.fetch(request, env, ctx);
  },
};

async function redeemSafely(request, env) {
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, env);
  try {
    requireAllowedOrigin(origin, env);
    if (!env.DB) throw new Error('DB binding is missing');
    if (!env.AUTH_SECRET) throw new Error('AUTH_SECRET is missing');

    const body = await readJson(request);
    const code = canonicalCode(body.code);
    if (!code) throw httpError(400, 'invite_code_required');

    const codeHash = await sha256Hex(code);
    const now = new Date();
    const nowIso = now.toISOString();

    const invite = await env.DB.prepare(`
      SELECT id, label, code_hint, max_uses, used_count, active, expires_at
      FROM invites
      WHERE code_hash = ?
      LIMIT 1
    `).bind(codeHash).first();

    if (!invite || invite.active !== 1) throw httpError(403, 'invite_invalid');
    if (invite.expires_at && Date.parse(invite.expires_at) <= now.getTime()) {
      throw httpError(403, 'invite_expired');
    }
    if (invite.used_count >= invite.max_uses) throw httpError(409, 'invite_already_used');

    const days = positiveInt(env.SESSION_DAYS, 90);
    const token = await signToken({
      sub: invite.id,
      label: invite.label || '',
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(now.getTime() / 1000) + days * 86400,
    }, env.AUTH_SECRET);

    const update = await env.DB.prepare(`
      UPDATE invites
      SET used_count = used_count + 1,
          last_used_at = ?
      WHERE id = ?
        AND active = 1
        AND used_count < max_uses
    `).bind(nowIso, invite.id).run();

    if ((update.meta?.changes || 0) !== 1) throw httpError(409, 'invite_already_used');

    return json({
      ok: true,
      token,
      expiresInDays: days,
      label: invite.label || '',
    }, 200, cors);
  } catch (error) {
    const status = error?.status || 500;
    const message = status >= 500 ? 'server_error' : error.message;
    if (status >= 500) console.error(error);
    return json({ ok: false, error: message }, status, cors);
  }
}

function corsHeaders(origin, env) {
  const headers = {
    ...jsonHeaders,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (origin && allowedOrigins(env).has(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function requireAllowedOrigin(origin, env) {
  if (!origin || !allowedOrigins(env).has(origin)) throw httpError(403, 'origin_not_allowed');
}

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || 'https://clarteot.github.io')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean));
}

async function readJson(request) {
  try { return await request.json(); } catch { return {}; }
}

function canonicalCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signToken(payload, secret) {
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const body = base64UrlJson(payload);
  const input = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input));
  return `${input}.${base64UrlBytes(new Uint8Array(signature))}`;
}

function base64UrlJson(value) {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function positiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...extraHeaders },
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
