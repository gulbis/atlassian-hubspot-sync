# MPAC → HubSpot Property Map

Field mapping reference for the Atlassian Marketplace (MPAC) to HubSpot CRM sync engine. Updated 2026-03-31.

## HubSpot Custom Properties Required

These custom contact properties must exist in HubSpot before running the sync.
Group: `atlassian_licensing`. All are single-line text fields.

### Contact Properties (custom, in `atlassian_licensing` group)

| Property Name | Label | Purpose |
|---|---|---|
| `contact_type` | Contact Type | Four-tier classification: certified_partner / partner / atlassian_expert / customer |
| `region` | Region | Geographic region from MPAC |
| `aa_products` | Products | Semicolon-separated addon keys |
| `related_products` | Related Products | Semicolon-separated platform names (Jira, Confluence) |
| `deployment` | Deployment | Semicolon-separated: Server, Cloud, Data Center |
| `license_tier` | License Tier | Highest user tier across all licenses |
| `last_mpac_event` | Last MPAC Event | Most recent license/transaction date |
| `associated_partner` | Last Associated Partner | Domain of most recent partner contact |
| `utm_channel` | UTM Channel | Marketing channel (e.g., Organic Search, Paid Search, Direct) |
| `utm_source` | UTM Source | Traffic source (e.g., google, bing) |
| `utm_medium` | UTM Medium | Marketing medium (e.g., cpc, email) |
| `utm_campaign` | UTM Campaign | Campaign name |
| `utm_term` | UTM Term | Search keyword / term |
| `utm_content` | UTM Content | Ad content identifier |
| `utm_referrer` | UTM Referrer | Referring domain (e.g., www.google.com) |

### Contact Properties (HubSpot built-in, no creation needed)

| Property Name | Label | Purpose |
|---|---|---|
| `email` | Email | Contact identifier (upsert key) |
| `firstname` | First Name | From MPAC tech/billing contact |
| `lastname` | Last Name | From MPAC tech/billing contact |
| `phone` | Phone | From MPAC tech contact |
| `city` | City | From MPAC tech contact |
| `state` | State | From MPAC tech contact |
| `country` | Country | From MPAC license/transaction |
| `hs_google_click_id` | Google Click ID | GCLID extracted from Marketplace URL |

### Deal Properties (custom, in `atlassian_licensing` group)

See `docs/ENV_REFERENCE.md` for full deal property list (15 properties configured via ENV vars).

## MPAC License Fields → HubSpot

