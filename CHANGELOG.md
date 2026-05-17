# Changelog

## 2026-05-17

### Improved

**Admin login endpoints are now rate-limited.** The `/api/auth` token endpoint and the legacy `/api/admin/verify` password check now allow at most 5 requests per IP every 15 minutes, returning `429 Too Many Requests` with a `Retry-After` header once the limit is hit. This slows down password-guessing attacks without affecting normal sign-in.

---

## 2026-04-21

### Fixed

**Admin panel buttons and password gate work correctly again.** The Unlock, Save Event, and Cancel buttons were silently failing, and the admin panel was visible before login, because the site's Content Security Policy blocks inline styles and click handlers. All three issues are resolved — the password gate now hides the admin panel until you log in, and every button responds as expected.

### Improved

**The public dashboard has a new look.** The homepage now shows a striped ballpark-style header with a gold "NUGGETS" wordmark, a live qualifying-event count badge, and a season tag. Stat cards display emoji icons with team-colored accents, and the events table uses pill chips for the inning and nugget redemption date — a gold "FREE TODAY!" chip appears on redemption days.

### New

**A "Is it nugget day?" banner now appears on the homepage.** On days when nuggets are redeemable it shows in gold with a "FREE NUGGETS TODAY" headline. Every other day it shows a neutral prompt to check back after the next home game.

---

## 2026-04-20

### New

**Initial launch of the Cubs Free Nuggets Tracker.** Track Chicago Cubs three-strikeout-inning events that trigger free Chick-fil-A nuggets. The site includes a public dashboard with event stats and history, a password-protected admin panel for managing events manually, and automatic nightly syncing with MLB game data.
