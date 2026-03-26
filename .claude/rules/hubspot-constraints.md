# HubSpot Environment Constraints

**Critical: read before touching HubSpot config or running any sync.**

| Constraint | Detail |
|-----------|--------|
| No sandbox available | HubSpot sandbox requires Enterprise plan — not available. All testing is against the live account. |
| 14-day backup exists | HubSpot backup/restore covers CRM objects (contacts, companies, deals, properties). Use as rollback insurance. |
| HubSpot tracking pixel DISABLED | Deliberate — disabled due to Cookie Overload/LinkedIn pixel security vulnerability. Do not re-enable. |
| Partner pipeline — DO NOT TOUCH | HubSpot is used for Partner Management in a separate pipeline. Sync must not modify or create deals in the Partner pipeline. |
| Separate pipeline required | Atlassian licensing deals must go in a **new, dedicated pipeline**: "Atlassian Licensing". Create before any deal import. |
| Custom field conflicts possible | eazyBI already has HubSpot contact/company properties. Check for existing fields before creating new ones. |
| Additional custom fields missing | Solution requires additional mandatory/optional custom fields. Create them before pushing to HubSpot. |

## Verification Required Before Full Run

### Email Matching Behavior
Does the sync match incoming Atlassian contacts to *existing* HubSpot contacts by email, or always create new records?
- **Matches by email** → safe, enriches existing contacts
- **Always creates new** → will create duplicates, data quality problem

Check HubSpot API calls in sync logic — look for `getByEmail`, `searchContacts`, or `upsert` patterns vs `createContact`.

### Deal Creation Workflow
Does the sync create a new deal pipeline and then create new deals per license? Are deals connected only to a contact, or also to a company?

## Credential Requirements

| Credential | Source | Notes |
|-----------|--------|-------|
| Atlassian Marketplace API key | Atlassian Marketplace vendor dashboard | Needs Vendor access |
| HubSpot Private App token | HubSpot → Settings → Integrations → Private Apps | Scopes: CRM read/write (contacts, companies, deals, properties) |
| eazyBI Marketplace Vendor ID | Atlassian Marketplace vendor profile | Identifies which vendor's licenses to pull |

Map every config field in `src/lib/config/env.ts` to its credential source before running.