| MPAC Field (License) | HubSpot Target | Entity |
|---|---|---|
| `contactDetails.technicalContact.email` | `email` | Contact |
| `contactDetails.technicalContact.name` | `firstname` + `lastname` | Contact |
| `contactDetails.technicalContact.phone` | `phone` | Contact |
| `contactDetails.technicalContact.city` | `city` | Contact |
| `contactDetails.technicalContact.state` | `state` | Contact |
| `contactDetails.technicalContact.address1` | *Used in scoring only* | -- |
| `contactDetails.technicalContact.address2` | *Not mapped* | -- |
| `contactDetails.technicalContact.postcode` | *Not mapped* | -- |
| `contactDetails.billingContact.*` | Same as tech contact (merged) | Contact |
| `contactDetails.company` | `name` | Company |
| `contactDetails.country` | `country` (Contact) + custom field (Deal) | Contact + Deal |
| `contactDetails.region` | custom `region` | Contact |
| `addonLicenseId` | custom `addonlicenseid` | Deal |
| `appEntitlementId` | custom `entitlement_id` | Deal |
| `appEntitlementNumber` | custom `entitlement_number` | Deal |
| `licenseId` | *Used for matching only* | -- |
| `addonKey` | custom `aa_app` (Deal) + custom `aa_products` (Contact) | Deal + Contact |
| `addonName` | `dealname` (via Mustache template) | Deal |
| `hosting` | custom `deployment` | Deal + Contact |
| `tier` | custom `license_tier` | Deal + Contact |
| `maintenanceStartDate` | `closedate` (Deal) + custom `last_mpac_event` (Contact) | Deal + Contact |
| `maintenanceEndDate` | custom `maintenance_end_date` | Deal |
| `licenseType` | *Determines deal stage (eval vs purchase)* | -- |
| `status` | *Determines closed-lost for evals* | -- |
| `lastUpdated` | *Used for merge priority ordering* | -- |
| `evaluationOpportunitySize` | *Fallback for tier parsing* | -- |
| `partnerDetails.partnerName` | *Not mapped* | -- |
| `partnerDetails.partnerType` | *Not mapped* | -- |
| `partnerDetails.billingContact.email` | custom `associated_partner` (domain only) | Deal + Contact |
| `partnerDetails.billingContact.name` | *Not mapped* | -- |
| `attribution.channel` | custom `utm_channel` (normalized) | Contact |
| `attribution.referrerDomain` | custom `utm_referrer` | Contact |
| `attribution.campaignName` | custom `utm_campaign` | Contact |
| `attribution.campaignSource` | custom `utm_source` | Contact |
| `attribution.campaignMedium` | custom `utm_medium` | Contact |
| `attribution.campaignContent` | `hs_google_click_id` (if GCLID pattern `Cj...`), else custom `utm_content` | Contact |
| `parentProductBillingCycle` | *Not mapped* | -- |
| `parentProductName` | *Not mapped* | -- |
| `parentProductEdition` | *Not mapped* | -- |
| `installedOnSandbox` | *Not mapped* | -- |
| `evaluationLicense` | *Used for eval→purchase linking* | -- |
| `daysToConvertEval` | *Not mapped* | -- |
| `evaluationStartDate` | *Not mapped* | -- |
| `evaluationEndDate` | *Not mapped* | -- |
| `evaluationSaleDate` | *Not mapped* | -- |

## MPAC Transaction Fields → HubSpot

| MPAC Field (Transaction) | HubSpot Target | Entity |
|---|---|---|
| `transactionId` | custom `transactionid` | Deal |
| `transactionLineItemId` | custom `transaction_line_item_id` | Deal |
| `addonLicenseId` | custom `addonlicenseid` | Deal |
| `appEntitlementId` | custom `entitlement_id` | Deal |
| `appEntitlementNumber` | custom `entitlement_number` | Deal |
| `licenseId` | *Used for matching only* | -- |
| `addonKey` | custom `aa_app` (Deal) + custom `aa_products` (Contact) | Deal + Contact |
| `addonName` | `dealname` (via Mustache template) | Deal |
| `customerDetails.technicalContact.email` | `email` | Contact |
| `customerDetails.technicalContact.name` | `firstname` + `lastname` | Contact |
| `customerDetails.billingContact.*` | Same as tech contact (merged) | Contact |
| `customerDetails.company` | `name` | Company |
| `customerDetails.country` | `country` (Contact) + custom field (Deal) | Contact + Deal |
| `customerDetails.region` | custom `region` | Contact |
| `purchaseDetails.saleDate` | `closedate` | Deal |
| `purchaseDetails.saleType` | custom `sale_type` + determines deal stage | Deal |
| `purchaseDetails.tier` | custom `license_tier` | Deal + Contact |
| `purchaseDetails.hosting` | custom `deployment` | Deal + Contact |
| `purchaseDetails.vendorAmount` | `amount` | Deal |
| `purchaseDetails.purchasePrice` | *Not mapped* | -- |
| `purchaseDetails.billingPeriod` | *Not mapped* | -- |
| `purchaseDetails.licenseType` | *Not mapped* | -- |
| `purchaseDetails.maintenanceStartDate` | custom `maintenance_end_date` (end, not start) | Deal |
| `purchaseDetails.maintenanceEndDate` | custom `maintenance_end_date` | Deal |
| `partnerDetails.partnerName` | *Not mapped* | -- |
| `partnerDetails.partnerType` | *Not mapped* | -- |
| `partnerDetails.billingContact.email` | custom `associated_partner` (domain only) | Deal + Contact |
| `partnerDetails.billingContact.name` | *Not mapped* | -- |
| `lastUpdated` | *Used for merge ordering only* | -- |

## MPAC Marketing-Attribution Endpoint → HubSpot

