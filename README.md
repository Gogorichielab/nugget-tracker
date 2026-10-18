# Nugget Tracker

A Chicago Cubs fan project celebrating the 2026 season and the **free Chick-fil-A breakfast biscuit** promotion. A qualifying three-strikeout inning at a Cubs home game could unlock a Chicken Biscuit or Spicy Chicken Biscuit offer at participating restaurants, subject to the promotion's terms.

The season is over. The [website](https://github.com/Gogorichielab/nugget-tracker) now serves as a cinematic season recap and archive—not a promise that the promotion will return.

## What it does

- **Season recap:** Wrigley-inspired homepage with 2026 statistics and qualifying events.
- **Event archive:** Browse recorded qualifying innings and the associated breakfast-offer dates. Recorded events are not verified customer redemptions.
- **Automatic updates:** GitHub Actions runs the MLB event synchronization workflow.
- **Admin tools:** Protected interface for managing recorded events.

## Built with

Vanilla HTML, CSS and JavaScript · Azure Static Web Apps · Azure Functions (Node.js) · Azure Table Storage · GitHub Actions.

The frontend lives in `src/`, API functions in `api/`, and automation in `.github/workflows/`.

## Development

```bash
cd api
npm ci
npm test
```

The public frontend uses static files in `src/` and requires no build step. The API requires Azure configuration for storage and admin authentication; never commit credentials.

For contributor and environment details, see [AGENTS.md](AGENTS.md). For CI/CD rollout and operational checks, see [workflow adoption notes](docs/workflow-template-adoption.md).

## Deployment

Changes to `main` deploy through the Azure Static Web Apps GitHub Actions workflow. The separate MLB sync and maintenance workflows handle their respective schedules. Pull-request previews depend on repository configuration and environment permissions.

[Deployment workflow](.github/workflows/azure-static-web-apps-victorious-cliff-0a4b70b0f.yml) · [MLB sync](.github/workflows/mlb-sync-nightly.yml) · [Maintenance](.github/workflows/maintenance.yml)

---

*Independent fan project. Not affiliated with the Chicago Cubs, MLB, or Chick-fil-A.*
