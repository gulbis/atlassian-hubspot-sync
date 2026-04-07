import { RawDataSet } from '../lib/data/raw';
import { RawLicense, RawTransaction } from '../lib/marketplace/raw';
import { mergeMpacData, verifyMergeIntegrity, IncrementalMpacData, FreshHubspotAndStaticData } from '../lib/engine/incremental-download';

function makeLicense(id: string, lastUpdated: string, overrides?: Partial<RawLicense>): RawLicense {
  return {
    licenseId: id,
    addonKey: 'com.test.app',
    addonName: 'Test App',
    lastUpdated,
    contactDetails: {},
    tier: '10',
    licenseType: 'COMMERCIAL',
    hosting: 'Cloud',
    maintenanceStartDate: '2025-01-01',
    status: 'active',
    ...overrides,
  };
}

function makeTransaction(id: string, lastUpdated: string, overrides?: Partial<RawTransaction>): RawTransaction {
  return {
    transactionId: id,
    transactionLineItemId: `${id}-1`,
    addonKey: 'com.test.app',
    addonName: 'Test App',
    lastUpdated,
    customerDetails: {
      company: 'Test Corp',
      country: 'US',
      region: 'Americas',
      technicalContact: { email: 'tech@test.com' },
    },
    purchaseDetails: {
      saleDate: '2025-01-01',
      tier: '10',
      licenseType: 'COMMERCIAL',
      hosting: 'Cloud',
      billingPeriod: 'Annual',
      purchasePrice: 100,
      vendorAmount: 70,
      saleType: 'New',
      maintenanceStartDate: '2025-01-01',
      maintenanceEndDate: '2026-01-01',
    },
    ...overrides,
  };
}

function makeBaseline(licenses: RawLicense[], transactions: RawTransaction[]): RawDataSet {
  return {
    licensesWithDataInsights: licenses,
    licensesWithoutDataInsights: [],
    transactions,
    rawAttributions: [],
    tlds: ['com'],
    freeDomains: ['gmail.com'],
    rawDeals: [],
    rawCompanies: [],
    rawContacts: [],
  };
}

const freshData: FreshHubspotAndStaticData = {
  tlds: ['com', 'org'],
  freeDomains: ['gmail.com', 'yahoo.com'],
  rawDeals: [],
  rawCompanies: [],
  rawContacts: [],
};

