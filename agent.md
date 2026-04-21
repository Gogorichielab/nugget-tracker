# agent.md

Guidance for AI agents working with this codebase.

## Project Overview

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
│   ├── mlb-sync/         ← HTTP endpoint invoked nightly by GitHub Actions
│   ├── host.json
│   └── package.json
└── staticwebapp.config.json
```

## Data Flow

- **Storage**: Azure Table Storage table `NuggetEvents`
  - `PartitionKey`: Year (e.g., `"2026"`)
  - `RowKey`: UUID
  - Fields: `GameDate`, `RedemptionDate` (GameDate+1), `Pitcher`, `Inning`
- **API**: GET `/api/events` returns all events for the current calendar year
- **Security**: Admin writes require the header `x-admin-password` matching env var `ADMIN_PASSWORD`

## MLB Auto-Detection (`mlb-sync`)

Runs nightly at 22:30 UTC via GitHub Actions cron calling `/api/mlb-sync`.

Logic:
1. Query `https://statsapi.mlb.com/api/v1/schedule?teamId=112&date={today}` to find Final Cubs home game
2. Fetch `/api/v1.1/game/{gamePk}/feed/live` play-by-play data
3. Count strikeouts by pitcher per inning (top half only — Cubs pitch when away team bats)
4. Insert `NuggetEvent` for each pitcher/inning combo with ≥ 3 Ks, skipping duplicates

**Cubs team ID**: 112 | **MLB API**: No key required

## Admin Authentication

- Password stored in `sessionStorage` after first unlock
- Login flow: probe POST, immediately delete created row if successful
- Validates password without separate auth endpoint

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Backend**: Node.js 18 Azure Functions
- **Storage**: Azure Table Storage
- **Hosting**: Azure Static Web Apps
- **CI/CD**: GitHub Actions

## Environment Variables

| Variable | Location | Purpose |
|---|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | Azure SWA app settings | Table Storage connection |
| `ADMIN_PASSWORD` | Azure SWA app settings | Protects POST/PUT/DELETE endpoints |

## Deployment

- Connected GitHub repo to Azure Static Web Apps via Azure Portal
- Build configuration:
  - **App location**: `src`
  - **API location**: `api`
  - **Output location**: (leave blank — no build step)
- Auto-deploys on every push to `main`

## Design System

### Color Palette
| Token | Hex | Usage |
|---|---|---|
| Cubs Blue | `#0E3386` | Header, primary buttons, table headers |
| Cubs Red | `#CC3433` | Accents, error states |
| Chick-fil-A Red | `#DD0031` | Redemption badges |
| Gold | `#F5C518` | Highlights, edit buttons |
| Cream | `#f5f0e8` | Page background |

### Typography
- **Headings**: Bebas Neue (Google Fonts)
- **Body**: DM Sans (Google Fonts)

## Development Setup

### Prerequisites
- Node.js 18+
- Azure Functions Core Tools v4
- Azure Storage account (or Azurite for local emulation)

### Local Development

```bash
# Install API dependencies
cd api && npm install

# Create local settings
cat > api/local.settings.json <<EOF
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_STORAGE_CONNECTION_STRING": "UseDevelopmentStorage=true",
    "ADMIN_PASSWORD": "dev-password"
  }
}
EOF

# Start API
cd api && func start

# Serve frontend (in new terminal)
cd src && npx serve .
```

### Alternative: Azure Static Web Apps CLI

```bash
npx @azure/static-web-apps-cli start src --api-location api
```

## PR Naming Conventions

All pull requests should follow this naming format: `[TYPE] Brief description`

### PR Type Prefixes

| Prefix | Usage | Examples |
|---|---|---|
| `[feat]` | New feature or functionality | `[feat] Add event filtering by date range` |
| `[fix]` | Bug fixes | `[fix] Correct strikeout calculation logic` |
| `[docs]` | Documentation updates | `[docs] Update API endpoint documentation` |
| `[refactor]` | Code restructuring (no behavior change) | `[refactor] Extract event validation logic` |
| `[test]` | Test additions or updates | `[test] Add integration tests for mlb-sync` |
| `[style]` | CSS/styling changes | `[style] Update Cubs color palette` |
| `[perf]` | Performance improvements | `[perf] Optimize table rendering` |
| `[infra]` | Infrastructure/CI-CD changes | `[infra] Update GitHub Actions workflow` |
| `[chore]` | Maintenance tasks, dependencies | `[chore] Update Node.js to 20` |

### PR Description Guidelines

- **One-liner title** following the naming convention
- **Problem statement**: What issue does this solve?
- **Solution approach**: How was it solved?
- **Testing**: Manual/automated tests performed
- **Screenshots/demos**: Visual changes should include before/after
- **Breaking changes**: Flag any breaking changes clearly

### Commit Message Standards

- Use the same prefix: `[type] description`
- Keep commits atomic (one logical change per commit)
- Reference PR or issue if applicable: `[fix] Correct calculation (#42)`

Example commit history:
```
[feat] Add event filtering
[test] Add filter tests
[docs] Update API docs
```

## Key Patterns

- **API Structure**: Each function folder contains `function.json` and `index.js`
- **Authentication**: Custom password header validation on write endpoints
- **Frontend**: Vanilla JS with no build step—served as-is by SWA
- **Year Partitioning**: Events organized by calendar year in Table Storage
