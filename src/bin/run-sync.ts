import 'source-map-support/register';
import { dataShiftConfigFromENV, engineConfigFromENV, incrementalSyncConfigFromENV } from "../lib/config/env";
import { DataShiftAnalyzer } from '../lib/data-shift/analyze';
import { loadDataSets } from '../lib/data-shift/loader';
import { DataShiftReporter } from '../lib/data-shift/reporter';
import { dataManager } from '../lib/data/manager';
import { SyncLogger, emptySyncLogEntry, SyncLogEntry } from '../lib/data/sync-log';
import { SyncStateManager, FailedUploadRecord } from '../lib/data/sync-state';
import { orchestrateDownload, DownloadResult } from '../lib/engine/download-orchestrator';
import { Engine } from "../lib/engine/engine";
import { hubspotConfigFromENV } from '../lib/hubspot/hubspot';
import { HubspotUploader, UploadResult } from '../lib/hubspot/uploader';
import { ConsoleLogger } from '../lib/log/console';
import { AttachableError } from '../lib/util/errors';

/**
 * Single-run sync: download → engine → upload → log → exit.
 * Supports incremental sync by default, use --full to force full re-download.
 *
 * Usage: npm run sync [-- --full]
 */

const console2 = new ConsoleLogger();
const uploader = new HubspotUploader(console2);
const syncState = new SyncStateManager();
const syncLogger = new SyncLogger();
const forceFull = process.argv.includes('--full');

async function main() {
  const startTime = Date.now();
  console2.printInfo('Sync', '=== Single-Run Sync ===');
  console2.printInfo('Sync', `Started: ${new Date(startTime).toISOString()}`);

  console2.printInfo('Sync', 'Pruning old data sets');
  dataManager.pruneDataSets(console2);

  // Download (full or incremental)
  const downloadStart = Date.now();
  console2.printInfo('Sync', 'Downloading data');
  const incrementalConfig = incrementalSyncConfigFromENV();
  const downloadResult = await orchestrateDownload(
    console2,
    hubspotConfigFromENV(),
    syncState,
    incrementalConfig,
    { forceFull },
  );
  const downloadMs = Date.now() - downloadStart;

  const dataSet = dataManager.dataSetFrom(downloadResult.dataSetId, console2);
  const logDir = dataSet.makeLogDir!('sync');

  // Engine
  const engineStart = Date.now();
  console2.printInfo('Sync', 'Running engine');
  const engine = new Engine(engineConfigFromENV(), console2, logDir);
  engine.run(dataSet);
  const engineMs = Date.now() - engineStart;

  // Retry previous failures
  const retryResult = await retryFailedUploads(syncState, incrementalConfig);

  // Upload
  const uploadStart = Date.now();
  console2.printInfo('Sync', 'Uploading changes to HubSpot');
  const uploadResult = await uploader.upsyncChangesToHubspot(dataSet.hubspot);
  const uploadMs = Date.now() - uploadStart;

  // Track new failures
  const allFailures: FailedUploadRecord[] = [
    ...uploadResult.deals.failed,
    ...uploadResult.contacts.failed,
    ...uploadResult.companies.failed,
  ];
  if (allFailures.length > 0) {
    syncState.recordFailedUploads(allFailures);
    console2.printWarning('Sync', `${allFailures.length} upload(s) failed — will retry next sync`);
  }

  // Prune exhausted retries
  const pruned = syncState.pruneExhaustedRetries(incrementalConfig.maxRetryCount);
  if (pruned > 0) {
    console2.printWarning('Sync', `Discarded ${pruned} upload(s) that exceeded max retry count`);
  }

  console2.printInfo('Sync', 'Writing change log');
  logDir.hubspotOutputLogger()?.logResults(dataSet.hubspot);

  console2.printInfo('Sync', 'Analyzing data shift');
  const dataSets = loadDataSets(console2);
  const analyzer = new DataShiftAnalyzer(dataShiftConfigFromENV(), console2);
  const results = analyzer.run(dataSets);
  const reporter = new DataShiftReporter(console2, undefined);
  reporter.report(results);

  // Record success
  syncState.recordSuccess(downloadResult.mode, downloadResult.dataSetId);

  // Write sync log
  const totalMs = Date.now() - startTime;
  const logEntry = buildSyncLogEntry(downloadResult, uploadResult, retryResult, {
    totalMs,
    downloadMs,
    engineMs,
    uploadMs,
  }, engine);
  syncLogger.appendEntry(logEntry);

  // Summary
  const durationMin = (totalMs / 60000).toFixed(1);
  console2.printInfo('Sync', '');
  console2.printInfo('Sync', '=== SYNC COMPLETE ===');
  console2.printInfo('Sync', `Mode: ${downloadResult.mode.toUpperCase()}`);
  if (downloadResult.syncPeriod) {
    console2.printInfo('Sync', `Period: ${downloadResult.syncPeriod.startDate} → ${downloadResult.syncPeriod.endDate}`);
  }
  console2.printInfo('Sync', `Duration: ${durationMin} min`);
  console2.printInfo('Sync', `Contacts: ${uploadResult.contacts.created} created, ${uploadResult.contacts.updated} updated, ${uploadResult.contacts.failed.length} failed`);
  console2.printInfo('Sync', `Deals: ${uploadResult.deals.created} created, ${uploadResult.deals.updated} updated, ${uploadResult.deals.failed.length} failed`);
  console2.printInfo('Sync', `Companies: ${uploadResult.companies.created} created, ${uploadResult.companies.updated} updated`);
  console2.printInfo('Sync', `Associations: ${uploadResult.associations.created} created, ${uploadResult.associations.deleted} deleted`);
  console2.printInfo('Sync', `MPAC: ${engine.mpac.licenses.length} licenses, ${engine.mpac.transactions.length} transactions`);
  if (retryResult.succeeded + retryResult.failed > 0) {
    console2.printInfo('Sync', `Retries: ${retryResult.succeeded} succeeded, ${retryResult.failed} failed`);
  }
}

