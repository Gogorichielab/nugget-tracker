# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An Azure Static Web App that tracks qualifying Chicago Cubs pitching performances that trigger free Chick-fil-A nugget promotions. A "qualifying event" is any Cubs pitcher who strikes out 3 batters in a single inning during a home game — fans redeem free nuggets the following day.

## Architecture

```
/
├── src/                  ← Frontend (served as static files)
│   ├── index.html        ← Public page: stat cards + events table
│   ├── admin.html        ← Password-gated admin panel
│   ├── app.js            ← Public page logic
│   ├── admin.js          ← Admin CRUD logic
│   └── style.css         ← Shared styles (both pages)
├── api/                  ← Azure Functions (Node 18)
│   ├── events/           ← GET + POST /api/events
│   ├── events-item/      ← PUT + DELETE /api/events/{id}
│   ├── mlb-sync/         ← Scheduled function (nightly, 10:30 PM UTC)
│   ├── host.json
│   └── package.json
└── staticwebapp.config.json
```

### Data flow

- Azure Table Storage table `NuggetEvents`: `PartitionKey` = year (e.g. `"2026"`), `RowKey` = UUID.  
- Fields: `GameDate`, `RedemptionDate` (GameDate+1), `Pitcher`, `Inning`.
- GET `/api/events` returns all events for the **current calendar year**.
- Admin writes require the header `x-admin-password` matching the env var `ADMIN_PASSWORD`.

### MLB auto-detection (`mlb-sync`)

Runs nightly at 22:30 UTC. Logic:
1. Hits `https://statsapi.mlb.com/api/v1/schedule?teamId=112&date={today}` to find a Final Cubs home game.
2. Fetches `/api/v1.1/game/{gamePk}/feed/live` play-by-play.
3. Counts strikeouts by pitcher per inning (top half only — Cubs pitch when away team bats).
4. Inserts a `NuggetEvent` for each pitcher/inning combo with ≥ 3 Ks, skipping duplicates.

Cubs team ID: **112**. No MLB API key required.

### Admin authentication

Password is stored in `sessionStorage` after the first unlock. The login flow does a probe POST and immediately deletes the created row if successful — this validates the password without a separate auth endpoint.

## Local Development

### Prerequisites
- Node.js 18+
- [Azure Functions Core Tools v4](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local)
- An Azure Storage account (or use [Azurite](https://github.com/Azure/Azurite) for local emulation)

### Run locally

```bash
# Install API dependencies
cd api && npm install

# Create local settings (not committed)
cat > api/local.settings.json <<EOF
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_STORAGE_CONNECTION_STRING": "<your-connection-string-or-UseDevelopmentStorage=true>",
    "ADMIN_PASSWORD": "yourpassword"
  }
}
EOF

# Start the API
cd api && func start

# Serve the frontend (any static file server)
cd src && npx serve .
```

The SWA CLI can also proxy both together:
```bash
npx @azure/static-web-apps-cli start src --api-location api
```

## Environment Variables

| Variable | Where set | Purpose |
|---|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | Azure SWA app settings | Table Storage connection |
| `ADMIN_PASSWORD` | Azure SWA app settings | Protects POST/PUT/DELETE endpoints |

## Deployment

Connect the GitHub repo to Azure Static Web Apps via the Azure Portal. Configure the build:
- **App location**: `src`
- **API location**: `api`
- **Output location**: (leave blank — no build step)

Azure auto-deploys on every push to `main`.

## Design Tokens

| Token | Value | Use |
|---|---|---|
| Cubs blue | `#0E3386` | Header, primary buttons, table headers |
| Cubs red | `#CC3433` | Accents, error states |
| Chick-fil-A red | `#DD0031` | Redemption badges |
| Gold | `#F5C518` | Highlight / edit buttons |
| Cream | `#f5f0e8` | Page background |

Fonts: **Bebas Neue** (headings), **DM Sans** (body) — loaded from Google Fonts.
