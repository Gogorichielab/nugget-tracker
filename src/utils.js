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