**Endpoint:** `POST /rest/2/vendors/{sellerId}/reporting/marketing-attribution/async/export`

This is a separate MPAC API endpoint that returns per-touchpoint marketing attribution data. Each record represents one user visit to the Marketplace listing, with the full page URL including UTM params, GCLIDs, and Google Ads metadata.

**Relationship:** One-to-many — a single license can have multiple touchpoints (avg ~5.7). The engine selects the best touchpoint per contact (GCLID-bearing preferred, then most recent).

**Join keys:** Touchpoints are matched to licenses via `appEntitlementId` (63% coverage) or `addonLicenseId` (37%). Combined, these cover all records.

**Data coverage:** Active for 2026 and ongoing. ~3,500 touchpoints per quarter. Historical data available via `startDate` parameter.

| MPAC Field (Touchpoint) | HubSpot Target | Entity | Notes |
|---|---|---|---|
| `channel` | custom `utm_channel` (normalized) | Contact | e.g., "paid-search-non-branded" → "Paid Search" |
| `referrerDomain` | custom `utm_referrer` | Contact | Full URL form (e.g., `https://www.google.com/`) |
| `marketplaceURL` → `gclid` param | `hs_google_click_id` | Contact | Parsed from URL query string |
| `marketplaceURL` → `utm_source` param | custom `utm_source` | Contact | Parsed from URL; falls back to `campaignSource` |
| `marketplaceURL` → `utm_medium` param | custom `utm_medium` | Contact | Parsed from URL; falls back to `campaignMedium` |
| `marketplaceURL` → `utm_campaign` param | custom `utm_campaign` | Contact | Parsed from URL; falls back to `campaignName` |
| `marketplaceURL` → `utm_term` param | custom `utm_term` | Contact | Parsed from URL |
| `marketplaceURL` → `utm_content` param | custom `utm_content` | Contact | Parsed from URL; falls back to `campaignContent` |
| `campaignSource` | custom `utm_source` | Contact | Fallback if URL has no `utm_source` |
| `campaignMedium` | custom `utm_medium` | Contact | Fallback if URL has no `utm_medium` |
| `campaignName` | custom `utm_campaign` | Contact | Fallback if URL has no `utm_campaign` |
| `appEntitlementId` | *Join key to License* | -- | Cloud/DC licenses |
| `addonLicenseId` | *Join key to License* | -- | Older Server/DC licenses |
| `appEntitlementNumber` | *Join key (unused)* | -- | |
| `eventTimestamp` | *Used for recency selection* | -- | |
| `userId` | *Not mapped* | -- | |
| `userType` | *Not mapped* | -- | |
| `marketplaceURL` → `gbraid` | *Not mapped* | -- | Google Ads cookie ID |
| `marketplaceURL` → `hsa_*` params | *Not mapped* | -- | Google Ads metadata |

### Dual-Source Attribution Strategy

The engine uses two data sources for attribution, applied in priority order:

| Source | API | Date Range | Data | Status |
|---|---|---|---|---|
| **Source B** (preferred) | `/marketing-attribution/async/export` | 2018+ (via startDate) | Per-touchpoint with full URL | Active |
| **Source A** (fallback) | License export `attribution.*` fields | 2018-07-01 to 2025-10-06 | Aggregated per license | Dead after Oct 2025 |

### Touchpoint Selection Priority

| Priority | Rule |
|---|---|
| 1 | **Source B** (marketing-attribution) preferred over Source A (license export) |
| 2 | **GCLID-bearing touchpoint** preferred over non-GCLID (regardless of recency) |
| 3 | **Most recent** touchpoint by `eventTimestamp` among equal-priority |
| 4 | **URL params** preferred over top-level API fields for UTM values |
| 5 | Literal `"null"` string values filtered out |

### Channel Normalization (`utm_channel` values)

