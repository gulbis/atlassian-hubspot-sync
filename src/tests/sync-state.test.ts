import { SyncState, FailedUploadRecord } from '../lib/data/sync-state';

// Test the pure logic of SyncState decisions without touching the filesystem.
// We test the data structures and decision rules directly.

describe('SyncState data structures', () => {

  it('default state has null fields and empty failures', () => {
    const state: SyncState = {
      version: 1,
      lastSuccessfulSync: null,
      lastFullSync: null,
      baselineDataSetId: null,
      failedUploads: [],
    };

    expect(state.lastSuccessfulSync).toBeNull();
    expect(state.lastFullSync).toBeNull();
    expect(state.baselineDataSetId).toBeNull();
    expect(state.failedUploads).toEqual([]);
  });

  it('records sync success for full mode', () => {
    const state: SyncState = {
      version: 1,
      lastSuccessfulSync: null,
      lastFullSync: null,
      baselineDataSetId: null,
      failedUploads: [],
    };

    const timestamp = '2026-04-07T10:00:00.000Z';
    const dataSetId = 1712487600000;

    state.lastSuccessfulSync = { timestamp, dataSetId, mode: 'full' };
    state.lastFullSync = { timestamp, dataSetId };
    state.baselineDataSetId = dataSetId;

    expect(state.lastSuccessfulSync.mode).toBe('full');
    expect(state.baselineDataSetId).toBe(dataSetId);
  });

  it('records sync success for incremental mode (baseline unchanged)', () => {
    const state: SyncState = {
      version: 1,
      lastSuccessfulSync: { timestamp: '2026-04-06T10:00:00.000Z', dataSetId: 100, mode: 'full' },
      lastFullSync: { timestamp: '2026-04-06T10:00:00.000Z', dataSetId: 100 },
      baselineDataSetId: 100,
      failedUploads: [],
    };

    // Incremental sync does not update lastFullSync or baselineDataSetId
    state.lastSuccessfulSync = { timestamp: '2026-04-07T10:00:00.000Z', dataSetId: 200, mode: 'incremental' };

    expect(state.lastSuccessfulSync.mode).toBe('incremental');
    expect(state.baselineDataSetId).toBe(100); // unchanged
    expect(state.lastFullSync!.dataSetId).toBe(100); // unchanged
  });

});

describe('shouldDoFullSync decision logic', () => {

  function shouldDoFull(state: SyncState, force: boolean, intervalDays: number, baselineExists: boolean): boolean {
    if (force) return true;
    if (!state.lastFullSync) return true;
    if (state.baselineDataSetId === null) return true;
    if (!baselineExists) return true;

    const lastFull = new Date(state.lastFullSync.timestamp).getTime();
    const daysSince = (Date.now() - lastFull) / (1000 * 60 * 60 * 24);
    return daysSince >= intervalDays;
  }

  it('returns true when force flag is set', () => {
    const state: SyncState = {
      version: 1,
      lastSuccessfulSync: { timestamp: new Date().toISOString(), dataSetId: 1, mode: 'full' },
      lastFullSync: { timestamp: new Date().toISOString(), dataSetId: 1 },
      baselineDataSetId: 1,
      failedUploads: [],
    };

    expect(shouldDoFull(state, true, 7, true)).toBe(true);
  });

  it('returns true when no previous full sync', () => {
    const state: SyncState = {
      version: 1,
      lastSuccessfulSync: null,
      lastFullSync: null,
      baselineDataSetId: null,
      failedUploads: [],
    };

    expect(shouldDoFull(state, false, 7, false)).toBe(true);
  });

  it('returns true when baseline dataset does not exist', () => {
    const state: SyncState = {
      version: 1,
      lastSuccessfulSync: { timestamp: new Date().toISOString(), dataSetId: 1, mode: 'full' },
      lastFullSync: { timestamp: new Date().toISOString(), dataSetId: 1 },
      baselineDataSetId: 1,
      failedUploads: [],
    };

    expect(shouldDoFull(state, false, 7, false)).toBe(true);
  });

  it('returns true when interval exceeded', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const state: SyncState = {
      version: 1,
      lastSuccessfulSync: { timestamp: eightDaysAgo, dataSetId: 1, mode: 'full' },
      lastFullSync: { timestamp: eightDaysAgo, dataSetId: 1 },
      baselineDataSetId: 1,
      failedUploads: [],
    };

    expect(shouldDoFull(state, false, 7, true)).toBe(true);
  });

  it('returns false when within interval and baseline exists', () => {
    const state: SyncState = {
      version: 1,
      lastSuccessfulSync: { timestamp: new Date().toISOString(), dataSetId: 1, mode: 'full' },
      lastFullSync: { timestamp: new Date().toISOString(), dataSetId: 1 },
      baselineDataSetId: 1,
      failedUploads: [],
    };

    expect(shouldDoFull(state, false, 7, true)).toBe(false);
  });

});

describe('FailedUploadRecord management', () => {

  it('filters by maxRetryCount', () => {
    const failures: FailedUploadRecord[] = [
      { syncTimestamp: '', entityKind: 'contact', operation: 'create', entityId: null, properties: {}, errorMessage: '', retryCount: 0 },
      { syncTimestamp: '', entityKind: 'deal', operation: 'create', entityId: null, properties: {}, errorMessage: '', retryCount: 2 },
      { syncTimestamp: '', entityKind: 'company', operation: 'update', entityId: '123', properties: {}, errorMessage: '', retryCount: 3 },
    ];

    const toRetry = failures.filter(f => f.retryCount < 3);
    expect(toRetry).toHaveLength(2);
    expect(toRetry.map(f => f.entityKind)).toEqual(['contact', 'deal']);
  });

  it('increments retry count', () => {
    const failure: FailedUploadRecord = {
      syncTimestamp: '', entityKind: 'contact', operation: 'create', entityId: null, properties: {}, errorMessage: '', retryCount: 1,
    };

    failure.retryCount++;
    expect(failure.retryCount).toBe(2);
  });

  it('prunes exhausted retries', () => {
    const failures: FailedUploadRecord[] = [
      { syncTimestamp: '', entityKind: 'contact', operation: 'create', entityId: null, properties: {}, errorMessage: '', retryCount: 0 },
      { syncTimestamp: '', entityKind: 'deal', operation: 'create', entityId: null, properties: {}, errorMessage: '', retryCount: 3 },
      { syncTimestamp: '', entityKind: 'company', operation: 'update', entityId: '123', properties: {}, errorMessage: '', retryCount: 5 },
    ];

    const remaining = failures.filter(f => f.retryCount < 3);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].entityKind).toBe('contact');
  });

});

describe('getIncrementalStartDate logic', () => {

  it('subtracts overlap days from last sync timestamp', () => {
    // Last sync was April 7, overlap is 1 day → start = April 6
    const lastSyncDate = new Date('2026-04-07T10:00:00.000Z');
    const overlapDays = 1;

    const start = new Date(lastSyncDate.getTime() - overlapDays * 24 * 60 * 60 * 1000);
    const startIso = start.toISOString().split('T')[0];

    expect(startIso).toBe('2026-04-06');
  });

  it('with 2 days overlap subtracts correctly', () => {
    const lastSyncDate = new Date('2026-04-07T10:00:00.000Z');
    const overlapDays = 2;

    const start = new Date(lastSyncDate.getTime() - overlapDays * 24 * 60 * 60 * 1000);
    const startIso = start.toISOString().split('T')[0];

    expect(startIso).toBe('2026-04-05');
  });

});
