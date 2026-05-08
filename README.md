# Nugget Tracker

[![Azure SWA CI/CD](https://github.com/Gogorichielab/nugget-tracker/actions/workflows/azure-static-web-apps-victorious-cliff-0a4b70b0f.yml/badge.svg)](https://github.com/Gogorichielab/nugget-tracker/actions/workflows/azure-static-web-apps-victorious-cliff-0a4b70b0f.yml) [![MLB Sync Nightly](https://github.com/Gogorichielab/nugget-tracker/actions/workflows/mlb-sync-nightly.yml/badge.svg)](https://github.com/Gogorichielab/nugget-tracker/actions/workflows/mlb-sync-nightly.yml) [![Maintenance](https://github.com/Gogorichielab/nugget-tracker/actions/workflows/maintenance.yml/badge.svg)](https://github.com/Gogorichielab/nugget-tracker/actions/workflows/maintenance.yml)

Free Chick-fil-A nuggets. Every time a Cubs pitcher strikes out **3 batters in a single inning** at home.

We're keeping score so you don't have to. 

## How It Works

1. **Cubs pitcher gets 3 K's** in one inning → ✨ Qualifying event
2. **Event gets logged** in real-time
3. **Free nuggets tomorrow** — Chick-fil-A honors the promo the next day

## What You'll Find Here

- 📊 **Public dashboard** — Track all qualifying events this season
- 🔐 **Admin panel** — Manage the event log (password protected)
- ⚾ **Auto-sync** — Nightly MLB data fetch keeps events up to date
- 🎨 **Cubs-themed UI** — Blue, red, gold, and cream colors

## Tech Stack

Built with:
- **Frontend**: Vanilla HTML, CSS, JavaScript (no build step)
- **Backend**: Node.js 18 Azure Functions
- **Storage**: Azure Table Storage
- **Hosting**: Azure Static Web Apps
- **CI/CD**: GitHub Actions

## Getting Started

For local setup and deployment instructions, see [agent.md](agent.md).

## Security

### Admin Authentication Hardening

Admin writes now use a dedicated auth flow:

- `GET /api/admin/verify` accepts the password in the `x-admin-password` header and verifies it without touching event data
- `POST /api/auth` accepts `{ "password": "..." }` after verification to mint an admin token
- The server validates the password with a derived hash (`crypto.scryptSync`)
- On auth success, the API returns a short-lived HMAC-signed bearer token (1 hour)
- Admin write endpoints (`POST/PUT/DELETE /api/events`) require `Authorization: Bearer <token>`

The admin UI no longer uses event writes as a login probe, so failed validation
cannot create synthetic events or accidentally unlock the UI. (`/api/mlb-sync`
still accepts the legacy header for scheduled-job backward compatibility.)

Required environment variables:

- `ADMIN_PASSWORD` (must be at least 12 chars with upper/lower/number/symbol)
- `ADMIN_PASSWORD_SALT` (must be at least 16 chars)
- `ADMIN_TOKEN_SECRET` (must be at least 32 chars)
- `AZURE_STORAGE_CONNECTION_STRING` (used for event data and shared rate-limit state)
- `RATE_LIMIT_TABLE_NAME` (optional; defaults to `RateLimits`)

![Admin login screen](docs/admin-login.png)

### OData Query Injection Protection

All values interpolated into Azure Table Storage OData filter strings are
escaped before use. The helper `api/utils/odata.js` exposes `escapeOData`,
which doubles every single quote in a string value (`'` → `''`) as required
by the OData specification. This prevents a crafted value — such as a pitcher
name containing `'` or a malicious route parameter — from breaking out of the
surrounding quotes and altering the query predicate.

```js
// api/utils/odata.js
function escapeOData(value) {
  return String(value).replace(/'/g, "''");
}
```

The helper is applied in:

| File | Filter field(s) |
|------|----------------|
| `api/events/index.js` | `id` (URL route parameter) used in `RowKey` filter |
| `api/mlb-sync/index.js` | `pitcher`, `gameDate`, `year` from MLB Stats API response; `inning` is coerced with `parseInt` |

> **Why this matters:** Without escaping, a pitcher name like `O'Brien` would
> produce a syntactically invalid OData expression. A deliberately crafted
> value such as `' or '1' eq '1` could match all rows, bypassing the
> deduplication guard in `mlb-sync` and allowing duplicate events to be
> inserted.

### Audit Logging for Admin Writes

Successful admin-protected event writes now emit structured audit logs from
`api/events/index.js` through `context.log` (ingested by Azure Application
Insights when configured in `host.json`).

Covered operations:

- `POST /api/events` → `CREATE`
- `PUT /api/events/{id}` → `UPDATE`
- `DELETE /api/events/{id}` → `DELETE`

Each audit entry includes:

- ISO timestamp
- action (`CREATE`, `UPDATE`, `DELETE`)
- event identifiers (`rowKey`, `partitionKey`)
- event context (`gameDate`, `pitcher`, `inning` when applicable)
- hashed client IP (`ipHash`, first 12 chars of SHA-256)
