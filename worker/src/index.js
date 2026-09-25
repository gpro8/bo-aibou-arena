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
  const allow = new Set(["chiri", "nuppe", "go", "kama", "kitsunebi", "suiko", "gyuki", "moogredon"]);
  const out = [];
  const have = new Set();
  for (const s of Array.isArray(list) ? list : []) {
    if (!allow.has(s) || have.has(s)) continue;
    have.add(s);
    out.push(s);
  }
  return out;
}

function titleRank(t) {
  if (t === "sansho") return 3;
  if (t === "sanseru") return 2;
  if (t === "kitsui-nobiru") return 1;
  return 0;
}

function bestTitle(a, b) {
  return titleRank(a) >= titleRank(b) ? a || "" : b || "";
}

function cleanRecord(raw) {
  const o = raw && typeof raw === "object" ? raw : {};
  const hardClears = Math.max(0, Math.min(99999, Number(o.hardClears) || 0));
  const raidKills = Math.max(0, Math.min(99999, Number(o.raidKills) || 0));
  let title = bestTitle(o.title, raidKills >= 3 ? "sansho" : raidKills >= 1 ? "sanseru" : "");
  if (!title && hardClears > 0) title = "kitsui-nobiru";
  return {
    v: 1,
    days: cleanDays(o.days),
    easy: cleanDays(o.easy),
    hard: cleanDays(o.hard),
    seen: cleanSeen(o.seen),
    told: cleanDays(o.told),
    hardClears,
    raidKills,
    title,
  };
}

function publicRecord(rec) {
  const r = cleanRecord(rec);
  return {
    ok: true,
    linked: true,
    days: r.days,
    easy: r.easy,
    hard: r.hard,
    seen: r.seen,
    told: r.told,
    hardClears: r.hardClears,
    raidKills: r.raidKills,
    title: r.title,
    dayCount: r.days.length,
  };
}

