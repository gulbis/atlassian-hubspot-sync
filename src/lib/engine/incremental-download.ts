import { ConsoleLogger } from '../log/console';
import { RawDataSet } from '../data/raw';
import { RawLicense, RawTransaction } from '../marketplace/raw';

export interface MergeStats {
  baselineLicenses: number;
  deltaLicenses: number;
  mergedLicenses: number;
  licensesReplaced: number;
  licensesAdded: number;
  baselineTransactions: number;
  deltaTransactions: number;
  mergedTransactions: number;
  transactionsReplaced: number;
  transactionsAdded: number;
}

export interface IncrementalMpacData {
  deltaLicenses: RawLicense[];
  deltaTransactions: RawTransaction[];
}

export interface FreshHubspotAndStaticData {
  tlds: string[];
  freeDomains: string[];
  rawDeals: RawDataSet['rawDeals'];
  rawCompanies: RawDataSet['rawCompanies'];
  rawContacts: RawDataSet['rawContacts'];
}

/**
 * Merges incremental MPAC delta with a baseline dataset.
 *
 * - Licenses: merge by licenseId, replace if delta has newer lastUpdated
 * - Transactions: merge by transactionId, replace if delta has newer lastUpdated
 * - licensesWithoutDataInsights: kept from baseline (pre-2018 data, never changes)
 * - rawAttributions: kept from baseline (refreshed only on full sync)
 * - HubSpot + static data: always from fresh download
 */
export function mergeMpacData(
  baseline: RawDataSet,
  delta: IncrementalMpacData,
  fresh: FreshHubspotAndStaticData,
  console?: ConsoleLogger,
): { merged: RawDataSet; stats: MergeStats } {

  // Merge licenses by licenseId
  const licenseMap = new Map<string, RawLicense>();
  for (const lic of baseline.licensesWithDataInsights) {
    licenseMap.set(lic.licenseId, lic);
  }

  let licensesReplaced = 0;
  let licensesAdded = 0;

  for (const lic of delta.deltaLicenses) {
    const existing = licenseMap.get(lic.licenseId);
    if (existing) {
      if (lic.lastUpdated >= existing.lastUpdated) {
        licenseMap.set(lic.licenseId, lic);
        licensesReplaced++;
      }
    } else {
      licenseMap.set(lic.licenseId, lic);
      licensesAdded++;
    }
  }

  // Merge transactions by transactionId
  const txMap = new Map<string, RawTransaction>();
  for (const tx of baseline.transactions) {
    txMap.set(tx.transactionId, tx);
  }

  let transactionsReplaced = 0;
  let transactionsAdded = 0;

  for (const tx of delta.deltaTransactions) {
    const existing = txMap.get(tx.transactionId);
    if (existing) {
      if (tx.lastUpdated >= existing.lastUpdated) {
        txMap.set(tx.transactionId, tx);
        transactionsReplaced++;
      }
    } else {
      txMap.set(tx.transactionId, tx);
      transactionsAdded++;
    }
  }

  const mergedLicenses = Array.from(licenseMap.values());
  const mergedTransactions = Array.from(txMap.values());

  const stats: MergeStats = {
    baselineLicenses: baseline.licensesWithDataInsights.length,
    deltaLicenses: delta.deltaLicenses.length,
    mergedLicenses: mergedLicenses.length,
    licensesReplaced,
    licensesAdded,
    baselineTransactions: baseline.transactions.length,
    deltaTransactions: delta.deltaTransactions.length,
    mergedTransactions: mergedTransactions.length,
    transactionsReplaced,
    transactionsAdded,
  };

  console?.printInfo('Merge', `Licenses: ${stats.baselineLicenses} baseline + ${stats.deltaLicenses} delta → ${stats.mergedLicenses} merged (${licensesAdded} new, ${licensesReplaced} updated)`);
  console?.printInfo('Merge', `Transactions: ${stats.baselineTransactions} baseline + ${stats.deltaTransactions} delta → ${stats.mergedTransactions} merged (${transactionsAdded} new, ${transactionsReplaced} updated)`);

  const merged: RawDataSet = {
    licensesWithDataInsights: mergedLicenses,
    licensesWithoutDataInsights: baseline.licensesWithoutDataInsights,
    transactions: mergedTransactions,
    rawAttributions: baseline.rawAttributions,
    tlds: fresh.tlds,
    freeDomains: fresh.freeDomains,
    rawDeals: fresh.rawDeals,
    rawCompanies: fresh.rawCompanies,
    rawContacts: fresh.rawContacts,
  };

  return { merged, stats };
}

/**
 * Verifies merge produced a valid dataset.
 * Returns true if OK, false if integrity check failed.
 */
export function verifyMergeIntegrity(
  baseline: RawDataSet,
  merged: RawDataSet,
  console?: ConsoleLogger,
): boolean {
  let ok = true;

  // Merged should have >= licenses than baseline (licenses only grow)
  if (merged.licensesWithDataInsights.length < baseline.licensesWithDataInsights.length) {
    console?.printWarning('Merge', `License count decreased: ${baseline.licensesWithDataInsights.length} → ${merged.licensesWithDataInsights.length}`);
    ok = false;
  }

  // Merged should have >= transactions
  if (merged.transactions.length < baseline.transactions.length) {
    console?.printWarning('Merge', `Transaction count decreased: ${baseline.transactions.length} → ${merged.transactions.length}`);
    ok = false;
  }

  // Check for duplicate licenseIds
  const licenseIds = new Set<string>();
  for (const lic of merged.licensesWithDataInsights) {
    if (licenseIds.has(lic.licenseId)) {
      console?.printWarning('Merge', `Duplicate licenseId found: ${lic.licenseId}`);
      ok = false;
      break;
    }
    licenseIds.add(lic.licenseId);
  }

  // Check for duplicate transactionIds
  const txIds = new Set<string>();
  for (const tx of merged.transactions) {
    if (txIds.has(tx.transactionId)) {
      console?.printWarning('Merge', `Duplicate transactionId found: ${tx.transactionId}`);
      ok = false;
      break;
    }
    txIds.add(tx.transactionId);
  }

  if (ok) {
    console?.printInfo('Merge', 'Integrity check passed');
  }

  return ok;
}
