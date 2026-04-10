import { runDealGenerator, runDealGeneratorTwice } from './utils';
import { Deal } from '../../lib/model/deal';
import { License, LicenseData } from '../../lib/model/license';
import { Transaction, TransactionData } from '../../lib/model/transaction';
import { EventGenerator, DealRelevantEvent } from '../../lib/deal-generator/events';
import { ActionGenerator, Action } from '../../lib/deal-generator/actions';
import { DealStage } from '../../lib/hubspot/interfaces';

// =============================================================================
// Helpers: construct minimal License and Transaction objects directly
// =============================================================================

function makeLicense(overrides: Partial<LicenseData> & { addonLicenseId: string; addonKey: string }): License {
  const defaults: LicenseData = {
    addonLicenseId: overrides.addonLicenseId,
    appEntitlementId: overrides.addonLicenseId,
    appEntitlementNumber: overrides.addonLicenseId,
    licenseId: overrides.addonLicenseId,
    addonKey: overrides.addonKey,
    addonName: 'Test Addon',
    lastUpdated: '2024-01-01',
    technicalContact: {
      email: 'tech@customer.com',
      name: 'Tech User',
    },
    billingContact: null,
    partnerDetails: null,
    company: 'Test Company',
    country: 'US',
    region: 'Americas',
    tier: '10 Users',
    licenseType: 'EVALUATION',
    hosting: 'Cloud',
    maintenanceStartDate: '2024-01-01',
    maintenanceEndDate: '2024-04-01',
    status: 'active',
    evaluationOpportunitySize: '',
    attribution: null,
    parentInfo: null,
    newEvalData: null,
  };
  return new License({ ...defaults, ...overrides });
}

function makeTransaction(
  license: License,
  overrides: Partial<TransactionData> & { transactionId: string; transactionLineItemId: string; saleType: TransactionData['saleType'] }
): Transaction {
  const defaults: TransactionData = {
    addonLicenseId: license.data.addonLicenseId,
    appEntitlementId: license.data.appEntitlementId,
    appEntitlementNumber: license.data.appEntitlementNumber,
    licenseId: license.data.licenseId,
    addonKey: license.data.addonKey,
    addonName: license.data.addonName,
    lastUpdated: license.data.lastUpdated,
    technicalContact: license.data.technicalContact!,
    billingContact: license.data.billingContact,
    partnerDetails: license.data.partnerDetails,
    company: license.data.company ?? 'Test Company',
    country: license.data.country ?? 'US',
    region: license.data.region ?? 'Americas',
    tier: '10 Users',
    licenseType: 'COMMERCIAL',
    hosting: license.data.hosting,
    maintenanceStartDate: '2024-06-01',
    maintenanceEndDate: '2024-12-01',
    transactionId: overrides.transactionId,
    transactionLineItemId: overrides.transactionLineItemId,
    saleDate: '2024-06-01',
    saleType: overrides.saleType,
    billingPeriod: 'Annual',
    purchasePrice: 500,
    vendorAmount: 400,
  };
  const tx = new Transaction({ ...defaults, ...overrides });
  tx.license = license;
  license.transactions.push(tx);
  return tx;
}

// =============================================================================
// EventGenerator Tests (isolated, directly calling the class)
// =============================================================================

