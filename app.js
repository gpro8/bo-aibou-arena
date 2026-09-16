const ZUKAN = "https://gpro8.github.io/bo-aibou-zukan/";

const MODES = [
  { id: "easy", label: "ふつう", secs: 90, pace: 1 },
  { id: "hard", label: "きつい", secs: 60, pace: 1.35 },
];
const STAGES = [
  { id: "yang", label: "陽", bg: 0xe8dcc8, foe: 0x5a4030 },
  { id: "yin", label: "陰", bg: 0x1b1916, foe: 0xc49a2a },
];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function field(e, key) {
  const row = (e.fields || []).find((x) => x[0] === key);
  return row ? String(row[1]) : "";
}

function kit(e) {
  const skill = field(e, "特技") || "そばにいる";
  if (e.id === "sumi") {
    return {
      color: 0xf8b500,
      hp: 20,
      speed: 210,
      rate: 280,
      skill,
      kind: "spark",
    };
  }
  return {
    color: 0xf3eadc,
    hp: 28,
    speed: 170,
    rate: 420,
    skill,
    kind: "puff",
  };
}

const state = {
  data: null,
  mode: MODES[0],
  stage: STAGES[0],
  mate: null,
  game: null,
  last: null,
};

function show(name) {
  $$(".screen").forEach((el) => el.classList.toggle("hidden", el.dataset.screen !== name));
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
  if (!state.mate) state.mate = list[0];
  mates.innerHTML = list
    .map((e) => {
      const on = state.mate && state.mate.id === e.id ? " on" : "";
      return `<button type="button" class="mate${on}" data-mate="${e.id}"><b>${e.name}</b><span>主 ${e.owner || "未記入"}</span></button>`;
    })
    .join("");
  const e = state.mate;
  if (e) {
    const skill = field(e, "特技");
    const attr = field(e, "属性") || (e.types || []).join("·") || "—";
    $("[data-mate-blurb]").textContent = `${e.name} · ${e.species || ""} · ${attr} · ${skill} · 主 ${e.owner || "未記入"}`;
  }
}

