import 'source-map-support/register';
import { dataShiftConfigFromENV, engineConfigFromENV, incrementalSyncConfigFromENV, runLoopConfigFromENV } from "../lib/config/env";
import { DataShiftAnalyzer } from '../lib/data-shift/analyze';
import { loadDataSets } from '../lib/data-shift/loader';
import { DataShiftReporter } from '../lib/data-shift/reporter';
import { dataManager } from '../lib/data/manager';
import { SyncLogger, emptySyncLogEntry } from '../lib/data/sync-log';
import { SyncStateManager, FailedUploadRecord } from '../lib/data/sync-state';
import { orchestrateDownload } from '../lib/engine/download-orchestrator';
import { Engine } from "../lib/engine/engine";
import { SlackNotifier } from '../lib/engine/slack-notifier';
import { hubspotConfigFromENV } from '../lib/hubspot/hubspot';
import { HubspotUploader } from '../lib/hubspot/uploader';
import { ConsoleLogger } from '../lib/log/console';
import run from "../lib/util/runner";

const console = new ConsoleLogger();
const uploader = new HubspotUploader(console);
const syncState = new SyncStateManager();
const syncLogger = new SyncLogger();
const incrementalConfig = incrementalSyncConfigFromENV();

const runLoopConfig = runLoopConfigFromENV();
const notifier = SlackNotifier.fromENV(console);
void notifier?.notifyStarting();

run(console, runLoopConfig, {

  async work() {
    const startTime = Date.now();

    console.printInfo('Main', 'Pruning data sets');
    dataManager.pruneDataSets(console);

    console.printInfo('Main', 'Downloading data');
    const downloadStart = Date.now();
    const downloadResult = await orchestrateDownload(
      console,
      hubspotConfigFromENV(),
      syncState,
      incrementalConfig,
      { forceFull: false },
    );
    const downloadMs = Date.now() - downloadStart;

    const dataSet = dataManager.dataSetFrom(downloadResult.dataSetId);
    const logDir = dataSet.makeLogDir!('main');

    const engineStart = Date.now();
    console.printInfo('Main', 'Running engine');
    const engine = new Engine(engineConfigFromENV(), console, logDir);
    engine.run(dataSet);
    const engineMs = Date.now() - engineStart;

    // Retry previous failures
    const retryToRetry = syncState.getFailedUploads(incrementalConfig.maxRetryCount);
    let retrySucceeded = 0;
    let retryFailed = 0;
    if (retryToRetry.length > 0) {
      console.printInfo('Main', `Retrying ${retryToRetry.length} previously failed upload(s)`);
      // Simple retry: just clear them and let the main upload handle the entities
      // The entities will be re-computed by the engine and uploaded normally
      syncState.clearSucceededRetries(retryToRetry);
    }

    const uploadStart = Date.now();
    console.printInfo('Main', 'Upsyncing changes to HubSpot');
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
    }
    syncState.pruneExhaustedRetries(incrementalConfig.maxRetryCount);

    console.printInfo('Main', 'Writing HubSpot change log file');
    logDir.hubspotOutputLogger()?.logResults(dataSet.hubspot);

    // Record success and write sync log BEFORE data shift analysis (which may OOM)
    syncState.recordSuccess(downloadResult.mode, downloadResult.dataSetId);

    const totalMs = Date.now() - startTime;
    const logEntry = emptySyncLogEntry(downloadResult.mode, downloadResult.dataSetId);
    logEntry.syncPeriod = downloadResult.syncPeriod;
    logEntry.duration = { totalMs, downloadMs, engineMs, uploadMs };
    logEntry.download = downloadResult.downloadStats;
    logEntry.merge = downloadResult.mergeStats ? {
      baselineLicenses: downloadResult.mergeStats.baselineLicenses,
      deltaLicenses: downloadResult.mergeStats.deltaLicenses,
      mergedLicenses: downloadResult.mergeStats.mergedLicenses,
      baselineTransactions: downloadResult.mergeStats.baselineTransactions,
      deltaTransactions: downloadResult.mergeStats.deltaTransactions,
      mergedTransactions: downloadResult.mergeStats.mergedTransactions,
    } : null;
    logEntry.upload = {
      contacts: { created: uploadResult.contacts.created, updated: uploadResult.contacts.updated, failed: uploadResult.contacts.failed.length, unchanged: uploadResult.contacts.unchanged },
      deals: { created: uploadResult.deals.created, updated: uploadResult.deals.updated, failed: uploadResult.deals.failed.length, unchanged: uploadResult.deals.unchanged },
      companies: { created: uploadResult.companies.created, updated: uploadResult.companies.updated, failed: uploadResult.companies.failed.length, unchanged: uploadResult.companies.unchanged },
      associations: uploadResult.associations,
      retried: { succeeded: retrySucceeded, failed: retryFailed },
    };
    const totalFailed = uploadResult.contacts.failed.length + uploadResult.deals.failed.length + uploadResult.companies.failed.length;
    logEntry.status = totalFailed > 0 ? 'partial_failure' : 'success';
    syncLogger.appendEntry(logEntry);

    // Data shift analysis — optional, may fail on memory-constrained environments
    try {
      console.printInfo('Main', 'Analyzing data shift');
      const dataSets = loadDataSets(console);
      const analyzer = new DataShiftAnalyzer(dataShiftConfigFromENV(), console);
      const results = analyzer.run(dataSets);
      const reporter = new DataShiftReporter(console, notifier);
      reporter.report(results);
    } catch (e) {
      console.printWarning('Main', 'Data shift analysis failed (likely out of memory) — skipping');
    }

    console.printInfo('Main', `Done (${downloadResult.mode} sync, ${(totalMs / 60000).toFixed(1)} min)`);
  },

  async failed(errors) {
    await notifier?.notifyErrors(runLoopConfig, errors);
  },

});
