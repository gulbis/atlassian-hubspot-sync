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

### Run (loop mode)

```bash
docker run -d \
  --name atlassian-hubspot-sync \
  --env-file .env \
  -v sync-data:/usr/src/app/data \
  --restart unless-stopped \
  atlassian-hubspot-sync
```

The `data` volume persists downloaded MPAC/HubSpot data between runs.

### Run (single sync)

```bash
docker run --rm \
  --env-file .env \
  -v sync-data:/usr/src/app/data \
  atlassian-hubspot-sync \
  node out/bin/run-sync.js
```

### Logs

```bash
docker logs -f atlassian-hubspot-sync
```

## CLI Commands

| Command | Description |
|---|---|
| `npm run sync` | Single-run: download → engine → upload → exit |
| `npm start` | Loop: same, repeats on `RUN_INTERVAL` |
| `npm run sample` | Fast dry-run on 10 contacts (~5 sec) |
| `npm run once` | Full dry-run, no uploads |
| `npm run dry-run` | Full dry-run with structured report |
| `npm run download` | Download data only |
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

| Phase | Duration |
|---|---|
| Download (MPAC + HubSpot) | ~2 min |
| Engine processing | ~7 min |
| Upload (incremental changes) | ~1-5 min (depends on changes) |
| **Total per sync** | **~10-15 min** |

First sync after deployment may take longer if there are many new records.

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
