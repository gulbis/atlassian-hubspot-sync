import fs from 'fs';
import { fileURLToPath, pathToFileURL, URL } from 'url';
import { DateTime } from 'luxon';
import DataDir from './dir';

export interface SyncLogEntry {
  timestamp: string;
  mode: 'full' | 'incremental';
  dataSetId: number;
  syncPeriod: { startDate: string; endDate: string } | null;
  duration: {
    totalMs: number;
    downloadMs: number;
    engineMs: number;
    uploadMs: number;
  };
  download: {
    licensesWithInsights: number;
    licensesWithoutInsights: number;
    transactions: number;
    attributions: number;
  };
  merge: {
    baselineLicenses: number;
    deltaLicenses: number;
    mergedLicenses: number;
    baselineTransactions: number;
    deltaTransactions: number;
    mergedTransactions: number;
  } | null;
  upload: {
    contacts: EntityUploadStats;
    deals: EntityUploadStats;
    companies: EntityUploadStats;
    associations: { created: number; deleted: number };
    retried: { succeeded: number; failed: number };
  };
  status: 'success' | 'partial_failure' | 'failure';
  errors: string[];
}

export interface EntityUploadStats {
  created: number;
  updated: number;
  failed: number;
  unchanged: number;
}

export class SyncLogger {

  private filePath: string;

  constructor() {
    // Derive the absolute path using the same base as DataDir.root
    const dataRootUrl = new URL('data/', new URL('../../', pathToFileURL(__dirname)));
    this.filePath = fileURLToPath(new URL('sync-log.jsonl', dataRootUrl));
  }

  public appendEntry(entry: SyncLogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.filePath, line, 'utf8');
  }

  public readRecent(limit: number = 20): SyncLogEntry[] {
    if (!fs.existsSync(this.filePath)) return [];

    const content = fs.readFileSync(this.filePath, 'utf8');
    if (!content.trim()) return [];

    const lines = content.trim().split('\n').filter(l => l.trim());
    const recent = lines.slice(-limit);

    return recent.map(line => {
      try {
        return JSON.parse(line) as SyncLogEntry;
      } catch {
        return null;
      }
    }).filter((e): e is SyncLogEntry => e !== null);
  }

}

export function emptySyncLogEntry(
  mode: 'full' | 'incremental',
  dataSetId: number,
): SyncLogEntry {
  return {
    timestamp: DateTime.now().toISO()!,
    mode,
    dataSetId,
    syncPeriod: null,
    duration: { totalMs: 0, downloadMs: 0, engineMs: 0, uploadMs: 0 },
    download: { licensesWithInsights: 0, licensesWithoutInsights: 0, transactions: 0, attributions: 0 },
    merge: null,
    upload: {
      contacts: { created: 0, updated: 0, failed: 0, unchanged: 0 },
      deals: { created: 0, updated: 0, failed: 0, unchanged: 0 },
      companies: { created: 0, updated: 0, failed: 0, unchanged: 0 },
      associations: { created: 0, deleted: 0 },
      retried: { succeeded: 0, failed: 0 },
    },
    status: 'success',
    errors: [],
  };
}
