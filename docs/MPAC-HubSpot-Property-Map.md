# MPAC → HubSpot Property Map

Field mapping reference for the Atlassian Marketplace (MPAC) to HubSpot CRM sync engine. Generated 2026-03-31.

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
| `attribution.channel` | `hs_analytics_source` (mapped to enum) | Contact |
| `attribution.referrerDomain` | `hs_analytics_first_referrer` | Contact |
| `attribution.campaignName` | `hs_analytics_first_touch_converting_campaign` | Contact |
| `attribution.campaignSource` | `hs_analytics_source_data_1` | Contact |
| `attribution.campaignMedium` | `hs_analytics_source_data_2` | Contact |
| `attribution.campaignContent` | `hs_google_click_id` (if GCLID pattern `Cj...`) | Contact |
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

Source B: REST v2 `/marketing-attribution/async/export` — per-touchpoint data with full URLs.
One-to-many relationship (multiple touchpoints per license). Joined via `appEntitlementId` or `addonLicenseId`.

| MPAC Field (Touchpoint) | HubSpot Target | Entity | Notes |
|---|---|---|---|
| `channel` | `hs_analytics_source` (mapped to enum) | Contact | e.g., "paid-search-non-branded" → `PAID_SEARCH` |
| `referrerDomain` | `hs_analytics_first_referrer` | Contact | Full URL form (e.g., `https://www.google.com/`) |
| `marketplaceURL` → `gclid` param | `hs_google_click_id` | Contact | Parsed from URL query string |
| `marketplaceURL` → `utm_source` param | `hs_analytics_source_data_1` | Contact | Parsed from URL; falls back to `campaignSource` |
| `marketplaceURL` → `utm_medium` param | `hs_analytics_source_data_2` | Contact | Parsed from URL; falls back to `campaignMedium` |
| `marketplaceURL` → `utm_campaign` param | `hs_analytics_first_touch_converting_campaign` | Contact | Parsed from URL; falls back to `campaignName` |
| `campaignSource` | `hs_analytics_source_data_1` | Contact | Fallback if URL has no `utm_source` |
| `campaignMedium` | `hs_analytics_source_data_2` | Contact | Fallback if URL has no `utm_medium` |
| `campaignName` | `hs_analytics_first_touch_converting_campaign` | Contact | Fallback if URL has no `utm_campaign` |
| `appEntitlementId` | *Join key to License* | -- | 63% of touchpoints |
| `addonLicenseId` | *Join key to License* | -- | 37% of touchpoints |
| `appEntitlementNumber` | *Join key (unused)* | -- | |
| `eventTimestamp` | *Used for recency selection* | -- | |
| `userId` | *Not mapped* | -- | |
| `userType` | *Not mapped* | -- | |
| `marketplaceURL` → `utm_content` | *Not mapped* | -- | |
| `marketplaceURL` → `utm_term` | *Not mapped* | -- | |
| `marketplaceURL` → `gbraid` | *Not mapped* | -- | |
| `marketplaceURL` → `hsa_*` params | *Not mapped* | -- | Google Ads metadata |

### Attribution Source Priority

| Priority | Rule |
|---|---|
| 1 | **Source B** (marketing-attribution endpoint) preferred over Source A (license export) |
| 2 | **GCLID-bearing touchpoint** preferred over non-GCLID (regardless of recency) |
| 3 | **Most recent** touchpoint by `eventTimestamp` among equal-priority |
| 4 | **URL params** preferred over top-level API fields for UTM values |
| 5 | Literal `"null"` string values filtered out |

### Channel → `hs_analytics_source` Mapping

| MPAC Channel (Source A) | MPAC Channel (Source B) | HubSpot Value |
|---|---|---|
| Organic search | organic | `ORGANIC_SEARCH` |
| Paid Search | paid-search-non-branded, paid-search-branded | `PAID_SEARCH` |
| Direct | direct | `DIRECT_TRAFFIC` |
| Referral | referral-external, referral-internal | `REFERRALS` |
| Email | email | `EMAIL_MARKETING` |
| Social | unpaid-social | `SOCIAL_MEDIA` |
| Paid Social | paid-social | `PAID_SOCIAL` |
| Paid Display, Paid Other | paid-display, paid-affiliate | `PAID_SEARCH` |
| Atlassian, Other | in-product-referral, self-referral, other | `OTHER_CAMPAIGNS` |
| Atlassian Comarketing | — | `OTHER_CAMPAIGNS` |
| *(unknown)* | *(unknown)* | `OTHER_CAMPAIGNS` |

### Attribution Data Coverage

- **Source A** (license export `attribution.*`): 75.8% of licenses from 2018-07-01 to 2025-10-06. Dead after Oct 2025.
- **Source B** (marketing-attribution endpoint): Active. ~3,500 touchpoints/quarter, ~5.7 touchpoints per entitlement.
- **GCLID**: 8 historical records (Source A), 7 in Q1 2026 (Source B via URL).

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
