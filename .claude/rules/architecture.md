# Architecture Rules

## Entity Pattern
- All HubSpot entities extend `Entity` base class in `src/lib/hubspot/entity.ts`
- `data` = mutable current state, `downloadedData` = original from HubSpot API
- Entity changes are tracked in-memory, then batch-synced via `uploader.ts`
- EntityManagers (DealManager, ContactManager, CompanyManager) in `manager.ts` track created/updated/deleted

## MPAC Data
- License and Transaction records are immutable after import
- MarketplaceAPI facade (`src/lib/marketplace/api/api.ts`) delegates to async or sync API based on `MPAC_USE_ASYNC_APIS` env var

## License Matching
- Similarity scoring in `src/lib/license-matching/similarity-scorer.ts`
- Compares: address, company name, phone, email, contact name
- Groups related licenses within 90-day windows
- Results feed into deal generation

## Deal Generation
- Events generated from matched license groups in `src/lib/deal-generator/events.ts`
- Actions (create/update deals) in `src/lib/deal-generator/actions.ts`
- Deal types: eval, purchase, renewal, upgrade, refund

## Sync State & Incremental Sync
- `data/sync-state.json` tracks last sync timestamp, baseline dataset ID, and failed uploads
- `data/sync-log.jsonl` — append-only JSONL log of every sync run with per-entity stats
- Download orchestrator (`src/lib/engine/download-orchestrator.ts`) decides full vs incremental
- Merge logic (`src/lib/engine/incremental-download.ts`) combines delta with baseline by `licenseId`/`transactionId`
- Engine always receives a complete `RawDataSet` — it never knows about sync modes

## Configuration
- All config via ENV variables defined in `src/lib/config/env.ts`
- 50+ variables covering API keys, HubSpot field mappings, feature flags, sync configuration
- See `.sample.env` for full reference
