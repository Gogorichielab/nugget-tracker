(async () => {
  document.getElementById("footer-year").textContent = new Date().getFullYear();

  let events = [];

  try {
    const res = await fetch("/api/events");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    events = await res.json();
  } catch (e) {
    renderStats([]);
    renderEvents([]);
    console.error("Failed to load events:", e);
    return;
  }

  renderStats(events);
  renderEvents(events);
})();

function renderStats(events) {
  document.getElementById("stat-total").textContent = events.length || "0";

  if (!events.length) {
    document.getElementById("stat-pitcher-name").textContent = "—";
    document.getElementById("stat-pitcher-count").textContent = "";
    document.getElementById("stat-days").textContent = "—";
    document.getElementById("stat-last-date").textContent = "";
    return;
  }

  const counts = {};
  for (const e of events) counts[e.pitcher] = (counts[e.pitcher] ?? 0) + 1;
  const [topName, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  document.getElementById("stat-pitcher-name").textContent = topName.split(" ").pop();
  document.getElementById("stat-pitcher-count").textContent = `${topCount} qualifying inning${topCount > 1 ? "s" : ""}`;

  const sorted = [...events].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
  const lastDate = sorted[0].gameDate;
  const today = new Date().toISOString().split("T")[0];
  const diff = Math.floor((new Date(today) - new Date(lastDate)) / 86400000);
  document.getElementById("stat-days").textContent = diff === 0 ? "🔥" : diff;
  document.getElementById("stat-last-date").textContent = `Last: ${formatDate(lastDate)}`;
}

function renderEvents(events) {
  const list    = document.getElementById("events-list");
  const loading = document.getElementById("loading-state");
  if (loading) loading.remove();

  document.getElementById("event-count").textContent =
    events.length ? `${events.length} event${events.length > 1 ? "s" : ""}` : "None yet";

  if (!events.length) {
    list.insertAdjacentHTML("beforeend",
      `<div class="empty-state">No qualifying events yet this season — check back after a home game!</div>`);
    return;
  }

  const today  = new Date().toISOString().split("T")[0];
  const sorted = [...events].sort((a, b) => b.gameDate.localeCompare(a.gameDate));

  sorted.forEach((e, i) => {
    const isToday = e.redemptionDate === today;
    const row = document.createElement("div");
    row.className = "event-row";
    row.style.animationDelay = `${0.04 * i}s`;
    row.innerHTML = `
      <div class="event-cell cell-date">${formatDate(e.gameDate)}</div>
      <div class="event-cell cell-redemption">
        ${isToday
          ? `<span class="free-badge">🍟 Free Today!</span>`
          : formatDate(e.redemptionDate)}
      </div>
      <div class="event-cell cell-pitcher">${escHtml(e.pitcher)}</div>
      <div class="event-cell cell-inning">${ordinal(e.inning)}</div>
    `;
    list.appendChild(row);
  });
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-");
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
}

function ordinal(n) {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g,
    (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
}