function bootArena() {
  killGame();
  const mate = state.mate;
  const k = kit(mate);
  const mode = state.mode;
  const stage = state.stage;
  const hud = {
    name: $("[data-hud-name]"),
    time: $("[data-hud-time]"),
    hp: $("[data-hud-hp]"),
    lv: $("[data-hud-lv]"),
  };
  hud.name.textContent = mate.name;

  class Arena extends Phaser.Scene {
    constructor() {
      super("arena");
    }
    create() {
      this.ended = false;
      this.hp = k.hp;
      this.maxHp = k.hp;
      this.lv = 1;
      this.xp = 0;
      this.next = 6;
      this.left = mode.secs;
      this.pace = mode.pace;
      this.cameras.main.setBackgroundColor(stage.bg);
      const w = this.scale.width;
      const h = this.scale.height;
      this.player = this.add.circle(w / 2, h / 2, 16, k.color);
      this.physics.add.existing(this.player);
      this.player.body.setCollideWorldBounds(true);
      this.player.body.setCircle(16);
      this.cursors = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT");
      this.foes = this.physics.add.group();
      this.shots = this.physics.add.group();
      this.gems = this.physics.add.group();
      this.physics.add.overlap(this.shots, this.foes, (shot, foe) => {
        shot.destroy();
        this.hurtFoe(foe, k.kind === "spark" ? 18 : 12);
      });
      this.physics.add.overlap(this.player, this.gems, (_p, gem) => {
        gem.destroy();
        this.xp += 1;
        if (this.xp >= this.next) {
          this.xp = 0;
          this.next += 3;
          this.lv += 1;
          this.maxHp += 2;
          this.hp = Math.min(this.maxHp, this.hp + 4);
        }
      });
      this.hurtTick = 0;
      this.spawnAcc = 0;
      this.shotAcc = 0;
      this.secAcc = 0;
      this.paintHud();
    }
    paintHud() {
      hud.hp.textContent = `心 ${Math.max(0, Math.ceil(this.hp))}`;
      hud.lv.textContent = `lv ${this.lv}`;
      const t = Math.max(0, Math.ceil(this.left));
      hud.time.textContent = `${t}秒`;
    }
    spawn() {
      const w = this.scale.width;
      const h = this.scale.height;
      const edge = Phaser.Math.Between(0, 3);
      const x = edge === 0 ? 20 : edge === 1 ? w - 20 : Phaser.Math.Between(20, w - 20);
      const y = edge === 2 ? 20 : edge === 3 ? h - 20 : Phaser.Math.Between(20, h - 20);
      const foe = this.add.circle(x, y, 12, stage.foe);
      this.physics.add.existing(foe);
      foe.body.setCircle(12);
      foe.hp = 12 + this.lv * 2;
      this.foes.add(foe);
    }
    hurtFoe(foe, dmg) {
      foe.hp -= dmg;
      if (k.kind === "spark") foe.body.velocity.scale(0.2);
      if (foe.hp <= 0) {
        const gem = this.add.circle(foe.x, foe.y, 5, 0xf8b500);
        this.physics.add.existing(gem);
        gem.body.setCircle(5);
        this.gems.add(gem);
        foe.destroy();
      }
    }
    fire() {
      const target = this.closest();
      if (!target) return;
      const shot = this.add.circle(this.player.x, this.player.y, k.kind === "puff" ? 10 : 5, k.color);
      this.physics.add.existing(shot);
      const ang = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
      this.physics.velocityFromRotation(ang, 320, shot.body.velocity);
      this.shots.add(shot);
      this.time.delayedCall(700, () => shot.destroy());
      if (k.kind === "puff") this.hp = Math.min(this.maxHp, this.hp + 0.6);
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
      const ptr = this.input.activePointer;
      if (ptr.isDown) {
        const dx = ptr.worldX - this.player.x;
        const dy = ptr.worldY - this.player.y;
        if (Math.hypot(dx, dy) > 8) {
          vx = dx;
          vy = dy;
        }
      }
      const len = Math.hypot(vx, vy) || 1;
      const spd = k.speed * (1 + (this.lv - 1) * 0.06);
      b.setVelocity((vx / len) * spd, (vy / len) * spd);
    }
    finish(win) {
      if (this.ended) return;
      this.ended = true;
      state.last = {
        win,
        name: mate.name,
        lv: this.lv,
      };
      killGame();
      $("[data-result-title]").textContent = win ? "生きた" : "たおれた";
      $("[data-thanks]").textContent = "ありがとうございます";
      $("[data-result-line]").textContent = `${mate.name} · lv ${this.lv}`;
      show("result");
    }
    update(_t, delta) {
      if (this.ended) return;
      this.move(delta);
      this.secAcc += delta;
      if (this.secAcc >= 1000) {
        this.secAcc -= 1000;
        this.left -= 1;
        if (this.left <= 0) this.finish(true);
      }
      this.spawnAcc += delta * this.pace;
      if (this.spawnAcc > Math.max(420, 900 - this.lv * 40)) {
        this.spawnAcc = 0;
        this.spawn();
      }
      this.shotAcc += delta;
      if (this.shotAcc > Math.max(160, k.rate - this.lv * 20)) {
        this.shotAcc = 0;
        this.fire();
      }
      this.hurtTick -= delta;
      this.foes.children.iterate((f) => {
        if (!f || !f.body) return;
        this.physics.moveToObject(f, this.player, 70 + this.lv * 8);
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, f.x, f.y);
        if (d < 26 && this.hurtTick <= 0) {
          this.hp -= 4;
          this.hurtTick = 400;
          if (this.hp <= 0) this.finish(false);
        }
      });
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
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [Arena],
  });
}

function killGame() {
  if (state.game) {
    state.game.destroy(true);
    state.game = null;
    $("#arena").innerHTML = "";
  }
}

async function main() {
  const res = await fetch("./data/entries.json");
  state.data = await res.json();
  state.mate = (state.data.entries || [])[0];
  renderSetup();

  document.body.addEventListener("click", (ev) => {
    const go = ev.target.closest("[data-go]");
    if (go) {
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
      show("play");
      bootArena();
      return;
    }
    if (ev.target.closest("[data-pause]")) {
      if (state.game) state.game.scene.pause("arena");
      show("pause");
      return;
    }
    if (ev.target.closest("[data-resume]")) {
      show("play");
      if (state.game) state.game.scene.resume("arena");
      return;
    }
    if (ev.target.closest("[data-quit]")) {
      killGame();
      show("title");
      return;
    }
    if (ev.target.closest("[data-again]")) {
      show("play");
      bootArena();
    }
  });
}

main();
