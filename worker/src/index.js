const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return json({ ok: true, service: "clarte-invite-api" }, 200, cors);
      }

      if (url.pathname === "/redeem" && request.method === "POST") {
        requireAllowedOrigin(origin, env);
        return await redeemInvite(request, env, cors);
      }

      if (url.pathname === "/verify" && request.method === "POST") {
        requireAllowedOrigin(origin, env);
        return await verifyAccess(request, env, cors);
      }

      if (url.pathname === "/admin/invites" && request.method === "GET") {
        requireAdmin(request, env);
        return await listInvites(env, cors);
      }

      if (url.pathname === "/admin/invites" && request.method === "POST") {
        requireAdmin(request, env);
        return await createInvite(request, env, cors);
      }

      const revokeMatch = url.pathname.match(/^\/admin\/invites\/([^/]+)\/revoke$/);
      if (revokeMatch && request.method === "POST") {
        requireAdmin(request, env);
        return await revokeInvite(revokeMatch[1], env, cors);
      }

      return json({ ok: false, error: "not_found" }, 404, cors);
    } catch (error) {
      const status = error?.status || 500;
      const message = status >= 500 ? "server_error" : error.message;
      if (status >= 500) console.error(error);
      return json({ ok: false, error: message }, status, cors);
    }
  },
};

async function redeemInvite(request, env, cors) {
  const body = await readJson(request);
  const code = canonicalCode(body.code);
  if (!code) throw httpError(400, "invite_code_required");

  const codeHash = await sha256Hex(code);
  const now = new Date();
  const nowIso = now.toISOString();

  const invite = await env.DB.prepare(`
    SELECT id, label, code_hint, max_uses, used_count, active, expires_at
    FROM invites
    WHERE code_hash = ?
    LIMIT 1
  `).bind(codeHash).first();

  if (!invite || invite.active !== 1) throw httpError(403, "invite_invalid");
  if (invite.expires_at && Date.parse(invite.expires_at) <= now.getTime()) {
    throw httpError(403, "invite_expired");
  }
  if (invite.used_count >= invite.max_uses) throw httpError(409, "invite_already_used");

  const update = await env.DB.prepare(`
    UPDATE invites
    SET used_count = used_count + 1,
        last_used_at = ?
    WHERE id = ?
      AND active = 1
      AND used_count < max_uses
  `).bind(nowIso, invite.id).run();

  if ((update.meta?.changes || 0) !== 1) throw httpError(409, "invite_already_used");

  const days = positiveInt(env.SESSION_DAYS, 90);
  const token = await signToken({
    sub: invite.id,
    label: invite.label || "",
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(now.getTime() / 1000) + days * 86400,
  }, env.AUTH_SECRET);

  return json({
    ok: true,
    token,
    expiresInDays: days,
    label: invite.label || "",
  }, 200, cors);
}

async function verifyAccess(request, env, cors) {
  const token = bearerToken(request) || (await readJson(request)).token;
  if (!token) throw httpError(401, "access_token_required");

  const payload = await verifyToken(token, env.AUTH_SECRET);
  if (!payload) throw httpError(401, "access_token_invalid");

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) throw httpError(401, "access_token_expired");

  const invite = await env.DB.prepare(`
    SELECT id, label, active, expires_at
    FROM invites
    WHERE id = ?
    LIMIT 1
  `).bind(payload.sub).first();

  if (!invite || invite.active !== 1) throw httpError(401, "access_revoked");
  if (invite.expires_at && Date.parse(invite.expires_at) <= Date.now()) {
    throw httpError(401, "access_revoked");
  }

  return json({
    ok: true,
    label: invite.label || "",
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  }, 200, cors);
}

async function createInvite(request, env, cors) {
  const body = await readJson(request);
  const label = String(body.label || "").trim().slice(0, 80);
  const maxUses = clampInt(body.maxUses, 1, 20, 1);
  const expiresAt = normalizeFutureDate(body.expiresAt);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const canonical = canonicalCode(code);
    const codeHash = await sha256Hex(canonical);
    const id = crypto.randomUUID();
    const codeHint = canonical.slice(-4);
    const createdAt = new Date().toISOString();

    try {
      await env.DB.prepare(`
        INSERT INTO invites (
          id, code_hash, code_hint, label, max_uses, used_count,
          active, expires_at, created_at, last_used_at
        ) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, NULL)
      `).bind(id, codeHash, codeHint, label, maxUses, expiresAt, createdAt).run();

      return json({
        ok: true,
        invite: { id, code, codeHint, label, maxUses, expiresAt, createdAt },
        note: "邀请码明文只在本次创建响应中返回，请立即保存。",
      }, 201, cors);
    } catch (error) {
      if (!String(error?.message || "").toLowerCase().includes("unique")) throw error;
    }
  }

  throw httpError(500, "invite_generation_failed");
}

async function listInvites(env, cors) {
  const result = await env.DB.prepare(`
    SELECT id, code_hint, label, max_uses, used_count, active,
           expires_at, created_at, last_used_at
    FROM invites
    ORDER BY created_at DESC
  `).all();

  return json({ ok: true, invites: result.results || [] }, 200, cors);
}

async function revokeInvite(id, env, cors) {
  const result = await env.DB.prepare(`
    UPDATE invites SET active = 0 WHERE id = ?
  `).bind(id).run();

  if ((result.meta?.changes || 0) !== 1) throw httpError(404, "invite_not_found");
  return json({ ok: true, id, active: false }, 200, cors);
}

function corsHeaders(origin, env) {
  const headers = {
    ...jsonHeaders,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
  if (origin && allowedOrigins(env).has(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function requireAllowedOrigin(origin, env) {
  if (!origin || !allowedOrigins(env).has(origin)) throw httpError(403, "origin_not_allowed");
}

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "https://clarteot.github.io")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean));
}

function requireAdmin(request, env) {
  const token = bearerToken(request);
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) throw httpError(401, "admin_unauthorized");
}

function bearerToken(request) {
  const value = request.headers.get("authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function canonicalCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let body = "";
  for (const byte of bytes) body += alphabet[byte % alphabet.length];
  return `CLARTE-${body.slice(0, 4)}-${body.slice(4)}`;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function signToken(payload, secret) {
  if (!secret) throw new Error("AUTH_SECRET is missing");
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const body = base64UrlJson(payload);
  const input = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return `${input}.${base64UrlBytes(new Uint8Array(signature))}`;
}

async function verifyToken(token, secret) {
  if (!secret) throw new Error("AUTH_SECRET is missing");
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const input = `${parts[0]}.${parts[1]}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "HMAC", key, base64UrlDecode(parts[2]), new TextEncoder().encode(input)
  );
  if (!valid) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    return null;
  }
}

function base64UrlJson(value) {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  let s = value.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const binary = atob(s);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function normalizeFutureDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) throw httpError(400, "expires_at_invalid");
  return d.toISOString();
}

function positiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
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
