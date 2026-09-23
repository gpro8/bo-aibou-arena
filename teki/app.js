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
  const job = e.job ? `<span class="chip">${esc(e.job)}</span>` : "";
  const met = seen.has(e.id) ? `<span class="chip">見た</span>` : "";
  return `<button class="card" type="button" data-id="${esc(e.id)}" aria-label="${esc(e.name)}">
    <div class="card-art"><img src="${esc(e.image)}" alt="" width="640" height="640" loading="lazy" decoding="async"></div>
    <div class="card-meta">
      <div class="no">${padNo(e.no)}</div>
      <h2>${esc(e.name)}</h2>
      <div class="en">${esc(e.nameEn || "")}</div>
      <div class="chips">${job}${met}</div>
    </div>
  </button>`;
}

function sec(title, inner) {
  if (!inner) return "";
  return `<section class="sec"><h3>${esc(title)}</h3>${inner}</section>`;
}

function modalHtml(e, seen) {
  const bits = (e.fields || [])
    .filter((row) => Array.isArray(row) && row[0] && row[1])
    .map(([k, v]) => sec(k, `<p>${esc(v)}</p>`))
    .join("");
  const met = seen.has(e.id) ? sec("活動記録", "<p>きついの場で見た</p>") : "";
  return `
    <div class="modal-head">
      <div>
        <div class="no">${padNo(e.no)}</div>
        <h2>${esc(e.name)}</h2>
        <div class="en">${esc(e.nameEn || "")}</div>
      </div>
      <button class="close" type="button" data-close>閉じる</button>
    </div>
    <div class="modal-art"><img src="${esc(e.image)}" alt="${esc(e.name)}" width="720" height="720" decoding="async"></div>
    <div class="sections">${bits}${met}</div>`;
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
}

main().catch((err) => {
  $("[data-blurb]").textContent = "図鑑を読み込めませんでした。";
  console.error(err);
});
