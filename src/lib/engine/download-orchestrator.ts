import got from 'got';
import promiseAllProperties from 'promise-all-properties';
import { DateTime } from 'luxon';
import { IncrementalSyncConfig } from '../config/env';
import { dataManager } from '../data/manager';
import { RawDataSet } from '../data/raw';
import { SyncStateManager } from '../data/sync-state';
import HubspotAPI from '../hubspot/api';
import { HubspotConfig, Hubspot } from '../hubspot/hubspot';
import { ConsoleLogger } from '../log/console';
import { MultiDownloadLogger } from '../log/download';
import { MarketplaceAPI } from '../marketplace/api/api';
import { downloadAllData } from './download';
import {
  FreshHubspotAndStaticData,
  IncrementalMpacData,
  MergeStats,
  mergeMpacData,
  verifyMergeIntegrity,
} from './incremental-download';

export interface DownloadResult {
  dataSetId: number;
  mode: 'full' | 'incremental';
  syncPeriod: { startDate: string; endDate: string } | null;
  downloadStats: {
    licensesWithInsights: number;
    licensesWithoutInsights: number;
    transactions: number;
    attributions: number;
  };
  mergeStats: MergeStats | null;
}

export async function orchestrateDownload(
  console: ConsoleLogger,
  hubspotConfig: HubspotConfig,
  syncState: SyncStateManager,
  incrementalConfig: IncrementalSyncConfig,
  opts: { forceFull: boolean },
): Promise<DownloadResult> {

  const doFull = syncState.shouldDoFullSync(
    opts.forceFull,
    incrementalConfig.fullSyncIntervalDays,
  );

  if (doFull) {
    return doFullDownload(console, hubspotConfig, syncState);
  } else {
    return doIncrementalDownload(console, hubspotConfig, syncState, incrementalConfig);
  }
}

async function doFullDownload(
  console: ConsoleLogger,
  hubspotConfig: HubspotConfig,
  syncState: SyncStateManager,
): Promise<DownloadResult> {
  console.printInfo('Orchestrator', 'Running FULL download');

  const ms = await downloadAllData(console, hubspotConfig);
  const rawData = dataManager.loadRawDataSet(ms);

  return {
    dataSetId: ms,
    mode: 'full',
    syncPeriod: null,
    downloadStats: {
      licensesWithInsights: rawData.licensesWithDataInsights.length,
      licensesWithoutInsights: rawData.licensesWithoutDataInsights.length,
      transactions: rawData.transactions.length,
      attributions: rawData.rawAttributions.length,
    },
    mergeStats: null,
  };
}

async function doIncrementalDownload(
  console: ConsoleLogger,
  hubspotConfig: HubspotConfig,
  syncState: SyncStateManager,
  incrementalConfig: IncrementalSyncConfig,
): Promise<DownloadResult> {
  const startDate = syncState.getIncrementalStartDate(incrementalConfig.incrementalOverlapDays);
  if (!startDate) {
    console.printWarning('Orchestrator', 'No previous sync date found — falling back to full download');
    return doFullDownload(console, hubspotConfig, syncState);
  }

  const endDate = DateTime.now().toISODate()!;
  console.printInfo('Orchestrator', `Running INCREMENTAL download (${startDate} → ${endDate})`);

  // Load baseline
  const baselineId = syncState.getState().baselineDataSetId!;
  console.printInfo('Orchestrator', `Loading baseline dataset in-${baselineId}`);
  let baseline: RawDataSet | null = dataManager.loadRawDataSet(baselineId);
  console.printInfo('Orchestrator', `Baseline: ${baseline.licensesWithDataInsights.length} licenses, ${baseline.transactions.length} transactions`);

  // Download incremental MPAC data + fresh HubSpot data in parallel
  const hubspotAPI = new HubspotAPI(console);
  const marketplaceAPI = new MarketplaceAPI();
  const hubspot = new Hubspot(hubspotConfig);
  const logbox = new MultiDownloadLogger(console);

  const data = await promiseAllProperties({
    deltaLicenses: logbox.wrap('Licenses (incremental)', (progress) =>
      marketplaceAPI.downloadLicensesSince(startDate, progress)
    ),

    deltaTransactions: logbox.wrap('Transactions (incremental)', () =>
      marketplaceAPI.downloadTransactionsSince(startDate)
    ),

    tlds: logbox.wrap('Tlds', () => downloadAllTlds()),
    freeDomains: logbox.wrap('Free Email Providers', () => downloadFreeEmailProviders()),

    rawDeals: logbox.wrap('Deals', () =>
      hubspotAPI.downloadHubspotEntities(hubspot.dealManager.entityAdapter)
    ),
    rawCompanies: logbox.wrap('Companies', () =>
      hubspotAPI.downloadHubspotEntities(hubspot.companyManager.entityAdapter)
    ),
    rawContacts: logbox.wrap('Contacts', () =>
      hubspotAPI.downloadHubspotEntities(hubspot.contactManager.entityAdapter)
    ),
  });

  logbox.done();

  const delta: IncrementalMpacData = {
    deltaLicenses: data.deltaLicenses,
    deltaTransactions: data.deltaTransactions,
  };

  const fresh: FreshHubspotAndStaticData = {
    tlds: data.tlds,
    freeDomains: data.freeDomains,
    rawDeals: data.rawDeals,
    rawCompanies: data.rawCompanies,
    rawContacts: data.rawContacts,
  };

  // Merge
  console.printInfo('Orchestrator', 'Merging incremental data with baseline');
  const { merged, stats } = mergeMpacData(baseline, delta, fresh, console);

  // Verify integrity
  if (!verifyMergeIntegrity(baseline, merged, console)) {
    console.printWarning('Orchestrator', 'Merge integrity check failed — falling back to full download');
    return doFullDownload(console, hubspotConfig, syncState);
  }

  // Release baseline to free ~155 MB before DataSet construction
  baseline = null;

  // Save merged dataset
  const ms = dataManager.createDataSet(merged);
  console.printInfo('Orchestrator', 'Done');

  return {
    dataSetId: ms,
    mode: 'incremental',
    syncPeriod: { startDate, endDate },
    downloadStats: {
      licensesWithInsights: data.deltaLicenses.length,
      licensesWithoutInsights: 0,
      transactions: data.deltaTransactions.length,
      attributions: 0,
    },
    mergeStats: stats,
  };
}

async function downloadAllTlds(): Promise<string[]> {
  const res = await got.get(`https://data.iana.org/TLD/tlds-alpha-by-domain.txt`);
  return res.body.trim().split('\n').splice(1).map((s) => s.toLowerCase());
}

async function downloadFreeEmailProviders(): Promise<string[]> {
  const res = await got.get(
    `https://f.hubspotusercontent40.net/hubfs/2832391/Marketing/Lead-Capture/free-domains-1.csv`
  );
  return res.body.split(',\n');
}
