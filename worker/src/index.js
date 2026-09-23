/**
 * 活動記録 persist — Discord user id (opt-in).
 * No Gi / 投票権 / 金銭. Client stamps are 誉 only.
 * Secret: DISCORD_CLIENT_SECRET (never Pages).
 */

const DISCORD_API = "https://discord.com/api/v10";
const SES_TTL = 60 * 60 * 24 * 30;
const STATE_TTL = 600;

function corsHeaders(env, request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ok = !origin || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin || allowed[0] || "null" : "null",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, env, request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(env, request),
    },
  });
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}

function playUrl(env) {
  return String(env.PLAY_URL || "https://gpro8.github.io/bo-aibou-arena/").replace(/\/?$/, "/");
}

function callbackUrl(url) {
  return `${url.origin}/v1/oauth/callback`;
}

function bytesHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function jstDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function cleanDays(list) {
  const out = [];
  const seen = new Set();
  for (const d of Array.isArray(list) ? list : []) {
    if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  out.sort();
  return out.slice(-400);
}

function cleanSeen(list) {
  const allow = new Set(["chiri", "nuppe", "go", "kama", "kitsunebi", "suiko", "gyuki"]);
  const out = [];
  const have = new Set();
  for (const s of Array.isArray(list) ? list : []) {
    if (!allow.has(s) || have.has(s)) continue;
    have.add(s);
    out.push(s);
  }
  return out;
}

function cleanRecord(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const hardClears = Math.max(0, Math.min(99999, Number(o.hardClears) || 0));
  return {
    v: 1,
    days: cleanDays(o.days),
    seen: cleanSeen(o.seen),
    told: cleanDays(o.told),
    hardClears,
    title: o.title === "kitsui-nobiru" || hardClears > 0 ? "kitsui-nobiru" : "",
  };
}

function publicRecord(rec) {
  const r = cleanRecord(rec);
  return {
    ok: true,
    linked: true,
    days: r.days,
    seen: r.seen,
    told: r.told,
    hardClears: r.hardClears,
    title: r.title,
    dayCount: r.days.length,
  };
}

async function kvJson(env, key) {
  if (!env.KATSUDO) return null;
  const raw = await env.KATSUDO.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function kvPut(env, key, obj, ttl) {
  if (!env.KATSUDO) return;
  const opts = ttl ? { expirationTtl: ttl } : {};
  await env.KATSUDO.put(key, JSON.stringify(obj), opts);
}

function bearer(request) {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+([a-f0-9]{32,128})$/i.exec(h);
  return m ? m[1].toLowerCase() : "";
}

async function sessionUid(env, request) {
  const tok = bearer(request);
  if (!tok) return null;
  const ses = await kvJson(env, `ses:${tok}`);
  if (!ses || !ses.uid || !/^\d{5,30}$/.test(ses.uid)) return null;
  return { tok, uid: ses.uid };
}

async function loadUser(env, uid) {
  return cleanRecord(await kvJson(env, `u:${uid}`));
}

async function saveUser(env, uid, rec) {
  await kvPut(env, `u:${uid}`, cleanRecord(rec));
}

async function rate(env, key, max, ttl) {
  const n = Number((await env.KATSUDO.get(key)) || 0) + 1;
  await env.KATSUDO.put(key, String(n), { expirationTtl: ttl });
  return n <= max;
}

function oauthReady(env) {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);
}

async function handleStart(url, env) {
  const play = playUrl(env);
  if (!oauthReady(env)) return redirect(`${play}?katsudo=off`);
  const state = bytesHex(16);
  await kvPut(env, `st:${state}`, { t: Date.now() }, STATE_TTL);
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: callbackUrl(url),
    response_type: "code",
    scope: "identify",
    state,
    prompt: "consent",
  });
  return redirect(`https://discord.com/oauth2/authorize?${params}`);
}

async function handleCallback(url, env) {
  const play = playUrl(env);
  const err = (code) => redirect(`${play}?katsudo=${code}`);
  if (!oauthReady(env)) return err("off");
  const code = String(url.searchParams.get("code") || "");
  const state = String(url.searchParams.get("state") || "");
  if (!code || !state) return err("bad");
  const st = await kvJson(env, `st:${state}`);
  if (env.KATSUDO) await env.KATSUDO.delete(`st:${state}`);
  if (!st) return err("state");
  const body = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl(url),
  });
  const tokRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokRes.ok) return err("token");
  const tok = await tokRes.json();
  const access = tok && tok.access_token;
  if (!access) return err("token");
  const meRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!meRes.ok) return err("user");
  const me = await meRes.json();
  const uid = String(me.id || "");
  if (!/^\d{5,30}$/.test(uid)) return err("user");
  const session = bytesHex(24);
  await kvPut(env, `ses:${session}`, { uid }, SES_TTL);
  const rec = await loadUser(env, uid);
  await saveUser(env, uid, rec);
  return redirect(`${play}?katsudo=ok#ks=${session}`);
}

