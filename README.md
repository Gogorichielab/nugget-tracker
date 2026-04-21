# 🟦 Nugget Tracker

[![Azure SWA CI/CD](https://github.com/Gogorichielab/nugget-tracker/actions/workflows/azure-static-web-apps-victorious-cliff-0a4b70b0f.yml/badge.svg)](https://github.com/Gogorichielab/nugget-tracker/actions/workflows/azure-static-web-apps-victorious-cliff-0a4b70b0f.yml) [![MLB Sync Nightly](https://github.com/Gogorichielab/nugget-tracker/actions/workflows/mlb-sync-nightly.yml/badge.svg)](https://github.com/Gogorichielab/nugget-tracker/actions/workflows/mlb-sync-nightly.yml) [![Maintenance](https://github.com/Gogorichielab/nugget-tracker/actions/workflows/maintenance.yml/badge.svg)](https://github.com/Gogorichielab/nugget-tracker/actions/workflows/maintenance.yml)

Free Chick-fil-A nuggets. Every time a Cubs pitcher strikes out **3 batters in a single inning** at home.

We're keeping score so you don't have to. 🍟

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


