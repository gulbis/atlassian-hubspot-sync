# Deployment Guide

## Overview

The sync engine downloads Atlassian Marketplace (MPAC) licensing data and uploads it to HubSpot CRM as contacts, companies, and deals. It runs as either:

- **Loop mode** (`npm start` / Docker): runs continuously on a configurable interval
- **Single-run mode** (`npm run sync`): runs once and exits (for cron/scheduled execution)

## Prerequisites

- Node.js 16+
- Atlassian Marketplace vendor API credentials
- HubSpot Private App token with CRM read/write scopes
- HubSpot custom properties created (see below)

## Environment Variables

Copy `.sample.env` to `.env` and fill in all values. See `docs/ENV_REFERENCE.md` for the complete list.

### Critical Variables

| Variable | Description |
|---|---|
| `HUBSPOT_ACCESS_TOKEN` | HubSpot Private App token |
| `MPAC_USER` | Atlassian Marketplace API username (email) |
| `MPAC_API_KEY` | Atlassian Marketplace API token |
| `MPAC_SELLER_ID` | Atlassian vendor ID (comma-separated for multiple) |
| `MPAC_USE_ASYNC_APIS` | Set to `true` for async MPAC API (recommended) |
| `HUBSPOT_PIPELINE_MPAC` | Atlassian Licensing pipeline ID |
| `HUBSPOT_DEALSTAGE_EVAL` | Eval deal stage ID |
| `HUBSPOT_DEALSTAGE_CLOSED_WON` | Closed Won deal stage ID |
| `HUBSPOT_DEALSTAGE_CLOSED_LOST` | Closed Lost deal stage ID |
| `RUN_INTERVAL` | Time between sync runs (e.g., `24h`, `12h`) |
| `RETRY_INTERVAL` | Time between retries on error (e.g., `5m`) |
| `RETRY_TIMES` | Number of retries before Slack alert |
| `FULL_SYNC_INTERVAL_DAYS` | Force full re-download every N days (default: `7`) |
| `INCREMENTAL_OVERLAP_DAYS` | Days of overlap for incremental ranges (default: `1`) |
| `UPLOAD_MAX_RETRY_COUNT` | Max retries for failed uploads (default: `3`) |

### HubSpot Scopes Required

The Private App needs these scopes:
- `crm.objects.contacts.read`
- `crm.objects.contacts.write`
- `crm.objects.companies.read`
- `crm.objects.companies.write`
- `crm.objects.deals.read`
- `crm.objects.deals.write`

**Do NOT leave `crm.schemas.*.write` enabled** — only needed for one-time property creation.

## HubSpot Custom Properties

These must exist before running. Created via API (see `/tmp/hs-create-utm-properties.js` and `/tmp/hs-setup-stage4.js`).

### Pipeline
- "Atlassian Licensing" pipeline with stages: Eval, Closed Won, Closed Lost

### Contact Properties (in `atlassian_licensing` group)
- `contact_type`, `region`, `aa_products`, `related_products`, `deployment`
- `license_tier`, `last_mpac_event`, `associated_partner`
- `utm_channel`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_referrer`

### Deal Properties (in `atlassian_licensing` group)
- See `docs/ENV_REFERENCE.md` for full list (15 custom properties configured via ENV)

## Docker Deployment

### Build

```bash
docker build -t atlassian-hubspot-sync .
```

### Run with docker-compose (recommended)

```bash
docker compose up -d          # Start in loop mode (background)
docker compose logs -f        # Follow logs
docker compose down           # Stop
docker compose up -d --build  # Rebuild and restart after code changes
```

The `sync-data` volume persists downloaded MPAC/HubSpot data, sync state (`sync-state.json`), and sync logs (`sync-log.jsonl`) between container rebuilds. Critical for incremental sync — without persistent data, every run falls back to full download.

### Run without docker-compose

```bash
# Loop mode (continuous)
docker run -d \
  --name atlassian-hubspot-sync \
  --env-file .env \
  -v sync-data:/usr/src/app/data \
  --restart unless-stopped \
  atlassian-hubspot-sync

# Single sync (run once and exit)
docker run --rm \
  --env-file .env \
  -v sync-data:/usr/src/app/data \
  atlassian-hubspot-sync \
  node out/bin/run-sync.js

# Force full re-download
docker run --rm \
  --env-file .env \
  -v sync-data:/usr/src/app/data \
  atlassian-hubspot-sync \
  node out/bin/run-sync.js --full
```

### Logs

```bash
docker logs -f atlassian-hubspot-sync

# View sync log (structured JSONL)
docker exec atlassian-hubspot-sync cat data/sync-log.jsonl | jq .

# View sync state
docker exec atlassian-hubspot-sync cat data/sync-state.json | jq .
```

## CLI Commands

| Command | Description |
|---|---|
| `npm run sync` | Single-run sync (incremental by default) |
| `npm run sync -- --full` | Force full re-download of all data |
| `npm start` | Loop: repeats on `RUN_INTERVAL` (auto incremental/full) |
| `npm run download` | Download data only (incremental by default) |
| `npm run download -- --full` | Full download |
| `npm run sample` | Fast dry-run on 10 contacts (~5 sec) |
| `npm run once` | Full dry-run, no uploads |
| `npm run dry-run` | Full dry-run with structured report |
| `npm test` | Run all tests (build first!) |

## Monitoring

### Slack Alerts
Configure `SLACK_API_TOKEN` and `SLACK_ERROR_CHANNEL_ID` in `.env`. The loop runner sends Slack notifications after `RETRY_TIMES` consecutive failures.

### Data Volume
Each sync run saves data to `data/in-{timestamp}/`. The pruner automatically removes old data sets based on `KEEP_DATA_SETS` schedule.

### Health Check
For Docker health monitoring:
- The process exits with code 1 on fatal errors (`npm run sync`)
- The loop mode (`npm start`) retries automatically and alerts via Slack

## Typical Sync Timing

| Phase | Full Sync | Incremental Sync |
|---|---|---|
| Download (MPAC + HubSpot) | ~10-15 min | ~1-2 min |
| Engine processing | ~7 min | ~7 min |
| Upload | ~1-5 min | ~1-2 min |
| **Total per sync** | **~18-27 min** | **~3-5 min** |

The first sync is always full. Subsequent daily syncs are incremental (only MPAC records changed since last sync). A full sync runs automatically every `FULL_SYNC_INTERVAL_DAYS` (default 7) or on `--full` flag.

## Rollback

### Property values on existing records
HubSpot Settings → Account Management → Backups (14-day retention)

### New records created by sync
Search by `createdate` > sync start time → batch archive via API

### Deals
Filter by pipeline `3682953436` + `createdate` → batch archive

## Security Notes

- Never commit `.env` to git
- Rotate HubSpot tokens periodically
- Remove `crm.schemas.*.write` scope after property creation
- The sync only writes to the "Atlassian Licensing" pipeline — Partner pipeline is isolated by 5 safeguards
