const VERSION = "0.4.80";
const NEON = [0xff3d8a, 0x39f0ff, 0xc8ff3a, 0xff9a3a, 0xb44dff];
const SHEETS = {
  sumi: "art/sumi/sheet.png",
  mokopu: "art/mokopu/sheet.png",
};
const FOE_SHEETS = {
  small: "art/foes/chiri/sheet.png",
  thick: "art/foes/nuppe/sheet.png",
  brute: "art/foes/go/sheet.png",
  fly: "art/foes/kama/sheet.png",
  rebound: "art/foes/kitsunebi/sheet.png",
  well: "art/foes/suiko/sheet.png",
  boss: "art/foes/gyuki/sheet.png",
  king: "art/foes/moogredon/sheet.png",
};
const FOE_NAMES = {
  small: { stem: "chiri", jp: "塵坊", en: "Chiri-bou" },
  thick: { stem: "nuppe", jp: "ぬっぺ", en: "Nuppe" },
  brute: { stem: "go", jp: "唐傘", en: "UmBoo" },
  fly: { stem: "kama", jp: "カマイッタ", en: "Kama" },
  rebound: { stem: "kitsunebi", jp: "狐火", en: "Kitsunebi" },
  well: { stem: "suiko", jp: "吸い子", en: "Suiko" },
  boss: { stem: "gyuki", jp: "牛鬼", en: "Moogre" },
  king: { stem: "moogredon", jp: "大妖怪", en: "Moogredon" },
};

const MODES = [
  { id: "easy", label: "ふつう", secs: 120, pace: 1 },
  { id: "long", label: "ながい", secs: 180, pace: 1 },
  { id: "hard", label: "きつい", secs: 80, pace: 1.35 },
];
const STAGES = [
  { id: "yang", label: "陽", bg: 0xf7ecd4, foe: 0x4a2060 },
  { id: "yin", label: "陰", bg: 0x12100e, foe: 0x5a2878 },
];
const PLAY_URL = "https://gpro8.github.io/bo-aibou-arena/";
const KATSUDO_API = "https://bo-aibou-katsudo.bushidao.workers.dev";
const THEME_KEY = "bo-aibou-theme";
const KATSUDO_SES = "bo-aibou-katsudo-ses";
const KATSUDO_PROF = "bo-aibou-katsudo-prof";
const SEEN_STEMS = ["chiri", "nuppe", "go", "kama", "kitsunebi", "suiko", "gyuki", "moogredon"];
const TITLE_RANK = { "": 0, "kitsui-nobiru": 1, sanseru: 2, sansho: 3 };
function bestTitle(a, b) {
  const x = TITLE_RANK[a] != null ? a : "";
  const y = TITLE_RANK[b] != null ? b : "";
  return (TITLE_RANK[x] || 0) >= (TITLE_RANK[y] || 0) ? x : y;
}
function bestMs(a, b) {
  const x = Math.max(0, Math.min(9999999, Number(a) || 0));
  const y = Math.max(0, Math.min(9999999, Number(b) || 0));
  if (!x) return y;
  if (!y) return x;
  return Math.min(x, y);
}
function titleJp(t) {
  if (t === "sansho") return "大妖怪撃退を称賛";
  if (t === "sanseru") return "大妖怪撃退を讃える";
  if (t === "kitsui-nobiru") return "きついを生き延びた";
  return "まだ";
}
const WELL_PAD = 30;
function buzz(pat) {
  try {
    if (navigator.vibrate) navigator.vibrate(pat);
  } catch {
    /* no hap */
  }
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function hit(ev, sel) {
  let n = ev.target;
  if (n && n.nodeType !== 1) n = n.parentElement;
  while (n && typeof n.closest !== "function") n = n.parentNode;
  return n && n.closest ? n.closest(sel) : null;
}

function field(e, key) {
  const row = (e.fields || []).find((x) => x[0] === key);
  return row ? String(row[1]) : "";
}

function kit(e) {
  if (e.id === "sumi") {
    return {
      color: 0xf8b500,
      hp: 32,
      speed: 210,
      rate: 520,
      skill: "ネオンスパーク",
      kind: "spark",
      dmg: 6,
    };
  }
  return {
    color: 0xf3eadc,
    hp: 36,
    speed: 155,
    rate: 520,
    skill: "ふわふわ",
    kind: "puff",
    bob: true,
    dmg: 6,
  };
}

const state = {
  data: null,
  mode: MODES[0],
  stage: STAGES[1],
  mate: null,
  game: null,
  last: null,
  stick: { x: 0, y: 0 },
  stickSide: "left",
  pendingPlay: false,
};

function paintBossLabel() {
  const el = $(".bosslabel");
  if (!el) return;
  const yang = state.stage && state.stage.id === "yang";
  const col = yang ? "#3a2e22" : "#f8b500";
  el.style.setProperty("color", col, "important");
  el.style.setProperty("-webkit-text-fill-color", col, "important");
  el.style.setProperty("text-shadow", "none", "important");
}

function themeId() {
  return document.documentElement.getAttribute("data-theme") === "yang" ? "yang" : "yin";
}

function paintThemeBtn() {
  const btn = $("[data-theme-toggle]");
  if (!btn) return;
  const t = themeId();
  btn.dataset.mode = t;
  btn.setAttribute("aria-label", t === "yang" ? "陽" : "陰");
}

function applyTheme(id) {
  const t = id === "yang" ? "yang" : "yin";
  document.documentElement.setAttribute("data-theme", t);
  const meta = $("meta[name='theme-color']");
  if (meta) meta.setAttribute("content", t === "yang" ? "#f7ecd4" : "#12100e");
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* guest */
  }
  state.stage = STAGES.find((s) => s.id === t) || STAGES[1];
  paintThemeBtn();
}

function bootTheme() {
  let t = "yin";
  try {
    const s = localStorage.getItem(THEME_KEY);
    if (s === "yang" || s === "yin") t = s;
  } catch {
    t = "yin";
  }
  applyTheme(t);
}

function show(name) {
  $$(".screen").forEach((el) => el.classList.toggle("hidden", el.dataset.screen !== name));
  document.body.classList.toggle("playing", name === "play");
  if (name === "title" || name === "setup") paintRec();
  if (name === "katsudo") {
    paintKatsudo();
    refreshNanMeta();
    if (loadKatsudoSes()) pullKatsudo();
  }
  if (name === "ba") {
    flushTodayStamps();
    loadBoard();
  }
  if (name === "play") {
    ["#result-ov", "#raise-ov", "#pause-ov", "#raid-ov", "#bosshp"].forEach((s) => {
      const el = $(s);
      if (el) el.classList.add("hidden");
    });
  }
  if (name !== "play") {
    state.pendingPlay = false;
    clearStick();
    exitFullscreen();
    const rotate = $("#rotate");
    const stick = $("#stick");
    const ov = $("#pause-ov");
    const raid = $("#raid-ov");
    const result = $("#result-ov");
    const raise = $("#raise-ov");
    const boss = $("#bosshp");
    if (rotate) rotate.classList.add("hidden");
    if (stick) stick.classList.add("hidden");
    if (ov) ov.classList.add("hidden");
    if (raid) raid.classList.add("hidden");
    if (result) result.classList.add("hidden");
    if (raise) raise.classList.add("hidden");
    if (boss) boss.classList.add("hidden");
    const stickOv = $("#stick-ov");
    if (stickOv) stickOv.classList.add("hidden");
  }
}

function isCoarse() {
  return window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
}

function wellPad(w, h) {
  if (isCoarse()) return Math.max(72, Math.round(Math.min(w, h) * 0.2));
  return WELL_PAD;
}

function isLandscape() {
  return window.innerWidth >= window.innerHeight;
}

function clearStick() {
  state.stick.x = 0;
  state.stick.y = 0;
  const knob = $("[data-knob]");
  if (knob) knob.style.transform = "translate(-50%, -50%)";
}

function lockPortrait() {
  try {
    const o = screen.orientation;
    if (o && o.lock) {
      const p = o.lock("portrait");
      if (p && p.catch) p.catch(() => {});
    }
  } catch {
    /* iOS / no lock */
  }
}

function unlockOrient() {
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  } catch {
    /* no unlock */
  }
}

function enterPlay() {
  killGame();
  unlockOrient();
  const result = $("#result-ov");
  const raise = $("#raise-ov");
  const pause = $("#pause-ov");
  if (result) result.classList.add("hidden");
  if (raise) raise.classList.add("hidden");
  if (pause) pause.classList.add("hidden");
  const play = $("[data-screen='play']");
  if (play) play.classList.remove("combo");
  applyStickSide();
  show("play");
  const ready = $("#ready");
  const readyTxt = $("[data-ready-txt]");
  const readyBar = $("[data-ready-bar]");
  if (ready) ready.classList.remove("hidden");
  if (readyTxt) readyTxt.textContent = "準備中";
  if (readyBar) readyBar.style.width = "12%";
  document.body.classList.toggle("yang", state.stage && state.stage.id === "yang");
  document.body.classList.toggle("yin", state.stage && state.stage.id === "yin");
  paintBossLabel();
  state.pendingPlay = true;
  tryFullscreen();
  syncPlayGate();
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function tryFullscreen() {
  if (isStandalone() || document.fullscreenElement || document.webkitFullscreenElement) return;
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) return;
  Promise.resolve(req.call(el)).catch(() => {});
}

function exitFullscreen() {
  const x = document.exitFullscreen || document.webkitExitFullscreen;
  if (!x) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    Promise.resolve(x.call(document)).catch(() => {});
  }
}

function fitPlay() {
  const play = $("[data-screen='play']");
  if (!play || play.classList.contains("hidden")) return;
  const vv = window.visualViewport;
  const w = Math.round(vv ? vv.width : window.innerWidth);
  const h = Math.round(vv ? vv.height : window.innerHeight);
  const left = vv ? vv.offsetLeft : 0;
  const top = vv ? vv.offsetTop : 0;
  play.style.width = `${w}px`;
  play.style.height = `${h}px`;
  play.style.left = `${left}px`;
  play.style.top = `${top}px`;
  const arena = $("#arena");
  if (arena) {
    arena.style.width = `${w}px`;
    arena.style.height = `${h}px`;
  }
  if (state.game) state.game.scale.refresh();
}

function syncPlayGate() {
  const rotate = $("#rotate");
  const stickEl = $("#stick");
  const onPlay = !$("[data-screen='play']").classList.contains("hidden");
  if (!onPlay) return;
  fitPlay();
  const coarse = isCoarse();
  const land = isLandscape();
  if (coarse && !land) {
    rotate.classList.remove("hidden");
    stickEl.classList.add("hidden");
    if (state.game) freezeScene();
    return;
  }
  rotate.classList.add("hidden");
  if (coarse) stickEl.classList.remove("hidden");
  else stickEl.classList.add("hidden");
  if (state.pendingPlay && !state.game) {
    state.pendingPlay = false;
    bootArena();
  } else if (state.game) {
    if ($("#result-ov") && !$("#result-ov").classList.contains("hidden")) return;
    if ($("#pause-ov") && !$("#pause-ov").classList.contains("hidden")) return;
    thawScene();
    state.game.scale.refresh();
  }
}

function bindStick() {
  const stick = $("#stick");
  const knob = $("[data-knob]");
  if (!stick || !knob) return;
  let pid = null;
  const apply = (x, y) => {
    const r = stick.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = x - cx;
    let dy = y - cy;
    const max = r.width / 2 - 10;
    const len = Math.hypot(dx, dy) || 1;
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    state.stick.x = dx / max;
    state.stick.y = dy / max;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  };
  stick.addEventListener("pointerdown", (ev) => {
    pid = ev.pointerId;
    stick.setPointerCapture(pid);
    apply(ev.clientX, ev.clientY);
    ev.preventDefault();
  });
  stick.addEventListener("pointermove", (ev) => {
    if (pid == null || ev.pointerId !== pid) return;
    apply(ev.clientX, ev.clientY);
    ev.preventDefault();
  });
  const up = (ev) => {
    if (pid == null || ev.pointerId !== pid) return;
    pid = null;
    clearStick();
  };
  stick.addEventListener("pointerup", up);
  stick.addEventListener("pointercancel", up);
}

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem("bo-aibou-best") || "{}");
  } catch {
    return {};
  }
}

function recKey(mateId, modeId) {
  return `bo-aibou:${mateId}:${modeId}`;
}

function jstDay() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDay(ymd, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return dt.toISOString().slice(0, 10);
}

function streakCount(days, today) {
  const set = new Set(cleanDays(days));
  let start = today;
  if (!set.has(start)) start = shiftDay(today, -1);
  if (!set.has(start)) return 0;
  let n = 0;
  let d = start;
  while (set.has(d)) {
    n += 1;
    d = shiftDay(d, -1);
  }
  return n;
}

function weekDays(today) {
  return [6, 5, 4, 3, 2, 1, 0].map((i) => shiftDay(today, -i));
}

function streakHonor(n) {
  if (n >= 30) return "ひと月つづいた";
  if (n >= 14) return "二週間つづいた";
  if (n >= 7) return "一週間つづいた";
  if (n >= 3) return "火がついた";
  if (n >= 1) return "今日も走った";
  return "";
}

function toldHonor(n) {
  if (n >= 30) return "語りつづける";
  if (n >= 7) return "仲間を呼ぶ";
  if (n >= 3) return "声が届く";
  if (n >= 1) return "語りはじめ";
  return "𝕏で話すと残る";
}

function cleanSeen(list) {
  const allow = new Set(SEEN_STEMS);
  const out = [];
  const have = new Set();
  for (const s of Array.isArray(list) ? list : []) {
    if (!allow.has(s) || have.has(s)) continue;
    have.add(s);
    out.push(s);
  }
  return out;
}

function cleanDays(list) {
  const out = [];
  const have = new Set();
  for (const d of Array.isArray(list) ? list : []) {
    if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || have.has(d)) continue;
    have.add(d);
    out.push(d);
  }
  out.sort();
  return out.slice(-400);
}

function jobStem(job) {
  return (FOE_NAMES[job] && FOE_NAMES[job].stem) || "";
}

