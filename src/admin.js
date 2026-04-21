document.getElementById("footer-year").textContent = new Date().getFullYear();

// ── Auth ──────────────────────────────────────────────────────────────────

let adminPassword = sessionStorage.getItem("admin_pw") || "";
let events = [];

(function init() {
  if (adminPassword) attemptLoad();

  document.getElementById("password-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") adminLogin();
  });
  document.getElementById("unlock-btn").addEventListener("click", adminLogin);
  document.getElementById("save-btn").addEventListener("click", submitForm);
  document.getElementById("cancel-btn").addEventListener("click", cancelEdit);

  document.getElementById("admin-tbody").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "edit") editEvent(id);
    else if (btn.dataset.action === "delete") deleteEvent(id);
  });
})();

async function adminLogin() {
  const pw = document.getElementById("password-input").value.trim();
  if (!pw) return;

  // Probe a write-protected endpoint with this password
  const res = await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": pw },
    body: JSON.stringify({ gameDate: "1900-01-01", pitcher: "__probe__", inning: 0 }),
  });

  if (res.status === 401) {
    document.getElementById("pw-error").textContent = "Incorrect password.";
    return;
  }

  // Accepted — delete the probe event if it was created
  if (res.status === 201) {
    const created = await res.json();
    await fetch(`/api/events/${created.id}`, {
      method: "DELETE",
      headers: { "x-admin-password": pw },
    });
  }

  adminPassword = pw;
  sessionStorage.setItem("admin_pw", pw);
  attemptLoad();
}

async function attemptLoad() {
  document.getElementById("password-gate").classList.add("hidden");
  document.getElementById("admin-panel").classList.remove("hidden");
  await loadEvents();
}

// ── API helpers ───────────────────────────────────────────────────────────

function authHeaders() {
  return { "Content-Type": "application/json", "x-admin-password": adminPassword };
}

async function loadEvents() {
  const res = await fetch("/api/events");
  if (!res.ok) { showToast("Failed to load events", true); return; }
  events = await res.json();
  renderAdminTable();
}

// ── Form ──────────────────────────────────────────────────────────────────

async function submitForm() {
  const id      = document.getElementById("edit-id").value;
  const gameDate= document.getElementById("field-date").value;
  const pitcher = document.getElementById("field-pitcher").value.trim();
  const inning  = parseInt(document.getElementById("field-inning").value, 10);

  if (!gameDate || !pitcher || !inning) {
    showToast("All fields are required", true);
    return;
  }

  const body = JSON.stringify({ gameDate, pitcher, inning });
  const url  = id ? `/api/events/${id}` : "/api/events";
  const method = id ? "PUT" : "POST";

  const res = await fetch(url, { method, headers: authHeaders(), body });

  if (res.status === 401) { showToast("Session expired — reload and log in again", true); return; }
  if (!res.ok) { showToast("Save failed", true); return; }

  showToast(id ? "Event updated" : "Event added");
  cancelEdit();
  await loadEvents();
}

function editEvent(id) {
  const ev = events.find((e) => e.id === id);
  if (!ev) return;

  document.getElementById("edit-id").value        = ev.id;
  document.getElementById("field-date").value     = ev.gameDate;
  document.getElementById("field-pitcher").value  = ev.pitcher;
  document.getElementById("field-inning").value   = ev.inning;
  document.getElementById("form-heading").textContent = "Edit Event";
  document.getElementById("cancel-btn").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelEdit() {
  document.getElementById("edit-id").value       = "";
  document.getElementById("field-date").value    = "";
  document.getElementById("field-pitcher").value = "";
  document.getElementById("field-inning").value  = "";
  document.getElementById("form-heading").textContent = "Add Event";
  document.getElementById("cancel-btn").classList.add("hidden");
}

async function deleteEvent(id) {
  if (!confirm("Delete this event?")) return;

  const res = await fetch(`/api/events/${id}`, {
    method: "DELETE",
    headers: { "x-admin-password": adminPassword },
  });

  if (res.status === 401) { showToast("Session expired", true); return; }
  if (!res.ok && res.status !== 204) { showToast("Delete failed", true); return; }

  showToast("Event deleted");
  await loadEvents();
}

// ── Render ────────────────────────────────────────────────────────────────

function renderAdminTable() {
  const tbody = document.getElementById("admin-tbody");

  if (events.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No events yet.</td></tr>`;
    return;
  }

  const sorted = [...events].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
  tbody.innerHTML = sorted.map((e) => `
    <tr>
      <td>${formatDate(e.gameDate)}</td>
      <td>${formatDate(e.redemptionDate)}</td>
      <td>${escHtml(e.pitcher)}</td>
      <td>${ordinal(e.inning)}</td>
      <td class="actions-cell">
        <button class="btn btn-warning" data-action="edit" data-id="${escHtml(e.id)}">Edit</button>
        <button class="btn btn-danger" data-action="delete" data-id="${escHtml(e.id)}">Delete</button>
      </td>
    </tr>`).join("");
}

// ── Utilities ─────────────────────────────────────────────────────────────

function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
}

function ordinal(n) {
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]
  );
}

let toastTimer;
function showToast(msg, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast"; }, 3000);
}
