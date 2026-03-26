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

## Configuration
- All config via ENV variables defined in `src/lib/config/env.ts`
- 40+ variables covering API keys, HubSpot field mappings, feature flags
- See `.sample.env` for full reference