| MPAC Channel (Source A) | MPAC Channel (Source B) | Normalized Value |
|---|---|---|
| Organic search | organic | Organic Search |
| Paid Search | paid-search-non-branded | Paid Search |
| — | paid-search-branded | Paid Search (Branded) |
| Direct | direct | Direct |
| Referral | referral-external | Referral |
| — | referral-internal | Referral (Internal) |
| — | self-referral | Self-Referral |
| — | in-product-referral | In-Product Referral |
| Email | email | Email |
| Social | unpaid-social | Social |
| Paid Social | paid-social | Paid Social |
| Paid Display | paid-display | Paid Display |
| Paid Other | paid-affiliate | Paid Affiliate |
| Atlassian | — | Atlassian |
| Atlassian Comarketing | — | Atlassian Comarketing |
| Other | other | Other |

### GCLID Extraction

GCLIDs are extracted from two locations:

1. **Source B `marketplaceURL`** — parsed from `gclid=` query parameter (e.g., `?gclid=Cj0KCQ...`)
2. **Source A `campaignContent`** — matched against Base64 GCLID pattern (`/^Cj[A-Za-z0-9_-]{60,120}$/`)

Extracted GCLIDs are written to HubSpot's built-in `hs_google_click_id` property, which integrates with Google Ads conversion tracking.

## Computed/Derived HubSpot Fields (no direct MPAC source)

| HubSpot Field | Derived From | Entity |
|---|---|---|
| `contact_type` | Email domain matched against partner pipeline deal stages | Contact |
| `related_products` | `addonKey` → platform via `ADDONKEY_PLATFORMS` mapping | Contact + Deal |
| `dealname` | Mustache template (`DEAL_DEALNAME`) rendered with record fields | Deal |
| `dealstage` | Event type: eval→Eval, purchase/renewal/upgrade→Won, refund→Lost | Deal |
| `pipeline` | Always `HUBSPOT_PIPELINE_MPAC` (hardcoded isolation) | Deal |
| `amount` | Eval→null, License→0, Transaction→vendorAmount | Deal |
| `origin` | Static value from `DEAL_ORIGIN` env var | Deal |
| `Company.type` | `PARTNER` if any associated contact is in partner domain set | Company |
| `duplicate_of` | Deal ID if duplicate detected during matching | Deal |

## Summary of Unmapped MPAC Fields

These 14 fields are available from the MPAC API but **not written to HubSpot**:

| Category | Fields |
|---|---|
| **Parent product** (4) | parentProductBillingCycle, parentProductName, parentProductEdition, installedOnSandbox |
| **Evaluation** (4) | daysToConvertEval, evaluationStartDate, evaluationEndDate, evaluationSaleDate |
| **Contact address** (2) | address2, postcode |
| **Partner detail** (2) | partnerName, partnerType |
| **Transaction** (2) | purchasePrice, billingPeriod |

The parent product fields are the most notable gap — they could power host-product segmentation in HubSpot if mapped.

## Key Transformation Logic

### Contact Type (4-tier priority)
1. Email domain in `eazybiCertifiedPartnerDomains` → `certified_partner`
2. Email domain in `eazybiPartnerDomains` → `partner`
3. Email domain in `partnerDomains` (Atlassian) → `atlassian_expert`
4. Everything else → `customer`

### Deal Stage from Event Type
- `EvalEvent` (licenseType = EVALUATION/OPEN_SOURCE) → Eval stage (or Closed Lost if inactive)
- `PurchaseEvent` (New transaction or commercial license) → Closed Won
- `RenewalEvent` → Closed Won
- `UpgradeEvent` → Closed Won
- `RefundEvent` → Closed Lost (amount = 0)
- `PartnerOnlyEvent` / `MassProviderOnlyEvent` / `ArchivedAppEvent` → No-op (no deal created)

### Deal Amount
- Eval → `null`
- License (no transaction) → `0`
- Transaction → `vendorAmount`

### License Tier Parsing
- `"Unlimited Users"` → 10001
- `"X Users"` → X (integer)
- `"Subscription"` / `"Evaluation"` / `"Demonstration License"` → -1 (fallback to evaluationOpportunitySize)

### Contact Merge Priority
- `contactType`: highest tier wins (certified > partner > atlassian_expert > customer)
- `firstName` + `lastName`: prefer source with both; else any with first; else any with last
- `phone`, `city`, `state`: first non-empty source
- `products`, `deployment`: union of all values
- `licenseTier`: maximum value across all records
- `lastMpacEvent`: most recent date