async function retryFailedUploads(
  syncState: SyncStateManager,
  config: { maxRetryCount: number },
): Promise<{ succeeded: number; failed: number }> {
  const toRetry = syncState.getFailedUploads(config.maxRetryCount);
  if (toRetry.length === 0) return { succeeded: 0, failed: 0 };

  console2.printInfo('Sync', `Retrying ${toRetry.length} previously failed upload(s)`);
  const retryUploader = new HubspotUploader(console2);

  let succeeded = 0;
  let failed = 0;

  // Group by kind and operation
  for (const kind of ['contact', 'deal', 'company'] as const) {
    const creates = toRetry.filter(f => f.entityKind === kind && f.operation === 'create');
    const updates = toRetry.filter(f => f.entityKind === kind && f.operation === 'update');

    if (creates.length > 0) {
      const results = await retryUploader.api.createEntities(
        kind,
        creates.map(f => ({ properties: f.properties })),
      );
      const successCount = results.length;
      succeeded += successCount;
      failed += creates.length - successCount;

      // Clear succeeded from state
      const succeededRecords = creates.filter((_, i) =>
        results.some(r => r.index === i)
      );
      syncState.clearSucceededRetries(succeededRecords);

      // Increment retry count on failures
      const failedRecords = creates.filter((_, i) =>
        !results.some(r => r.index === i)
      );
      syncState.incrementRetryCount(failedRecords);
    }

    if (updates.length > 0) {
      const results = await retryUploader.api.updateEntities(
        kind,
        updates.filter(f => f.entityId !== null).map(f => ({
          id: f.entityId!,
          properties: f.properties,
        })),
      );
      const successCount = results.length;
      succeeded += successCount;
      failed += updates.length - successCount;

      const succeededRecords = updates.filter(f =>
        results.some(r => r.id === f.entityId)
      );
      syncState.clearSucceededRetries(succeededRecords);

      const failedRecords = updates.filter(f =>
        !results.some(r => r.id === f.entityId)
      );
      syncState.incrementRetryCount(failedRecords);
    }
  }

  return { succeeded, failed };
}

function buildSyncLogEntry(
  download: DownloadResult,
  upload: UploadResult,
  retry: { succeeded: number; failed: number },
  duration: { totalMs: number; downloadMs: number; engineMs: number; uploadMs: number },
  engine: Engine,
): SyncLogEntry {
  const entry = emptySyncLogEntry(download.mode, download.dataSetId);

  entry.syncPeriod = download.syncPeriod;
  entry.duration = duration;
  entry.download = download.downloadStats;
  entry.merge = download.mergeStats ? {
    baselineLicenses: download.mergeStats.baselineLicenses,
    deltaLicenses: download.mergeStats.deltaLicenses,
    mergedLicenses: download.mergeStats.mergedLicenses,
    baselineTransactions: download.mergeStats.baselineTransactions,
    deltaTransactions: download.mergeStats.deltaTransactions,
    mergedTransactions: download.mergeStats.mergedTransactions,
  } : null;

  entry.upload = {
    contacts: {
      created: upload.contacts.created,
      updated: upload.contacts.updated,
      failed: upload.contacts.failed.length,
      unchanged: upload.contacts.unchanged,
    },
    deals: {
      created: upload.deals.created,
      updated: upload.deals.updated,
      failed: upload.deals.failed.length,
      unchanged: upload.deals.unchanged,
    },
    companies: {
      created: upload.companies.created,
      updated: upload.companies.updated,
      failed: upload.companies.failed.length,
      unchanged: upload.companies.unchanged,
    },
    associations: upload.associations,
    retried: retry,
  };

  const totalFailed = upload.contacts.failed.length + upload.deals.failed.length + upload.companies.failed.length;
  entry.status = totalFailed > 0 ? 'partial_failure' : 'success';

  return entry;
}

main().catch(e => {
  if (e instanceof AttachableError) {
    console2.printError('Sync', e.message);
    console2.printError('Sync', e.attachment);
  } else {
    console2.printError('Sync', 'Fatal error:', e);
  }
  process.exit(1);
});