function seenNames(stems) {
  const byStem = {};
  Object.values(FOE_NAMES).forEach((n) => {
    byStem[n.stem] = n.jp;
  });
  return cleanSeen(stems).map((s) => byStem[s] || s);
}

function emptyKatsudo() {
  return { v: 1, hardClears: 0, raidKills: 0, raidBestMs: 0, days: [], easy: [], hard: [], seen: [], told: [], title: "" };
}

function copyKatsudo(o) {
  return {
    v: 1,
    hardClears: Math.max(0, Math.min(99999, Number(o.hardClears) || 0)),
    raidKills: Math.max(0, Math.min(99999, Number(o.raidKills) || 0)),
    raidBestMs: Math.max(0, Math.min(9999999, Number(o.raidBestMs) || 0)),
    days: cleanDays(o.days),
    easy: cleanDays(o.easy),
    hard: cleanDays(o.hard),
    seen: cleanSeen(o.seen),
    told: cleanDays(o.told),
    title: bestTitle(o.title, Number(o.raidKills) >= 3 ? "sansho" : Number(o.raidKills) >= 1 ? "sanseru" : o.title),
  };
}

function readKatsudoDisk() {
  try {
    const o = JSON.parse(localStorage.getItem("bo-aibou-katsudo") || "null");
    if (!o || typeof o !== "object") return emptyKatsudo();
    return copyKatsudo(o);
  } catch {
    return emptyKatsudo();
  }
}

let katsudoMem = null;

function loadKatsudo() {
  const disk = readKatsudoDisk();
  if (!katsudoMem) {
    katsudoMem = copyKatsudo(disk);
    return copyKatsudo(katsudoMem);
  }
  const next = {
    v: 1,
    hardClears: Math.max(katsudoMem.hardClears, disk.hardClears),
    raidKills: Math.max(katsudoMem.raidKills || 0, disk.raidKills || 0),
    raidBestMs: bestMs(katsudoMem.raidBestMs, disk.raidBestMs),
    days: cleanDays([...(katsudoMem.days || []), ...(disk.days || [])]),
    easy: cleanDays([...(katsudoMem.easy || []), ...(disk.easy || [])]),
    hard: cleanDays([...(katsudoMem.hard || []), ...(disk.hard || [])]),
    seen: cleanSeen([...(katsudoMem.seen || []), ...(disk.seen || [])]),
    told: cleanDays([...(katsudoMem.told || []), ...(disk.told || [])]),
    title: bestTitle(katsudoMem.title, disk.title),
  };
  katsudoMem = next;
  return copyKatsudo(next);
}

function saveKatsudo(o) {
  const next = copyKatsudo(o);
  if (katsudoMem) {
    next.hardClears = Math.max(next.hardClears, katsudoMem.hardClears);
    next.raidKills = Math.max(next.raidKills || 0, katsudoMem.raidKills || 0);
    next.raidBestMs = bestMs(next.raidBestMs, katsudoMem.raidBestMs);
    next.days = cleanDays([...(katsudoMem.days || []), ...(next.days || [])]);
    next.easy = cleanDays([...(katsudoMem.easy || []), ...(next.easy || [])]);
    next.hard = cleanDays([...(katsudoMem.hard || []), ...(next.hard || [])]);
    next.seen = cleanSeen([...(katsudoMem.seen || []), ...(next.seen || [])]);
    next.told = cleanDays([...(katsudoMem.told || []), ...(next.told || [])]);
    next.title = bestTitle(next.title, katsudoMem.title);
  }
  katsudoMem = copyKatsudo(next);
  try {
    localStorage.setItem("bo-aibou-katsudo", JSON.stringify(katsudoMem));
  } catch {
    /* guest device — mem still holds */
  }
}

function pushKatsudo(o) {
  if (!loadKatsudoSes()) return;
  katsudoFetch("/v1/sync", {
    method: "POST",
    body: JSON.stringify({
      days: o.days,
      hardClears: o.hardClears,
      raidKills: o.raidKills || 0,
      raidBestMs: o.raidBestMs || 0,
      seen: o.seen,
      told: o.told,
      title: o.title,
      version: VERSION,
    }),
  }).catch(() => {});
}

function loadKatsudoSes() {
  try {
    return localStorage.getItem(KATSUDO_SES) || "";
  } catch {
    return "";
  }
}

function saveKatsudoSes(tok) {
  try {
    if (tok) localStorage.setItem(KATSUDO_SES, tok);
    else {
      localStorage.removeItem(KATSUDO_SES);
      localStorage.removeItem(KATSUDO_PROF);
    }
  } catch {
    /* guest */
  }
}

function loadKatsudoProf() {
  try {
    const o = JSON.parse(localStorage.getItem(KATSUDO_PROF) || "null");
    if (!o || typeof o !== "object") return { name: "", av: "" };
    const name = String(o.name || "").replace(/[<>]/g, "").trim().slice(0, 32);
    const av = typeof o.av === "string" && o.av.startsWith("https://cdn.discordapp.com/") ? o.av : "";
    return { name, av };
  } catch {
    return { name: "", av: "" };
  }
}

function saveKatsudoProf(p) {
  try {
    if (!p || !p.name) localStorage.removeItem(KATSUDO_PROF);
    else localStorage.setItem(KATSUDO_PROF, JSON.stringify({ name: String(p.name).slice(0, 32), av: p.av || "" }));
  } catch {
    /* guest */
  }
}