describe('mergeMpacData', () => {

  it('returns baseline unchanged when delta is empty', () => {
    const baseline = makeBaseline(
      [makeLicense('L1', '2025-01-01'), makeLicense('L2', '2025-01-02')],
      [makeTransaction('T1', '2025-01-01')],
    );
    const delta: IncrementalMpacData = { deltaLicenses: [], deltaTransactions: [] };

    const { merged, stats } = mergeMpacData(baseline, delta, freshData);

    expect(merged.licensesWithDataInsights).toHaveLength(2);
    expect(merged.transactions).toHaveLength(1);
    expect(stats.licensesAdded).toBe(0);
    expect(stats.licensesReplaced).toBe(0);
    expect(stats.mergedLicenses).toBe(2);
  });

  it('adds new licenses from delta', () => {
    const baseline = makeBaseline(
      [makeLicense('L1', '2025-01-01')],
      [],
    );
    const delta: IncrementalMpacData = {
      deltaLicenses: [makeLicense('L2', '2025-03-01'), makeLicense('L3', '2025-03-02')],
      deltaTransactions: [],
    };

    const { merged, stats } = mergeMpacData(baseline, delta, freshData);

    expect(merged.licensesWithDataInsights).toHaveLength(3);
    expect(stats.licensesAdded).toBe(2);
    expect(stats.licensesReplaced).toBe(0);
  });

  it('replaces license when delta has newer lastUpdated', () => {
    const baseline = makeBaseline(
      [makeLicense('L1', '2025-01-01', { status: 'active' })],
      [],
    );
    const delta: IncrementalMpacData = {
      deltaLicenses: [makeLicense('L1', '2025-03-01', { status: 'cancelled' })],
      deltaTransactions: [],
    };

    const { merged, stats } = mergeMpacData(baseline, delta, freshData);

    expect(merged.licensesWithDataInsights).toHaveLength(1);
    expect(merged.licensesWithDataInsights[0].status).toBe('cancelled');
    expect(stats.licensesReplaced).toBe(1);
    expect(stats.licensesAdded).toBe(0);
  });

  it('keeps baseline license when delta has older lastUpdated', () => {
    const baseline = makeBaseline(
      [makeLicense('L1', '2025-03-01', { status: 'active' })],
      [],
    );
    const delta: IncrementalMpacData = {
      deltaLicenses: [makeLicense('L1', '2025-01-01', { status: 'inactive' })],
      deltaTransactions: [],
    };

    const { merged } = mergeMpacData(baseline, delta, freshData);

    expect(merged.licensesWithDataInsights[0].status).toBe('active');
  });

  it('merges transactions by transactionId', () => {
    const baseline = makeBaseline(
      [],
      [makeTransaction('T1', '2025-01-01'), makeTransaction('T2', '2025-01-02')],
    );
    const delta: IncrementalMpacData = {
      deltaLicenses: [],
      deltaTransactions: [
        makeTransaction('T2', '2025-03-01'),  // update existing
        makeTransaction('T3', '2025-03-01'),  // new
      ],
    };

    const { merged, stats } = mergeMpacData(baseline, delta, freshData);

    expect(merged.transactions).toHaveLength(3);
    expect(stats.transactionsAdded).toBe(1);
    expect(stats.transactionsReplaced).toBe(1);
  });

  it('preserves licensesWithoutDataInsights from baseline', () => {
    const baseline = makeBaseline([], []);
    baseline.licensesWithoutDataInsights = [makeLicense('OLD-1', '2017-06-01')];

    const { merged } = mergeMpacData(baseline, { deltaLicenses: [], deltaTransactions: [] }, freshData);

    expect(merged.licensesWithoutDataInsights).toHaveLength(1);
    expect(merged.licensesWithoutDataInsights[0].licenseId).toBe('OLD-1');
  });

  it('preserves rawAttributions from baseline', () => {
    const baseline = makeBaseline([], []);
    baseline.rawAttributions = [{ addonKey: 'test', channel: 'organic', eventTimestamp: '2025-01-01' }];

    const { merged } = mergeMpacData(baseline, { deltaLicenses: [], deltaTransactions: [] }, freshData);

    expect(merged.rawAttributions).toHaveLength(1);
  });

  it('uses fresh HubSpot and static data', () => {
    const baseline = makeBaseline([], []);
    baseline.tlds = ['old-tld'];
    baseline.freeDomains = ['old-domain'];

    const { merged } = mergeMpacData(baseline, { deltaLicenses: [], deltaTransactions: [] }, freshData);

    expect(merged.tlds).toEqual(['com', 'org']);
    expect(merged.freeDomains).toEqual(['gmail.com', 'yahoo.com']);
  });

});

describe('verifyMergeIntegrity', () => {

  it('passes when merged has more licenses than baseline', () => {
    const baseline = makeBaseline([makeLicense('L1', '2025-01-01')], []);
    const merged = makeBaseline(
      [makeLicense('L1', '2025-01-01'), makeLicense('L2', '2025-03-01')],
      [],
    );

    expect(verifyMergeIntegrity(baseline, merged)).toBe(true);
  });

  it('passes when counts are equal', () => {
    const baseline = makeBaseline([makeLicense('L1', '2025-01-01')], [makeTransaction('T1', '2025-01-01')]);
    const merged = makeBaseline([makeLicense('L1', '2025-03-01')], [makeTransaction('T1', '2025-03-01')]);

    expect(verifyMergeIntegrity(baseline, merged)).toBe(true);
  });

  it('fails when license count decreased', () => {
    const baseline = makeBaseline(
      [makeLicense('L1', '2025-01-01'), makeLicense('L2', '2025-01-02')],
      [],
    );
    const merged = makeBaseline([makeLicense('L1', '2025-01-01')], []);

    expect(verifyMergeIntegrity(baseline, merged)).toBe(false);
  });

  it('fails when transaction count decreased', () => {
    const baseline = makeBaseline(
      [],
      [makeTransaction('T1', '2025-01-01'), makeTransaction('T2', '2025-01-02')],
    );
    const merged = makeBaseline([], [makeTransaction('T1', '2025-01-01')]);

    expect(verifyMergeIntegrity(baseline, merged)).toBe(false);
  });

  it('fails on duplicate licenseIds', () => {
    const baseline = makeBaseline([], []);
    const merged = makeBaseline(
      [makeLicense('L1', '2025-01-01'), makeLicense('L1', '2025-01-02')],
      [],
    );

    expect(verifyMergeIntegrity(baseline, merged)).toBe(false);
  });

  it('fails on duplicate transactionIds', () => {
    const baseline = makeBaseline([], []);
    const merged = makeBaseline(
      [],
      [makeTransaction('T1', '2025-01-01'), makeTransaction('T1', '2025-01-02')],
    );

    expect(verifyMergeIntegrity(baseline, merged)).toBe(false);
  });

});
