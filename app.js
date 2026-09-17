const VERSION = "0.4.5";
const NEON = [0xff3d8a, 0x39f0ff, 0xc8ff3a, 0xff9a3a, 0xb44dff];
const SHEETS = {
  sumi: "art/sumi/sheet.png",
  mokopu: "art/mokopu/sheet.png",
};

const MODES = [
  { id: "easy", label: "ふつう", secs: 90, pace: 1 },
  { id: "hard", label: "きつい", secs: 60, pace: 1.35 },
];
const STAGES = [
  { id: "yang", label: "陽", bg: 0xe8dcc8, foe: 0x4a2060 },
  { id: "yin", label: "陰", bg: 0x1b1916, foe: 0x5a2878 },
];
const PLAY_URL = "https://gpro8.github.io/bo-aibou-arena/";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

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
    skill: field(e, "特技") || "ふわふわで癒す",
    kind: "puff",
    bob: true,
    dmg: 6,
  };
}

const state = {
  data: null,
  mode: MODES[0],
  stage: STAGES[0],
  mate: null,
  game: null,
  last: null,
  stick: { x: 0, y: 0 },
  stickSide: "left",
  pendingPlay: false,
};

function show(name) {
  $$(".screen").forEach((el) => el.classList.toggle("hidden", el.dataset.screen !== name));
  document.body.classList.toggle("playing", name === "play");
  if (name === "title" || name === "setup") paintRec();
  if (name === "play") {
    ["#result-ov", "#raise-ov", "#pause-ov", "#bosshp"].forEach((s) => {
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
    const result = $("#result-ov");
    const raise = $("#raise-ov");
    const boss = $("#bosshp");
    if (rotate) rotate.classList.add("hidden");
    if (stick) stick.classList.add("hidden");
    if (ov) ov.classList.add("hidden");
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

function isLandscape() {
  return window.innerWidth >= window.innerHeight;
}

function clearStick() {
  state.stick.x = 0;
  state.stick.y = 0;
  const knob = $("[data-knob]");
  if (knob) knob.style.transform = "translate(-50%, -50%)";
}

function enterPlay() {
  killGame();
  applyStickSide();
  show("play");
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
    PLAY_URL,
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
  ctx.fillText("旗を掲げる", 540, 1230);
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
  const file = new File([bytes], "kakageru.png", { type: "image/png" });
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
  clickA(pack.tweet);
  const ok = navigator.clipboard && window.ClipboardItem;
  if (!ok) {
    raiseMsg("コピーできない。保存して添付");
    return;
  }
  navigator.clipboard
    .write([new ClipboardItem({ "image/png": pack.blob })])
    .then(() => raiseMsg("コピーした。Xに貼る"))
    .catch(() => raiseMsg("コピーできない。保存して添付"));
}

function raiseSave() {
  const pack = cardPack();
  if (!pack) return;
  clickA(pack.dataUrl, "kakageru.png");
  raiseMsg("保存した");
}

function renderSetup() {
  const modes = $("[data-modes]");
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
      this.cameras.main.setBackgroundColor(stage.bg);
      this.bakeMarks();
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
      this.cursors = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT");
      this.foes = this.physics.add.group();
      this.shots = this.physics.add.group();
      this.gems = this.physics.add.group();
      this.chests = this.physics.add.group();
      this.physics.add.overlap(this.shots, this.foes, (shot, foe) => {
        if (!shot.active || !foe.active) return;
        shot.destroy();
        this.hurtFoe(foe, this.skillDmg());
        if (k.kind === "spark") this.flash(foe);
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
      this.hitStop = 0;
      this.pullUntil = 0;
      this.fastUntil = 0;
      this.chestAcc = 0;
      this.chestsOpened = 0;
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
      hud.lv.textContent = `lv ${this.lv}  ${this.xp}/${this.next}`;
      hud.combo.textContent = this.combo > 1 ? `連 ${this.combo}` : "";
      const tnow = this.time ? this.time.now : 0;
      const chip = $("[data-buffchip]");
      const bbar = $("[data-buff-bar]");
      const leftP = this.pullUntil - tnow;
      const leftF = this.fastUntil - tnow;
      const active = leftP > leftF ? (leftP > 0 ? "pull" : "") : leftF > 0 ? "fast" : "";
      if (chip) chip.classList.toggle("hidden", !active);
      if (active === "pull") {
        if (hud.buff) hud.buff.textContent = `旗吸い ${Math.ceil(leftP / 1000)}`;
        if (bbar && this.buffMax) bbar.style.width = `${Math.max(0, Math.min(100, (leftP / this.buffMax) * 100))}%`;
      } else if (active === "fast") {
        if (hud.buff) hud.buff.textContent = `はやて ${Math.ceil(leftF / 1000)}`;
        if (bbar && this.buffMax) bbar.style.width = `${Math.max(0, Math.min(100, (leftF / this.buffMax) * 100))}%`;
      } else if (hud.buff) hud.buff.textContent = "";
      hud.skill.textContent = `${k.skill} ${this.skillDmg()}`;
      const t = Math.max(0, Math.ceil(this.left));
      hud.time.textContent = `${t}秒`;
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
      return k.dmg + (this.lv - 1) * 2;
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
    spawn(kind) {
      const w = this.scale.width;
      const h = this.scale.height;
      const edge = Phaser.Math.Between(0, 3);
      const x = edge === 0 ? 20 : edge === 1 ? w - 20 : Phaser.Math.Between(20, w - 20);
      const y = edge === 2 ? 20 : edge === 3 ? h - 20 : Phaser.Math.Between(20, h - 20);
      const boss = kind === "boss";
      const r = boss ? 28 : 14;
      const foe = this.physics.add.sprite(x, y, boss ? "mark-boss" : "mark-foe");
      foe.setDepth(4);
      foe.body.setCircle(r, boss ? 4 : 2, boss ? 4 : 2);
      foe.hp = boss ? 280 + this.lv * 16 : 20 + (this.lv - 1) * 2;
      foe.maxHp = foe.hp;
      foe.boss = boss;
      foe.spd = boss ? 80 : 70 + this.lv * 8;
      this.tweens.add({
        targets: foe,
        angle: boss ? -360 : 360,
        duration: boss ? 14000 : 7000,
        repeat: -1,
      });
      this.foes.add(foe);
    }
    dropGem(x, y) {
      const gem = this.physics.add.sprite(x, y, "mark-flag");
      gem.setDepth(6);
      gem.body.setCircle(10, 4, 5);
      this.tweens.add({
        targets: gem,
        scale: 1.14,
        angle: 10,
        duration: 380,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.gems.add(gem);
    }
    spawnChest() {
      if (this.chestsOpened >= 2) return;
      if (this.chests.countActive(true) > 0) return;
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
      this.callout("桐箱");
    }
    openChest(box) {
      if (!box || !box.active) return;
      box.destroy();
      this.chestsOpened += 1;
      const dur = 22000;
      this.buffMax = dur;
      if (Math.random() < 0.5) {
        this.pullUntil = this.time.now + dur;
        this.fastUntil = 0;
        this.callout("旗吸い");
      } else {
        this.fastUntil = this.time.now + dur;
        this.pullUntil = 0;
        this.callout("はやて");
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
    }
    endHitStop() {
      if (this.physics && this.physics.world) this.physics.world.resume();
      if (this.cameras && this.cameras.main && this.cameras.main.zoomTo) this.cameras.main.zoomTo(1, 160);
      const fx = $("#fx");
      if (fx) fx.className = "";
      if (this.wardPending) {
        this.wardPending = false;
        this.hurtTick = 2200;
        this.callout("一息");
        this.spawnWard();
      }
    }
    spawnWard() {
      if (this.ward && this.ward.active) this.ward.destroy();
      if (!this.player) return;
      this.ward = this.add.circle(this.player.x, this.player.y, 34, 0xf8b500, 0.18);
      this.ward.setStrokeStyle(5, 0xf8b500, 0.95);
      this.ward.setDepth(7);
    }
    flash(foe) {
      if (!foe.active) return;
      foe.setTint(NEON[Phaser.Math.Between(0, NEON.length - 1)]);
      if (foe.body) foe.body.velocity.scale(0.2);
      this.time.delayedCall(140, () => {
        if (foe.active) foe.clearTint();
      });
    }
    pop(x, y, n, color) {
      const t = this.add.text(x, y - 8, `${n}`, {
        fontFamily: "sans-serif",
        fontSize: "14px",
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
    hurtFoe(foe, dmg) {
      if (!foe.active) return;
      foe.hp -= dmg;
      this.pop(foe.x, foe.y, dmg);
      if (foe.boss && foe.hp > 0) {
        const bar = $("#bosshp");
        if (bar) {
          bar.classList.remove("hit");
          void bar.offsetWidth;
          bar.classList.add("hit");
        }
      }
      if (foe.hp <= 0) {
        const boss = foe.boss;
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
        if (boss) {
          this.bossDown += 1;
          this.dropGem(x - 16, y);
          this.dropGem(x + 16, y);
          this.dropGem(x, y - 16);
          this.dropGem(x, y + 12);
          this.healWhy = "親玉";
          this.maxHp += 2;
          this.hp = Math.min(this.maxHp, this.hp + 10);
          this.callout("倒した");
          this.pop(x, y - 18, "親玉 +10");
          this.startHitStop(560);
          this.wardPending = true;
          if (this.hasSprite && this.player) this.player.setTint(0xf8b500);
          const bar = $("#bosshp");
          if (bar) bar.classList.add("hidden");
        }
      }
    }
    fire() {
      if (k.kind === "puff") {
        const r = 70 + this.lv * 6;
        const ring = this.add.circle(this.player.x, this.player.y, 18, k.color, 0.35);
        ring.setStrokeStyle(3, 0xf8b500, 0.9);
        this.tweens.add({
          targets: ring,
          scale: 2.4,
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
      const spark = this.add.circle(this.player.x + dir * 24, this.player.y, 12, NEON[0], 0.9);
      spark.setStrokeStyle(3, 0xffffff, 0.75);
      spark.setDepth(8);
      spark.vx = dir * (this.time.now < this.fastUntil ? 0.72 : 0.52);
      spark.travel = 520;
      spark.life = 1500;
      spark.tick = 0;
      spark.hue = 0;
      this.sparks.push(spark);
    }
    tickSparks(delta) {
      const r = 36 + this.lv * 2;
      const dmg = this.skillDmg();
      this.sparks = this.sparks.filter((s) => s.active);
      for (const s of this.sparks) {
        s.life -= delta;
        s.hue = (s.hue + delta * 0.012) % NEON.length;
        s.setFillStyle(NEON[Math.floor(s.hue) % NEON.length], 0.85);
        if (s.travel > 0) {
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
            }
          });
        } else {
          s.tick += delta;
          s.setScale(1.15 + 0.08 * Math.sin(s.life * 0.02));
          if (s.tick >= 240) {
            s.tick = 0;
            this.foes.children.iterate((f) => {
              if (!f || !f.active) return;
              const d = Phaser.Math.Distance.Between(s.x, s.y, f.x, f.y);
              if (d < r) {
                this.hurtFoe(f, dmg);
                this.flash(f);
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
      const spd = k.speed * (1 + (this.lv - 1) * 0.06);
      b.setVelocity(moving ? (vx / len) * spd : 0, moving ? (vy / len) * spd : 0);
      if (this.hasSprite) {
        // Run frames face LEFT. Flip when moving right.
        if (moving && Math.abs(vx) > 0.01) this.face = vx > 0 ? 1 : -1;
        if (this.face == null) this.face = 1;
        this.player.setFlipX(this.face > 0);
        if (moving) this.player.anims.play("mate-run", true);
        else {
          this.player.anims.stop();
          this.player.setFrame(this.face > 0 ? 2 : 1);
        }
      }
    }
    finish(win) {
      if (this.ended) return;
      this.ended = true;
      const score = this.lv * 12 + this.kills * 2 + this.maxCombo * 3 + (win ? 25 : 0) + this.bossDown * 40;
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
      state.last = {
        win,
        id: mate.id,
        name: mate.name,
        lv: this.lv,
        score,
        kills: this.kills,
        combo: this.maxCombo,
        rec,
      };
      if (state.game) freezeScene();
      $("[data-result-title]").textContent = win ? "生き延びた" : "やられた";
      $("[data-thanks]").textContent = win ? "おめでとうございます" : "まだいける。もういちど旗を";
      $("[data-result-line]").textContent = `${mate.name} · lv ${this.lv} · 倒 ${this.kills} · 連 ${this.maxCombo}`;
      $("[data-result-rec]").textContent = rec ? `新記録 ${score}` : `記録 ${score}（ベスト ${Math.max(best, score)}）`;
      paintRec();
      paintFlagCard(state.last);
      const pause = $("#pause-ov");
      const result = $("#result-ov");
      if (pause) pause.classList.add("hidden");
      if (result) result.classList.remove("hidden");
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
        this.left -= 1;
        this.waveAcc += 1;
        if (this.paceHold > 0) this.paceHold -= 1;
        this.pace = mode.pace * (this.paceHold > 0 ? 1.55 : 1);
        if (this.waveAcc === 20) this.callout("来るぞ");
        if (this.waveAcc >= 22) {
          this.waveAcc = 0;
          this.paceHold = 3;
          for (let i = 0; i < 4; i += 1) this.spawn();
        }
        if (!this.bossDone && this.left === Math.floor(mode.secs * 0.45)) {
          this.bossDone = true;
          this.spawn("boss");
          this.callout("影の親玉");
          this.cameras.main.shake(220, 0.012);
        }
        if (this.time.now - this.lastKill > 1600) this.combo = 0;
        if (this.left <= 0) this.finish(true);
      }
      this.chestAcc += delta;
      if (this.chestAcc > 14000) {
        this.chestAcc = 0;
        this.spawnChest();
      }
      this.spawnAcc += delta * this.pace;
      if (this.spawnAcc > Math.max(420, 900 - this.lv * 40)) {
        this.spawnAcc = 0;
        this.spawn();
      }
      this.shotAcc += delta;
      const hayate = this.time.now < this.fastUntil;
      const rate = hayate ? Math.max(110, k.rate * 0.28) : k.rate;
      if (this.shotAcc > Math.max(110, rate - this.lv * 20)) {
        this.shotAcc = 0;
        this.fire();
        if (hayate && k.kind === "spark") this.fire();
      }
      this.hurtTick -= delta;
      this.foes.children.iterate((f) => {
        if (!f || !f.body) return;
        this.physics.moveToObject(f, this.player, f.spd || 70);
        const reach = f.boss ? 54 : 34;
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, f.x, f.y);
        if (d < reach && this.hurtTick <= 0) {
          this.hp -= f.boss ? 10 : 2;
          this.hurtTick = f.boss ? 480 : 650;
          if (this.hp <= 0) this.finish(false);
        } else if (d < reach && this.hurtTick > 0) {
          const ang = Math.atan2(f.y - this.player.y, f.x - this.player.x);
          f.x += Math.cos(ang) * 6;
          f.y += Math.sin(ang) * 6;
        }
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
        if (boss && fill && boss.maxHp) fill.style.width = `${Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100))}%`;
      }
      if (this.ward && this.ward.active) {
        if (this.hurtTick > 0 && this.player) {
          this.ward.x = this.player.x;
          this.ward.y = this.player.y;
          if (this.hasSprite) this.player.setAlpha(0.5 + 0.45 * Math.abs(Math.sin(this.time.now / 70)));
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
    render: { antialias: true, roundPixels: true },
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

function killGame() {
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
  renderSetup();

  bindStick();
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
    if (ov && !ov.classList.contains("hidden")) resumePlay();
    else if (play && !play.classList.contains("hidden")) pausePlay();
  });

  document.body.addEventListener("click", (ev) => {
    const go = ev.target.closest("[data-go]");
    if (go) {
      killGame();
      if (go.dataset.go === "setup") renderSetup();
      show(go.dataset.go);
      return;
    }
    if (ev.target.closest("[data-how]")) {
      show("how");
      return;
    }
    const mode = ev.target.closest("[data-mode]");
    if (mode) {
      state.mode = MODES.find((m) => m.id === mode.dataset.mode);
      renderSetup();
      return;
    }
    const stage = ev.target.closest("[data-stage]");
    if (stage) {
      state.stage = STAGES.find((s) => s.id === stage.dataset.stage);
      renderSetup();
      return;
    }
    const mate = ev.target.closest("[data-mate]");
    if (mate) {
      state.mate = state.data.entries.find((e) => e.id === mate.dataset.mate);
      renderSetup();
      return;
    }
    if (ev.target.closest("[data-run]")) {
      if (isCoarse()) {
        paintStickOv();
        const ov = $("#stick-ov");
        if (ov) ov.classList.remove("hidden");
        return;
      }
      enterPlay();
      return;
    }
    const side = ev.target.closest("[data-stick-side]");
    if (side) {
      saveStickSide(side.dataset.stickSide);
      const ov = $("#stick-ov");
      if (ov) ov.classList.add("hidden");
      enterPlay();
      return;
    }
    if (ev.target.closest("[data-pause]")) {
      pausePlay();
      return;
    }
    if (ev.target.closest("[data-resume]")) {
      resumePlay();
      return;
    }
    if (ev.target.closest("[data-quit]")) {
      killGame();
      show("title");
      return;
    }
    if (ev.target.closest("[data-raise]")) {
      raiseFlag();
      return;
    }
    if (ev.target.closest("[data-raise-copy]")) {
      raiseCopy();
      return;
    }
    if (ev.target.closest("[data-raise-save]")) {
      raiseSave();
      return;
    }
    if (ev.target.closest("[data-raise-close]")) {
      const ov = $("#raise-ov");
      if (ov) ov.classList.add("hidden");
      return;
    }
    if (ev.target.closest("[data-again]")) {
      enterPlay();
    }
  });
}

main();