async function katsudoFetch(path, opts) {
  const ses = loadKatsudoSes();
  const headers = { Accept: "application/json" };
  if (ses) headers.Authorization = `Bearer ${ses}`;
  if (opts && opts.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${KATSUDO_API}${path}`, {
    method: (opts && opts.method) || "GET",
    headers,
    body: opts && opts.body,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

function mergeKatsudoRemote(remote) {
  if (!remote || typeof remote !== "object") return loadKatsudo();
  const local = loadKatsudo();
  const days = [...new Set([...local.days, ...(Array.isArray(remote.days) ? remote.days : [])])]
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const easy = cleanDays([...(local.easy || []), ...(Array.isArray(remote.easy) ? remote.easy : [])]);
  const hard = cleanDays([...(local.hard || []), ...(Array.isArray(remote.hard) ? remote.hard : [])]);
  const hardClears = Math.max(local.hardClears, Math.max(0, Number(remote.hardClears) || 0));
  const raidKills = Math.max(local.raidKills || 0, Math.max(0, Number(remote.raidKills) || 0));
  const raidBestMs = bestMs(local.raidBestMs, remote.raidBestMs);
  const seen = cleanSeen([...(local.seen || []), ...(Array.isArray(remote.seen) ? remote.seen : [])]);
  const told = cleanDays([...(local.told || []), ...(Array.isArray(remote.told) ? remote.told : [])]);
  const title = bestTitle(local.title, remote.title);
  const next = { v: 1, days: days.slice(-400), easy, hard, hardClears, raidKills, raidBestMs, seen, told, title };
  saveKatsudo(next);
  return next;
}

async function pullKatsudo() {
  if (!loadKatsudoSes()) {
    paintKatsudo();
    return;
  }
  const got = await katsudoFetch("/v1/me");
  if (got.status === 401) {
    saveKatsudoSes("");
    paintKatsudo();
    return;
  }
  if (got.ok) {
    mergeKatsudoRemote(got.data);
    if (got.data && got.data.name) saveKatsudoProf({ name: got.data.name, av: got.data.av || "" });
    const local = loadKatsudo();
    await katsudoFetch("/v1/sync", {
      method: "POST",
      body: JSON.stringify({
        days: local.days,
        hardClears: local.hardClears,
        raidKills: local.raidKills || 0,
        raidBestMs: local.raidBestMs || 0,
        seen: local.seen,
        told: local.told,
        title: local.title,
        version: VERSION,
      }),
    });
    flushTodayStamps();
  }
  paintKatsudo();
}

function consumeKatsudoReturn() {
  const u = new URL(location.href);
  const flag = u.searchParams.get("katsudo");
  let tok = "";
  const hash = location.hash || "";
  if (hash.startsWith("#ks=")) tok = hash.slice(4).replace(/[^a-f0-9]/gi, "");
  if (tok) saveKatsudoSes(tok.toLowerCase());
  if (flag || tok) {
    u.searchParams.delete("katsudo");
    const q = u.searchParams.toString();
    history.replaceState(null, "", u.pathname + (q ? `?${q}` : "") );
    if (flag === "ok" || tok) {
      show("katsudo");
      showToast("つながった");
      pullKatsudo();
    } else {
      show("katsudo");
      paintKatsudo();
    }
  }
}

function markSeenLocal(stem) {
  const s = String(stem || "");
  if (!SEEN_STEMS.includes(s)) return;
  const o = loadKatsudo();
  if ((o.seen || []).includes(s)) return;
  o.seen = cleanSeen([...(o.seen || []), s]);
  saveKatsudo(o);
}

function rememberSeen(stems) {
  const add = cleanSeen(stems);
  if (!add.length) return loadKatsudo();
  const o = loadKatsudo();
  o.seen = cleanSeen([...(o.seen || []), ...add]);
  saveKatsudo(o);
  pushKatsudo(o);
  return o;
}

let stampChain = Promise.resolve();

function serverStamp(kinds) {
  if (!loadKatsudoSes()) return;
  const list = [...new Set((Array.isArray(kinds) ? kinds : []).filter((k) => k === "play" || k === "easy" || k === "hard" || k === "told"))];
  if (!list.length) return;
  stampChain = stampChain
    .then(() =>
      katsudoFetch("/v1/stamp", {
        method: "POST",
        body: JSON.stringify({ kinds: list, version: VERSION }),
      })
    )
    .then((got) => {
      if (got && got.ok && got.data) mergeKatsudoRemote(got.data);
      paintNanMine();
    })
    .catch(() => {});
}

function stampPlayDay(modeId) {
  const o = loadKatsudo();
  const day = jstDay();
  const id = modeId || (state.mode && state.mode.id) || "";
  const freshDay = !o.days.includes(day);
  if (freshDay) o.days.push(day);
  if (o.days.length > 400) o.days = o.days.slice(-400);
  const kinds = ["play"];
  if (id === "easy") {
    if (!(o.easy || []).includes(day)) o.easy = cleanDays([...(o.easy || []), day]);
    kinds.push("easy");
  }
  o.v = 1;
  saveKatsudo(o);
  serverStamp(kinds);
  pushKatsudo(o);
  return { freshDay, streak: streakCount(o.days, day), days: o.days.length };
}

function stampHardWin() {
  const o = loadKatsudo();
  const day = jstDay();
  const freshDay = !o.days.includes(day);
  if (freshDay) o.days.push(day);
  if (o.days.length > 400) o.days = o.days.slice(-400);
  if (!(o.hard || []).includes(day)) o.hard = cleanDays([...(o.hard || []), day]);
  o.hardClears += 1;
  o.title = "kitsui-nobiru";
  o.v = 1;
  saveKatsudo(o);
  serverStamp(["play", "hard"]);
  pushKatsudo(o);
  return { freshDay, streak: streakCount(o.days, day), days: o.days.length, hardClears: o.hardClears };
}

function stampRaidKill(ms) {
  const o = loadKatsudo();
  o.raidKills = Math.min(99999, (o.raidKills || 0) + 1);
  o.raidBestMs = bestMs(o.raidBestMs, ms);
  o.title = bestTitle(o.title, o.raidKills >= 3 ? "sansho" : "sanseru");
  o.v = 1;
  saveKatsudo(o);
  pushKatsudo(o);
  return o;
}

function noteTold() {
  if (!state.last) return false;
  const o = loadKatsudo();
  const day = jstDay();
  const fresh = !(o.told || []).includes(day);
  if (fresh) {
    o.told = cleanDays([...(o.told || []), day]);
    saveKatsudo(o);
    const n = o.told.length;
    const honor = toldHonor(n);
    showToast(n === 3 || n === 7 || n === 30 ? honor : "語った");
    paintKatsudo();
  }
  serverStamp(["told"]);
  if (fresh) pushKatsudo(o);
  return fresh;
}

function flushTodayStamps() {
  if (!loadKatsudoSes()) return;
  const o = loadKatsudo();
  const day = jstDay();
  const kinds = [];
  if ((o.days || []).includes(day)) kinds.push("play");
  if ((o.easy || []).includes(day)) kinds.push("easy");
  if ((o.hard || []).includes(day)) kinds.push("hard");
  if ((o.told || []).includes(day)) kinds.push("told");
  if (kinds.length) serverStamp(kinds);
}

let toastTimer = 0;
function hideToast() {
  const ov = $("#toast-ov");
  if (ov) ov.classList.add("hidden");
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = 0;
  }
}
function showToast(msg) {
  const ov = $("#toast-ov");
  const el = $("[data-toast-msg]");
  if (!ov || !el) return;
  el.textContent = msg || "";
  ov.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 2200);
}

function paintKatsudo() {
  const o = loadKatsudo();
  const has = o.hardClears > 0;
  const empty = $("[data-katsudo-empty]");
  if (empty) empty.classList.add("hidden");
  const filled = $("[data-katsudo-filled]");
  if (filled) filled.classList.remove("hidden");
  const title = $("[data-katsudo-title]");
  const days = $("[data-katsudo-days]");
  const clears = $("[data-katsudo-clears]");
  const today = jstDay();
  const streak = streakCount(o.days, today);
  const honor = streakHonor(streak);
  const week = $("[data-katsudo-week]");
  if (week) {
    const set = new Set(o.days);
    week.innerHTML = weekDays(today)
      .map((d) => {
        const on = set.has(d) ? " on" : "";
        const now = d === today ? " today" : "";
        return `<i class="${(on + now).trim()}" title="${d}"></i>`;
      })
      .join("");
  }
  const streakEl = $("[data-katsudo-streak]");
  if (streakEl) {
    streakEl.textContent = streak ? `連続 ${streak}日${honor ? ` · ${honor}` : ""}` : "連続 まだ";
    streakEl.classList.toggle("thanks", streak > 0);
    streakEl.classList.toggle("hint", streak === 0);
  }
  const nudge = $("[data-katsudo-nudge]");
  if (nudge) {
    const todayOn = o.days.includes(today);
    nudge.textContent = todayOn
      ? "明日も走ると連続が伸びる"
      : streak
        ? "今日走ると連続が続く"
        : "今日走ると印がつく";
  }
  if (title) {
    title.textContent = titleJp(has ? o.title || "kitsui-nobiru" : "");
    title.classList.toggle("thanks", has);
    title.classList.toggle("hint", !has);
  }
  if (days) {
    days.textContent = `走った日 ${o.days.length}日`;
    days.classList.toggle("thanks", o.days.length > 0);
    days.classList.toggle("hint", o.days.length === 0);
  }
  if (clears) {
    clears.textContent = `きついクリア ${o.hardClears}回`;
    clears.classList.toggle("thanks", o.hardClears > 0);
    clears.classList.toggle("hint", o.hardClears === 0);
  }
  const raidEl = $("[data-katsudo-raid]");
  if (raidEl) {
    const n = o.raidKills || 0;
    const best = o.raidBestMs || 0;
    const sec = best ? Math.max(1, Math.round(best / 1000)) : 0;
    raidEl.textContent = n
      ? `大妖怪撃退 ${n}回${sec ? ` · 最速 ${sec}秒` : ""}`
      : "大妖怪撃退 まだ";
    raidEl.classList.toggle("thanks", n > 0);
    raidEl.classList.toggle("hint", n === 0);
  }
  const seenEl = $("[data-katsudo-seen]");
  if (seenEl) {
    const names = seenNames(o.seen);
    seenEl.textContent = names.length
      ? `見た敵の種類 ${names.join(" · ")}`
      : "見た敵の種類 まだ";
  }
  const toldEl = $("[data-katsudo-told]");
  const toldN = (o.told || []).length;
  if (toldEl) {
    toldEl.textContent = `語った ${toldN}日`;
    toldEl.classList.toggle("thanks", toldN > 0);
    toldEl.classList.toggle("hint", toldN === 0);
    toldEl.classList.remove("hidden");
  }
  const toldHonorEl = $("[data-katsudo-told-honor]");
  if (toldHonorEl) {
    toldHonorEl.textContent = toldHonor(toldN);
    toldHonorEl.classList.toggle("thanks", toldN > 0);
    toldHonorEl.classList.toggle("hint", toldN === 0);
  }
  const linked = Boolean(loadKatsudoSes());
  const hello = $("[data-katsudo-hello]");
  if (hello) {
    hello.classList.remove("hidden");
    hello.classList.toggle("guest", !linked);
  }
  const prof = loadKatsudoProf();
  const av = $("[data-dc-ava]");
  const nm = $("[data-dc-name]");
  const mark = $("[data-dc-mark]");
  if (av) {
    if (linked && prof.av) {
      av.src = prof.av;
      av.classList.remove("hidden");
    } else {
      av.removeAttribute("src");
      av.classList.add("hidden");
    }
  }
  if (nm) nm.textContent = linked && prof.name ? prof.name : "ゲスト";
  if (mark) {
    mark.classList.remove("hidden");
    mark.classList.toggle("dc-mute", !linked);
    mark.setAttribute("aria-label", linked ? "接続を解除" : "つなぐ");
  }
  const join = $("[data-katsudo-join]");
  if (join) join.classList.toggle("hidden", linked);
  const ask = $("[data-dc-ask]");
  if (ask && !linked) ask.classList.add("hidden");
  const link = $("[data-katsudo-link]");
  if (link) {
    link.textContent = linked
      ? "Discordの名前で残す（番号は出ない）。順位表にも載せられる"
      : "この端末に残る";
  }
  const connect = $("[data-katsudo-connect]");
  if (connect) connect.classList.toggle("hidden", linked);
  paintNanMine();
}

let baMode = "hard";
let baTab = "ba";

function baRow(r) {
  const name = String(r.name || "走った人").replace(/[<>]/g, "");
  const av = typeof r.av === "string" && r.av.startsWith("https://cdn.discordapp.com/") ? r.av : "";
  const img = av
    ? `<img class="dc-ava" src="${av}" alt="" width="32" height="32" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="dc-ava ba-ph"></span>`;
  const n = Number(r.n) || 0;
  const score = Math.max(0, Math.min(99999, Number(r.score) || 0));
  return `<li class="ba-row"><span class="ba-n">${n}</span>${img}<span class="ba-name">${name}</span><span class="ba-score">${score}</span></li>`;
}

function nanRow(r) {
  const name = String(r.name || "走った人").replace(/[<>]/g, "");
  const av = typeof r.av === "string" && r.av.startsWith("https://cdn.discordapp.com/") ? r.av : "";
  const img = av
    ? `<img class="dc-ava" src="${av}" alt="" width="32" height="32" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="dc-ava ba-ph"></span>`;
  const n = Number(r.n) || 0;
  const mark = r.ok7 ? `<span class="ba-ok">七日</span>` : "";
  return `<li class="ba-row"><span class="ba-n">${n}</span>${img}<span class="ba-name">${name}</span><span class="ba-meta">語${Number(r.told) || 0} きつい${Number(r.hard) || 0} ふつう${Number(r.easy) || 0} 走${Number(r.play) || 0}</span>${mark}</li>`;
}

function paintBaChrome() {
  $$("[data-ba-tab]").forEach((b) => b.classList.toggle("on", b.dataset.baTab === baTab));
  const modes = $("[data-ba-modes]");
  if (modes) modes.classList.toggle("hidden", baTab === "nan");
  const sh = $("[data-ba-score-hint]");
  const nh = $("[data-ba-nan-hint]");
  if (sh) sh.classList.toggle("hidden", baTab === "nan");
  if (nh) nh.classList.toggle("hidden", baTab !== "nan");
  const phase = $("[data-nan-phase]");
  const rules = $("[data-nan-rules]");
  if (phase) phase.classList.toggle("hidden", baTab !== "nan");
  if (rules) rules.classList.toggle("hidden", baTab !== "nan");
}

function loadBoard() {
  paintBaChrome();
  if (baTab === "nan") return loadNan();
  return loadBa();
}

let nanMeta = null;

function inWinCount(list, win) {
  const set = new Set(Array.isArray(win) ? win : []);
  return (Array.isArray(list) ? list : []).filter((d) => set.has(d)).length;
}

function nanWindow() {
  if (nanMeta && Array.isArray(nanMeta.window) && nanMeta.window.length) return nanMeta.window;
  return [0, 1, 2, 3, 4, 5, 6].map((i) => shiftDay(jstDay(), -i));
}

function paintNanMine() {
  const phase = $("[data-nan-mine-phase]");
  const stats = $("[data-nan-mine-stats]");
  if (!phase || !stats) return;
  const o = loadKatsudo();
  const m = nanMeta;
  const win = nanWindow();
  const play = inWinCount(o.days, win);
  const hard = inWinCount(o.hard, win);
  const easy = inWinCount(o.easy, win);
  const told = inWinCount(o.told, win);
  const bits = `走${play} 語${told} きつい${hard} ふつう${easy}`;
  if (!m || !m.ok || m.practice || !m.start) {
    phase.textContent = "開始前（練習）本番の期間が決まるとこの数字は使わない";
    stats.textContent = `練習 ${bits}`;
    return;
  }
  const label = m.status === "ended" ? "終了" : m.status === "live" ? "開催中" : "開始前";
  phase.textContent = `${label} ${m.start}〜${m.end}（JST）この期間だけ`;
  stats.textContent = play >= 7 ? `${bits} 七日` : bits;
}

async function refreshNanMeta() {
  try {
    const res = await fetch(`${KATSUDO_API}/v1/nan`, { headers: { Accept: "application/json" } });
    const data = await res.json();
    if (data && data.ok) nanMeta = data;
  } catch {
    /* keep last */
  }
  paintNanMine();
  return nanMeta;
}

async function loadNan() {
  const list = $("[data-ba-list]");
  const empty = $("[data-ba-empty]");
  const phase = $("[data-nan-phase]");
  await refreshNanMeta();
  const data = nanMeta;
  try {
    if (phase) {
      const st = data && data.status;
      if (data && data.start && st === "live") phase.textContent = `開催中 ${data.start}〜${data.end}（JST）この期間だけ`;
      else if (data && data.start && st === "ended") phase.textContent = `終了 ${data.start}〜${data.end}（JST）この期間だけ。後は数えない`;
      else if (data && data.start && st === "soon") phase.textContent = `開始前 ${data.start}〜${data.end}（JST）この期間だけ`;
      else if (data && data.practice) phase.textContent = "開始前。下は練習（直近7日）。本番では使わない";
      else phase.textContent = "開始前。ルールを読んでつなぐ";
    }
    const rows = data && Array.isArray(data.rows) ? data.rows : [];
    if (list) list.innerHTML = rows.map(nanRow).join("");
    if (empty) {
      if (data && data.start && data.status === "soon") empty.textContent = "この期間はまだ始まっていない";
      else if (data && data.practice) empty.textContent = "練習。まだ誰も走っていない";
      else if (data && data.status === "ended") empty.textContent = "この期間に走った人はいない";
      else empty.textContent = "この期間はまだ誰も走っていない";
      empty.classList.toggle("hidden", rows.length > 0);
    }
  } catch {
    if (phase) phase.textContent = "開始前。ルールを読んでつなぐ";
    if (list) list.innerHTML = "";
    if (empty) {
      empty.textContent = "順位表を読めませんでした";
      empty.classList.remove("hidden");
    }
  }
}

async function loadBa() {
  $$("[data-ba-mode]").forEach((b) => b.classList.toggle("on", b.dataset.baMode === baMode));
  const list = $("[data-ba-list]");
  const empty = $("[data-ba-empty]");
  try {
    const res = await fetch(`${KATSUDO_API}/v1/ba?mode=${baMode}`, { headers: { Accept: "application/json" } });
    const data = await res.json();
    const rows = data && Array.isArray(data.rows) ? data.rows : [];
    if (list) list.innerHTML = rows.map(baRow).join("");
    if (empty) {
      empty.textContent = "まだ誰も載っていない";
      empty.classList.toggle("hidden", rows.length > 0);
    }
  } catch {
    if (list) list.innerHTML = "";
    if (empty) {
      empty.textContent = "順位表を読めませんでした";
      empty.classList.remove("hidden");
    }
  }
}

async function postBa() {
  const run = state.last;
  if (!run) return;
  if (!loadKatsudoSes()) {
    showToast("つなぐと順位表に載せる");
    return;
  }
  const mode = run.mode === "easy" ? "easy" : run.mode === "long" ? "long" : run.mode === "hard" ? "hard" : "";
  if (!mode) return;
  const got = await katsudoFetch("/v1/ba", {
    method: "POST",
    body: JSON.stringify({ mode, score: run.score, version: VERSION }),
  });
  if (got.status === 401) {
    saveKatsudoSes("");
    showToast("つなぐと順位表に載せる");
    return;
  }
  if (got.status === 429) {
    showToast("少し待って");
    return;
  }
  if (got.ok) {
    showToast("載せた");
    return;
  }
  showToast("載せられませんでした");
}

function loadStickSide() {
  try {
    const s = localStorage.getItem("bo-aibou-stick");
    if (s === "right" || s === "left") state.stickSide = s;
  } catch {
    /* guest */
  }
}

function saveStickSide(side) {
  state.stickSide = side === "right" ? "right" : "left";
  try {
    localStorage.setItem("bo-aibou-stick", state.stickSide);
  } catch {
    /* guest */
  }
}

function applyStickSide() {
  const stick = $("#stick");
  const boss = $("#bosshp");
  if (stick) stick.classList.toggle("right", state.stickSide === "right");
  if (boss) boss.classList.toggle("swap", state.stickSide === "right");
}

function paintStickOv() {
  $$("[data-stick-side]").forEach((b) => {
    const on = b.dataset.stickSide === state.stickSide;
    b.classList.toggle("gold", on);
    b.classList.toggle("ghost", !on);
  });
}

function paintRec() {
  const all = loadBest();
  const nums = Object.values(all).map(Number).filter((n) => n > 0);
  const own = $("[data-own-rec]");
  if (own) own.textContent = nums.length ? `自分のベスト ${Math.max(...nums)}` : "自分の記録はまだない";
  const setup = $("[data-setup-rec]");
  if (setup && state.mate) {
    const n = Number(all[recKey(state.mate.id, state.mode.id)] || 0);
    setup.textContent = n
      ? `${state.mate.name} · ${state.mode.label} ベスト ${n}`
      : `${state.mate.name} · この難易度の記録はまだない`;
  }
}

function loadImg(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

function raiseText(run) {
  return [
    "相棒あそび",
    `${run.name} ${run.win ? "生き延びた" : "やられた"}`,
    `倒 ${run.kills} · 連 ${run.combo} · lv ${run.lv}${run.rec ? " · 新記録" : ""}`,
    "入場・参加無料",
    "活動記録でつなぐ",
    PLAY_URL,
    "",
    "#相棒あそび #BushiDAO",
  ].join("\n");
}

async function paintFlagCard(run) {
  const img = $("[data-flag-card]");
  const c = document.createElement("canvas");
  c.width = 1080;
  c.height = 1350;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#12100e";
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.strokeStyle = "#3a342c";
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 36, 1008, 1278);
  ctx.strokeStyle = "#f8b500";
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.arc(540, 400, 210, 0, Math.PI * 2);
  ctx.stroke();
  const face = await loadImg(`art/${run.id}/front.png`);
  if (face) {
    const s = 340;
    ctx.save();
    ctx.beginPath();
    ctx.arc(540, 400, 176, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(face, 540 - s / 2, 400 - s / 2, s, s);
    ctx.restore();
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#f8b500";
  ctx.font = "700 28px sans-serif";
  ctx.fillText("BushiDAO · 相棒あそび", 540, 120);
  ctx.fillStyle = "#f3eadc";
  ctx.font = "700 80px sans-serif";
  ctx.fillText(run.win ? "生き延びた" : "やられた", 540, 710);
  ctx.fillStyle = "#f8b500";
  ctx.font = "700 48px sans-serif";
  ctx.fillText(run.name, 540, 780);
  ctx.fillStyle = "#f3eadc";
  ctx.font = "600 36px sans-serif";
  ctx.fillText(`倒 ${run.kills}   連 ${run.combo}   lv ${run.lv}`, 540, 860);
  ctx.fillStyle = run.rec ? "#f8b500" : "#9a8f82";
  ctx.font = "700 40px sans-serif";
  ctx.fillText(run.rec ? `新記録 ${run.score}` : `記録 ${run.score}`, 540, 930);
  ctx.fillStyle = "#9a8f82";
  ctx.font = "500 28px sans-serif";
  ctx.fillText("入場・参加無料", 540, 1180);
  ctx.fillText("希望に向かって駆け抜ける", 540, 1230);
  ctx.fillStyle = "#3a342c";
  ctx.fillRect(980, 80, 8, 64);
  ctx.fillStyle = "#f8b500";
  ctx.beginPath();
  ctx.moveTo(988, 80);
  ctx.lineTo(1040, 100);
  ctx.lineTo(988, 120);
  ctx.closePath();
  ctx.fill();
  state.card = c;
  if (img) {
    img.src = c.toDataURL("image/png");
    img.classList.remove("hidden");
    img.alt = `${run.name} ${run.win ? "生き延びた" : "やられた"}`;
  }
}

function clickA(href, download) {
  const a = document.createElement("a");
  a.href = href;
  a.rel = "noopener";
  if (download) a.download = download;
  else a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function cardPack() {
  const run = state.last;
  if (!run || !state.card) return null;
  const text = raiseText(run);
  const dataUrl = state.card.toDataURL("image/png");
  const bin = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/png" });
  const file = new File([bytes], "share.png", { type: "image/png" });
  return {
    text,
    dataUrl,
    blob,
    file,
    tweet: `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`,
  };
}

function raiseMsg(s) {
  const el = $("[data-raise-msg]");
  if (el) el.textContent = s || "";
}

function raiseFlag() {
  const pack = cardPack();
  if (!pack) return;
  noteTold();
  if (isCoarse() && navigator.share) {
    const payload =
      navigator.canShare && navigator.canShare({ files: [pack.file] })
        ? { files: [pack.file], text: pack.text, title: "相棒あそび" }
        : { text: pack.text, url: PLAY_URL, title: "相棒あそび" };
    navigator.share(payload).catch((err) => {
      if (err && err.name === "AbortError") return;
      const ov = $("#raise-ov");
      if (ov) ov.classList.remove("hidden");
    });
    return;
  }
  raiseMsg("");
  const ov = $("#raise-ov");
  if (ov) ov.classList.remove("hidden");
}

function raiseCopy() {
  const pack = cardPack();
  if (!pack) return;
  noteTold();
  clickA(pack.tweet);
  const ok = navigator.clipboard && window.ClipboardItem;
  if (!ok) {
    raiseMsg("コピーできない。保存して添付");
    return;
  }
  const img = pack.blob;
  const txt = new Blob([pack.text], { type: "text/plain" });
  const done = (s) => raiseMsg(s);
  navigator.clipboard
    .write([new ClipboardItem({ "image/png": img, "text/plain": txt })])
    .then(() => done("コピーした。𝕏に貼る"))
    .catch(() =>
      navigator.clipboard
        .write([new ClipboardItem({ "image/png": img })])
        .then(() => done("画像をコピーした。文は𝕏の投稿欄"))
        .catch(() => done("コピーできない。保存して添付"))
    );
}

function raiseSave() {
  const pack = cardPack();
  if (!pack) return;
  clickA(pack.dataUrl, "share.png");
  raiseMsg("保存した");
}

function renderSetup() {
  if (!state.data) return;
  const modes = $("[data-modes]");
  if (!modes) return;
  modes.innerHTML = MODES.map(
    (m) =>
      `<button type="button" class="chip${m.id === state.mode.id ? " on" : ""}" data-mode="${m.id}">${m.label}<br><span>${m.secs}秒</span></button>`
  ).join("");
  const stages = $("[data-stages]");
  stages.innerHTML = STAGES.map(
    (s) =>
      `<button type="button" class="chip${s.id === state.stage.id ? " on" : ""}" data-stage="${s.id}">${s.label}</button>`
  ).join("");
  const mates = $("[data-mates]");
  const list = state.data.entries || [];
  if (!state.mate) state.mate = list.find((e) => e.id === "mokopu") || list[0];
  mates.innerHTML = list
    .map((e) => {
      const on = state.mate && state.mate.id === e.id ? " on" : "";
      const thumb = SHEETS[e.id] ? `<img src="art/${e.id}/front.png" alt="">` : "";
      return `<button type="button" class="mate${on}" data-mate="${e.id}">${thumb}<b>${e.name}</b><span>主 ${e.owner || "未記入"}</span></button>`;
    })
    .join("");
  const e = state.mate;
  if (e) {
    const skill = field(e, "特技");
    const attr = field(e, "属性") || (e.types || []).join("·") || "—";
    $("[data-mate-blurb]").textContent = `${e.name} · ${e.species || ""} · ${attr} · ${skill} · 主 ${e.owner || "未記入"}`;
  }
  paintRec();
}

function bootArena() {
  killGame();
  const mate = state.mate;
  const k = kit(mate);
  const mode = state.mode;
  const stage = state.stage;
  const hud = {
    name: $("[data-hud-name]"),
    skill: $("[data-hud-skill]"),
    time: $("[data-hud-time]"),
    hp: $("[data-hud-hp]"),
    hpbar: $("[data-hud-hpbar]"),
    combo: $("[data-hud-combo]"),
    graze: $("[data-hud-graze]"),
    score: $("[data-hud-score]"),
    lv: $("[data-hud-lv]"),
    buff: $("[data-hud-buff]"),
  };
  hud.name.textContent = mate.name;
  hud.skill.textContent = k.skill;

  class Arena extends Phaser.Scene {
    constructor() {
      super("arena");
    }
    preload() {
      const path = SHEETS[mate.id];
      if (path) this.load.spritesheet("mate", path, { frameWidth: 160, frameHeight: 160 });
      Object.entries(FOE_SHEETS).forEach(([job, p]) => {
        this.load.spritesheet(`foe-${job}`, p, { frameWidth: 160, frameHeight: 160 });
      });
      this.load.on("progress", (v) => {
        const bar = $("[data-ready-bar]");
        const txt = $("[data-ready-txt]");
        if (bar) bar.style.width = `${Math.max(12, Math.round(v * 100))}%`;
        if (txt) txt.textContent = "準備中";
      });
    }
    create() {
      this.ended = false;
      this.hp = k.hp;
      this.maxHp = k.hp;
      this.lv = 1;
      this.xp = 0;
      this.next = 4;
      this.left = mode.secs;
      this.pace = mode.pace;
      this.hasSprite = this.textures.exists("mate");
      this.face = 1;
      this.look = "right";
      this.cameras.main.setBackgroundColor(stage.bg);
      this.bakeMarks();
      ["small", "thick", "brute", "fly", "rebound", "well", "boss", "king"].forEach((job) => {
        const key = `foe-${job}`;
        if (!this.textures.exists(key)) return;
        if (job === "well") {
          this.anims.create({
            key: `${key}-rise`,
            frames: this.anims.generateFrameNumbers(key, { start: 0, end: 2 }),
            frameRate: 9,
            repeat: 0,
          });
          return;
        }
        this.anims.create({
          key: `${key}-run`,
          frames: this.anims.generateFrameNumbers(key, { start: 0, end: 2 }),
          frameRate: job === "boss" || job === "king" ? 5 : job === "brute" ? 6 : job === "thick" ? 5 : job === "rebound" ? 8 : 9,
          repeat: -1,
        });
      });
      const w = this.scale.width;
      const h = this.scale.height;
      if (this.hasSprite) {
        this.anims.create({
          key: "mate-run",
          frames: this.anims.generateFrameNumbers("mate", { start: 4, end: 7 }),
          frameRate: k.bob ? 6 : 9,
          repeat: -1,
        });
        this.player = this.physics.add.sprite(w / 2, h / 2, "mate", 0);
        this.player.setScale(k.bob ? 0.58 : 0.52);
        this.player.body.setCircle(k.bob ? 42 : 36, 40, k.bob ? 55 : 70);
        this.player.setDepth(5);
      } else {
        this.player = this.add.circle(w / 2, h / 2, 16, k.color);
        this.physics.add.existing(this.player);
        this.player.body.setCircle(16);
      }
      this.player.body.setCollideWorldBounds(true);
      this.physics.world.pause();
      const readyTxt = $("[data-ready-txt]");
      const readyBar = $("[data-ready-bar]");
      if (readyBar) readyBar.style.width = "100%";
      if (readyTxt) readyTxt.textContent = "はじまる";
      this.time.delayedCall(560, () => {
        const ov = $("#ready");
        if (ov) ov.classList.add("hidden");
        if (this.physics && this.physics.world) this.physics.world.resume();
      });
      this.cursors = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT");
      this.foes = this.physics.add.group();
      this.shots = this.physics.add.group();
      this.bolts = this.physics.add.group();
      this.gems = this.physics.add.group();
      this.chests = this.physics.add.group();
      this.physics.add.overlap(this.shots, this.foes, (shot, foe) => {
        if (!shot.active || !foe.active) return;
        shot.destroy();
        this.hurtFoe(foe, this.skillDmg());
      });
      this.physics.add.overlap(this.player, this.gems, (_p, gem) => {
        gem.destroy();
        this.xp += 1;
        if (this.xp >= this.next) {
          this.xp = 0;
          this.next += 2;
          this.lv += 1;
          this.maxHp += 2;
          this.healWhy = "lv";
          this.hp = Math.min(this.maxHp, this.hp + 4);
        }
      });
      this.physics.add.overlap(this.player, this.chests, (_p, box) => {
        this.openChest(box);
      });
      this.physics.add.overlap(this.player, this.bolts, (_p, bolt) => {
        if (!bolt.active) return;
        if (bolt.iframes > 0) return;
        const guarded = this.hurtTick > 0 || this.time.now < this.wardUntil;
        if (!guarded) {
          this.hp -= 2;
          this.hurtTick = 480;
          this.grazeStreak = 0;
          if (this.hp <= 0) this.die();
        }
        if (bolt.bounce > 0) {
          bolt.bounce -= 1;
          bolt.iframes = 220;
          if (bolt.body && bolt.body.velocity) {
            bolt.body.velocity.x *= -1;
            bolt.body.velocity.y *= -1;
          }
        } else {
          bolt.destroy();
        }
      });
      this.hurtTick = 0;
      this.spawnAcc = 0;
      this.shotAcc = 0;
      this.secAcc = 0;
      this.waveAcc = 0;
      this.paceHold = 0;
      this.sparks = [];
      this.kills = 0;
      this.dry = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.lastKill = 0;
      this.bossDone = false;
      this.bossDown = 0;
      this.raid = false;
      this.raidAsked = false;
      this.raidWin = false;
      this.raidFail = false;
      this.raidDown = 0;
      this.raidAt = 0;
      this.raidMs = 0;
      this.raidChests = 0;
      this.powerUntil = 0;
      this.clockPlayed = null;
      this.surviveLocked = false;
      this.hardStamped = false;
      this.hitStop = 0;
      this.pullUntil = 0;
      this.fastUntil = 0;
      this.chestAcc = 0;
      this.chestsOpened = 0;
      this.lastBuff = null;
      this.gotBuffs = [];
      this.graze = 0;
      this.grazeStreak = 0;
      this.grazeScore = 0;
      this.wardUntil = 0;
      this.buffMax = 22000;
      this.wardPending = false;
      this.ward = null;
      this.prevHp = this.hp;
      this.healWhy = "";
      this.paintHud();
    }
    pulseHp(kind, amt) {
      const bar = $(".hpbar");
      const fx = $("#fx");
      if (bar) {
        bar.classList.remove("dmg", "heal");
        void bar.offsetWidth;
        bar.classList.add(kind);
        setTimeout(() => bar.classList.remove("dmg", "heal"), 340);
      }
      if (fx) {
        fx.className = kind;
        void fx.offsetWidth;
        setTimeout(() => {
          fx.className = "";
        }, 320);
      }
      if (this.player) {
        const n =
          kind === "heal"
            ? `${this.healWhy || "心"} +${Math.ceil(amt)}`
            : `-${Math.ceil(amt)}`;
        this.pop(this.player.x, this.player.y - 24, n, kind === "heal" ? "#7ecfff" : "#ff8a8a");
        if (this.hasSprite) {
          this.player.setTint(kind === "heal" ? 0x7ecfff : 0xff4a4a);
          this.time.delayedCall(180, () => this.player.clearTint());
          if (kind === "dmg" && this.cameras && this.cameras.main) this.cameras.main.shake(110, 0.008);
          if (kind === "dmg") buzz(45);
        }
        this.healWhy = "";
      }
    }
    paintHud() {
      const now = Math.max(0, Math.ceil(this.hp));
      hud.hp.textContent = `心 ${now}/${this.maxHp}`;
      if (hud.hpbar) {
        hud.hpbar.style.width = `${Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100))}%`;
        const wrap = $(".hpbar");
        if (wrap) wrap.classList.toggle("low", this.hp / this.maxHp < 0.3);
      }
      if (this.prevHp != null) {
        if (this.hp < this.prevHp - 0.05) this.pulseHp("dmg", this.prevHp - this.hp);
        else if (this.hp > this.prevHp + 0.05) this.pulseHp("heal", this.hp - this.prevHp);
      }
      this.prevHp = this.hp;
      hud.lv.textContent = `lv ${this.lv}`;
      const comboTxt = this.combo > 1 ? `連 ${this.combo}` : "";
      if (hud.combo.textContent !== comboTxt) {
        hud.combo.textContent = comboTxt;
        hud.combo.classList.toggle("hidden", !comboTxt);
      }
      const grazeTxt = this.grazeStreak > 0 ? `かわし ${this.grazeStreak}` : "";
      if (hud.graze && hud.graze.textContent !== grazeTxt) {
        hud.graze.textContent = grazeTxt;
        hud.graze.classList.toggle("hidden", !grazeTxt);
      }
      if (hud.score) {
        const sc = this.liveScore();
        const scoreTxt = sc > 0 ? `記録 ${sc}` : "";
        if (hud.score.textContent !== scoreTxt) {
          hud.score.textContent = scoreTxt;
          hud.score.classList.toggle("hidden", !scoreTxt);
        }
      }
      const tnow = this.time ? this.time.now : 0;
      const chip = $("[data-buffchip]");
      const bbar = $("[data-buff-bar]");
      const leftP = this.pullUntil - tnow;
      const leftF = this.fastUntil - tnow;
      const leftW = this.wardUntil - tnow;
      const bits = [
        { k: "pull", t: leftP, n: "吸い込み" },
        { k: "fast", t: leftF, n: "はやて" },
        { k: "ward", t: leftW, n: "守" },
        { k: "power", t: (this.powerUntil || 0) - tnow, n: "力" },
      ].filter((b) => b.t > 0);
      bits.sort((a, b) => b.t - a.t);
      const top = bits[0];
      if (chip) chip.classList.toggle("hidden", !top);
      if (top) {
        if (hud.buff) hud.buff.textContent = `${top.n} ${Math.ceil(top.t / 1000)}`;
        if (bbar && this.buffMax) bbar.style.width = `${Math.max(0, Math.min(100, (top.t / this.buffMax) * 100))}%`;
      } else if (hud.buff) hud.buff.textContent = "";
      hud.skill.textContent = `${k.skill} ${this.skillDmg()}`;
      const t = Math.max(0, Math.ceil(this.left));
      hud.time.textContent = this.raid ? "大妖怪" : `${t}秒`;
    }
    liveScore(win) {
      const clear = win ? (mode.id === "hard" ? 100 : 25) : 0;
      return this.lv * 12 + this.kills * 2 + this.maxCombo * 3 + clear + this.bossDown * 55 + (this.raidDown || 0) * 150 + this.grazeScore;
    }
    hajikiFoe(f) {
      if (!f || !f.active || f.hajiki || f.boss) return;
      f.hajiki = true;
      const ang = Math.atan2(f.y - this.player.y, f.x - this.player.x);
      const nx = f.x + Math.cos(ang) * 150;
      const ny = f.y + Math.sin(ang) * 150;
      this.pop(f.x, f.y - 12, "弾き", "#fff4a3");
      const burst = this.add.circle(f.x, f.y, 12, 0xffffff, 0.45);
      burst.setStrokeStyle(3, 0xf8b500, 0.95);
      burst.setDepth(8);
      this.tweens.add({
        targets: burst,
        scale: 2.6,
        alpha: 0,
        duration: 240,
        onComplete: () => burst.destroy(),
      });
      this.tweens.add({
        targets: f,
        x: nx,
        y: ny,
        duration: 180,
        ease: "Cubic.easeOut",
      });
      f.setTint(0xffffff);
      this.time.delayedCall(140, () => {
        if (f.active) f.clearTint();
      });
      buzz([18, 20, 28]);
    }
    callout(msg) {
      const w = this.scale.width / 2;
      const h = this.scale.height / 2;
      const t = this.add.text(w, h, msg, {
        fontFamily: "sans-serif",
        fontSize: "28px",
        color: "#f8b500",
        stroke: "#1a1408",
        strokeThickness: 6,
      });
      t.setOrigin(0.5);
      t.setDepth(30);
      this.tweens.add({
        targets: t,
        y: h - 36,
        alpha: 0,
        duration: 900,
        onComplete: () => t.destroy(),
      });
    }
    skillDmg() {
      return k.dmg + (this.lv - 1) * 2 + (this.time && this.time.now < (this.powerUntil || 0) ? 3 : 0);
    }
    skillReach() {
      const t = this.lv >= 9 ? 3 : this.lv >= 6 ? 2 : this.lv >= 3 ? 1 : 0;
      return 14 + t * 10;
    }
    puffReach() {
      return 56 + (this.lv - 1) * 6;
    }
    sparkCap() {
      return Math.min(8, 4 + this.lv);
    }
    sparkDirect() {
      return 8 + (this.lv - 1) * 2;
    }
    sparkSitLife() {
      return 1600 + (this.lv - 1) * 450;
    }
    bakeMarks() {
      const diamond = (g, cx, cy, s, fill, stroke) => {
        g.fillStyle(fill, 1);
        g.beginPath();
        g.moveTo(cx, cy - s);
        g.lineTo(cx + s, cy);
        g.lineTo(cx, cy + s);
        g.lineTo(cx - s, cy);
        g.closePath();
        g.fillPath();
        if (stroke) {
          g.lineStyle(2, stroke, 0.95);
          g.strokePath();
        }
      };
      const foe = this.make.graphics({ add: false });
      diamond(foe, 16, 16, 13, stage.foe, 0x1b1916);
      foe.generateTexture("mark-foe", 32, 32);
      foe.destroy();
      const slash = this.make.graphics({ add: false });
      slash.lineStyle(5, 0x39f0ff, 0.95);
      slash.beginPath();
      slash.arc(16, 16, 11, -0.4, 2.2);
      slash.strokePath();
      slash.lineStyle(2, 0xffffff, 0.85);
      slash.beginPath();
      slash.arc(16, 16, 7, -0.2, 2.0);
      slash.strokePath();
      slash.generateTexture("mark-kama", 32, 32);
      slash.destroy();
      const flame = this.make.graphics({ add: false });
      flame.fillStyle(0xe22a00, 0.95);
      flame.fillCircle(16, 16, 12);
      flame.fillStyle(0xff6a1a, 1);
      flame.fillCircle(16, 16, 8);
      flame.fillStyle(0xffc14a, 1);
      flame.fillCircle(16, 15, 5);
      flame.fillStyle(0xfff4a3, 1);
      flame.fillCircle(14, 13, 2);
      flame.generateTexture("mark-fire", 32, 32);
      flame.destroy();
      const boss = this.make.graphics({ add: false });
      boss.fillStyle(0x1a1018, 1);
      boss.fillCircle(32, 32, 28);
      boss.lineStyle(5, 0xf8b500, 1);
      boss.strokeCircle(32, 32, 26);
      diamond(boss, 32, 32, 14, 0x4a2060, 0x1b1916);
      boss.generateTexture("mark-boss", 64, 64);
      boss.destroy();
      const flag = this.make.graphics({ add: false });
      flag.fillStyle(0x3a342c, 1);
      flag.fillRect(7, 4, 3, 24);
      flag.fillStyle(0xf8b500, 1);
      flag.fillTriangle(10, 4, 26, 12, 10, 20);
      flag.lineStyle(1, 0xfff4a3, 0.85);
      flag.strokeTriangle(10, 4, 26, 12, 10, 20);
      flag.generateTexture("mark-flag", 28, 30);
      flag.destroy();
      const box = this.make.graphics({ add: false });
      box.fillStyle(0x6b4a2a, 1);
      box.fillRect(4, 12, 36, 22);
      box.fillStyle(0x8a6238, 1);
      box.fillRect(4, 4, 36, 14);
      box.lineStyle(2, 0xf8b500, 1);
      box.strokeRect(4, 4, 36, 30);
      diamond(box, 22, 18, 6, 0xf8b500, 0x1b1916);
      box.generateTexture("mark-chest", 44, 38);
      box.destroy();
    }
    clockPct() {
      return 1 - this.left / mode.secs;
    }
    pickJob() {
      const p = this.clockPct();
      if (p < 0.15) return "small";
      if (p < 0.33) return Math.random() < 0.55 ? "thick" : "small";
      if (p < 0.48) return Math.random() < 0.6 ? "brute" : "thick";
      if (p < 0.62) return Math.random() < 0.55 ? "fly" : "brute";
      if (p < 0.78) return Math.random() < 0.55 ? "rebound" : "fly";
      return Math.random() < 0.45 ? "well" : Math.random() < 0.5 ? "rebound" : "fly";
    }
    spawn(kind) {
      const king = kind === "king";
      const boss = kind === "boss" || king;
      if (!boss && this.raid) return;
      if (!boss && this.foes.countActive(true) >= 16) return;
      let job = king ? "king" : boss ? "boss" : kind && kind !== "boss" ? kind : this.pickJob();
      if (!boss && job === "well") {
        let hasWell = false;
        this.foes.children.iterate((f) => {
          if (f && f.active && f.job === "well") hasWell = true;
        });
        if (hasWell) job = "rebound";
      }
      const w = this.scale.width;
      const h = this.scale.height;
      const pad = job === "well" ? wellPad(w, h) : 20;
      let x;
      let y;
      if (job === "well") {
        const px = this.player ? this.player.x : w / 2;
        const py = this.player ? this.player.y : h / 2;
        x = px < w / 2 ? w - pad : pad;
        y = py < h / 2 ? h - pad : pad;
      } else {
        const edge = Phaser.Math.Between(0, 3);
        x = edge === 0 ? pad : edge === 1 ? w - pad : Phaser.Math.Between(pad, w - pad);
        y = edge === 2 ? pad : edge === 3 ? h - pad : Phaser.Math.Between(pad, h - pad);
      }
      const r = boss ? 28 : job === "small" ? 10 : job === "brute" ? 16 : job === "well" ? 18 : job === "fly" || job === "rebound" ? 12 : 14;
      const artKey = FOE_SHEETS[job] ? `foe-${job}` : null;
      const art = !!(artKey && this.textures.exists(artKey));
      const foe = this.physics.add.sprite(x, y, art ? artKey : boss ? "mark-boss" : "mark-foe");
      foe.setDepth(4);
      foe.art = art;
      if (art) {
        const sc = job === "small" ? 0.26 : job === "thick" ? 0.34 : job === "brute" ? 0.4 : job === "well" ? 0.36 : job === "rebound" ? 0.20 : job === "king" ? 1.2 : job === "boss" ? 1.04 : 0.36;
        foe.setScale(sc);
        foe.baseScale = sc;
        const rad = job === "small" ? 22 : job === "thick" ? 28 : job === "brute" ? 28 : job === "well" ? 28 : job === "king" ? 80 : job === "boss" ? 72 : job === "rebound" ? 18 : 26;
        foe.body.setCircle(rad, 80 - rad, 80 - rad);
        if (job === "well") foe.setFrame(0);
        else foe.play(`${artKey}-run`);
      } else {
        foe.body.setCircle(r, boss ? 4 : 2, boss ? 4 : 2);
      }
      const late = this.left <= 15 ? 1.5 : 1;
      if (king) foe.hp = 540 + this.lv * 28;
      else if (boss) foe.hp = 460 + this.lv * 24;
      else if (job === "small") foe.hp = Math.ceil((10 + (this.lv - 1)) * late);
      else if (job === "brute") foe.hp = Math.ceil((40 + (this.lv - 1) * 3) * late);
      else if (job === "fly" || job === "rebound") foe.hp = Math.ceil((16 + (this.lv - 1) * 2) * late);
      else if (job === "well") foe.hp = Math.ceil((48 + (this.lv - 1) * 3) * late);
      else foe.hp = Math.ceil((24 + (this.lv - 1) * 2) * late);
      foe.maxHp = foe.hp;
      foe.boss = boss;
      foe.king = king;
      foe.job = job;
      if (!this.seenJobs) this.seenJobs = new Set();
      if (mode.id === "hard") {
        const stem = jobStem(job);
        if (stem) {
          this.seenJobs.add(stem);
          markSeenLocal(stem);
        }
      }
      foe.spd = (king ? 88 : boss ? 80 : job === "small" ? 78 : job === "brute" ? 56 : job === "well" ? 24 : job === "fly" || job === "rebound" ? 52 : 70) * mode.pace;
      foe.hajiki = false;
      foe.wind = 0;
      foe.lunge = 0;
      foe.shotAcc = 0;
      foe.pulling = 0;
      if (!boss && !art) {
        foe.setScale(job === "small" ? 0.72 : job === "brute" ? 1.22 : job === "well" ? 1.4 : job === "fly" || job === "rebound" ? 0.88 : 1);
        if (job === "brute") foe.setTint(0x2a1040);
        if (job === "fly") foe.setTint(0x39f0ff);
        if (job === "rebound") foe.setTint(0xff9a3a);
        if (job === "well") foe.setTint(0xb44dff);
      }
      this.foes.add(foe);
    }
    fireBolt(from) {
      if (!from || !from.active || !this.player) return;
      if (this.bolts.countActive(true) >= 4) return;
      const rebound = from.job === "rebound";
      const kama = from.job === "fly";
      const tex = kama ? "mark-kama" : rebound ? "mark-fire" : "mark-foe";
      const b = this.physics.add.sprite(from.x, from.y, tex);
      b.setScale(kama ? 0.95 : rebound ? 0.55 : 0.42);
      if (!kama && !rebound) b.setTint(0x39f0ff);
      b.kama = kama;
      b.fire = rebound;
      b.setDepth(7);
      b.body.setCircle(6, 4, 4);
      b.life = rebound ? 1200 : 900;
      b.bounce = rebound ? 1 : 0;
      b.iframes = 0;
      this.physics.moveToObject(b, this.player, rebound ? 170 : 190);
      if (kama && b.body && b.body.velocity) b.setRotation(Math.atan2(b.body.velocity.y, b.body.velocity.x));
      this.bolts.add(b);
    }
    paintDashLane(f, running) {
      if (!this.dashLane) {
        this.dashLane = this.add.graphics();
        this.dashLane.setDepth(9);
      }
      const g = this.dashLane;
      g.clear();
      const ang = f.dashAng || 0;
      const ox = f.dashOx ?? f.x;
      const oy = f.dashOy ?? f.y;
      const len = f.dashLen || 520;
      const x2 = ox + Math.cos(ang) * len;
      const y2 = oy + Math.sin(ang) * len;
      const flash = running || Math.floor(this.time.now / 90) % 2 === 1;
      g.lineStyle(22, 0xffffff, flash ? 0.55 : 0.22);
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(x2, y2);
      g.strokePath();
      g.lineStyle(8, 0xffffff, flash ? 1 : 0.4);
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(x2, y2);
      g.strokePath();
    }
    clearDashLane() {
      if (this.dashLane) this.dashLane.clear();
    }
    wellSucking() {
      let yes = false;
      this.foes.children.iterate((o) => {
        if (o && o.active && o.job === "well" && o.pulling > 0) yes = true;
      });
      return yes;
    }
    laneLen(x, y, ang) {
      const w = this.scale.width;
      const h = this.scale.height;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      let t = 1e9;
      if (c > 0.02) t = Math.min(t, (w - 18 - x) / c);
      else if (c < -0.02) t = Math.min(t, (18 - x) / c);
      if (s > 0.02) t = Math.min(t, (h - 18 - y) / s);
      else if (s < -0.02) t = Math.min(t, (18 - y) / s);
      return Math.max(200, Math.min(t, 900) * (2 / 3));
    }
    dropGem(x, y) {
      const gem = this.physics.add.sprite(x, y, "mark-flag");
      gem.setDepth(6);
      gem.body.setCircle(10, 4, 5);
      this.gems.add(gem);
    }
    spawnChest() {
      if (this.raid) {
        if ((this.raidChests || 0) >= 5) return;
        if (this.chests.countActive(true) > 0) return;
      } else {
        if (this.chestsOpened >= 3) return;
        if (this.chests.countActive(true) > 0) return;
      }
      const w = this.scale.width;
      const h = this.scale.height;
      const x = Phaser.Math.Between(80, w - 80);
      const y = Phaser.Math.Between(80, h - 80);
      const box = this.physics.add.sprite(x, y, "mark-chest");
      box.setDepth(6);
      box.body.setCircle(16, 6, 4);
      this.tweens.add({
        targets: box,
        y: y - 6,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.chests.add(box);
      if (this.raid) this.raidChests = (this.raidChests || 0) + 1;
      this.callout(this.raid ? "力" : "桐箱");
    }
    openChest(box) {
      if (!box || !box.active) return;
      box.destroy();
      this.chestsOpened += 1;
      const kinds = ["pull", "hayate", "ward"].filter((x) => !this.gotBuffs.includes(x));
      let pick = kinds[0] || "pull";
      if (this.gotBuffs.length === 0) {
        const r = Math.random();
        pick = r < 0.5 ? "pull" : r < 0.75 ? "hayate" : "ward";
      } else if (kinds.length > 1) {
        pick = kinds[Math.floor(Math.random() * kinds.length)];
      }
      this.gotBuffs.push(pick);
      this.lastBuff = pick;
      if (this.raid) {
        const dur = 12000;
        this.buffMax = dur;
        this.powerUntil = this.time.now + dur;
        this.maxHp += 2;
        this.hp = Math.min(this.maxHp, this.hp + 10);
        this.healWhy = "力";
        this.callout("力");
        this.pop(this.player.x, this.player.y - 24, "力 +10");
        return;
      }
      if (pick === "pull") {
        const dur = 22000;
        this.buffMax = dur;
        this.pullUntil = this.time.now + dur;
        this.callout("吸い込み");
      } else if (pick === "hayate") {
        const dur = 22000;
        this.buffMax = dur;
        this.fastUntil = this.time.now + dur;
        this.callout("はやて");
      } else {
        const dur = 9000;
        this.buffMax = dur;
        this.wardUntil = this.time.now + dur;
        this.callout("守");
        this.spawnWard();
      }
    }
    startHitStop(ms) {
      this.hitStop = ms;
      if (this.physics && this.physics.world) this.physics.world.pause();
      if (this.cameras && this.cameras.main) {
        this.cameras.main.flash(240, 248, 181, 0, false);
        this.cameras.main.shake(340, 0.03);
        if (this.cameras.main.zoomTo) this.cameras.main.zoomTo(1.16, 80);
      }
      const fx = $("#fx");
      if (fx) fx.className = "stop";
      buzz([40, 50, 40, 50, 140]);
    }
    endHitStop() {
      if (this.physics && this.physics.world) this.physics.world.resume();
      if (this.cameras && this.cameras.main && this.cameras.main.zoomTo) this.cameras.main.zoomTo(1, 160);
      const fx = $("#fx");
      if (fx) fx.className = "";
      if (this.wardPending) {
        this.wardPending = false;
        this.hurtTick = 3300;
        this.callout("一息");
        if (this.hasSprite && this.player) {
          this.player.clearTint();
          this.player.setAlpha(1);
        }
        this.spawnWard();
      }
      if (this.raidWin && !this.ended) this.finish(true);
    }
    spawnWard() {
      if (this.ward && this.ward.active) this.ward.destroy();
      if (!this.player) return;
      this.wardHue = 0;
      this.rippleAcc = 0;
      this.ward = this.add.circle(this.player.x, this.player.y, 36, NEON[0], 0.1);
      this.ward.setStrokeStyle(6, NEON[1], 1);
      this.ward.setDepth(7);
      this.tweens.add({
        targets: this.ward,
        scale: 1.32,
        duration: 460,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    pulseRipple() {
      if (!this.player) return;
      const col = NEON[Math.floor(this.wardHue) % NEON.length];
      const r = this.add.circle(this.player.x, this.player.y, 28, col, 0.12);
      r.setStrokeStyle(4, col, 0.9);
      r.setDepth(6);
      this.tweens.add({
        targets: r,
        scale: 2.6,
        alpha: 0,
        duration: 640,
        onComplete: () => r.destroy(),
      });
    }
    wellSuckFx(f) {
      if (!f || !f.active) return;
      const key = f.texture && f.texture.key;
      if (f.art && key) {
        const ov = this.add.sprite(f.x, f.y, key, f.frame ? f.frame.name : undefined);
        ov.setTintFill(0x6b2dff);
        ov.setAlpha(0.42);
        ov.setScale(f.scaleX, f.scaleY);
        ov.setDepth((f.depth || 4) + 1);
        this.tweens.add({ targets: ov, alpha: 0, duration: 200, onComplete: () => ov.destroy() });
      }
      const ring = this.add.circle(f.x, f.y, 34, 0x1a0828, 0.32);
      ring.setStrokeStyle(3, 0xb44dff, 0.9);
      ring.setDepth(3);
      this.tweens.add({
        targets: ring,
        scale: 2.2,
        alpha: 0,
        duration: 360,
        onComplete: () => ring.destroy(),
      });
    }
    flash(foe) {
      if (!foe || !foe.active) return;
      if (foe.body && !foe.boss) foe.body.velocity.scale(0.35);
      const key = foe.texture && foe.texture.key;
      if (!key) return;
      const ov = this.add.sprite(foe.x, foe.y, key, foe.frame ? foe.frame.name : undefined);
      ov.setTintFill(0xffffff);
      ov.setAlpha(0.8);
      ov.setScale(foe.scaleX, foe.scaleY);
      ov.setFlipX(!!foe.flipX);
      ov.setAngle(foe.angle || 0);
      ov.setDepth((foe.depth || 4) + 2);
      this.tweens.add({
        targets: ov,
        alpha: 0,
        duration: 160,
        onComplete: () => ov.destroy(),
      });
    }
    pop(x, y, n, color, size) {
      const t = this.add.text(x, y - 8, `${n}`, {
        fontFamily: "sans-serif",
        fontSize: size || "14px",
        color: color || "#fff4a3",
        stroke: "#1a1408",
        strokeThickness: 3,
      });
      t.setOrigin(0.5);
      t.setDepth(20);
      this.tweens.add({
        targets: t,
        y: y - 34,
        alpha: 0,
        duration: 420,
        onComplete: () => t.destroy(),
      });
    }
    hurtFoe(foe, dmg, popSize) {
      if (!foe.active) return;
      this.flash(foe);
      if (foe.boss) dmg = Math.max(1, Math.ceil(dmg * 0.7));
      foe.hp -= dmg;
      this.pop(foe.x, foe.y, dmg, popSize ? "#ff9a3a" : undefined, popSize);
      if (foe.boss && foe.hp > 0) {
        const bar = $("#bosshp");
        if (bar) {
          bar.classList.remove("hit");
          void bar.offsetWidth;
          bar.classList.add("hit");
        }
        if (!foe.raged && foe.hp <= foe.maxHp * 0.5) {
          foe.raged = true;
          this.callout("半血");
          buzz([20, 24, 20, 24, 80]);
          if (bar) bar.classList.add("rage");
        }
      }
      if (foe.hp <= 0) {
        const boss = foe.boss;
        const king = !!foe.king;
        const x = foe.x;
        const y = foe.y;
        foe.destroy();
        this.kills += 1;
        const now = this.time.now;
        this.combo = now - this.lastKill < 1600 ? this.combo + 1 : 1;
        this.lastKill = now;
        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        const pity = this.dry >= 2;
        if (Math.random() < 0.7 || pity || boss) {
          this.dropGem(x, y);
          this.dry = 0;
        } else {
          this.dry += 1;
        }
        if (this.combo >= 4) this.dropGem(x + 10, y - 8);
        if (this.combo >= 5) {
          this.dropGem(x - 10, y + 8);
          const play = $(".play");
          if (play) play.classList.add("combo");
          if (this.combo === 5) this.callout("連");
        }
        if (boss) {
          this.clearDashLane();
          this.bossDown += 1;
          if (king) {
            this.raidDown = 1;
            this.raidWin = true;
            this.raidMs = Math.max(1, this.time.now - (this.raidAt || this.time.now));
          }
          this.dropGem(x - 16, y);
          this.dropGem(x + 16, y);
          this.dropGem(x, y - 16);
          this.dropGem(x, y + 12);
          this.healWhy = "親玉";
          this.maxHp += 2;
          this.hp = Math.min(this.maxHp, this.hp + 12);
          this.callout("倒した");
          this.pop(x, y - 18, "親玉 +12");
          this.startHitStop(560);
          this.wardPending = !king;
          if (this.hasSprite && this.player) this.player.setTint(0xf8b500);
          const bar = $("#bosshp");
          if (bar) bar.classList.add("hidden");
        }
      }
    }
    fire() {
      if (k.kind === "puff") {
        const r = this.puffReach();
        const ring = this.add.circle(this.player.x, this.player.y, 8, k.color, 0.35);
        ring.setStrokeStyle(3, 0xf8b500, 0.9);
        this.tweens.add({
          targets: ring,
          scale: r / 8,
          alpha: 0,
          duration: 280,
          onComplete: () => ring.destroy(),
        });
        this.foes.children.iterate((f) => {
          if (!f || !f.active) return;
          const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, f.x, f.y);
          if (d < r) this.hurtFoe(f, this.skillDmg());
        });
        return;
      }
      const dir = this.face > 0 ? 1 : -1;
      this.sparks = this.sparks.filter((s) => s.active);
      const inflight = this.sparks.filter((s) => s.travel > 0).length;
      if (inflight >= this.sparkCap()) return;
      const spark = this.add.circle(this.player.x + dir * 24, this.player.y, 14, NEON[0], 0.9);
      spark.setStrokeStyle(3, 0xffffff, 0.75);
      spark.setDepth(8);
      spark.vx = dir * (this.time.now < this.fastUntil ? 0.72 : 0.58);
      spark.travel = 520;
      spark.life = this.sparkSitLife();
      spark.tick = 0;
      spark.hue = 0;
      this.sparks.push(spark);
    }
    tickSparks(delta) {
      const r = this.skillReach();
      const dmg = this.skillDmg();
      this.sparks = this.sparks.filter((s) => s.active);
      for (const s of this.sparks) {
        s.hue = (s.hue + delta * 0.012) % NEON.length;
        const col = NEON[Math.floor(s.hue) % NEON.length];
        if (s.travel > 0) {
          s.setFillStyle(col, 0.9);
          s.travel -= delta;
          s.x += s.vx * delta;
          s.setScale(0.85);
          this.foes.children.iterate((f) => {
            if (!f || !f.active || s.travel <= 0) return;
            const hit = 20 + (f.boss ? 12 : 0);
            const d = Phaser.Math.Distance.Between(s.x, s.y, f.x, f.y);
            if (d < hit) {
              s.travel = 0;
              s.x = f.x;
              s.y = f.y;
              this.hurtFoe(f, this.sparkDirect(), "22px");
            }
          });
        } else {
          s.setFillStyle(col, 0.28);
          s.setStrokeStyle(2, 0xffffff, 0.75);
          s.life -= delta;
          s.tick += delta;
          const z = r / 14;
          s.setScale(z * (1 + 0.04 * Math.sin(s.life * 0.02)));
          if (s.tick >= 520) {
            s.tick = 0;
            this.foes.children.iterate((f) => {
              if (!f || !f.active) return;
              const d = Phaser.Math.Distance.Between(s.x, s.y, f.x, f.y);
              if (d < r) {
                this.hurtFoe(f, dmg);
              }
            });
          }
        }
        if (s.life <= 0) s.destroy();
      }
    }
    closest() {
      let best = null;
      let d = 1e9;
      this.foes.children.iterate((f) => {
        if (!f) return;
        const dd = Phaser.Math.Distance.Between(this.player.x, this.player.y, f.x, f.y);
        if (dd < d) {
          d = dd;
          best = f;
        }
      });
      return best;
    }
    move(delta) {
      const b = this.player.body;
      let vx = 0;
      let vy = 0;
      const c = this.cursors;
      if (c.A.isDown || c.LEFT.isDown) vx -= 1;
      if (c.D.isDown || c.RIGHT.isDown) vx += 1;
      if (c.W.isDown || c.UP.isDown) vy -= 1;
      if (c.S.isDown || c.DOWN.isDown) vy += 1;
      vx += state.stick.x;
      vy += state.stick.y;
      const len = Math.hypot(vx, vy) || 1;
      const moving = Math.hypot(vx, vy) > 0.01;
      const spd = k.speed;
      b.setVelocity(moving ? (vx / len) * spd : 0, moving ? (vy / len) * spd : 0);
      if (this.hasSprite) {
        if (k.bob) {
          if (moving && Math.abs(vx) > 0.01) this.face = vx > 0 ? 1 : -1;
          this.player.setFlipX(this.face > 0);
          if (moving) this.player.anims.play("mate-run", true);
          else {
            this.player.anims.stop();
            this.player.setFrame(1);
          }
        } else {
          this.paintSumi(vx, vy, moving);
        }
      }
    }
    stopVertBob() {
      if (this.vBob) {
        this.vBob.stop();
        this.vBob = null;
      }
      if (this.player && this.player.setScale) this.player.setScale(0.52);
    }
    startVertBob() {
      if (this.vBob && this.vBob.isPlaying()) return;
      if (!this.player) return;
      this.player.setScale(0.52);
      this.vBob = this.tweens.add({
        targets: this.player,
        scaleY: 0.58,
        duration: 160,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    paintSumi(vx, vy, moving) {
      const ax = Math.abs(vx);
      const ay = Math.abs(vy);
      if (moving && ax >= ay && ax > 0.01) {
        this.stopVertBob();
        this.face = vx > 0 ? 1 : -1;
        this.look = this.face > 0 ? "right" : "left";
        this.player.setFlipX(this.face > 0);
        this.player.anims.play("mate-run", true);
      } else if (moving && ay > 0.01) {
        this.player.anims.stop();
        this.player.setFlipX(false);
        this.look = vy > 0 ? "front" : "back";
        this.player.setFrame(vy > 0 ? 0 : 3);
        this.startVertBob();
      } else {
        this.stopVertBob();
        this.player.anims.stop();
        if (this.look === "back") {
          this.player.setFlipX(false);
          this.player.setFrame(3);
        } else if (this.look === "front") {
          this.player.setFlipX(false);
          this.player.setFrame(0);
        } else {
          this.player.setFrame(1);
          this.player.setFlipX(this.face > 0);
        }
      }
    }
    die() {
      if (this.raid) {
        this.raidFail = true;
        this.finish(false);
        return;
      }
      this.finish(false);
    }
    finish(win) {
      if (this.ended) return;
      this.ended = true;
      if (mode.id === "hard" && this.seenJobs && this.seenJobs.size) {
        rememberSeen([...this.seenJobs]);
      }
      this.clearDashLane();
      lockPortrait();
      const play = $(".play");
      if (play) play.classList.remove("combo");
      const score = this.liveScore(win);
      const key = `bo-aibou:${mate.id}:${mode.id}`;
      let best = 0;
      try {
        best = Number(JSON.parse(localStorage.getItem("bo-aibou-best") || "{}")[key] || 0);
      } catch {
        best = 0;
      }
      const rec = score > best;
      if (rec) {
        try {
          const all = JSON.parse(localStorage.getItem("bo-aibou-best") || "{}");
          all[key] = score;
          localStorage.setItem("bo-aibou-best", JSON.stringify(all));
        } catch {
          /* guest device */
        }
      }
      const hard = mode.id === "hard" || (state.mode && state.mode.id === "hard");
      const survived = Boolean(win);
      const stampedHard = Boolean(survived && hard && !this.hardStamped);
      if (stampedHard) this.hardStamped = true;
      const played = this.clockPlayed || (stampedHard ? stampHardWin() : stampPlayDay(mode.id));
      if (this.raidWin) {
        const o = stampRaidKill(this.raidMs);
        showToast(o.raidKills >= 3 ? "称賛" : "讃える");
      }
      state.last = {
        win,
        id: mate.id,
        name: mate.name,
        lv: this.lv,
        score,
        kills: this.kills,
        combo: this.maxCombo,
        rec,
        hard,
        mode: mode.id,
      };
      if (state.game) freezeScene();
      $("[data-result-title]").textContent = survived ? "生き延びた" : "やられた";
      $("[data-thanks]").textContent = this.raidWin
        ? "大妖怪を倒した"
        : this.raidFail
          ? "大妖怪にやられた"
          : win
            ? "おめでとうございます"
            : "まだいける。もういちど";
      const raiseBtn = $("[data-raise]");
      if (raiseBtn) raiseBtn.textContent = rec ? "𝕏でドヤる" : "𝕏でシェアする";
      const raidSec = this.raidWin && this.raidMs ? ` · 撃退 ${Math.max(1, Math.round(this.raidMs / 1000))}秒` : "";
      $("[data-result-line]").textContent = `${mate.name} · lv ${this.lv} · 倒 ${this.kills} · 連 ${this.maxCombo}${raidSec}`;
      $("[data-result-rec]").textContent = rec ? `新記録 ${score}` : `記録 ${score}（ベスト ${Math.max(best, score)}）`;
      const kEl = $("[data-result-katsudo]");
      if (kEl) {
        const o = loadKatsudo();
        const st = played.streak;
        kEl.textContent = `連続 ${st}日 · 走った日 ${o.days.length}日${this.hardStamped || stampedHard ? ` · きついクリア ${o.hardClears}回` : ""}`;
        kEl.classList.remove("hidden");
        if (played.freshDay) showToast(st >= 3 ? streakHonor(st) || "日の印" : "日の印");
      }
      paintKatsudo();
      paintRec();
      paintFlagCard(state.last);
      const baBtn = $("[data-ba-post]");
      if (baBtn) baBtn.classList.toggle("hidden", !loadKatsudoSes());
      const pause = $("#pause-ov");
      const raid = $("#raid-ov");
      const result = $("#result-ov");
      if (pause) pause.classList.add("hidden");
      if (raid) raid.classList.add("hidden");
      if (result) result.classList.remove("hidden");
    }
    latePush() {
      this.callout("終盤");
      buzz([20, 30, 20, 30, 40]);
      this.foes.children.iterate((f) => {
        if (!f || !f.active || f.boss) return;
        f.hp = Math.ceil(f.hp * 1.4);
        f.maxHp = Math.ceil(f.maxHp * 1.4);
      });
    }
    askRaid() {
      const ov = $("#raid-ov");
      if (ov) ov.classList.remove("hidden");
      freezeScene();
    }
    beginRaid() {
      this.raid = true;
      this.raidAt = this.time.now;
      this.raidChests = 0;
      this.chestAcc = 0;
      this.clearDashLane();
      (this.foes.getChildren ? this.foes.getChildren() : []).slice().forEach((f) => {
        if (f && f.active) f.destroy();
      });
      (this.bolts.getChildren ? this.bolts.getChildren() : []).slice().forEach((b) => {
        if (b && b.active) b.destroy();
      });
      this.spawn("king");
      const lab = $(".bosslabel");
      if (lab) lab.textContent = "Moogredon";
      const av = $(".bossava");
      if (av) av.src = `art/foes/moogredon/avatar.png?v=${VERSION}`;
      const bar = $("#bosshp");
      if (bar) {
        bar.classList.remove("hidden", "rage");
        const hp = $("[data-boss-hpbar]");
        if (hp) hp.style.width = "100%";
      }
      paintBossLabel();
      this.callout("大妖怪");
      if (this.cameras && this.cameras.main) this.cameras.main.shake(260, 0.014);
      buzz([30, 40, 90, 40, 90]);
      this.spawnChest();
    }
    update(_t, delta) {
      if (this.ended) return;
      if (this.hitStop > 0) {
        this.hitStop -= delta;
        if (this.hitStop <= 0) this.endHitStop();
        this.paintHud();
        return;
      }
      this.move(delta);
      if (k.kind === "spark") this.tickSparks(delta);
      this.secAcc += delta;
      if (this.secAcc >= 1000) {
        this.secAcc -= 1000;
        if (!this.raid) this.left -= 1;
        this.waveAcc += 1;
        this.pace = mode.pace;
        if (!this.raid && this.left === 15) this.latePush();
        if (!this.raid && this.waveAcc === 20) {
          this.callout("来るぞ");
          buzz([18, 24, 18]);
          const job = this.pickJob();
          for (let i = 0; i < 3; i += 1) this.spawn(job);
          this.waveAcc = 0;
        }
        if (!this.bossDone && this.left === Math.floor(mode.secs * 0.45)) {
          this.bossDone = true;
          this.spawn("boss");
          this.callout("親玉");
          this.cameras.main.shake(220, 0.012);
          buzz([30, 40, 90]);
        }
        if (this.time.now - this.lastKill > 1600) {
          this.combo = 0;
          const play = $(".play");
          if (play) play.classList.remove("combo");
        }
        if (!this.raid && this.left <= 0) {
          if (mode.id === "hard" && this.hp > 0 && !this.raidAsked) {
            this.raidAsked = true;
            this.clearDashLane();
            if (!this.hardStamped) {
              this.clockPlayed = stampHardWin();
              this.hardStamped = true;
            }
            this.askRaid();
          } else {
            this.finish(true);
          }
        }
      }
      this.chestAcc += delta;
      if (this.raid) {
        if (this.chestAcc > 16000) {
          this.chestAcc = 0;
          this.spawnChest();
        }
      } else if (this.chestAcc > 12000) {
        this.chestAcc = 0;
        this.spawnChest();
      }
      this.spawnAcc += delta * this.pace;
      if (!this.raid && this.spawnAcc > 900) {
        this.spawnAcc = 0;
        this.spawn();
      }
      this.shotAcc += delta;
      const hayate = this.time.now < this.fastUntil;
      const paced = Math.max(240, k.rate - (this.lv - 1) * 40);
      const rate = hayate ? Math.max(110, paced * 0.28) : paced;
      if (this.shotAcc > rate) {
        this.shotAcc = 0;
        this.fire();
        if (hayate && k.kind === "spark") this.fire();
      }
      this.hurtTick -= delta;
      this.foes.children.iterate((f) => {
        if (!f || !f.body) return;
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, f.x, f.y);
        if (f.boss) {
          f.dashCd = f.dashCd || 0;
          if (f.dashCd > 0) f.dashCd -= delta;
          if (d < 180 && f.wind <= 0 && f.lunge <= 0 && f.dashCd <= 0) {
            f.wind = 500;
            f.dashAng = Math.atan2(this.player.y - f.y, this.player.x - f.x);
            f.dashOx = f.x;
            f.dashOy = f.y;
            f.dashLen = this.laneLen(f.x, f.y, f.dashAng);
            f.dashDist = 0;
            f.setTint(0xf8b500);
          }
          if (f.wind > 0) {
            f.wind -= delta;
            f.body.setVelocity(0, 0);
            this.paintDashLane(f, false);
            if (f.wind <= 0) {
              f.clearTint();
              f.lunge = 1;
              this.clearDashLane();
            }
          } else if (f.lunge > 0) {
            const spd = 520 * mode.pace;
            f.body.setVelocity(Math.cos(f.dashAng) * spd, Math.sin(f.dashAng) * spd);
            f.dashDist = (f.dashDist || 0) + spd * (delta / 1000);
            const w = this.scale.width;
            const h = this.scale.height;
            const off = f.x < 12 || f.y < 12 || f.x > w - 12 || f.y > h - 12;
            if (f.dashDist >= f.dashLen || off) {
              f.lunge = 0;
              f.dashCd = 1400;
              f.body.setVelocity(0, 0);
              f.x = Phaser.Math.Clamp(f.x, 24, w - 24);
              f.y = Phaser.Math.Clamp(f.y, 24, h - 24);
            }
          } else if (this.wellSucking()) {
            f.body.setVelocity(0, 0);
          } else {
            this.physics.moveToObject(f, this.player, f.spd || 80);
          }
        } else if (f.job === "brute" && !f.boss) {
          if (d < 92 && f.wind <= 0 && f.lunge <= 0) {
            f.wind = 420;
            f.setTint(0xf8b500);
          }
          if (f.wind > 0) {
            f.wind -= delta;
            this.physics.moveToObject(f, this.player, 10);
            if (f.wind <= 0) {
              f.clearTint();
              f.lunge = 240;
            }
          } else if (f.lunge > 0) {
            f.lunge -= delta;
            this.physics.moveToObject(f, this.player, 155 * mode.pace);
          } else {
            this.physics.moveToObject(f, this.player, f.spd || 56);
          }
        } else if (f.job === "fly" || f.job === "rebound") {
          f.shotAcc = (f.shotAcc || 0) + delta;
          if (d < 150) {
            const ang = Math.atan2(f.y - this.player.y, f.x - this.player.x);
            f.body.setVelocity(Math.cos(ang) * (f.spd || 52), Math.sin(ang) * (f.spd || 52));
          } else if (d > 230) {
            this.physics.moveToObject(f, this.player, f.spd || 52);
          } else {
            f.body.setVelocity(0, 0);
          }
          if (f.shotAcc > 1300) {
            f.shotAcc = 0;
            this.fireBolt(f);
          }
        } else if (f.job === "well") {
          f.shotAcc = (f.shotAcc || 0) + delta;
          const ww = this.scale.width;
          const hh = this.scale.height;
          const pad = wellPad(ww, hh);
          const tx = this.player.x < ww / 2 ? ww - pad : pad;
          const ty = this.player.y < hh / 2 ? hh - pad : pad;
          if (f.pulling > 0) f.body.setVelocity(0, 0);
          else this.physics.moveTo(f, tx, ty, f.spd || 24);
          f.x = Phaser.Math.Clamp(f.x, pad, ww - pad);
          f.y = Phaser.Math.Clamp(f.y, pad, hh - pad);
          if (f.shotAcc > 1200 && f.pulling <= 0) {
            f.shotAcc = 0;
            f.pulling = 400;
            f.suckFx = 0;
            const base = f.baseScale || (f.art ? f.scaleX : 1.4);
            f.baseScale = base;
            if (f.art) {
              f.anims.stop();
              f.play("foe-well-rise");
              f.setScale(base * 1.04);
            } else f.setScale(1.55);
            this.wellSuckFx(f);
          }
          if (f.pulling > 0) {
            f.pulling -= delta;
            f.suckFx = (f.suckFx || 0) + delta;
            if (f.suckFx > 90) {
              f.suckFx = 0;
              this.wellSuckFx(f);
            }
            this.player.x += (f.x - this.player.x) * 0.045;
            this.player.y += (f.y - this.player.y) * 0.045;
            this.foes.children.iterate((o) => {
              if (!o || o === f || o.boss || o.job === "boss") return;
              o.x += (f.x - o.x) * 0.03;
              o.y += (f.y - o.y) * 0.03;
            });
            if (f.pulling <= 0) {
              if (f.art) {
                f.anims.stop();
                f.setScale(f.baseScale);
                f.setFrame(0);
              } else f.setScale(1.4);
              const popR = 72;
              if (d < popR) {
                const guarded = this.hurtTick > 0 || this.time.now < this.wardUntil;
                if (!guarded) {
                  this.hp -= 2;
                  this.hurtTick = 400;
                  this.grazeStreak = 0;
                  if (this.hp <= 0) this.die();
                }
              }
            }
          }
        } else {
          this.physics.moveToObject(f, this.player, f.spd || 70);
        }
        if (!f.art) f.angle += (f.boss ? -0.8 : 1.6) * (delta / 16);
        else if (f.job !== "well" && f.body && f.body.velocity) {
          if (f.body.velocity.x > 18) f.setFlipX(true);
          else if (f.body.velocity.x < -18) f.setFlipX(false);
        }
        const reach = f.boss ? 54 : f.job === "small" ? 28 : f.job === "brute" ? 40 : 34;
        const guarded = this.hurtTick > 0 || this.time.now < this.wardUntil;
        if (f.job === "well") {
          /* 吸い場: no contact. pop is the hit */
        } else if (d < reach && !guarded) {
          const bull = f.boss && f.lunge > 0;
          const sting = bull ? 18 : f.boss ? 10 : f.job === "brute" && f.lunge > 0 ? 4 : f.job === "small" || f.job === "fly" ? 1 : this.left <= 15 ? 3 : 2;
          this.hp -= sting;
          this.hurtTick = bull ? 720 : f.boss ? 480 : 650;
          this.grazeStreak = 0;
          if (bull) this.pop(this.player.x, this.player.y - 32, "直撃", "#ff3d8a");
          if (this.hp <= 0) this.die();
        } else if (d < reach && guarded) {
          if (!f.boss) this.hajikiFoe(f);
        } else if (f.hajiki && d > reach + 36) {
          f.hajiki = false;
        } else if (!f.boss && !guarded && !f.grazed && d >= reach && d < reach + 26) {
          f.grazed = true;
          this.grazeStreak += 1;
          this.graze += 1;
          const pts = 2 * this.grazeStreak;
          this.grazeScore += pts;
          this.pop(this.player.x, this.player.y - 28, `かわし +${pts}`, "#fff4a3");
          buzz([12, 16, 24]);
          const fx = $("#fx");
          if (fx) {
            fx.className = "graze";
            void fx.offsetWidth;
            setTimeout(() => {
              if (fx.className === "graze") fx.className = "";
            }, 200);
          }
          if (this.grazeStreak % 3 === 0) this.dropGem(f.x, f.y);
        }
      });
      this.bolts.children.iterate((b) => {
        if (!b || !b.active) return;
        b.life -= delta;
        if (b.iframes > 0) b.iframes -= delta;
        if (b.kama && b.body && b.body.velocity) b.setRotation(Math.atan2(b.body.velocity.y, b.body.velocity.x));
        else if (!b.fire) b.angle += 8;
        if (b.life <= 0) b.destroy();
      });
      this.gems.children.iterate((g) => {
        if (!g || !g.active || !this.player) return;
        if (this.time.now >= this.pullUntil) return;
        const d = Phaser.Math.Distance.Between(g.x, g.y, this.player.x, this.player.y);
        if (d < 110 && d > 6) {
          g.x += (this.player.x - g.x) * 0.16;
          g.y += (this.player.y - g.y) * 0.16;
        }
      });
      let boss = null;
      this.foes.children.iterate((f) => {
        if (f && f.boss) boss = f;
      });
      const bar = $("#bosshp");
      const fill = $("[data-boss-hpbar]");
      if (bar) {
        bar.classList.toggle("hidden", !boss);
        if (!boss) bar.classList.remove("rage");
        if (boss) paintBossLabel();
        if (boss) {
          const lab = $(".bosslabel");
          if (lab) lab.textContent = boss.king ? "Moogredon" : "Moogre";
          const av = $(".bossava");
          if (av && !boss.king) av.src = `art/foes/gyuki/avatar.png?v=${VERSION}`;
        }
        if (boss && fill && boss.maxHp) fill.style.width = `${Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100))}%`;
      }
      if (this.ward && this.ward.active) {
        if ((this.hurtTick > 0 || (this.time && this.time.now < this.wardUntil)) && this.player) {
          this.ward.x = this.player.x;
          this.ward.y = this.player.y;
          this.wardHue = (this.wardHue + delta * 0.01) % NEON.length;
          const col = NEON[Math.floor(this.wardHue) % NEON.length];
          this.ward.setFillStyle(col, 0.1);
          this.ward.setStrokeStyle(6, col, 1);
          this.rippleAcc = (this.rippleAcc || 0) + delta;
          if (this.rippleAcc > 380) {
            this.rippleAcc = 0;
            this.pulseRipple();
          }
          if (this.hasSprite) this.player.setAlpha(1);
        } else {
          this.ward.destroy();
          this.ward = null;
          if (this.hasSprite && this.player) {
            this.player.clearTint();
            this.player.setAlpha(1);
          }
        }
      }
      this.paintHud();
    }
  }

  state.game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "arena",
    width: 960,
    height: 540,
    backgroundColor: stage.bg,
    physics: { default: "arcade" },
    pixelArt: true,
    roundPixels: true,
    render: { antialias: false },
    fps: { target: 60, min: 24 },
    input: { activePointers: 3 },
    scale: {
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      expandParent: false,
    },
    scene: [Arena],
  });
}

function freezeScene() {
  const sc = state.game && state.game.scene.getScene("arena");
  if (!sc) return;
  if (sc.physics && sc.physics.world) sc.physics.world.pause();
  if (sc.tweens) sc.tweens.pauseAll();
  if (sc.anims) sc.anims.pauseAll();
  sc.time.paused = true;
  if (!sc.scene.isPaused()) sc.scene.pause();
}

function thawScene() {
  const sc = state.game && state.game.scene.getScene("arena");
  if (!sc) return;
  sc.time.paused = false;
  if (sc.physics && sc.physics.world) sc.physics.world.resume();
  if (sc.tweens) sc.tweens.resumeAll();
  if (sc.anims) sc.anims.resumeAll();
  if (sc.scene.isPaused()) sc.scene.resume();
}

function pausePlay() {
  const play = $("[data-screen='play']");
  if (!play || play.classList.contains("hidden")) return;
  if ($("#rotate") && !$("#rotate").classList.contains("hidden")) return;
  if ($("#result-ov") && !$("#result-ov").classList.contains("hidden")) return;
  if ($("#raise-ov") && !$("#raise-ov").classList.contains("hidden")) return;
  if ($("#raid-ov") && !$("#raid-ov").classList.contains("hidden")) return;
  const ov = $("#pause-ov");
  if (ov && !ov.classList.contains("hidden")) return;
  if (state.game) freezeScene();
  if (ov) ov.classList.remove("hidden");
}

function resumePlay() {
  const ov = $("#pause-ov");
  if (!ov || ov.classList.contains("hidden")) return;
  ov.classList.add("hidden");
  tryFullscreen();
  thawScene();
  syncPlayGate();
}

function acceptRaid() {
  const ov = $("#raid-ov");
  if (!ov || ov.classList.contains("hidden")) return;
  ov.classList.add("hidden");
  tryFullscreen();
  thawScene();
  const sc = state.game && state.game.scene.getScene("arena");
  if (sc && sc.beginRaid) sc.beginRaid();
  syncPlayGate();
}

function declineRaid() {
  const ov = $("#raid-ov");
  if (!ov || ov.classList.contains("hidden")) return;
  ov.classList.add("hidden");
  const sc = state.game && state.game.scene.getScene("arena");
  if (sc && sc.finish) sc.finish(true);
}

function killGame() {
  unlockOrient();
  const sc = state.game && state.game.scene.getScene("arena");
  if (sc && sc.seenJobs && sc.seenJobs.size) rememberSeen([...sc.seenJobs]);
  if (state.game) {
    state.game.destroy(true);
    state.game = null;
    $("#arena").innerHTML = "";
  }
}

async function main() {
  const res = await fetch(`./data/entries.json?v=${VERSION}`);
  state.data = await res.json();
  state.mate = (state.data.entries || []).find((e) => e.id === "mokopu") || (state.data.entries || [])[0];
  const ver = $("[data-ver]");
  if (ver) ver.textContent = `v${VERSION}`;
  loadStickSide();
  consumeKatsudoReturn();
  renderSetup();
}

function bindUi() {
  try {
    bindStick();
  } catch {
    /* no stick */
  }
  const themeBtn = $("[data-theme-toggle]");
  if (themeBtn) {
    const toggle = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      applyTheme(themeId() === "yang" ? "yin" : "yang");
      renderSetup();
    };
    themeBtn.addEventListener("click", toggle);
  }
  window.addEventListener("resize", syncPlayGate);
  window.addEventListener("orientationchange", () => setTimeout(syncPlayGate, 200));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", fitPlay);
    window.visualViewport.addEventListener("scroll", fitPlay);
  }
  document.addEventListener(
    "touchmove",
    (ev) => {
      if (document.body.classList.contains("playing")) ev.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener("keydown", (ev) => {
    if (ev.code !== "Space" && ev.code !== "KeyP") return;
    if (ev.repeat) return;
    ev.preventDefault();
    const play = $("[data-screen='play']");
    const ov = $("#pause-ov");
    if ($("#result-ov") && !$("#result-ov").classList.contains("hidden")) return;
    if ($("#raise-ov") && !$("#raise-ov").classList.contains("hidden")) return;
    if ($("#raid-ov") && !$("#raid-ov").classList.contains("hidden")) return;
    if (ov && !ov.classList.contains("hidden")) resumePlay();
    else if (play && !play.classList.contains("hidden")) pausePlay();
  });

  document.body.addEventListener("click", (ev) => {
    const go = hit(ev, "[data-go]");
    if (go) {
      killGame();
      if (go.dataset.go === "setup") renderSetup();
      show(go.dataset.go);
      return;
    }
    if (hit(ev, "#toast-ov")) {
      hideToast();
      return;
    }
    if (hit(ev, "[data-katsudo-connect]")) {
      location.href = `${KATSUDO_API}/v1/oauth/start`;
      return;
    }
    const dcMark = hit(ev, "[data-dc-mark]");
    if (dcMark) {
      if (loadKatsudoSes()) {
        const ask = $("[data-dc-ask]");
        if (ask) ask.classList.remove("hidden");
      } else {
        location.href = `${KATSUDO_API}/v1/oauth/start`;
      }
      return;
    }
    if (hit(ev, "[data-dc-un-no]")) {
      const ask = $("[data-dc-ask]");
      if (ask) ask.classList.add("hidden");
      return;
    }
    if (hit(ev, "[data-dc-un-yes]")) {
      const ask = $("[data-dc-ask]");
      if (ask) ask.classList.add("hidden");
      katsudoFetch("/v1/unlink", { method: "POST", body: "{}" }).finally(() => {
        saveKatsudoSes("");
        paintKatsudo();
      });
      return;
    }
    const baChip = hit(ev, "[data-ba-mode]");
    if (baChip) {
      baMode = baChip.dataset.baMode === "easy" || baChip.dataset.baMode === "long" ? baChip.dataset.baMode : "hard";
      baTab = "ba";
      loadBoard();
      return;
    }
    const baTabBtn = hit(ev, "[data-ba-tab]");
    if (baTabBtn) {
      baTab = baTabBtn.dataset.baTab === "nan" ? "nan" : "ba";
      loadBoard();
      return;
    }
    if (hit(ev, "[data-ba-post]")) {
      postBa();
      return;
    }
    if (hit(ev, "[data-how]")) {
      show("how");
      return;
    }
    const mode = hit(ev, "[data-mode]");
    if (mode) {
      state.mode = MODES.find((m) => m.id === mode.dataset.mode) || state.mode;
      renderSetup();
      return;
    }
    const stage = hit(ev, "[data-stage]");
    if (stage) {
      applyTheme(stage.dataset.stage);
      renderSetup();
      return;
    }
    if (hit(ev, "[data-theme-toggle]")) {
      applyTheme(themeId() === "yang" ? "yin" : "yang");
      renderSetup();
      return;
    }
    const mate = hit(ev,"[data-mate]");
    if (mate) {
      state.mate = state.data.entries.find((e) => e.id === mate.dataset.mate);
      renderSetup();
      return;
    }
    if (hit(ev,"[data-run]")) {
      if (isCoarse()) {
        paintStickOv();
        const ov = $("#stick-ov");
        if (ov) ov.classList.remove("hidden");
        return;
      }
      enterPlay();
      return;
    }
    const side = hit(ev,"[data-stick-side]");
    if (side) {
      saveStickSide(side.dataset.stickSide);
      const ov = $("#stick-ov");
      if (ov) ov.classList.add("hidden");
      enterPlay();
      return;
    }
    if (hit(ev,"[data-stick-back]")) {
      const ov = $("#stick-ov");
      if (ov) ov.classList.add("hidden");
      return;
    }
    if (hit(ev,"[data-pause]")) {
      pausePlay();
      return;
    }
    if (hit(ev,"[data-resume]")) {
      resumePlay();
      return;
    }
    if (hit(ev,"[data-raid-yes]")) {
      acceptRaid();
      return;
    }
    if (hit(ev,"[data-raid-no]")) {
      declineRaid();
      return;
    }
    if (hit(ev,"[data-quit]")) {
      killGame();
      show("title");
      return;
    }
    if (hit(ev,"[data-raise]")) {
      raiseFlag();
      return;
    }
    if (hit(ev,"[data-raise-copy]")) {
      raiseCopy();
      return;
    }
    if (hit(ev,"[data-raise-save]")) {
      raiseSave();
      return;
    }
    if (hit(ev,"[data-raise-close]")) {
      const ov = $("#raise-ov");
      if (ov) ov.classList.add("hidden");
      return;
    }
    if (hit(ev,"[data-again]")) {
      enterPlay();
    }
  });
}

bootTheme();
bindUi();
main().catch(() => {});
