# Marketing Automation Engine

Analyzes all your Atlassian Marketplace data, generates contacts/deals, and puts them into HubSpot.

More specifically:

1. Downloads and analyzes HubSpot and Atlassian Marketplace data
2. Generates contacts from all License/Transaction contact info
3. Identifies and flags Contact-Type for each Contact/Company
4. Matches up related MPAC events via similarity-scoring
5. Updates Contacts based on match results
6. Generates Deals based on match results
7. Upserts all generated/updated HubSpot data entities

This runs in an ENV-configurable loop.

Read about the engine logic in detail in [docs/ENGINE.md](./docs/ENGINE.md).

Implemented in Node.js (TypeScript) and can build a Docker image (hosted by [GitHub](https://github.com/Atlas-Authority/marketing-automation/pkgs/container/marketing-automation)).

---

## HubSpot Setup

See [docs/HUBSPOT.md](./docs/HUBSPOT.md).


## Running in Development

Install Node.js 16+ and NPM 7+

Copy [`.sample.env`](./.sample.env) to `.env` and set values.

Install dependencies:

```sh
$ npm install
```

Compile TypeScript in background:

```sh
$ npm run watch
```

For general development:

```sh
$ npm run download     # Download data (incremental by default)
$ npm run download -- --full  # Full download
$ npm run once [fast]  # Dry-run engine once on cached inputs
$ npm run sync         # Single sync run (incremental by default)
$ npm run sync -- --full  # Force full re-download
$ npm run 3x   [fast]  # Dry-run engine 3x, piping output to input
```

* Data must be downloaded before local dry-runs
* Engine log files are written under `data/[input-dir]/[log-dir]/`
* Running with `fast` skips time-consuming logs
* Sync state tracked in `data/sync-state.json`, logs in `data/sync-log.jsonl`

Running tests:

```sh
$ npm run test                # Run once
$ npm run test -- --watchAll  # Run during dev
```


## Running in Production

```sh
$ node out/bin/main.js  # Continuous loop with incremental sync
```

The engine uses **incremental sync** by default: only MPAC records changed since the last run are downloaded and merged with a cached baseline. A full re-download runs automatically every 7 days (configurable via `FULL_SYNC_INTERVAL_DAYS`).

See [Deployment Guide](./docs/DEPLOYMENT.md) for Docker setup and full configuration.
See [Analyse Data Shift](./docs/ANALYSE_DATA_SHIFT.md) for data shift analysis.
