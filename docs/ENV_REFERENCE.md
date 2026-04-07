# Environment Variable Reference

Complete reference for every `.env` variable used by the Atlassian-HubSpot sync engine. Variables are read at startup via `src/lib/config/env.ts`. Required variables cause `process.exit(1)` if missing.

**Total: 52 variables** (15 required, 37 optional)

---

## 1. Atlassian Marketplace (MPAC) Credentials

| Variable | Required | Current Value |
|----------|----------|---------------|
| `MPAC_USER` | **YES** | `janis.gulbis@eazybi.com` |
| `MPAC_API_KEY` | **YES** | `ATATT3x...` (set) |
| `MPAC_SELLER_ID` | **YES** | `866502` |
| `MPAC_USE_ASYNC_APIS` | No | `true` |

### `MPAC_USER`
**What:** Email address for Atlassian Marketplace API authentication.
**Where:** `env.ts:34` via `mpacCredsFromENV()`. Passed as HTTP basic auth username.
**Source:** The email of the Atlassian account with Vendor access to your Marketplace listing.

### `MPAC_API_KEY`
**What:** API token for Atlassian Marketplace API authentication.
**Where:** `env.ts:35` via `mpacCredsFromENV()`. Passed as HTTP basic auth password.
**Source:** Generate at Atlassian account settings > API tokens (https://id.atlassian.com/manage-profile/security/api-tokens).

### `MPAC_SELLER_ID`
**What:** Your Atlassian Marketplace vendor account ID(s). Determines which vendor's licenses and transactions are downloaded.
**Where:** `env.ts:36` via `mpacCredsFromENV()`. Split on commas — supports multiple seller IDs.
**Source:** Your Marketplace vendor dashboard URL contains the seller ID. For eazyBI: `866502`.
**Format:** Single ID or comma-separated: `866502` or `866502,123456`

### `MPAC_USE_ASYNC_APIS`
**What:** Whether to use the Atlassian Marketplace async (v2) APIs instead of sync (v1) APIs.
**Where:** `marketplace/api/api.ts:8` (direct `process.env` access, not via env.ts).
**Default:** `undefined` (uses sync APIs). Set to `true` to use async APIs.
**Note:** Atlassian deprecated sync APIs after August 2024. This should be `true`.

---

## 2. HubSpot Credentials & Account

| Variable | Required | Current Value |
|----------|----------|---------------|
| `HUBSPOT_ACCESS_TOKEN` | **YES** | `pat-eu1-911c...` (set) |
| `HUBSPOT_ACCOUNT_ID` | No | `139635503` |
| `HUBSPOT_API_KEY` | DEPRECATED | — |

### `HUBSPOT_ACCESS_TOKEN`
**What:** HubSpot Private App access token for CRM API access.
**Where:** `env.ts:23` via `hubspotCredsFromENV()`. Passed to `@hubspot/api-client`.
**Source:** HubSpot > Settings > Integrations > Private Apps > Create/manage. Requires these scopes:
- `crm.objects.contacts.read` + `crm.objects.contacts.write`
- `crm.objects.companies.read` + `crm.objects.companies.write`
- `crm.objects.deals.read` + `crm.objects.deals.write`
**Format:** `pat-{region}-{uuid}` (e.g., `pat-eu1-...` for EU data center)

### `HUBSPOT_ACCOUNT_ID`
**What:** HubSpot portal/account ID. Used only for generating clickable links to deals in duplicate detection logs.
**Where:** `env.ts:65,95`. Used in `hubspotDealConfigFromENV()` and exported as `hubspotAccountIdFromEnv`.
**Source:** HubSpot > Settings > Account Management > Account & Billing. The number in your HubSpot URL: `app.hubspot.com/contacts/{ACCOUNT_ID}/...`
**Default:** `undefined` — duplicate links won't be generated (non-critical).

### `HUBSPOT_API_KEY` (DEPRECATED)
**What:** Legacy HubSpot API key. No longer functional.
**Where:** `engine/engine.ts:63` — only checked to print a deprecation warning.
**Action:** Do not set. If present, engine prints a warning to migrate to Private App token.

---

## 3. Slack Notifications

| Variable | Required | Current Value |
|----------|----------|---------------|
| `SLACK_API_TOKEN` | No | `xoxb-524...` (set) |
| `SLACK_ERROR_CHANNEL_ID` | No | `C12345ABCDE` (placeholder) |

### `SLACK_API_TOKEN`
**What:** Slack Bot User OAuth token for posting error/warning notifications.
**Where:** `env.ts:50` via `slackConfigFromENV()`. Used by `@slack/web-api` client.
**Source:** Slack App dashboard > OAuth & Permissions > Bot User OAuth Token.
**Format:** `xoxb-{numbers}-{numbers}-{alphanumeric}`
**Note:** Currently optional — can be skipped for initial testing. Errors will only appear in console.

### `SLACK_ERROR_CHANNEL_ID`
**What:** Slack channel ID where error messages are posted.
**Where:** `env.ts:51` via `slackConfigFromENV()`.
**Source:** Right-click channel in Slack > "Copy link" > extract the `C...` ID from the URL.
**Note:** Must be set alongside `SLACK_API_TOKEN` for notifications to work. Bot must be invited to the channel.

---

## 4. Run Loop & Scheduling

| Variable | Required | Current Value |
|----------|----------|---------------|
| `RUN_INTERVAL` | **YES** | `24h` |
| `RETRY_INTERVAL` | **YES** | `10m` |
| `RETRY_TIMES` | **YES** | `3` |

### `RUN_INTERVAL`
**What:** How often the sync engine runs in continuous mode.
**Where:** `env.ts:57` via `runLoopConfigFromENV()`. Parsed by `luxon` duration parser.
**Format:** Duration string: `4h`, `24h`, `1d`, etc.
**Note:** Only applies to continuous loop mode (`npm start`). Ignored by `npm run once`.

### `RETRY_INTERVAL`
**What:** How long to wait between retries after a failed run.
**Where:** `env.ts:58` via `runLoopConfigFromENV()`.
**Format:** Duration string: `10m`, `30m`, `1h`, etc.

### `RETRY_TIMES`
**What:** Maximum number of retries before giving up and waiting for the next regular run.
**Where:** `env.ts:59` via `runLoopConfigFromENV()`. Parsed as integer.
**Format:** Numeric string: `3`, `5`, etc.

---

## 5. HubSpot Pipeline & Deal Stages

| Variable | Required | Current Value | Status |
|----------|----------|---------------|--------|
| `HUBSPOT_PIPELINE_MPAC` | **YES** | `1234567` | PLACEHOLDER |
| `HUBSPOT_DEALSTAGE_EVAL` | **YES** | `1234568` | PLACEHOLDER |
| `HUBSPOT_DEALSTAGE_CLOSED_WON` | **YES** | `1234569` | PLACEHOLDER |
| `HUBSPOT_DEALSTAGE_CLOSED_LOST` | **YES** | `1234570` | PLACEHOLDER |

### `HUBSPOT_PIPELINE_MPAC`
**What:** The HubSpot Pipeline ID where all Atlassian licensing deals are created.
**Where:** `env.ts:67` via `hubspotDealConfigFromENV()`. Maps to `Pipeline.MPAC` in deal creation.
**Source:** HubSpot > Settings > Objects > Deals > Pipelines. Click pipeline name > ID is in the URL or via API: `GET /crm/v3/pipelines/deals`.
**CRITICAL:** Must be a dedicated pipeline (e.g., "Atlassian Licensing"), NOT the Partner pipeline. This is the primary pipeline isolation safeguard.

### `HUBSPOT_DEALSTAGE_EVAL`
**What:** Deal stage ID for evaluation/trial licenses.
**Where:** `env.ts:70`. Maps to `DealStage.EVAL` in deal creation.
**Source:** Same pipeline settings page. Each stage has an internal ID (visible via API or in stage edit URL).

### `HUBSPOT_DEALSTAGE_CLOSED_WON`
**What:** Deal stage ID for purchased/active/renewed licenses.
**Where:** `env.ts:71`. Maps to `DealStage.CLOSED_WON`.

### `HUBSPOT_DEALSTAGE_CLOSED_LOST`
**What:** Deal stage ID for expired, cancelled, or refunded licenses.
**Where:** `env.ts:72`. Maps to `DealStage.CLOSED_LOST`.

> **Action needed:** Create "Atlassian Licensing" pipeline in HubSpot with these 3 stages, then replace placeholder IDs.

---

## 6. HubSpot Deal Field Mappings

These map internal deal properties to HubSpot custom property internal names. The `_ATTR` suffix means "attribute name."

### Required Deal Fields

| Variable | Current Value | Purpose |
|----------|---------------|---------|
| `HUBSPOT_DEAL_ADDONLICENESID_ATTR` | `addonlicenseid` | MPAC addon license ID (primary deal-to-license link) |
| `HUBSPOT_DEAL_APPENTITLEMENTID_ATTR` | `entitlement_id` | MPAC app entitlement ID (secondary link) |
| `HUBSPOT_DEAL_APPENTITLEMENTNUMBER_ATTR` | `entitlement_number` | MPAC app entitlement number (tertiary link) |
| `HUBSPOT_DEAL_TRANSACTIONID_ATTR` | `transactionid` | MPAC transaction ID (links deal to specific transaction) |
| `HUBSPOT_DEAL_TRANSACTIONLINEITEMID_ATTR` | `transaction_line_item_id` | MPAC transaction line item ID (unique within transaction) |

**What these do:** The engine uses these 5 IDs to match existing HubSpot deals to incoming MPAC records. Without them, every run would create duplicate deals. These custom properties **must exist** in HubSpot before the first sync.

**Where:** `env.ts:80-84` via `hubspotDealConfigFromENV()`. Used in `Deal` entity adapter to read/write HubSpot properties.

### Optional Deal Fields

| Variable | Current Value | Purpose |
|----------|---------------|---------|
| `HUBSPOT_DEAL_APP_ATTR` | `aa_app` | Addon key (which app this deal is for) |
| `HUBSPOT_DEAL_DEPLOYMENT_ATTR` | `deployment` | Hosting type: Server, Cloud, Data Center |
| `HUBSPOT_DEAL_SALE_TYPE_ATTR` | `sale_type` | New, Renewal, Upgrade, Refund |
| `HUBSPOT_DEAL_ORIGIN_ATTR` | `origin` | Static origin label (from `DEAL_ORIGIN`) |
| `HUBSPOT_DEAL_COUNTRY_ATTR` | `country` | Customer country |
| `HUBSPOT_DEAL_LICENSE_TIER_ATTR` | `license_tier` | License tier (10 Users, 100 Users, Unlimited, etc.) |
| `HUBSPOT_DEAL_RELATED_PRODUCTS_ATTR` | `related_products` | Static label (from `DEAL_RELATED_PRODUCTS`) |
| `HUBSPOT_DEAL_ASSOCIATED_PARTNER` | `associated_partner` | Partner domain if any record has partner contacts |
| `HUBSPOT_DEAL_DUPLICATEOF_ATTR` | `duplicate_of` | ID of the primary deal (set on duplicate deals) |
| `HUBSPOT_DEAL_MAINTENANCE_END_DATE_ATTR` | `maintenance_end_date` | License/support end date |

**What these do:** If set, these custom properties are populated on deals. If not set (`undefined`), the field is silently skipped — no error, just no data written for that property.

**Where:** `env.ts:75-89` via `hubspotDealConfigFromENV()`.

---

## 7. HubSpot Contact Field Mappings

All optional. If not set, the corresponding data is not written to contacts.

| Variable | Current Value | Purpose |
|----------|---------------|---------|
| `HUBSPOT_CONTACT_DEPLOYMENT_ATTR` | `deployment` | Hosting type from latest license |
| `HUBSPOT_CONTACT_PRODUCTS_ATTR` | `aa_products` | Semicolon-separated list of addon keys |
| `HUBSPOT_CONTACT_LICENSE_TIER_ATTR` | `license_tier` | Highest license tier across all licenses |
| `HUBSPOT_CONTACT_LAST_MPAC_EVENT_ATTR` | `last_mpac_event` | Date of most recent MPAC transaction |
| `HUBSPOT_CONTACT_CONTACT_TYPE_ATTR` | `contact_type` | "Partner" or "Customer" classification |
| `HUBSPOT_CONTACT_REGION_ATTR` | `region` | Geographic region (EMEA, Americas, APAC, Unknown) |
| `HUBSPOT_CONTACT_RELATED_PRODUCTS_ATTR` | `related_products` | Platform names (Confluence, Jira) |
| `HUBSPOT_CONTACT_LAST_ASSOCIATED_PARTNER` | `last_associated_partner` | Most recent partner domain associated |

**Where:** `env.ts:99-108` via `hubspotContactConfigFromENV()`.

---

## 8. Managed Fields

| Variable | Required | Current Value |
|----------|----------|---------------|
| `HUBSPOT_MANAGED_DEAL_FIELDS` | No | `country` |
| `HUBSPOT_MANAGED_CONTACT_FIELDS` | No | `firstname,lastname` |

### `HUBSPOT_MANAGED_DEAL_FIELDS`
**What:** Comma-separated list of HubSpot deal property names that should only be set if currently empty. Prevents overwriting manual edits.
**Where:** `env.ts:91`. The Entity base class checks if a field is "managed" before writing — if it already has a value, the update is skipped.
**Example:** `country` — if a sales rep manually corrects a deal's country, the sync won't overwrite it.

### `HUBSPOT_MANAGED_CONTACT_FIELDS`
**What:** Same concept for contacts.
**Where:** `env.ts:109`.
**Example:** `firstname,lastname` — if HubSpot already has a contact's name, MPAC data won't overwrite it.

---

## 9. HubSpot Association Type Mappings

| Variable | Required | Current Value |
|----------|----------|---------------|
| `HUBSPOT_ASSOCIATION_TYPE_MAPPINGS` | No | `contractor:company_to_contact,some_other_type:contact_to_deal` |

### `HUBSPOT_ASSOCIATION_TYPE_MAPPINGS`
**What:** Custom HubSpot association type labels. If your HubSpot uses custom association types (beyond the default "Primary"), define them here.
**Where:** `env.ts:28-29` via `hubspotSettingsFromENV()`. Parsed into a `Map<string, string>`.
**Format:** `label:entity1_to_entity2` pairs, comma-separated.
**Example:** `contractor:company_to_contact` creates a "contractor" association type between companies and contacts.
**Note:** The current value is a sample/placeholder from `.sample.env`. Review whether eazyBI uses custom association types. If not, this can be removed.

---

## 10. Data Classification & Filtering

| Variable | Required | Current Value |
|----------|----------|---------------|
| `PARTNER_DOMAINS` | No | `atlassian.com,bugcrowd.com,bugcrowdninja.com` |
| `IGNORED_APPS` | No | `com.eazybi.atlassian-connect.eazybi-jira,com.eazybi.jira.plugins.eazybi-jira-test` |
| `IGNORED_EMAILS` | No | `foo@bar,qux` |
| `EMAIL_MAPPINGS` | No | `tom.cruise@topgun.coom=tom.cruise@topgun.coom` |

### `PARTNER_DOMAINS`
**What:** Domains that belong to known partners (resellers, Atlassian Solution Partners). Contacts from these domains are classified as "Partner" type, and licenses with only partner contacts generate `partner-only` noop events (no deals created).
**Where:** `env.ts:126` via `engineConfigFromENV()`. Fed to `EventGenerator` for meta classification.
**Format:** Comma-separated domains: `atlassian.com,bugcrowd.com`
**eazyBI note:** The current values look correct. May need expansion if eazyBI has additional partner relationships.

### `IGNORED_APPS`
**What:** Addon keys to skip during deal generation. Licenses/transactions for these apps produce `archived-app` noop events.
**Where:** `env.ts:132` via `engineConfigFromENV()` as `archivedApps` Set.
**Format:** Comma-separated addon keys.
**eazyBI note:** Currently ignores the main eazyBI Jira app and a test app. This makes sense if those are handled separately or shouldn't generate deals.

### `IGNORED_EMAILS`
**What:** Email addresses to skip when logging invalid MPAC records. Does NOT skip the record itself — only suppresses validation warnings.
**Where:** `env.ts:115` via `mpacConfigFromENV()`. Checked in marketplace validation.
**Format:** Comma-separated emails.
**Note:** Current value `foo@bar,qux` is a sample placeholder. Replace with actual known-bad emails if needed, or leave empty.

### `EMAIL_MAPPINGS`
**What:** Maps MPAC email addresses to HubSpot email addresses. Useful when a contact's email differs between the two systems.
**Where:** `env.ts:116-120` via `mpacConfigFromENV()`. Applied during contact matching.
**Format:** Comma-separated `from=to` pairs: `old@example.com=new@example.com`
**Note:** Current value maps an email to itself (sample). Replace with actual mappings or remove.

---

## 11. Addon Key to Platform Mapping

| Variable | Required | Current Value |
|----------|----------|---------------|
| `ADDONKEY_PLATFORMS` | **YES** | `my-conf-app=Confluence,com.my.jira.app=Jira` |

### `ADDONKEY_PLATFORMS`
**What:** Maps each addon key to its Atlassian platform. Used to populate the "related products" field on contacts and for platform-level filtering.
**Where:** `env.ts:127-131` via `engineConfigFromENV()` as `appToPlatform` object. The engine **requires** every addon key to be present here — unmapped keys cause errors.
**Format:** Comma-separated `addonKey=Platform` pairs.
**CRITICAL:** Current value is a placeholder from `.sample.env`. Must be replaced with actual eazyBI addon keys and their platforms. Example:
```
ADDONKEY_PLATFORMS=com.eazybi.jira=Jira,com.eazybi.confluence=Confluence
```

---

## 12. Deal Template Values

| Variable | Required | Current Value |
|----------|----------|---------------|
| `DEAL_DEALNAME` | **YES** | `{{{addonName}}} at {{{company}}}` |
| `DEAL_ORIGIN` | No | `AMKP-Lead` |
| `DEAL_RELATED_PRODUCTS` | No | `Marketplace Apps` |

### `DEAL_DEALNAME`
**What:** Mustache template for HubSpot deal names. Available placeholders come from license/transaction data fields.
**Where:** `env.ts:136` via `engineConfigFromENV()`. Rendered via `mustache.render()` in `ActionGenerator.dealCreationProperties()`.
**Common placeholders:** `{{{addonName}}}`, `{{{company}}}`, `{{{addonKey}}}`, `{{{country}}}`
**Example output:** "eazyBI Reports and Charts for Jira at Acme Corp"

### `DEAL_ORIGIN`
**What:** Static value written to every deal's origin field.
**Where:** `env.ts:134`. Written to the field specified by `HUBSPOT_DEAL_ORIGIN_ATTR`.

### `DEAL_RELATED_PRODUCTS`
**What:** Static value written to every deal's related products field.
**Where:** `env.ts:135`. Written to the field specified by `HUBSPOT_DEAL_RELATED_PRODUCTS_ATTR`.

---

## 13. Data Management

| Variable | Required | Current Value |
|----------|----------|---------------|
| `KEEP_DATA_SETS` | No | `8d 5w 2m` |
| `LATE_TRANSACTION_THRESHOLD_DAYS` | No | `30` |
| `DELETE_BLOCKING_DEALS` | No | (not set) |

### `KEEP_DATA_SETS`
**What:** Data retention policy for cached MPAC/HubSpot downloads. Keeps recent daily snapshots, weekly snapshots, and monthly snapshots.
**Where:** `env.ts:14` via `keepDataSetConfigFromENV()`. Used by data directory cleanup.
**Format:** Space-separated retention rules: `8d 5w 2m` = keep 8 daily, 5 weekly, 2 monthly snapshots.

### `LATE_TRANSACTION_THRESHOLD_DAYS`
**What:** If a transaction's sale date is more than this many days in the past but appears as new, a Slack alert is sent. Catches late-arriving marketplace data.
**Where:** `env.ts:41` via `dataShiftConfigFromENV()`. Parsed as integer.

### `DELETE_BLOCKING_DEALS`
**What:** When set to `yes`, the uploader deletes "blocking deals" — deals that the deduplication logic has flagged as problematic (encountered as duplicate primary twice).
**Where:** `env.ts:17-18` via `deleteBlockingDeals()`. Checked in `uploader.ts` before sync.
**Default:** Not set — blocking deals are logged but not deleted (safe default).
**CAUTION:** Only enable after confirming the sync is stable and duplicate detection is working correctly.

---

---

## 14. Incremental Sync Configuration

| Variable | Required | Default |
|----------|----------|---------|
| `FULL_SYNC_INTERVAL_DAYS` | No | `7` |
| `INCREMENTAL_OVERLAP_DAYS` | No | `1` |
| `UPLOAD_MAX_RETRY_COUNT` | No | `3` |

### `FULL_SYNC_INTERVAL_DAYS`
**What:** How many days between automatic full re-downloads. Incremental syncs run between full syncs, downloading only recently changed MPAC data and merging with the cached baseline.
**Where:** `env.ts` via `incrementalSyncConfigFromENV()`.
**Default:** `7` — weekly full sync as a safety net to catch any missed changes.

### `INCREMENTAL_OVERLAP_DAYS`
**What:** Days of overlap when calculating the incremental download start date. If last sync was April 7 with 1-day overlap, incremental starts from April 6.
**Where:** `env.ts` via `incrementalSyncConfigFromENV()`.
**Default:** `1` — handles timezone edge cases and API propagation delay.

### `UPLOAD_MAX_RETRY_COUNT`
**What:** Maximum number of times a failed entity upload will be retried across subsequent sync runs. After this limit, the failure is discarded.
**Where:** `env.ts` via `incrementalSyncConfigFromENV()`.
**Default:** `3`.

---

## Configuration Status Summary

All critical variables are configured and the system is in production. The `.env` file contains real values for pipeline IDs, deal stages, and MPAC credentials.

### Optional / Can Tune
- `FULL_SYNC_INTERVAL_DAYS` — increase for less frequent full syncs (saves bandwidth)
- `INCREMENTAL_OVERLAP_DAYS` — increase for more redundancy at cost of slightly more data
- `UPLOAD_MAX_RETRY_COUNT` — increase to retry longer, decrease to fail-fast
- `DELETE_BLOCKING_DEALS` — safe to leave off until duplicate detection is confirmed stable