function cleanName(s) {
  return String(s || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}

function avatarUrl(id, hash) {
  if (hash && /^a_[a-f0-9]+$/i.test(hash)) {
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.gif?size=64`;
  }
  if (hash && /^[a-f0-9]+$/i.test(hash)) {
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=64`;
  }
  let idx = 0;
  try {
    idx = Number(BigInt(id) >> 22n) % 6;
  } catch {
    idx = 0;
  }
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function publicAv(av) {
  return typeof av === "string" && av.startsWith("https://cdn.discordapp.com/") ? av : "";
}

async function saveProfile(env, uid, me) {
  const name = cleanName(me && me.global_name) || cleanName(me && me.username) || "走った人";
  const av = avatarUrl(uid, me && me.avatar);
  await kvPut(env, `p:${uid}`, { name, av, t: Date.now() });
  return { name, av };
}

async function loadProfile(env, uid) {
  const p = await kvJson(env, `p:${uid}`);
  if (!p || typeof p !== "object") return { name: "", av: "" };
  return { name: cleanName(p.name), av: publicAv(p.av) };
}

async function publicMe(env, uid, rec) {
  const p = await loadProfile(env, uid);
  return { ...publicRecord(rec), name: p.name, av: p.av };
}

function cleanMode(m) {
  return m === "hard" ? "hard" : m === "easy" ? "easy" : m === "long" ? "long" : "";
}

const BA_CAP = 50;
const SCORE_MAX = 99999;

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
  await saveProfile(env, uid, me);
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
  return json(await publicMe(env, ses.uid, rec), 200, env, request);
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
  rec.seen = cleanSeen([...(rec.seen || []), ...(incoming.seen || [])]);
  rec.raidKills = Math.max(rec.raidKills || 0, incoming.raidKills || 0);
  rec.title = bestTitle(rec.title, incoming.title);
  await saveUser(env, ses.uid, rec);
  return json(await publicMe(env, ses.uid, rec), 200, env, request);
}

async function handleStamp(env, request) {
  const ses = await sessionUid(env, request);
  if (!ses) return json({ ok: false, error: "auth" }, 401, env, request);
  const today = jstDay();
  if (!(await rate(env, `rl:stamp:${ses.uid}:${today}`, 16, 90000))) {
    return json({ ok: false, error: "rate" }, 429, env, request);
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const allow = new Set(["play", "easy", "hard", "told"]);
  const raw = Array.isArray(body.kinds) ? body.kinds : body.kind ? [body.kind] : [];
  const kinds = [...new Set(raw.map((k) => String(k)).filter((k) => allow.has(k)))].slice(0, 4);
  if (!kinds.length) return json({ ok: false, error: "kind" }, 400, env, request);
  const rec = await loadUser(env, ses.uid);
  rec.seen = cleanSeen([...(rec.seen || []), ...(cleanRecord(body).seen || [])]);
  if (kinds.includes("play") && !rec.days.includes(today)) rec.days.push(today);
  if (kinds.includes("easy") && !rec.easy.includes(today)) rec.easy.push(today);
  if (kinds.includes("hard") && !rec.hard.includes(today)) {
    rec.hard.push(today);
    rec.hardClears = Math.min(99999, rec.hardClears + 1);
    rec.title = bestTitle(rec.title, "kitsui-nobiru");
  }
  if (kinds.includes("told") && !rec.told.includes(today)) rec.told.push(today);
  rec.days = cleanDays(rec.days);
  rec.easy = cleanDays(rec.easy);
  rec.hard = cleanDays(rec.hard);
  rec.told = cleanDays(rec.told);
  const latest = await loadUser(env, ses.uid);
  rec.days = cleanDays([...(latest.days || []), ...(rec.days || [])]);
  rec.easy = cleanDays([...(latest.easy || []), ...(rec.easy || [])]);
  rec.hard = cleanDays([...(latest.hard || []), ...(rec.hard || [])]);
  rec.told = cleanDays([...(latest.told || []), ...(rec.told || [])]);
  rec.seen = cleanSeen([...(latest.seen || []), ...(rec.seen || [])]);
  rec.hardClears = Math.max(latest.hardClears, rec.hardClears);
  rec.raidKills = Math.max(latest.raidKills || 0, rec.raidKills || 0);
  rec.title = bestTitle(latest.title, rec.title);
  await saveUser(env, ses.uid, rec);
  await rememberNan(env, ses.uid);
  return json(await publicMe(env, ses.uid, rec), 200, env, request);
}

async function handleUnlink(env, request) {
  const ses = await sessionUid(env, request);
  if (!ses) return json({ ok: false, error: "auth" }, 401, env, request);
  if (env.KATSUDO) await env.KATSUDO.delete(`ses:${ses.tok}`);
  return json({ ok: true, linked: false }, 200, env, request);
}

async function rememberNan(env, uid) {
  if (!uid) return;
  const raw = await kvJson(env, "nan:idx");
  const idx = Array.isArray(raw) ? raw.filter((id) => typeof id === "string" && /^\d{5,30}$/.test(id)) : [];
  if (idx.includes(uid)) return;
  idx.push(uid);
  await kvPut(env, "nan:idx", idx.slice(-200));
}

function lastJstDays(n) {
  const days = [];
  const seen = new Set();
  let t = Date.now();
  while (days.length < n && t > Date.now() - 20 * 86400000) {
    const d = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(t));
    if (!seen.has(d)) {
      seen.add(d);
      days.push(d);
    }
    t -= 3600000;
  }
  return days.sort();
}

function inWin(list, win) {
  return (Array.isArray(list) ? list : []).filter((d) => win.has(d)).length;
}

function parseDay(s) {
  const t = String(s || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : "";
}

function nextDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function daysBetween(start, end) {
  const out = [];
  let cur = start;
  for (let i = 0; i < 31 && cur <= end; i += 1) {
    out.push(cur);
    cur = nextDay(cur);
  }
  return out;
}

function campaignMeta(env) {
  const start = parseDay(env.CAMPAIGN_START);
  const end = parseDay(env.CAMPAIGN_END);
  const today = jstDay();
  if (!start || !end || end < start) {
    return { status: "soon", start: "", end: "", window: lastJstDays(7), practice: true };
  }
  const window = daysBetween(start, end);
  let status = "live";
  if (today < start) status = "soon";
  if (today > end) status = "ended";
  return { status, start, end, window, practice: false };
}

async function handleNanGet(env, request) {
  const meta = campaignMeta(env);
  const win = meta.window;
  const winSet = new Set(win);
  const idxRaw = await kvJson(env, "nan:idx");
  const idx = Array.isArray(idxRaw) ? idxRaw : [];
  const uids = [...new Set((idx || []).filter((id) => typeof id === "string" && /^\d{5,30}$/.test(id)))].slice(-200);
  const rows = [];
  for (const uid of uids) {
    const rec = await loadUser(env, uid);
    const prof = await loadProfile(env, uid);
    const play = inWin(rec.days, winSet);
    const hard = inWin(rec.hard, winSet);
    const easy = inWin(rec.easy, winSet);
    const told = inWin(rec.told, winSet);
    if (!play && !hard && !easy && !told) continue;
    rows.push({
      name: prof.name || "走った人",
      av: prof.av,
      play,
      hard,
      easy,
      told,
      ok7: play >= 7,
    });
  }
  rows.sort((a, b) => {
    if (a.ok7 !== b.ok7) return a.ok7 ? -1 : 1;
    if (b.told !== a.told) return b.told - a.told;
    if (b.hard !== a.hard) return b.hard - a.hard;
    if (b.easy !== a.easy) return b.easy - a.easy;
    return b.play - a.play;
  });
  const out = rows.slice(0, 50).map((r, i) => ({
    n: i + 1,
    name: cleanName(r.name) || "走った人",
    av: publicAv(r.av),
    play: r.play,
    hard: r.hard,
    easy: r.easy,
    told: r.told,
    ok7: r.ok7,
  }));
  return json(
    {
      ok: true,
      status: meta.status,
      start: meta.start,
      end: meta.end,
      practice: Boolean(meta.practice),
      window: win,
      rows: out,
    },
    200,
    env,
    request
  );
}

async function handleBaGet(env, request) {
  const url = new URL(request.url);
  const mode = cleanMode(url.searchParams.get("mode") || "hard") || "hard";
  const raw = await kvJson(env, `ba:${mode}`);
  const rows = Array.isArray(raw) ? raw : [];
  const out = rows.slice(0, BA_CAP).map((r, i) => ({
    n: i + 1,
    name: cleanName(r && r.name) || "走った人",
    av: publicAv(r && r.av),
    score: Math.max(0, Math.min(SCORE_MAX, Number(r && r.score) || 0)),
  }));
  return json({ ok: true, mode, rows: out }, 200, env, request);
}

async function handleBaPost(env, request) {
  const ses = await sessionUid(env, request);
  if (!ses) return json({ ok: false, error: "auth" }, 401, env, request);
  if (!(await rate(env, `rl:ba:${ses.uid}`, 8, 3600))) {
    return json({ ok: false, error: "rate" }, 429, env, request);
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const mode = cleanMode(body.mode);
  if (!mode) return json({ ok: false, error: "mode" }, 400, env, request);
  const score = Math.max(0, Math.min(SCORE_MAX, Math.floor(Number(body.score) || 0)));
  const prof = await loadProfile(env, ses.uid);
  const raw = await kvJson(env, `ba:${mode}`);
  const rows = Array.isArray(raw) ? raw.filter((r) => r && r.uid !== ses.uid) : [];
  rows.push({
    uid: ses.uid,
    name: prof.name || "走った人",
    av: prof.av,
    score,
    t: Date.now(),
  });
  rows.sort((a, b) => b.score - a.score || a.t - b.t);
  await kvPut(env, `ba:${mode}`, rows.slice(0, BA_CAP));
  return json({ ok: true, mode, score }, 200, env, request);
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
    if (url.pathname === "/v1/ba" && request.method === "GET") {
      return handleBaGet(env, request);
    }
    if (url.pathname === "/v1/nan" && request.method === "GET") {
      return handleNanGet(env, request);
    }
    if (url.pathname === "/v1/ba" && request.method === "POST") {
      const origin = request.headers.get("Origin") || "";
      const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
      if (!origin || !allowed.includes(origin)) return json({ ok: false, error: "origin" }, 403, env, request);
      return handleBaPost(env, request);
    }

    return json({ ok: false, error: "not_found" }, 404, env, request);
  },
};
