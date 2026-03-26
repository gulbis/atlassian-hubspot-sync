# Phase 1: Test and Validate

**Do not run a full production sync.** This phase is exploratory.

## Execution Stages (in order)

1. **Code verification & safety audit** — verify email matching, pipeline isolation, duplicate handling, managed fields, upload batching, associations
2. **Test suite hardening** — fill gaps in license matching, field mapping, upload mocking, contact merge, date handling, config validation
3. **Credential setup** — map all env vars, obtain MPAC + HubSpot credentials, verify API connectivity
4. **HubSpot pipeline & property prep** — audit existing properties, create "Atlassian Licensing" pipeline + custom properties
5. **Data download & inspection** — fetch MPAC + HubSpot data, inspect volume/quality, configure partner domains and ignore lists
6. **Dry-run analysis** — `npm run once` on cached data, inspect output, validate before any writes
7. **Controlled live test** — single sync with HubSpot backup, spot-check results, verify no partner pipeline contamination
8. **Production deployment** — continuous loop, Slack alerts, Docker deploy, monitoring

Stages 1-2 are pure code work (no credentials or external systems needed).

## Key Findings

- **Dry-run mode**: `npm run once` processes cached data without uploading (safe)
- **Email matching**: confirmed email-based upsert via `ContactManager.getByEmail` (safe — enriches, doesn't duplicate)
- **Deal matching**: by MPAC IDs (addonLicenseId, appEntitlementId, transactionId)
- **Pipeline isolation**: deals go to configured MPAC pipeline only — partner pipeline untouched if IDs differ

## Goals Unlocked by CRM Enrichment

- Contact segmentation by license type and value
- Lifecycle stage automation (lead → customer based on license status)
- Renewal workflows (triggered X days before renewal date)
- Upgrade opportunity identification (customers on starter tier)
- Churned customer detection (expired licenses with no renewal)

## Definition of Done

- [x] Dry-run mode confirmed (`npm run once`)
- [x] Email matching behavior confirmed in code (email-based upsert)
- [x] All code verification items audited and documented (see `docs/VERIFICATION_REPORT.md`)
- [ ] Test suite covers: license matching, contact matching, deal creation, field mapping, date handling
- [ ] All credentials identified and documented
- [ ] "Atlassian Licensing" pipeline created in HubSpot
- [ ] Custom field conflicts checked — no overwrites of existing properties
- [ ] Dry-run output reviewed and approved — no anomalies
- [ ] Controlled live test successful — objects visible in HubSpot and correct
- [ ] Rollback plan documented (what to delete if something goes wrong)

## Full Plan Reference

See `/Users/swan/.claude/plans/deep-mixing-pixel.md` for detailed sub-tasks per stage.