async function handleMe(env, request) {
  const ses = await sessionUid(env, request);
  if (!ses) return json({ ok: false, error: "auth" }, 401, env, request);
  const rec = await loadUser(env, ses.uid);
  return json(publicRecord(rec), 200, env, request);
}

async function handleSync(env, request) {
  const ses = await sessionUid(env, request);
  if (!ses) return json({ ok: false, error: "auth" }, 401, env, request);
  if (!(await rate(env, `rl:sync:${ses.uid}`, 30, 3600))) {
    return json({ ok: false, error: "rate" }, 429, env, request);
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const incoming = cleanRecord(body);
  const rec = await loadUser(env, ses.uid);
  rec.days = cleanDays([...rec.days, ...incoming.days]);
  rec.seen = cleanSeen([...(rec.seen || []), ...(incoming.seen || [])]);
  rec.told = cleanDays([...(rec.told || []), ...(incoming.told || [])]);
  rec.hardClears = Math.max(rec.hardClears, Math.min(incoming.hardClears, rec.hardClears + 50));
  if (incoming.title === "kitsui-nobiru" || rec.hardClears > 0) rec.title = "kitsui-nobiru";
  await saveUser(env, ses.uid, rec);
  return json(publicRecord(rec), 200, env, request);
}

async function handleStamp(env, request) {
  const ses = await sessionUid(env, request);
  if (!ses) return json({ ok: false, error: "auth" }, 401, env, request);
  const today = jstDay();
  if (!(await rate(env, `rl:stamp:${ses.uid}:${today}`, 12, 90000))) {
    return json({ ok: false, error: "rate" }, 429, env, request);
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  let day = String(body.day || today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) day = today;
  if (day > today) day = today;
  const rec = await loadUser(env, ses.uid);
  if (!rec.days.includes(day)) rec.days.push(day);
  rec.days = cleanDays(rec.days);
  rec.seen = cleanSeen([...(rec.seen || []), ...(cleanRecord(body).seen || [])]);
  rec.hardClears = Math.min(99999, rec.hardClears + 1);
  rec.title = "kitsui-nobiru";
  await saveUser(env, ses.uid, rec);
  return json(publicRecord(rec), 200, env, request);
}

async function handleUnlink(env, request) {
  const ses = await sessionUid(env, request);
  if (!ses) return json({ ok: false, error: "auth" }, 401, env, request);
  if (env.KATSUDO) await env.KATSUDO.delete(`ses:${ses.tok}`);
  return json({ ok: true, linked: false }, 200, env, request);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }
    const url = new URL(request.url);

    if (url.pathname === "/health" || url.pathname === "/") {
      return json(
        {
          ok: true,
          service: "bo-aibou-katsudo",
          oauth: oauthReady(env),
          kv: Boolean(env.KATSUDO),
        },
        200,
        env,
        request
      );
    }

    if (url.pathname === "/v1/oauth/start" && request.method === "GET") {
      return handleStart(url, env);
    }
    if (url.pathname === "/v1/oauth/callback" && request.method === "GET") {
      return handleCallback(url, env);
    }
    if (url.pathname === "/v1/me" && request.method === "GET") {
      return handleMe(env, request);
    }
    if (url.pathname === "/v1/sync" && request.method === "POST") {
      const origin = request.headers.get("Origin") || "";
      const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
      if (!origin || !allowed.includes(origin)) return json({ ok: false, error: "origin" }, 403, env, request);
      return handleSync(env, request);
    }
    if (url.pathname === "/v1/stamp" && request.method === "POST") {
      const origin = request.headers.get("Origin") || "";
      const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
      if (!origin || !allowed.includes(origin)) return json({ ok: false, error: "origin" }, 403, env, request);
      return handleStamp(env, request);
    }
    if (url.pathname === "/v1/unlink" && request.method === "POST") {
      const origin = request.headers.get("Origin") || "";
      const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
      if (!origin || !allowed.includes(origin)) return json({ ok: false, error: "origin" }, 403, env, request);
      return handleUnlink(env, request);
    }

    return json({ ok: false, error: "not_found" }, 404, env, request);
  },
};
