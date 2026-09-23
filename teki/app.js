const $ = (s, r = document) => r.querySelector(s);

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function padNo(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "No. —";
  return `No.${String(x).padStart(3, "0")}`;
}

function cardHtml(e, seen) {
  const met = seen.has(e.id);
  const job = met && e.job ? `<span class="chip">${esc(e.job)}</span>` : "";
  const saw = met ? `<span class="chip">見た</span>` : `<span class="chip">未見</span>`;
  const name = met ? e.name : "？";
  const en = met ? e.nameEn || "" : "きついの場で会うとわかる";
  const cls = met ? "card" : "card secret";
  return `<button class="${cls}" type="button" data-id="${esc(e.id)}" aria-label="${esc(met ? e.name : "未見")}">
    <div class="card-art"><img src="${esc(e.image)}" alt="" width="640" height="640" loading="lazy" decoding="async"></div>
    <div class="card-meta">
      <div class="no">${padNo(e.no)}</div>
      <h2>${esc(name)}</h2>
      <div class="en">${esc(en)}</div>
      <div class="chips">${job}${saw}</div>
    </div>
  </button>`;
}

function sec(title, inner) {
  if (!inner) return "";
  return `<section class="sec"><h3>${esc(title)}</h3>${inner}</section>`;
}

function modalHtml(e, seen) {
  const met = seen.has(e.id);
  const bits = met
    ? (e.fields || [])
        .filter((row) => Array.isArray(row) && row[0] && row[1])
        .map(([k, v]) => sec(k, `<p>${esc(v)}</p>`))
        .join("")
    : sec("未見", "<p>きついの場で会うと姿と名がわかる</p>");
  const metSec = met ? sec("活動記録", "<p>きついの場で見た</p>") : "";
  const name = met ? e.name : "？";
  const en = met ? e.nameEn || "" : "";
  const artCls = met ? "modal-art" : "modal-art secret";
  return `
    <div class="modal-head">
      <div>
        <div class="no">${padNo(e.no)}</div>
        <h2>${esc(name)}</h2>
        <div class="en">${esc(en)}</div>
      </div>
      <button class="close" type="button" data-close>閉じる</button>
    </div>
    <div class="${artCls}"><img src="${esc(e.image)}" alt="${esc(name)}" width="720" height="720" decoding="async"></div>
    <div class="sections">${bits}${metSec}</div>`;
}

async function main() {
  const res = await fetch("./data/entries.json");
  const data = await res.json();
  const entries = data.entries || [];
  let seen = new Set();
  try {
    const o = JSON.parse(localStorage.getItem("bo-aibou-katsudo") || "null");
    if (o && Array.isArray(o.seen)) seen = new Set(o.seen.filter((s) => typeof s === "string"));
  } catch {
    seen = new Set();
  }
  $("[data-kicker]").textContent = data.kicker || "相棒あそび";
  $("[data-title]").textContent = data.title || "敵図鑑";
  $("[data-blurb]").textContent = data.blurb || "";
  $("[data-license]").textContent = data.licenseNote || "";
  $("[data-count]").textContent = `${entries.length} 体`;
  const grid = $("[data-grid]");
  grid.innerHTML = entries.map((e) => cardHtml(e, seen)).join("");

  const scrim = $("[data-scrim]");
  const body = $("[data-modal]");
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));

  function open(id) {
    const e = byId[id];
    if (!e) return;
    body.innerHTML = modalHtml(e, seen);
    scrim.classList.add("open");
    history.replaceState(null, "", `#${encodeURIComponent(id)}`);
  }
  function close() {
    scrim.classList.remove("open");
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }

  grid.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-id]");
    if (btn) open(btn.getAttribute("data-id"));
  });
  scrim.addEventListener("click", (ev) => {
    if (ev.target === scrim || ev.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") close();
  });

  const hash = decodeURIComponent((location.hash || "").replace(/^#/, ""));
  if (hash && byId[hash]) open(hash);

  function paintThemeBtn() {
    const btn = $("[data-theme-toggle]");
    if (!btn) return;
    const t = document.documentElement.getAttribute("data-theme") === "yang" ? "yang" : "yin";
    btn.dataset.mode = t;
    btn.setAttribute("aria-label", t === "yang" ? "陽" : "陰");
  }
  paintThemeBtn();
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest("[data-theme-toggle]")) return;
    const next = document.documentElement.getAttribute("data-theme") === "yang" ? "yin" : "yang";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("bo-aibou-theme", next);
    } catch {
      /* guest */
    }
    paintThemeBtn();
  });
}

main().catch((err) => {
  $("[data-blurb]").textContent = "図鑑を読み込めませんでした。";
  console.error(err);
});
