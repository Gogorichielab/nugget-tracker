# CLAUDE.md — Nugget Tracker

Instructions for Claude Code working in this repository.

> **Read [`agent.md`](agent.md) first.** It is the authoritative, tool-agnostic
> project brief. This file adds the Claude-specific bits and repeats only the
> rules that are easy to get wrong.

---

## Project overview

An Azure Static Web App that tracks qualifying Chicago Cubs pitching performances
which trigger free Chick-fil-A nuggets. A **qualifying event** is any Cubs pitcher
striking out **3 batters in a single inning during a home game** — fans redeem the
following day.

- **Frontend:** vanilla HTML/CSS/JS in `src/` (`index.html` public dashboard,
  `admin.html` password-gated admin panel). No build step.
- **API:** Node.js Azure Functions in `api/` — `events/`, `events-item/`,
  `mlb-sync/`.
- **Storage:** Azure Table Storage table `NuggetEvents`; `PartitionKey` = year,
  `RowKey` = UUID; fields `GameDate`, `RedemptionDate`, `Pitcher`, `Inning`.
- **Auto-detection:** GitHub Actions cron hits `/api/mlb-sync` nightly at 22:30
  UTC, reads the MLB StatsAPI (team ID 112, no key required), and inserts events
  for each pitcher/inning with ≥ 3 Ks, skipping duplicates.
- **Hosting/CI:** Azure Static Web Apps, auto-deploy on push to `main`
  (app location `src`, API location `api`, no output location).

### Non-negotiables

- **Admin auth:** `GET /api/admin/verify` → `POST /api/auth` mints a 1-hour
  HMAC-signed bearer token; admin writes require `Authorization: Bearer <token>`.
  Do **not** reintroduce the old "probe POST then delete the row" login — it could
  create synthetic events on a failed login. `/api/mlb-sync` keeps the legacy
  `x-admin-password` header for the scheduled job only.
- **Secrets:** `ADMIN_PASSWORD`, `ADMIN_PASSWORD_SALT`, `ADMIN_TOKEN_SECRET`,
  `AZURE_STORAGE_CONNECTION_STRING` live in SWA app settings. Never commit real
  values, never log them, never paste them into a PR.
- Keep the frontend build-step-free — it is served as-is by SWA.
- Don't change the year-partitioning scheme; existing rows depend on it.
- Detection logic changes are data-integrity changes: verify against real game
  feeds before merging.
- Colours and fonts are a defined system (Cubs Blue `#0E3386`, Cubs Red `#CC3433`,
  CFA Red `#DD0031`, Gold `#F5C518`, Cream `#f5f0e8`; Bebas Neue + DM Sans) — use
  the tokens, don't invent new ones.

Local setup, `local.settings.json`, and the SWA CLI commands are in
[`agent.md`](agent.md#development-setup).

---

## Commit conventions

**Every commit must follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).**
This replaces the older `[type] description` bracket style seen in this repo's
history — don't mix the two.

```
<type>(<optional scope>): <imperative description>

<optional body explaining why>

<optional footers — Refs: #42, BREAKING CHANGE: ...>
```

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
  `ci`, `chore`, `revert`.
- Scopes used here: `api`, `events`, `admin`, `auth`, `mlb-sync`, `ui`, `style`,
  `storage`, `swa`, `deps`.
- Imperative mood, no trailing period, subject ≤ 72 chars.
- Breaking = changed API contract, Table Storage key change, or renamed env var.
  Use `type(scope)!:` and/or a `BREAKING CHANGE:` footer.
- One logical change per commit. PR titles use the same format — squash merges
  take the PR title, so a bad title becomes a bad commit.

```
feat(events): add filtering by date range
fix(mlb-sync): count strikeouts only in the top half of the inning
style(ui): update Cubs colour palette
ci(swa): update the Static Web Apps deploy workflow
```

Full type table and more examples: [`agent.md`](agent.md#commit-conventions--conventional-commits).

---

## Skills to use

| Skill pack | Install (Claude Code) | Use it for |
|---|---|---|
| [ponytail](https://github.com/DietrichGebert/ponytail) | `/plugin marketplace add DietrichGebert/ponytail` then `/plugin install ponytail@ponytail` (two separate prompts) | Default posture for all code work — vanilla frontend, small functions, no build step. `/ponytail-review` the diff before every PR. |
| [marketing skills](https://github.com/coreyhaines31/marketingskills) | `/plugin marketplace add coreyhaines31/marketingskills` then `/plugin install marketing-skills` — or `npx skills add coreyhaines31/marketingskills` | Dashboard headlines and stat-card copy, the "how it works" explainer, social posts when an event lands, README polish, SEO/schema on the public page. |
| [business analysis skills](https://github.com/45ck/business-analysis-skills) | `git clone https://github.com/45ck/business-analysis-skills.git && cd business-analysis-skills && bash install.sh` | The qualifying-event definition is a business rule — use `/business-rule-extraction` and `/acceptance-criteria-writer` before changing detection logic. |

Ponytail's minimalism never licenses weakening admin auth, input validation, or
rate limiting. Keep marketing copy free of any implied endorsement by the Cubs,
MLB, or Chick-fil-A.

Order of operations: **frame** (business analysis) → **draft copy** (marketing) →
**build** (ponytail) → **verify against the API and dashboard** → **commit**
(Conventional Commits).

Handy commands: `/ponytail-review`, `/ponytail-audit`, `/business-problem-framing`,
`/business-rule-extraction`, `/acceptance-criteria-writer`,
`/requirements-quality-check`.

Details, non-Claude install paths, and per-skill guidance: [`agent.md`](agent.md#skills-to-use).
