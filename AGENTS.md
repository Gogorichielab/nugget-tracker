# AGENTS.md

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

- `GET /api/admin/verify` checks the password from the `x-admin-password` header
  without touching event data
- `POST /api/auth` accepts `{ "password": "..." }` and mints a short-lived (1 hour)
  HMAC-signed bearer token
- The server verifies the password against a derived hash (`crypto.scryptSync`)
- Admin writes (`POST/PUT/DELETE /api/events`) require `Authorization: Bearer <token>`
- `/api/mlb-sync` still accepts the legacy `x-admin-password` header for the
  scheduled job

> The old "probe POST then delete the row" login flow is gone. Do not reintroduce
> it — it could create synthetic events on a failed login.

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Backend**: Node.js 18 Azure Functions
- **Storage**: Azure Table Storage
- **Hosting**: Azure Static Web Apps
- **CI/CD**: GitHub Actions

## Environment Variables

| Variable | Location | Purpose |
|---|---|---|
| `AZURE_STORAGE_CONNECTION_STRING` | Azure SWA app settings | Table Storage connection (events + rate-limit state) |
| `ADMIN_PASSWORD` | Azure SWA app settings | Admin password; ≥ 12 chars with upper/lower/number/symbol |
| `ADMIN_PASSWORD_SALT` | Azure SWA app settings | Salt for the derived password hash; ≥ 16 chars |
| `ADMIN_TOKEN_SECRET` | Azure SWA app settings | HMAC secret for admin bearer tokens; ≥ 32 chars |
| `RATE_LIMIT_TABLE_NAME` | Azure SWA app settings | Optional; defaults to `RateLimits` |

Never commit real values for any of these, and never echo them into logs or PR
descriptions.

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

## Commit Conventions — Conventional Commits

Every commit in this repository **must** follow the
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
specification. This applies to agents and humans alike, and to every branch.

> This supersedes the older `[type] description` bracket style used earlier in
> this repo's history. Do not mix the two.

### Format

```
<type>(<optional scope>): <description>

<optional body>

<optional footer(s)>
```

- **Type** is required and lowercase.
- **Scope** is optional, lowercase, and names the area touched (see below).
- **Description** is a short imperative summary — "add", not "added"/"adds" — no
  trailing period, and ideally ≤ 72 characters for the whole subject line.
- **Body** explains *why*, wrapped at ~72 columns, separated by a blank line.
- **Footers** carry metadata: `Refs: #42`, `Closes: #42`, `BREAKING CHANGE: ...`.

### Allowed Types

| Type | Use for |
|---|---|
| `feat` | New feature or user-visible capability |
| `fix` | Bug fix |
| `docs` | README, this file, or other documentation |
| `style` | CSS and formatting changes with no behaviour change |
| `refactor` | Code restructuring with no behaviour change |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Dependency or packaging changes |
| `ci` | GitHub Actions and deployment workflow changes |
| `chore` | Maintenance that doesn't fit above |
| `revert` | Reverting a previous commit |

### Suggested Scopes

`api`, `events`, `admin`, `auth`, `mlb-sync`, `ui`, `style`, `storage`, `swa`,
`deps`

### Breaking Changes

Mark with a `!` after the type/scope, a `BREAKING CHANGE:` footer, or both. Here,
"breaking" means a changed API contract, a Table Storage key change, or a
renamed environment variable.

```
feat(auth)!: require bearer token on admin write endpoints

BREAKING CHANGE: POST/PUT/DELETE /api/events no longer accept the
x-admin-password header. Clients must call POST /api/auth and send
Authorization: Bearer <token>.
```

### Examples

```
feat(events): add filtering by date range
fix(mlb-sync): count strikeouts only in the top half of the inning
style(ui): update Cubs colour palette
test(mlb-sync): add integration tests for duplicate skipping
ci(swa): update the Static Web Apps deploy workflow
chore(deps): update Azure Functions runtime to Node 20
fix(events): correct calculation (#42)
```

