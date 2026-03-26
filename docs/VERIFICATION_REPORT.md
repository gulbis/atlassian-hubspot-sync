# Stage 1: Code Verification & Safety Audit Report

## 1. Email Matching — SAFE

**Status:** Verified
**Finding:** Email-based upsert. Does NOT create duplicates.

- `ContactManager.getByEmail` index maps email addresses (primary + `hs_additional_emails`)
- `contact-generator.ts` looks up by email first; only creates if no match
- Multiple records for same email are merged via `mergeContactInfo()` (combines names, products, deployments)

**Files:** [contact.ts:174](src/lib/model/contact.ts#L174), [contact-generator.ts](src/lib/contact-generator/contact-generator.ts)

---

## 2. Partner Pipeline Isolation — ROBUST

**Status:** Verified — 5 independent safeguards
**Finding:** No code path can touch non-MPAC pipelines.

| Safeguard | Location |
|-----------|----------|
| `Pipeline` enum only has `MPAC` value | [interfaces.ts:24-26](src/lib/hubspot/interfaces.ts#L24) |
| All new deals hardcoded to `Pipeline.MPAC` | [actions.ts:317](src/lib/deal-generator/actions.ts#L317) |
| Non-MPAC deals rejected on import via `shouldReject()` | [deal.ts:186-190](src/lib/model/deal.ts#L186) |
| Only one pipeline ID configured (`HUBSPOT_PIPELINE_MPAC`) | [env.ts:67](src/lib/config/env.ts#L67) |
| Only imported (MPAC) deals can be modified/deleted | [uploader.ts](src/lib/hubspot/uploader.ts) |

---

## 3. Duplicate Deal Handling — UNDERSTOOD

**Status:** Verified
**Finding:** `BlockingDeal` is a data conflict safety valve, not a crash.

**Flow:**
1. `actions.ts` detects when a primary duplicate deal is encountered a second time
2. Throws `BlockingDeal` error with the conflicting deal
3. `deal-generator.ts:67-78` catches it, logs error, continues processing other groups
4. Deal + its duplicates are removed from in-memory manager
5. If `DELETE_BLOCKING_DEALS=yes` → deals are archived from HubSpot during upload
6. If not set → blocking deals stay in HubSpot unchanged

**Recommendation:** Set `DELETE_BLOCKING_DEALS=no` (or leave unset) for initial runs. Only enable after confirming behavior is correct.

**Files:** [errors.ts:16-21](src/lib/util/errors.ts#L16), [actions.ts:228-229](src/lib/deal-generator/actions.ts#L228), [deal-generator.ts:67-78](src/lib/deal-generator/deal-generator.ts#L67)

---

## 4. Managed Fields — UNDERSTOOD

**Status:** Verified
**Finding:** Managed fields prevent overwrites of already-populated HubSpot values. Safe by design.

**How it works:**
- Configured via `HUBSPOT_MANAGED_DEAL_FIELDS` and `HUBSPOT_MANAGED_CONTACT_FIELDS` (comma-separated HubSpot property names)
- Proxy-based setter in `Entity` prevents modification when:
  - Field already has an old value (downloaded from HubSpot) **AND**
  - Field is in the managed list
- New entities: ALL fields are set (no old data exists)
- Existing entities with empty managed fields: field IS updated
- Existing entities with populated managed fields: field is NOT overwritten

**Purpose:** Allows manual data cleanup in HubSpot without the sync engine overwriting corrections.

**Example:** If `HUBSPOT_MANAGED_CONTACT_FIELDS=firstname,lastname` → engine sets names on new contacts but won't overwrite manually corrected names on existing contacts.

**Files:** [entity.ts:33-51](src/lib/hubspot/entity.ts#L33), [env.ts:91,109](src/lib/config/env.ts#L91), [docs/HUBSPOT.md:41-54](docs/HUBSPOT.md#L41)

---

## 5. Upload Batching — RISK IDENTIFIED

**Status:** Verified with concern
**Finding:** No rate limiting. All batches execute in parallel. Errors are silently logged.

| Entity Type | Batch Size | Parallel? |
|------------|-----------|-----------|
| Contacts (create/update) | 10 | Yes (`Promise.allSettled`) |
| Deals (create/update) | 100 | Yes (`Promise.allSettled`) |
| Companies (create/update) | 100 | Yes (`Promise.allSettled`) |
| Associations | 100 | Sequential (for loop with `await`) |

**Risks:**
- **No rate limit handling:** No delays between batches, no retry on 429
- **Silent failures:** Batch errors are caught and logged but don't throw — processing continues, potentially leaving partial data
- **No exponential backoff:** If HubSpot rate-limits, all concurrent batches may fail

**Mitigation for initial runs:** The dataset size matters. For small initial runs, this is unlikely to be a problem. For production with thousands of entities, rate limiting may need to be added.

**Files:** [api.ts:83-151](src/lib/hubspot/api.ts#L83), [uploader.ts:39-90](src/lib/hubspot/uploader.ts#L39)

---

## 6. Association Direction — CORRECT

**Status:** Verified
**Finding:** Associations are correctly directional. No orphan risk.

| From | To | Direction | Synced? |
|------|----|-----------|---------|
| Deal | Contact | `down/up` | Yes — fetched and synced |
| Deal | Company | `down/up` | Yes — fetched and synced |
| Contact | Company | `down/up` | Yes — fetched and synced |
| Company | Contact | `down` | Read-only — NOT synced back |

**Deal association setup** ([deal-generator.ts:123-144](src/lib/deal-generator/deal-generator.ts#L123)):
- Deals link to ALL matching contacts (tech, billing, partner)
- Deals link to companies of CUSTOMER contacts only
- `deal.contacts.clear()` + `deal.companies.clear()` before re-populating — ensures clean state

**Files:** [deal-generator.ts:123-144](src/lib/deal-generator/deal-generator.ts#L123), [entity.ts:90-164](src/lib/hubspot/entity.ts#L90), [uploader.ts:92-136](src/lib/hubspot/uploader.ts#L92)

---

## 7. DELETE_BLOCKING_DEALS Flag — DECISION

**Status:** Reviewed
**Recommendation:** Leave UNSET (disabled) for all initial runs.

- When disabled: blocking deals stay in HubSpot, can be manually reviewed
- When enabled: blocking deals + their duplicates are permanently archived
- Only enable after understanding what blocking deals exist and why

---

## Summary

| Check | Result | Risk |
|-------|--------|------|
| Email matching (upsert) | SAFE | None |
| Pipeline isolation | ROBUST (5 safeguards) | None |
| Duplicate deal handling | Understood, non-destructive by default | Low |
| Managed fields | Prevents overwrites, safe by design | None |
| Upload batching | No rate limits, silent failures | **Medium** (for large datasets) |
| Association direction | Correct, clean | None |
| DELETE_BLOCKING_DEALS | Disabled by default | None |

**Overall assessment:** The codebase is well-designed for safety. The only significant concern is the lack of rate limiting in the HubSpot upload batching, which is manageable for initial runs but should be addressed before high-volume production use.