describe('EventGenerator (isolated)', () => {

  describe('interpretAsEvents', () => {

    it('produces eval event type for EVALUATION license', () => {
      const gen = new EventGenerator(new Set(), new Set(), new Set(), new Set(), new Set());
      const license = makeLicense({
        addonLicenseId: 'L-1001',
        addonKey: 'com.test.plugin',
        licenseType: 'EVALUATION',
        maintenanceStartDate: '2024-03-15',
        status: 'active',
      });

      const events = gen.interpretAsEvents([license]);

      // Expect exactly one eval event with correct structure
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('eval');
      const evalEvent = events[0] as any;
      expect(evalEvent.licenses).toContain(license);
      expect(evalEvent.meta).toBeNull();
    });

    it('produces purchase event type for COMMERCIAL license', () => {
      const gen = new EventGenerator(new Set(), new Set(), new Set(), new Set(), new Set());
      const license = makeLicense({
        addonLicenseId: 'L-2001',
        addonKey: 'com.test.plugin',
        licenseType: 'COMMERCIAL',
        maintenanceStartDate: '2024-04-10',
        status: 'inactive',
      });

      const events = gen.interpretAsEvents([license]);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('purchase');
      const purchaseEvent = events[0] as any;
      expect(purchaseEvent.licenses).toContain(license);
      // Purchase events from license-only have no transaction (undefined, not null)
      expect(purchaseEvent.transaction).toBeUndefined();
    });

    it('produces renewal event for Renewal transaction', () => {
      const gen = new EventGenerator(new Set(), new Set(), new Set(), new Set(), new Set());
      const license = makeLicense({
        addonLicenseId: 'L-3001',
        addonKey: 'com.test.plugin',
        licenseType: 'COMMERCIAL',
        maintenanceStartDate: '2023-01-15',
        status: 'active',
      });
      const tx = makeTransaction(license, {
        transactionId: 'AT-500001',
        transactionLineItemId: 'TL-1',
        saleType: 'Renewal',
        maintenanceStartDate: '2024-01-15',
        vendorAmount: 350,
      });

      const events = gen.interpretAsEvents([tx]);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('renewal');
      const renewalEvent = events[0] as any;
      expect(renewalEvent.transaction).toBe(tx);
    });

    it('produces upgrade event for Upgrade transaction', () => {
      const gen = new EventGenerator(new Set(), new Set(), new Set(), new Set(), new Set());
      const license = makeLicense({
        addonLicenseId: 'L-3002',
        addonKey: 'com.test.plugin',
        licenseType: 'COMMERCIAL',
        maintenanceStartDate: '2023-02-20',
        status: 'active',
      });
      const tx = makeTransaction(license, {
        transactionId: 'AT-500002',
        transactionLineItemId: 'TL-2',
        saleType: 'Upgrade',
        maintenanceStartDate: '2024-02-20',
        vendorAmount: 600,
      });

      const events = gen.interpretAsEvents([tx]);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('upgrade');
      const upgradeEvent = events[0] as any;
      expect(upgradeEvent.transaction).toBe(tx);
      // Vendor amount is on the transaction, not the event itself
      expect(upgradeEvent.transaction.data.vendorAmount).toBe(600);
    });
  });

  describe('applyRefunds', () => {

    it('marks fully refunded transaction as refunded via getSortedRecords', () => {
      const gen = new EventGenerator(new Set(), new Set(), new Set(), new Set(), new Set());
      const license = makeLicense({
        addonLicenseId: 'L-4001',
        addonKey: 'com.test.plugin',
        licenseType: 'COMMERCIAL',
        maintenanceStartDate: '2024-01-10',
        status: 'active',
      });
      const purchaseTx = makeTransaction(license, {
        transactionId: 'AT-600001',
        transactionLineItemId: 'TL-10',
        saleType: 'New',
        saleDate: '2024-06-01',
        maintenanceStartDate: '2024-06-01',
        vendorAmount: 500,
      });
      const refundTx = makeTransaction(license, {
        transactionId: 'AT-600002',
        transactionLineItemId: 'TL-11',
        saleType: 'Refund',
        saleDate: '2024-06-01',
        maintenanceStartDate: '2024-06-01',
        vendorAmount: -500,
      });

      const records = gen.getSortedRecords([license]);

      // After full refund: purchase marked refunded, both removed from records
      expect(purchaseTx.refunded).toBe(true);
      expect(records.filter(r => r instanceof Transaction && r.data.saleType === 'Refund')).toHaveLength(0);
      expect(records.filter(r => r === purchaseTx)).toHaveLength(0);
      // Only the license record itself should remain
      expect(records).toHaveLength(1);
      expect(records[0]).toBeInstanceOf(License);
    });

    it('reduces vendorAmount on partial refund via getSortedRecords', () => {
      const gen = new EventGenerator(new Set(), new Set(), new Set(), new Set(), new Set());
      const license = makeLicense({
        addonLicenseId: 'L-4002',
        addonKey: 'com.test.plugin',
        licenseType: 'COMMERCIAL',
        maintenanceStartDate: '2024-02-15',
        status: 'active',
      });
      const purchaseTx = makeTransaction(license, {
        transactionId: 'AT-700001',
        transactionLineItemId: 'TL-20',
        saleType: 'New',
        saleDate: '2024-07-01',
        maintenanceStartDate: '2024-07-01',
        vendorAmount: 800,
      });
      const refundTx = makeTransaction(license, {
        transactionId: 'AT-700002',
        transactionLineItemId: 'TL-21',
        saleType: 'Refund',
        saleDate: '2024-07-01',
        maintenanceStartDate: '2024-07-01',
        vendorAmount: -200,
      });

      const records = gen.getSortedRecords([license]);

      // After partial refund of 200 from 800
      expect(purchaseTx.data.vendorAmount).toBe(600);
      expect(purchaseTx.refunded).toBe(false);
      // The partially refunded transaction should still be in the records
      expect(records.filter(r => r === purchaseTx)).toHaveLength(1);
      // Records should not contain the license since there's a 'New' transaction
      expect(records.filter(r => r instanceof License)).toHaveLength(0);
    });
  });

  describe('getEventMeta', () => {

    it('returns null meta for partner-domain contacts (partner-only no longer blocks)', () => {
      const partnerDomains = new Set(['partner-corp.com']);
      const gen = new EventGenerator(new Set(), partnerDomains, new Set(), new Set(), new Set());

      const license = makeLicense({
        addonLicenseId: 'L-5001',
        addonKey: 'com.test.plugin',
        licenseType: 'COMMERCIAL',
        maintenanceStartDate: '2024-03-01',
        status: 'active',
        technicalContact: {
          email: 'user@partner-corp.com',
          name: 'Partner User',
        },
      });

      const events = gen.interpretAsEvents([license]);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('purchase');
      // Partner-only transactions now create deals normally
      expect((events[0] as any).meta).toBeNull();
    });

    it('returns archived-app when addonKey is in archived set', () => {
      const archivedApps = new Set(['com.test.archived-plugin']);
      const gen = new EventGenerator(archivedApps, new Set(), new Set(), new Set(), new Set());

      const license = makeLicense({
        addonLicenseId: 'L-5002',
        addonKey: 'com.test.archived-plugin',
        licenseType: 'COMMERCIAL',
        maintenanceStartDate: '2024-04-01',
        status: 'active',
        technicalContact: {
          email: 'user@example.com',
          name: 'Normal User',
        },
      });

      const events = gen.interpretAsEvents([license]);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('purchase');
      expect((events[0] as any).meta).toBe('archived-app');
    });
  });

  describe('normalizeEvalAndPurchaseEvents', () => {

    it('merges eval followed by purchase into purchase with eval licenses prepended', () => {
      const gen = new EventGenerator(new Set(), new Set(), new Set(), new Set(), new Set());

      const evalLicense = makeLicense({
        addonLicenseId: 'L-6001',
        addonKey: 'com.test.plugin',
        licenseType: 'EVALUATION',
        maintenanceStartDate: '2024-01-01',
        status: 'inactive',
      });

      const purchaseLicense = makeLicense({
        addonLicenseId: 'L-6002',
        addonKey: 'com.test.plugin',
        licenseType: 'COMMERCIAL',
        maintenanceStartDate: '2024-01-15',
        status: 'active',
      });

      const events = gen.interpretAsEvents([evalLicense, purchaseLicense]);

      // After normalization: single purchase event containing both licenses
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('purchase');
      const purchaseEvent = events[0] as any;
      expect(purchaseEvent.licenses).toHaveLength(2);
      expect(purchaseEvent.licenses[0]).toBe(evalLicense);
      expect(purchaseEvent.licenses[1]).toBe(purchaseLicense);
    });
  });
});

