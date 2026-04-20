(async () => {
  document.getElementById("footer-year").textContent = new Date().getFullYear();

  let events = [];

  try {
    const res = await fetch("/api/events");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    events = await res.json();
  } catch (e) {
    renderTable([]);
    renderStats([]);
    console.error("Failed to load events:", e);
    return;
  }

  renderStats(events);
  renderTable(events);
})();

function renderStats(events) {
  const totalEl       = document.getElementById("stat-total");
  const pitcherNameEl = document.getElementById("stat-pitcher-name");
  const pitcherCountEl= document.getElementById("stat-pitcher-count");
  const daysEl        = document.getElementById("stat-days");
  const lastDateEl    = document.getElementById("stat-last-date");

  totalEl.textContent = events.length;

  if (events.length === 0) {
    pitcherNameEl.textContent = "None yet";
    daysEl.textContent = "—";
    return;
  }

  // Top pitcher
  const counts = {};
  for (const e of events) counts[e.pitcher] = (counts[e.pitcher] ?? 0) + 1;
  const topPitcher = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  pitcherNameEl.textContent = topPitcher[0].split(" ").pop(); // last name
  pitcherCountEl.textContent = `${topPitcher[1]} qualifying inning${topPitcher[1] > 1 ? "s" : ""}`;

  // Days since last event
  const sorted = [...events].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
  const lastDate = sorted[0].gameDate;
  const today = new Date().toISOString().split("T")[0];
  const diff = Math.floor((new Date(today) - new Date(lastDate)) / 86400000);
  daysEl.textContent = diff === 0 ? "Today!" : diff;
  lastDateEl.textContent = `Last event: ${formatDate(lastDate)}`;
}

function renderTable(events) {
  const tbody = document.getElementById("events-tbody");

  if (events.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No qualifying events yet this season.</td></tr>`;
    return;
  }

  const sorted = [...events].sort((a, b) => b.gameDate.localeCompare(a.gameDate));
  tbody.innerHTML = sorted.map((e) => {
    const isToday = e.redemptionDate === new Date().toISOString().split("T")[0];
    const redemptionCell = isToday
      ? `<span class="redemption-badge">FREE TODAY!</span>`
      : formatDate(e.redemptionDate);
    return `
      <tr>
        <td>${formatDate(e.gameDate)}</td>
        <td>${redemptionCell}</td>
        <td>${escHtml(e.pitcher)}</td>
        <td>${ordinal(e.inning)}</td>
      </tr>`;
  }).join("");
}

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
  return str.replace(/[&<>"']/g, (c) =>
    ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]
  );
}
