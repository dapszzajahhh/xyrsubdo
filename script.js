const $ = (s) => document.querySelector(s);
const state = { proxy: true, zone: null, records: [] };

function toast(message, type = "success") {
  const el = $("#toast");
  const icon = el.querySelector("i");
  const text = el.querySelector("span");
  icon.className = type === "error" ? "fa-solid fa-circle-exclamation" : "fa-solid fa-circle-check";
  text.textContent = message;
  el.classList.toggle("error", type === "error");
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2600);
}

function tick() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  $("#clock").textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  $("#date").textContent = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  $("#day").textContent = days[now.getDay()];
}

async function loadNetwork() {
  try {
    const res = await fetch("https://ipwho.is/");
    const d = await res.json();
    if (!d.success) throw new Error();
    $("#ip").textContent = d.ip;
    $("#isp").textContent = d.connection?.isp || d.connection?.org || "—";
    const flag = d.flag?.emoji ? `${d.flag.emoji} ` : "";
    $("#loc").textContent = `${flag}${d.city || "—"}, ${d.country || "—"}`;
    $("#tz").textContent = d.timezone?.id || "—";
  } catch {
    $("#ip").textContent = "Unavailable";
    $("#loc").textContent = "Unavailable";
    $("#isp").textContent = "—";
    $("#tz").textContent = "—";
  }
}

async function loadBattery() {
  if (!navigator.getBattery) {
    $("#batt").textContent = "N/A";
    $("#batt-status").textContent = "Not supported";
    return;
  }
  try {
    const b = await navigator.getBattery();
    const render = () => {
      const pct = Math.round(b.level * 100);
      $("#batt").textContent = `${pct}%`;
      $("#batt-status").textContent = b.charging ? "Sedang di-charge" : "Menggunakan baterai";
      const icon = $("#batt-icon");
      if (b.charging) icon.className = "fa-solid fa-bolt";
      else if (pct > 80) icon.className = "fa-solid fa-battery-full";
      else if (pct > 55) icon.className = "fa-solid fa-battery-three-quarters";
      else if (pct > 30) icon.className = "fa-solid fa-battery-half";
      else if (pct > 10) icon.className = "fa-solid fa-battery-quarter";
      else icon.className = "fa-solid fa-battery-empty";
    };
    render();
    b.addEventListener("levelchange", render);
    b.addEventListener("chargingchange", render);
  } catch {
    $("#batt").textContent = "N/A";
  }
}

function setProxy(value) {
  state.proxy = value;
  const el = $("#proxy");
  el.dataset.on = String(value);
  el.setAttribute("aria-pressed", String(value));
}

function bindProxy() {
  $("#proxy").addEventListener("click", () => setProxy(!state.proxy));
  $("#type").addEventListener("change", (e) => {
    const t = e.target.value;
    const supportsProxy = t === "A" || t === "AAAA" || t === "CNAME";
    $("#proxy-row").classList.toggle("hidden", !supportsProxy);
    $("#content-label").textContent =
      t === "CNAME" ? "Target Domain" :
      t === "TXT" ? "Text Value" :
      t === "AAAA" ? "IPv6 Address" : "IPv4 Address";
    const ph =
      t === "CNAME" ? "app.example.com" :
      t === "TXT" ? "v=spf1 include:..." :
      t === "AAAA" ? "2606:4700:4700::1111" : "1.1.1.1";
    $("#content").placeholder = ph;
  });
}

async function loadZones() {
  const select = $("#zone");
  select.innerHTML = `<option value="">Memuat domain…</option>`;
  try {
    const res = await fetch("/api/cloudflare?action=zone");
    const data = await res.json();
    if (!data.success) throw new Error(data.errors?.[0]?.message || "Gagal memuat");
    const zone = data.result;
    select.innerHTML = `<option value="${zone.id}">${zone.name}</option>`;
    state.zone = zone;
    $("#suffix").textContent = `.${zone.name}`;
  } catch (e) {
    select.innerHTML = `<option value="">Gagal memuat domain</option>`;
    toast(e.message || "Gagal memuat domain", "error");
  }
}

async function loadRecords() {
  const box = $("#records");
  box.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
  try {
    const res = await fetch("/api/cloudflare?action=list");
    const data = await res.json();
    if (!data.success) throw new Error(data.errors?.[0]?.message || "Gagal memuat");
    state.records = data.result || [];
    renderRecords();
  } catch (e) {
    box.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><p>${e.message}</p></div>`;
    $("#records-count").textContent = "—";
  }
}

function renderRecords() {
  const box = $("#records");
  $("#records-count").textContent = `${state.records.length} record ditemukan`;
  if (!state.records.length) {
    box.innerHTML = `<div class="empty"><i class="fa-regular fa-folder-open"></i><p>Belum ada data</p></div>`;
    return;
  }
  box.innerHTML = state.records.map((r) => `
    <div class="record">
      <div class="badge">${r.type}</div>
      <div class="record-info">
        <div class="record-name">${r.name}</div>
        <div class="record-meta">
          <span class="content">${r.content}</span>
          <span class="dot-sep"></span>
          <span>${r.proxied ? "Proxied" : "DNS only"}</span>
          <span class="dot-sep"></span>
          <span>TTL ${r.ttl === 1 ? "Auto" : r.ttl}</span>
        </div>
      </div>
      <button class="icon-btn" data-id="${r.id}" title="Hapus">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>
  `).join("");

  box.querySelectorAll(".icon-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteRecord(btn.dataset.id));
  });
}

async function deleteRecord(id) {
  if (!confirm("Hapus record ini?")) return;
  try {
    const res = await fetch("/api/cloudflare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.errors?.[0]?.message || "Gagal menghapus");
    toast("Record berhasil dihapus");
    loadRecords();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function createRecord(e) {
  e.preventDefault();
  const btn = $("#submit");
  const name = $("#name").value.trim();
  const type = $("#type").value;
  const content = $("#content").value.trim();

  if (!name || !content) {
    toast("Lengkapi semua field", "error");
    return;
  }
  if (!/^[a-zA-Z0-9\-\.]+$/.test(name)) {
    toast("Subdomain hanya boleh huruf, angka, titik, dan strip", "error");
    return;
  }

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Creating…</span>`;

  try {
    const res = await fetch("/api/cloudflare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        name,
        type,
        content,
        proxied: state.proxy,
        ttl: 1,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.errors?.[0]?.message || "Gagal membuat record");
    toast(`${name}.${state.zone?.name} berhasil dibuat`);
    $("#name").value = "";
    $("#content").value = "";
    loadRecords();
  } catch (err) {
    toast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

function init() {
  tick();
  setInterval(tick, 1000);
  loadNetwork();
  loadBattery();
  bindProxy();
  loadZones();
  loadRecords();

  $("#create-form").addEventListener("submit", createRecord);
  $("#reload").addEventListener("click", loadRecords);
  $("#refresh").addEventListener("click", () => {
    loadZones();
    loadRecords();
    toast("Data diperbarui");
  });
}

document.addEventListener("DOMContentLoaded", init);