// =============================================================================
// ActionGenerator Tests (via runDealGenerator integration)
// =============================================================================

describe('ActionGenerator', () => {

  describe('eval actions', () => {

    it('creates deal with EVAL stage for active evaluation license', () => {
      const { actions } = runDealGenerator({
        records: [
          ['LIC-7001', '2024-05-01', 'EVALUATION', 'active', []],
        ],
      });

      expect(actions).toEqual([
        {
          Create: {
            dealStage: 'EVAL',
            addonLicenseId: 'LIC-7001',
            transactionId: null,
            transactionLineItemId: null,
            closeDate: '2024-05-01',
            amount: null,
          },
        },
      ]);
    });

    it('creates deal with CLOSED_LOST stage for inactive evaluation license', () => {
      const { actions } = runDealGenerator({
        records: [
          ['LIC-7002', '2024-05-15', 'EVALUATION', 'inactive', []],
        ],
      });

      expect(actions).toEqual([
        {
          Create: {
            dealStage: 'CLOSED_LOST',
            addonLicenseId: 'LIC-7002',
            transactionId: null,
            transactionLineItemId: null,
            closeDate: '2024-05-15',
            amount: 0,
          },
        },
      ]);
    });
  });

  describe('refunded purchase actions', () => {

    it('creates deal with CLOSED_LOST stage when purchase transaction is fully refunded', () => {
      const { actions } = runDealGenerator({
        records: [
          ['LIC-8001', '2024-06-01', 'COMMERCIAL', 'active', [
            ['AT-900001', 'TL-40', '2024-06-01', 'New', 750],
            ['AT-900002', 'TL-41', '2024-06-01', 'Refund', -750],
          ]],
        ],
      });

      // When a New transaction is fully refunded, applyRefunds removes both
      // transactions. The license-only purchase event defaults to CLOSED_WON.
      const createActions = actions.filter((a: any) => a.Create);
      expect(createActions).toHaveLength(1);
      expect((createActions[0] as any).Create.dealStage).toBe('CLOSED_WON');
    });
  });

  describe('maybeMakeMetaAction', () => {

    it('creates deal for partner-domain contacts (no longer noop)', () => {
      const { actions } = runDealGenerator({
        records: [
          ['LIC-9001', '2024-07-01', 'COMMERCIAL', 'active', [
            ['AT-1000001', 'TL-50', '2024-07-01', 'New', 450],
          ]],
        ],
        partnerLicenseIds: ['LIC-9001'],
      });

      // Partner-only transactions now create deals normally
      expect(actions).toHaveLength(1);
      expect(actions[0]).toHaveProperty('Create');
    });

    it('returns noop for archived-app eval events', () => {
      const { actions } = runDealGenerator({
        addonKey: 'com.example.old-archived-app',
        archivedApps: new Set(['com.example.old-archived-app']),
        records: [
          ['LIC-9002', '2024-07-15', 'EVALUATION', 'active', []],
        ],
      });

      expect(actions).toEqual([
        { Nothing: ['archived-app', null] },
      ]);
    });
  });

  describe('duplicate deal resolution', () => {

    it('singleDeal resolves to one deal when multiple deals match same license', () => {
      const { actions, deals } = runDealGenerator({
        addonKey: 'my-dup-addon',
        deals: [
          {
            id: 'deal-dup-1',
            data: {
              closeDate: '2024-01-01',
              maintenanceEndDate: '2024-06-01',
              addonLicenseId: 'LIC-10001',
              transactionId: '',
              transactionLineItemId: '',
              amount: 100,
              appEntitlementId: 'LIC-10001',
              appEntitlementNumber: 'LIC-10001',
            },
          } as Deal,
          {
            id: 'deal-dup-2',
            data: {
              closeDate: '2024-01-01',
              maintenanceEndDate: '2024-06-01',
              addonLicenseId: 'LIC-10001',
              transactionId: '',
              transactionLineItemId: '',
              amount: 100,
              appEntitlementId: 'LIC-10001',
              appEntitlementNumber: 'LIC-10001',
            },
          } as Deal,
        ] as Deal[],
        records: [
          ['LIC-10001', '2024-01-01', 'COMMERCIAL', 'inactive', []],
        ],
      });

      // With two duplicate deals, one should survive and the other should be
      // marked with duplicateOf set to the surviving deal's id.
      // Both deals remain in the manager (duplicates are marked, not removed).
      const allDupDeals = deals.filter(d => d.id === 'deal-dup-1' || d.id === 'deal-dup-2');
      expect(allDupDeals).toHaveLength(2);

      const survivingDeal = allDupDeals.find(d => d.data.duplicateOf === null);
      const duplicateDeal = allDupDeals.find(d => d.data.duplicateOf !== null);

      expect(survivingDeal).toBeDefined();
      expect(duplicateDeal).toBeDefined();
      expect(duplicateDeal!.data.duplicateOf).toBe(survivingDeal!.id);

      // The action for the surviving deal should be an Update
      const updateAction = actions.find((a: any) => a.Update);
      expect(updateAction).toBeDefined();
    });

    it('throws BlockingDeal when primary deal is encountered as duplicate twice', () => {
      const { deals } = runDealGenerator({
        addonKey: 'my-blocking-addon',
        deals: [
          {
            id: 'deal-block-1',
            data: {
              closeDate: '2024-01-01',
              maintenanceEndDate: '2024-06-01',
              addonLicenseId: 'LIC-11001',
              transactionId: '',
              transactionLineItemId: '',
              amount: 200,
              appEntitlementId: 'LIC-11001',
              appEntitlementNumber: 'LIC-11001',
            },
          } as Deal,
          {
            id: 'deal-block-2',
            data: {
              closeDate: '2024-01-01',
              maintenanceEndDate: '2024-06-01',
              addonLicenseId: 'LIC-11001',
              transactionId: '',
              transactionLineItemId: '',
              amount: 200,
              appEntitlementId: 'LIC-11001',
              appEntitlementNumber: 'LIC-11001',
            },
          } as Deal,
          {
            id: 'deal-block-3',
            data: {
              closeDate: '2024-02-01',
              maintenanceEndDate: '2024-07-01',
              addonLicenseId: 'LIC-11001',
              transactionId: 'AT-1100001',
              transactionLineItemId: 'TL-60',
              amount: 300,
              appEntitlementId: 'LIC-11001',
              appEntitlementNumber: 'LIC-11001',
            },
          } as Deal,
        ] as Deal[],
        records: [
          ['LIC-11001', '2024-01-01', 'COMMERCIAL', 'active', [
            ['AT-1100001', 'TL-60', '2024-02-01', 'Renewal', 300],
          ]],
        ],
      });

      // BlockingDeal is caught and logged by deal-generator.ts,
      // but deals are NOT removed from the manager
      const dealIds = deals.map(d => d.id);
      expect(dealIds).toContain('deal-block-1');
      expect(dealIds).toContain('deal-block-2');
    });
  });
});