### Rules Of Thumb

- Keep commits atomic — one logical change each.
- Do not mix a dependency bump with a feature or a fix.
- If a description needs "and", it should probably be two commits.
- Leave Dependabot's generated commit and PR titles alone.

## PR Standards

- **Title**: a Conventional Commit subject, e.g. `fix(mlb-sync): skip suspended games`.
  Squash merges use the PR title, so a bad title becomes a bad commit.
- **Problem statement**: what issue does this solve?
- **Solution approach**: how was it solved?
- **Testing**: manual or automated tests performed, with the commands run.
- **Screenshots/demos**: visual changes need before/after.
- **Breaking changes**: flag clearly, and use the `!` / `BREAKING CHANGE:` footer
  in the commit as well.
- Keep PRs small and single-purpose; don't bundle unrelated refactors.

## Skills To Use

This project expects agents to work with the following skill packs. Install them
once, then invoke them by name or slash command as the task warrants.

### 1. ponytail — write the least code that works

<https://github.com/DietrichGebert/ponytail>

Claude Code (send as **two separate prompts**):

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

Other agents: copy the matching rules file from that repo — `.cursor/rules/`,
`.windsurf/rules/`, `.clinerules/`, `.github/copilot-instructions.md`,
`.kiro/steering/ponytail.md`, or its `AGENTS.md` for everything else.

Commands: `/ponytail [lite|full|ultra|off]`, `/ponytail-review`,
`/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`, `/ponytail-help`.

**Use it here:** the frontend is vanilla HTML/CSS/JS with no build step and the
API is a handful of small functions — keep it that way. Prefer extending an
existing function folder over adding a new one, and run `/ponytail-review` on the
diff before opening a PR. Minimalism never licenses weakening admin auth, input
validation, or rate limiting.

### 2. marketing skills — copy and public-facing presentation

<https://github.com/coreyhaines31/marketingskills>

```bash
npx skills add coreyhaines31/marketingskills
# or a subset:
npx skills add coreyhaines31/marketingskills --skill copywriting social seo-audit
```

Claude Code plugin:

```
/plugin marketplace add coreyhaines31/marketingskills
/plugin install marketing-skills
```

**Use it here:** the public dashboard is the product's front door. Use these
skills for headline and stat-card copy, the "how it works" explainer, social
posts when a qualifying event lands, README polish, and basic SEO/schema work on
the public page. Keep the voice light and Cubs-flavoured, and never imply an
endorsement by the Cubs, MLB, or Chick-fil-A.

### 3. business analysis skills — framing before building

<https://github.com/45ck/business-analysis-skills>

```bash
git clone https://github.com/45ck/business-analysis-skills.git
cd business-analysis-skills
bash install.sh          # installs to ~/.claude/skills/ and ~/.agents/skills/
```

Project-level instead: `cp -R .claude .agents /path/to/this-repo/`.

Useful entry points: `/business-problem-framing`, `/requirements-elicitation`,
`/acceptance-criteria-writer`, `/business-rule-extraction`,
`/assumptions-constraints-log`, `/requirements-quality-check`.

**Use it here:** the qualifying-event definition *is* a business rule — 3
strikeouts, one inning, Cubs pitcher, home game, redeem the next day. Any change
to detection logic should start with `/business-rule-extraction` and end with
written acceptance criteria, because a wrong rule silently produces wrong data
for a whole season.

### How they fit together

1. **Frame** with business-analysis skills — what problem, whose, done when?
2. **Draft** any public-facing wording with the marketing skills.
3. **Build** under ponytail — the smallest change that ships it.
4. **Verify** locally against the API and the dashboard.
5. **Commit** using Conventional Commits, one logical change at a time.

## Key Patterns

- **API Structure**: Each function folder contains `function.json` and `index.js`
- **Authentication**: Custom password header validation on write endpoints
- **Frontend**: Vanilla JS with no build step—served as-is by SWA
- **Year Partitioning**: Events organized by calendar year in Table Storage
