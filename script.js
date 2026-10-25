const GRID_FACTOR = 0.82;
let records = [];
let authMode = "login";

const $ = (id) => document.getElementById(id);
const authView = $("authView");
const appView = $("appView");
const authMessage = $("authMessage");
const recordMessage = $("recordMessage");

function showMessage(element, message, type = "") {
  element.textContent = message;
  element.className = `form-message ${type}`.trim();
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function setAuthMode(mode) {
  authMode = mode;
  $("loginTab").classList.toggle("active", mode === "login");
  $("registerTab").classList.toggle("active", mode === "register");
  $("authSubmit").textContent = mode === "login" ? "Log in" : "Create account";
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  showMessage(authMessage, "");
}

$("loginTab").addEventListener("click", () => setAuthMode("login"));
$("registerTab").addEventListener("click", () => setAuthMode("register"));

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(authMessage, "Please wait...");
  $("authSubmit").disabled = true;
  try {
    const data = { email: $("email").value.trim(), password: $("password").value };
    const result = await api(authMode === "login" ? "/api/login" : "/api/register", {
      method: "POST", body: JSON.stringify(data)
    });
    $("authForm").reset();
    await enterApp(result.email);
  } catch (error) {
    showMessage(authMessage, error.message, "error");
  } finally {
    $("authSubmit").disabled = false;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (_) {}
  records = [];
  appView.classList.add("hidden");
  authView.classList.remove("hidden");
  $("headerUser").classList.add("hidden");
  setAuthMode("login");
});

async function enterApp(email) {
  $("userEmail").textContent = email;
  $("headerUser").classList.remove("hidden");
  authView.classList.add("hidden");
  appView.classList.remove("hidden");
  $("recordDate").value = new Date().toISOString().slice(0, 10);
  await loadRecords();
}

async function checkSession() {
  try {
    const data = await api("/api/me");
    if (data.loggedIn) await enterApp(data.email);
  } catch (error) {
    console.error(error);
  }
}

function getNumbers() {
  return {
    consumed: Number($("energyInput").value || 0),
    solar: Number($("solarInput").value || 0)
  };
}

function updatePreview() {
  const { consumed, solar } = getNumbers();
  const carbon = Math.max(consumed - solar, 0) * GRID_FACTOR;
  $("previewCarbon").textContent = carbon.toFixed(2);
}
$("energyInput").addEventListener("input", updatePreview);
$("solarInput").addEventListener("input", updatePreview);

$("recordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const { consumed, solar } = getNumbers();
  if (consumed <= 0 || solar < 0 || solar > consumed) {
    showMessage(recordMessage, "Enter positive consumption and solar energy no greater than consumption.", "error");
    return;
  }
  $("saveRecordBtn").disabled = true;
  showMessage(recordMessage, "Saving record...");
  try {
    await api("/api/records", {
      method: "POST",
      body: JSON.stringify({
        date: $("recordDate").value,
        period: $("period").value,
        consumedKwh: consumed,
        solarKwh: solar
      })
    });
    $("energyInput").value = "";
    $("solarInput").value = "0";
    updatePreview();
    showMessage(recordMessage, "Record saved successfully.", "success");
    await loadRecords();
  } catch (error) {
    showMessage(recordMessage, error.message, "error");
  } finally {
    $("saveRecordBtn").disabled = false;
  }
});

async function loadRecords() {
  try {
    records = await api("/api/records");
    renderDashboard();
  } catch (error) {
    showMessage(recordMessage, error.message, "error");
  }
}

function renderDashboard() {
  const totalEnergy = records.reduce((sum, r) => sum + Number(r.consumedKwh), 0);
  const totalSolar = records.reduce((sum, r) => sum + Number(r.solarKwh), 0);
  const totalCarbon = records.reduce((sum, r) => sum + Number(r.carbonKg), 0);
  $("totalEnergy").textContent = totalEnergy.toFixed(1);
  $("totalSolar").textContent = totalSolar.toFixed(1);
  $("totalCarbon").textContent = totalCarbon.toFixed(1);
  $("solarShare").textContent = totalEnergy ? Math.round(totalSolar / totalEnergy * 100) : 0;
  renderRows();
  drawChart();
}

function renderRows() {
  const search = $("historySearch").value.trim().toLowerCase();
  const filtered = records.filter(r =>
    `${r.date} ${r.period} ${r.consumedKwh} ${r.solarKwh}`.toLowerCase().includes(search)
  );
  $("recordRows").innerHTML = "";
  $("noRecords").classList.toggle("hidden", filtered.length > 0);
  filtered.forEach((r) => {
    const tr = document.createElement("tr");
    const values = [
      r.date, r.period, `${Number(r.consumedKwh).toFixed(2)} kWh`,
      `${Number(r.solarKwh).toFixed(2)} kWh`, `${Number(r.carbonKg).toFixed(2)} kg CO₂e`
    ];
    values.forEach(value => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });
    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.className = "button button-outline";
    button.type = "button";
    button.textContent = "Delete";
    button.addEventListener("click", async () => {
      if (!confirm("Delete this energy record?")) return;
      try {
        await api(`/api/records/${r.id}`, { method: "DELETE" });
        await loadRecords();
      } catch (error) {
        alert(error.message);
      }
    });
    actionCell.appendChild(button);
    tr.appendChild(actionCell);
    $("recordRows").appendChild(tr);
  });
}
$("historySearch").addEventListener("input", renderRows);

function drawChart() {
  const canvas = $("energyChart");
  const ctx = canvas.getContext("2d");
  const width = canvas.clientWidth || 400;
  const height = canvas.clientHeight || 235;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const latest = [...records].slice(0, 7).reverse();
  if (!latest.length) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "13px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Your energy records will appear here", width / 2, height / 2);
    return;
  }
  const pad = { left: 38, right: 12, top: 18, bottom: 38 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxVal = Math.max(...latest.map(r => Number(r.consumedKwh)), 1);
  ctx.font = "10px Arial";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + plotH * i / 4;
    ctx.strokeStyle = "#e5e7eb";
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.fillText((maxVal * (1 - i / 4)).toFixed(0), pad.left - 7, y + 3);
  }
  const slot = plotW / latest.length;
  latest.forEach((r, i) => {
    const barW = Math.min(28, slot * 0.55);
    const x = pad.left + slot * i + (slot - barW) / 2;
    const barH = Number(r.consumedKwh) / maxVal * plotH;
    ctx.fillStyle = "#3b8065";
    ctx.fillRect(x, pad.top + plotH - barH, barW, barH);
    ctx.fillStyle = "#6b7280";
    ctx.textAlign = "center";
    ctx.fillText(r.date.slice(5), x + barW / 2, height - 18);
  });
}

window.addEventListener("resize", drawChart);
checkSession();
