import fs from 'fs';
import { DateTime } from 'luxon';
import DataDir from './dir';

export interface FailedUploadRecord {
  syncTimestamp: string;
  entityKind: 'contact' | 'deal' | 'company';
  operation: 'create' | 'update';
  entityId: string | null;
  properties: Record<string, string>;
  errorMessage: string;
  retryCount: number;
}

export interface SyncState {
  version: 1;
  lastSuccessfulSync: {
    timestamp: string;
    dataSetId: number;
    mode: 'full' | 'incremental';
  } | null;
  lastFullSync: {
    timestamp: string;
    dataSetId: number;
  } | null;
  baselineDataSetId: number | null;
  failedUploads: FailedUploadRecord[];
}

const DEFAULT_STATE: SyncState = {
  version: 1,
  lastSuccessfulSync: null,
  lastFullSync: null,
  baselineDataSetId: null,
  failedUploads: [],
};

export class SyncStateManager {

  private file = DataDir.root.file<never>('sync-state.json');
  private state: SyncState;

  constructor() {
    this.state = this.load();
  }

  public getState(): Readonly<SyncState> {
    return this.state;
  }

  public shouldDoFullSync(forceFull: boolean, fullSyncIntervalDays: number): boolean {
    if (forceFull) return true;
    if (!this.state.lastFullSync) return true;
    if (this.state.baselineDataSetId === null) return true;

    // Check if baseline dataset still exists on disk
    const baselineDir = DataDir.root.subdir(`in-${this.state.baselineDataSetId}`);
    // subdir creates the dir if missing, so we check for the actual data file
    if (!this.baselineExistsOnDisk()) return true;

    const lastFull = DateTime.fromISO(this.state.lastFullSync.timestamp);
    const daysSinceFullSync = DateTime.now().diff(lastFull, 'days').days;
    return daysSinceFullSync >= fullSyncIntervalDays;
  }

  public getIncrementalStartDate(overlapDays: number): string | null {
    if (!this.state.lastSuccessfulSync) return null;
    const lastSync = DateTime.fromISO(this.state.lastSuccessfulSync.timestamp);
    const startDate = lastSync.minus({ days: overlapDays });
    return startDate.toISODate()!;
  }

  public recordSuccess(mode: 'full' | 'incremental', dataSetId: number): void {
    const timestamp = DateTime.now().toISO()!;

    this.state.lastSuccessfulSync = { timestamp, dataSetId, mode };

    if (mode === 'full') {
      this.state.lastFullSync = { timestamp, dataSetId };
      this.state.baselineDataSetId = dataSetId;
    }

    this.save();
  }

  public recordFailedUploads(failures: FailedUploadRecord[]): void {
    this.state.failedUploads.push(...failures);
    this.save();
  }

  public getFailedUploads(maxRetryCount: number): FailedUploadRecord[] {
    return this.state.failedUploads.filter(f => f.retryCount < maxRetryCount);
  }

  public clearSucceededRetries(succeeded: FailedUploadRecord[]): void {
    const succeededSet = new Set(succeeded);
    this.state.failedUploads = this.state.failedUploads.filter(f => !succeededSet.has(f));
    this.save();
  }

  public incrementRetryCount(failed: FailedUploadRecord[]): void {
    for (const f of failed) {
      f.retryCount++;
    }
    this.save();
  }

  public pruneExhaustedRetries(maxRetryCount: number): number {
    const before = this.state.failedUploads.length;
    this.state.failedUploads = this.state.failedUploads.filter(f => f.retryCount < maxRetryCount);
    const pruned = before - this.state.failedUploads.length;
    if (pruned > 0) this.save();
    return pruned;
  }

  private baselineExistsOnDisk(): boolean {
    if (this.state.baselineDataSetId === null) return false;
    try {
      // Check for the licenses-with.csv file as indicator the dataset exists
      const dir = DataDir.root.subdir(`in-${this.state.baselineDataSetId}`);
      const testFile = dir.file('licenses-with.csv');
      const lines = [...testFile.readLines()];
      return lines.length > 0;
    } catch {
      return false;
    }
  }

  private load(): SyncState {
    try {
      const lines = [...this.file.readLines()];
      if (lines.length === 0) return { ...DEFAULT_STATE };
      return JSON.parse(lines.join('\n'));
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  private save(): void {
    const stream = this.file.writeStream();
    try {
      stream.writeLine(JSON.stringify(this.state, null, 2));
    } finally {
      stream.close();
    }
  }

}
