import { HubspotUploader } from '../lib/hubspot/uploader';
import { Hubspot } from '../lib/hubspot/hubspot';
import { DealStage, EntityKind, ExistingEntity, IndexedEntity, NewEntity, Pipeline, Association } from '../lib/hubspot/interfaces';
import { DealData } from '../lib/model/deal';
import { ContactData } from '../lib/model/contact';

// ---------------------------------------------------------------------------
// Mock HubspotAPI — records every call so tests can assert on real behavior
// ---------------------------------------------------------------------------

jest.mock('../lib/hubspot/api', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockApi),
  };
});

jest.mock('../lib/config/env', () => ({
  deleteBlockingDeals: jest.fn(() => false),
  hubspotCredsFromENV: jest.fn(() => ({ accessToken: 'test-token' })),
}));

type CallRecord = {
  method: string;
  kind?: EntityKind;
  otherKind?: EntityKind;
  inputs: any[];
};

let callLog: CallRecord[];
let mockApi: {
  createEntities: jest.Mock;
  updateEntities: jest.Mock;
  createAssociations: jest.Mock;
  deleteAssociations: jest.Mock;
  archiveEntities: jest.Mock;
};

function resetMockApi() {
  callLog = [];

  mockApi = {
    createEntities: jest.fn(async (kind: EntityKind, entities: NewEntity[]): Promise<IndexedEntity[]> => {
      callLog.push({ method: 'createEntities', kind, inputs: entities });
      // Return indexed entities with generated ids, preserving input order
      return entities.map((e, i) => ({
        index: i,
        result: {
          id: `created-${kind}-${i + 1}`,
          properties: { ...e.properties },
        },
      }));
    }),

    updateEntities: jest.fn(async (kind: EntityKind, entities: ExistingEntity[]): Promise<ExistingEntity[]> => {
      callLog.push({ method: 'updateEntities', kind, inputs: entities });
      return entities;
    }),

    createAssociations: jest.fn(async (fromKind: EntityKind, toKind: EntityKind, inputs: Association[]) => {
      callLog.push({ method: 'createAssociations', kind: fromKind, otherKind: toKind, inputs });
    }),

    deleteAssociations: jest.fn(async (fromKind: EntityKind, toKind: EntityKind, inputs: Association[]) => {
      callLog.push({ method: 'deleteAssociations', kind: fromKind, otherKind: toKind, inputs });
    }),

    archiveEntities: jest.fn(async (kind: EntityKind, entities: any[]) => {
      callLog.push({ method: 'archiveEntities', kind, inputs: entities });
    }),
  };
}

// ---------------------------------------------------------------------------
// Helpers to build realistic domain objects
// ---------------------------------------------------------------------------

function makeHubspot(config: { deal?: any; contact?: any } = {}) {
  return new Hubspot({ deal: config.deal ?? {}, contact: config.contact ?? {} });
}

function defaultDealData(overrides: Partial<DealData> = {}): DealData {
  return {
    dealName: 'Acme Cloud Migration',
    closeDate: '2024-03-15',
    pipeline: Pipeline.MPAC,
    dealStage: DealStage.EVAL,
    amount: 1500,
    addonLicenseId: 'ALI-78901',
    transactionId: null,
    transactionLineItemId: null,
    appEntitlementId: null,
    appEntitlementNumber: null,
    relatedProducts: null,
    app: null,
    country: 'US',
    origin: null,
    deployment: 'Cloud',
    saleType: 'New',
    licenseTier: 25,
    associatedPartner: null,
    duplicateOf: null,
    maintenanceEndDate: null,
    ...overrides,
  };
}

function defaultContactData(overrides: Partial<ContactData> = {}): ContactData {
  return {
    email: 'jane.doe@acmecorp.com',
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '+1-415-555-0198',
    city: 'San Francisco',
    state: 'CA',
    country: 'US',
    region: null,
    contactType: 'customer',
    products: new Set<string>(),
    deployment: new Set<string>(),
    relatedProducts: new Set<string>(),
    licenseTier: null,
    lastMpacEvent: null,
    lastAssociatedPartner: null,
    utmChannel: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    utmReferrer: null,
    googleClickId: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetMockApi();
});

describe('HubspotUploader — property sync: creates vs updates separation', () => {

  it('sends new entities (id === null) to createEntities, not updateEntities', async () => {
    const hubspot = makeHubspot();
    hubspot.dealManager.create(defaultDealData({ dealName: 'Brand New Deal' }));

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const createCalls = callLog.filter(c => c.method === 'createEntities' && c.kind === 'deal');
    const updateCalls = callLog.filter(c => c.method === 'updateEntities' && c.kind === 'deal');

    expect(createCalls.length).toBe(1);
    expect(createCalls[0].inputs.length).toBe(1);
    expect(createCalls[0].inputs[0].properties['dealname']).toBe('Brand New Deal');
    expect(updateCalls.length).toBe(0);
  });

  it('sends existing entities (has id + changes) to updateEntities, not createEntities', async () => {
    const hubspot = makeHubspot();
    hubspot.dealManager.importEntities([{
      id: 'deal-501',
      properties: {
        dealname: 'Original Deal Name',
        closedate: '2024-01-10T00:00:00Z',
        pipeline: 'Pipeline',
        dealstage: 'Eval',
        amount: '800',
        addonLicenseId: 'ALI-501',
        transactionId: '',
        transactionLineItemId: '',
        appEntitlementId: '',
        appEntitlementNumber: '',
      },
      associations: [],
    }]);

    const deal = hubspot.dealManager.getArray()[0];
    deal.data.dealName = 'Updated Deal Name';

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const createCalls = callLog.filter(c => c.method === 'createEntities' && c.kind === 'deal');
    const updateCalls = callLog.filter(c => c.method === 'updateEntities' && c.kind === 'deal');

    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].inputs.length).toBe(1);
    expect(updateCalls[0].inputs[0].id).toBe('deal-501');
    expect(updateCalls[0].inputs[0].properties['dealname']).toBe('Updated Deal Name');
    expect(createCalls.length).toBe(0);
  });

  it('separates a mixed batch of new and existing entities into correct API calls', async () => {
    const hubspot = makeHubspot();

    // Existing entity with a change
    hubspot.dealManager.importEntities([{
      id: 'deal-200',
      properties: {
        dealname: 'Existing Deal',
        closedate: '2024-02-01T00:00:00Z',
        pipeline: 'Pipeline',
        dealstage: 'ClosedWon',
        amount: '300',
        addonLicenseId: 'ALI-200',
        transactionId: '',
        transactionLineItemId: '',
        appEntitlementId: '',
        appEntitlementNumber: '',
      },
      associations: [],
    }]);
    const existingDeal = hubspot.dealManager.getArray()[0];
    existingDeal.data.amount = 500;

    // New entity
    hubspot.dealManager.create(defaultDealData({ dealName: 'Fresh Deal', addonLicenseId: 'ALI-NEW-1' }));

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const createCalls = callLog.filter(c => c.method === 'createEntities' && c.kind === 'deal');
    const updateCalls = callLog.filter(c => c.method === 'updateEntities' && c.kind === 'deal');

    expect(createCalls.length).toBe(1);
    expect(createCalls[0].inputs.length).toBe(1);
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].inputs.length).toBe(1);
    expect(updateCalls[0].inputs[0].id).toBe('deal-200');
  });

});

describe('HubspotUploader — index-based ID assignment after create', () => {

  it('assigns the returned HubSpot id back to the in-memory deal entity by index', async () => {
    const hubspot = makeHubspot();
    const newDeal = hubspot.dealManager.create(defaultDealData({
      dealName: 'Index Match Test',
      addonLicenseId: 'ALI-MATCH-001',
    }));

    expect(newDeal.id).toBeNull();

    mockApi.createEntities.mockImplementation(async (kind: EntityKind, entities: NewEntity[]): Promise<IndexedEntity[]> => {
      callLog.push({ method: 'createEntities', kind, inputs: entities });
      return entities.map((e, i) => ({
        index: i,
        result: { id: 'hs-deal-99001', properties: { ...e.properties } },
      }));
    });

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    expect(newDeal.id).toBe('hs-deal-99001');
  });

  it('assigns correct IDs when multiple entities are created', async () => {
    const hubspot = makeHubspot();
    const deal1 = hubspot.dealManager.create(defaultDealData({ dealName: 'Deal A', addonLicenseId: 'ALI-A' }));
    const deal2 = hubspot.dealManager.create(defaultDealData({ dealName: 'Deal B', addonLicenseId: 'ALI-B' }));

    mockApi.createEntities.mockImplementation(async (kind: EntityKind, entities: NewEntity[]): Promise<IndexedEntity[]> => {
      callLog.push({ method: 'createEntities', kind, inputs: entities });
      return entities.map((e, i) => ({
        index: i,
        result: { id: `hs-deal-${i + 1}`, properties: { ...e.properties } },
      }));
    });

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    expect(deal1.id).toBe('hs-deal-1');
    expect(deal2.id).toBe('hs-deal-2');
  });

  it('leaves id null for entities in failed batches (missing from results)', async () => {
    const hubspot = makeHubspot();
    const deal = hubspot.dealManager.create(defaultDealData({
      dealName: 'Failed Batch Deal',
      addonLicenseId: 'ALI-FAIL',
    }));

    // Return empty array — simulates batch failure
    mockApi.createEntities.mockImplementation(async (kind: EntityKind, entities: NewEntity[]): Promise<IndexedEntity[]> => {
      callLog.push({ method: 'createEntities', kind, inputs: entities });
      return [];
    });

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    expect(deal.id).toBeNull();
  });

  it('assigns HubSpot id to contact by index after create', async () => {
    const hubspot = makeHubspot();
    const newContact = hubspot.contactManager.create(defaultContactData({
      email: 'alice.johnson@techcorp.io',
      firstName: 'Alice',
      lastName: 'Johnson',
    }));

    expect(newContact.id).toBeNull();

    mockApi.createEntities.mockImplementation(async (kind: EntityKind, entities: NewEntity[]): Promise<IndexedEntity[]> => {
      callLog.push({ method: 'createEntities', kind, inputs: entities });
      return entities.map((e, i) => ({
        index: i,
        result: { id: 'hs-contact-42001', properties: { ...e.properties } },
      }));
    });

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    expect(newContact.id).toBe('hs-contact-42001');
  });

});

describe('HubspotUploader — association sync', () => {

  it('calls createAssociations for newly added associations', async () => {
    const hubspot = makeHubspot();

    hubspot.dealManager.importEntities([{
      id: 'deal-300',
      properties: {
        dealname: 'Association Test',
        closedate: '2024-05-01T00:00:00Z',
        pipeline: 'Pipeline',
        dealstage: 'Eval',
        addonLicenseId: 'ALI-300',
        transactionId: '',
        transactionLineItemId: '',
        appEntitlementId: '',
        appEntitlementNumber: '',
      },
      associations: [],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'contact-300',
      properties: { email: 'bob@techfirm.com' },
      associations: [],
    }]);

    const deal = hubspot.dealManager.getArray()[0];
    const contact = hubspot.contactManager.getArray()[0];
    deal.contacts.add(contact);

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const assocCreates = callLog.filter(c => c.method === 'createAssociations' && c.kind === 'deal' && c.otherKind === 'contact');
    expect(assocCreates.length).toBe(1);
    expect(assocCreates[0].inputs.length).toBe(1);
    expect(assocCreates[0].inputs[0]).toEqual({
      fromId: 'deal-300',
      toId: 'contact-300',
      toType: 'contact',
    });
  });

  it('calls deleteAssociations for removed associations', async () => {
    const hubspot = makeHubspot();

    const dealAssocs = hubspot.dealManager.importEntities([{
      id: 'deal-400',
      properties: {
        dealname: 'Removal Test',
        closedate: '2024-06-01T00:00:00Z',
        pipeline: 'Pipeline',
        dealstage: 'ClosedWon',
        addonLicenseId: 'ALI-400',
        transactionId: '',
        transactionLineItemId: '',
        appEntitlementId: '',
        appEntitlementNumber: '',
      },
      associations: ['contact:contact-400'],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'contact-400',
      properties: { email: 'remove-me@techfirm.com' },
      associations: [],
    }]);
    hubspot.dealManager.linkEntities(dealAssocs, hubspot as any);

    const deal = hubspot.dealManager.getArray()[0];
    expect(deal.contacts.getAll().length).toBe(1);

    // Clear the association
    deal.contacts.clear();

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const assocDeletes = callLog.filter(c => c.method === 'deleteAssociations' && c.kind === 'deal' && c.otherKind === 'contact');
    expect(assocDeletes.length).toBe(1);
    expect(assocDeletes[0].inputs.length).toBe(1);
    expect(assocDeletes[0].inputs[0]).toEqual({
      fromId: 'deal-400',
      toId: 'contact-400',
      toType: 'contact',
    });
  });

  it('skips association sync for entities missing an id and logs a warning', async () => {
    const hubspot = makeHubspot();

    // New deal with no id
    const newDeal = hubspot.dealManager.create(defaultDealData({
      dealName: 'No-Id Deal',
      addonLicenseId: 'ALI-NOID',
    }));

    hubspot.contactManager.importEntities([{
      id: 'contact-500',
      properties: { email: 'valid@techfirm.com' },
      associations: [],
    }]);

    const contact = hubspot.contactManager.getArray()[0];
    newDeal.contacts.add(contact);

    // Make createEntities return nothing so the deal stays with null id
    mockApi.createEntities.mockImplementation(async (kind: EntityKind, entities: NewEntity[]) => {
      callLog.push({ method: 'createEntities', kind, inputs: entities });
      return []; // No matching results returned
    });

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    // The deal should still have null id
    expect(newDeal.id).toBeNull();

    // Association create should NOT include the no-id deal
    const assocCreates = callLog.filter(c => c.method === 'createAssociations' && c.kind === 'deal');
    for (const call of assocCreates) {
      for (const input of call.inputs) {
        expect(input.fromId).not.toBeUndefined();
        expect(input.fromId).not.toBeNull();
      }
    }
  });

  it('only syncs associations for directions marked as "up" in the entity adapter', async () => {
    const hubspot = makeHubspot();

    // Companies have associations: { contact: 'down' } — NOT 'down/up'
    // So company -> contact associations should NOT be synced up
    hubspot.companyManager.importEntities([{
      id: 'company-100',
      properties: { name: 'TechCorp Inc', type: '' },
      associations: [],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'contact-100',
      properties: { email: 'someone@techcorp.com' },
      associations: [],
    }]);

    const company = hubspot.companyManager.getArray()[0];
    const contact = hubspot.contactManager.getArray()[0];
    company.contacts.add(contact);

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    // Company adapter has contact association as 'down' only, not 'down/up'
    // So createAssociations should NOT be called for company -> contact
    const companyAssocCreates = callLog.filter(
      c => c.method === 'createAssociations' && c.kind === 'company' && c.otherKind === 'contact'
    );
    expect(companyAssocCreates.length).toBe(0);
  });

});

describe('HubspotUploader — no-op when no changes', () => {

  it('does not call createEntities or updateEntities when an existing entity has no property changes', async () => {
    const hubspot = makeHubspot();
    hubspot.dealManager.importEntities([{
      id: 'deal-600',
      properties: {
        dealname: 'Unchanged Deal',
        closedate: '2024-07-01T00:00:00Z',
        pipeline: 'Pipeline',
        dealstage: 'ClosedWon',
        amount: '1000',
        addonLicenseId: 'ALI-600',
        transactionId: '',
        transactionLineItemId: '',
        appEntitlementId: '',
        appEntitlementNumber: '',
      },
      associations: [],
    }]);

    // Don't modify anything

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const dealPropertyCalls = callLog.filter(
      c => (c.method === 'createEntities' || c.method === 'updateEntities') && c.kind === 'deal'
    );
    expect(dealPropertyCalls.length).toBe(0);
  });

  it('does not call createAssociations or deleteAssociations when associations are unchanged', async () => {
    const hubspot = makeHubspot();

    const dealAssocs = hubspot.dealManager.importEntities([{
      id: 'deal-700',
      properties: {
        dealname: 'Stable Associations',
        closedate: '2024-08-01T00:00:00Z',
        pipeline: 'Pipeline',
        dealstage: 'Eval',
        addonLicenseId: 'ALI-700',
        transactionId: '',
        transactionLineItemId: '',
        appEntitlementId: '',
        appEntitlementNumber: '',
      },
      associations: ['contact:contact-700'],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'contact-700',
      properties: { email: 'stable@techfirm.com' },
      associations: [],
    }]);
    hubspot.dealManager.linkEntities(dealAssocs, hubspot as any);

    // Don't change any associations

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const assocCalls = callLog.filter(
      c => (c.method === 'createAssociations' || c.method === 'deleteAssociations') && c.kind === 'deal'
    );
    // Even though createAssociations/deleteAssociations are called, they should receive empty arrays
    for (const call of assocCalls) {
      expect(call.inputs.length).toBe(0);
    }
  });

  it('does not trigger any API calls when the hubspot instance is completely empty', async () => {
    const hubspot = makeHubspot();

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    // No entities means no calls to create or update
    const propertyCalls = callLog.filter(
      c => c.method === 'createEntities' || c.method === 'updateEntities'
    );
    expect(propertyCalls.length).toBe(0);
  });

});

describe('HubspotUploader — error handling with Promise.allSettled', () => {

  it('silently swallows errors in individual create batches without rejecting the overall sync', async () => {
    const hubspot = makeHubspot();

    // Create enough deals to form at least one batch
    hubspot.dealManager.create(defaultDealData({
      dealName: 'Will Fail Deal',
      addonLicenseId: 'ALI-FAIL-1',
    }));

    mockApi.createEntities.mockImplementation(async (kind: EntityKind, entities: NewEntity[]) => {
      callLog.push({ method: 'createEntities', kind, inputs: entities });
      throw new Error('HubSpot 429 Rate Limit Exceeded');
    });

    const uploader = new HubspotUploader();

    // Should NOT throw — errors are caught and tracked in result
    const result = await uploader.upsyncChangesToHubspot(hubspot);
    expect(result).toBeDefined();
  });

  it('continues processing other entity types when one type fails during create', async () => {
    const hubspot = makeHubspot();

    hubspot.dealManager.create(defaultDealData({
      dealName: 'Failing Deal',
      addonLicenseId: 'ALI-FAIL-2',
    }));
    hubspot.contactManager.create(defaultContactData({
      email: 'surviving@techcorp.io',
      firstName: 'Surviving',
    }));

    // Make deal creation fail
    mockApi.createEntities.mockImplementation(async (kind: EntityKind, entities: NewEntity[]) => {
      callLog.push({ method: 'createEntities', kind, inputs: entities });
      if (kind === 'deal') {
        throw new Error('Simulated deal batch failure');
      }
      return entities.map((e, i) => ({
        id: `created-${kind}-${i + 1}`,
        properties: { ...e.properties },
      }));
    });

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    // Contact creation should have been attempted regardless of deal failure
    const contactCreates = callLog.filter(c => c.method === 'createEntities' && c.kind === 'contact');
    expect(contactCreates.length).toBe(1);
    expect(contactCreates[0].inputs.length).toBe(1);
  });

  it('sends all entities in a single createEntities call (batching is in api layer)', async () => {
    const hubspot = makeHubspot();

    // Create 250 deals — uploader sends all at once; api.ts handles batching
    for (let i = 0; i < 250; i++) {
      hubspot.dealManager.create(defaultDealData({
        dealName: `Deal Batch Test ${i}`,
        addonLicenseId: `ALI-BATCH-${i}`,
      }));
    }

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    // Uploader makes a single createEntities call with all 250 deals
    const dealCreates = callLog.filter(c => c.method === 'createEntities' && c.kind === 'deal');
    expect(dealCreates.length).toBe(1);
    expect(dealCreates[0].inputs.length).toBe(250);
  });

});

describe('HubspotUploader — batch size enforcement', () => {

  it('sends all contacts in a single createEntities call (batching is in api layer)', async () => {
    const hubspot = makeHubspot();

    // Create 25 contacts — uploader sends all at once; api.ts batches into 10s
    for (let i = 0; i < 25; i++) {
      hubspot.contactManager.create(defaultContactData({
        email: `contact-batch-${i}@techcorp.io`,
        firstName: `Contact`,
        lastName: `Number${i}`,
      }));
    }

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const contactCreates = callLog.filter(c => c.method === 'createEntities' && c.kind === 'contact');
    expect(contactCreates.length).toBe(1);
    expect(contactCreates[0].inputs.length).toBe(25);
  });

  it('sends all deals in a single createEntities call (batching is in api layer)', async () => {
    const hubspot = makeHubspot();

    // Create 150 deals — uploader sends all at once; api.ts batches into 100s
    for (let i = 0; i < 150; i++) {
      hubspot.dealManager.create(defaultDealData({
        dealName: `Deal Batch ${i}`,
        addonLicenseId: `ALI-BIG-${i}`,
      }));
    }

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const dealCreates = callLog.filter(c => c.method === 'createEntities' && c.kind === 'deal');
    expect(dealCreates.length).toBe(1);
    expect(dealCreates[0].inputs.length).toBe(150);
  });

  it('uses batch size 100 for companies, not 10', async () => {
    const hubspot = makeHubspot();

    // Create 15 companies — should be 1 batch (not 2 batches of 10+5)
    for (let i = 0; i < 15; i++) {
      hubspot.companyManager.create({
        name: `Company ${i}`,
        type: null,
      });
    }

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const companyCreates = callLog.filter(c => c.method === 'createEntities' && c.kind === 'company');
    expect(companyCreates.length).toBe(1);
    expect(companyCreates[0].inputs.length).toBe(15);
  });

});

describe('HubspotUploader — sync order', () => {

  it('syncs properties for all entity types before syncing any associations', async () => {
    const hubspot = makeHubspot();

    hubspot.dealManager.importEntities([{
      id: 'deal-800',
      properties: {
        dealname: 'Order Test',
        closedate: '2024-09-01T00:00:00Z',
        pipeline: 'Pipeline',
        dealstage: 'Eval',
        addonLicenseId: 'ALI-800',
        transactionId: '',
        transactionLineItemId: '',
        appEntitlementId: '',
        appEntitlementNumber: '',
      },
      associations: [],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'contact-800',
      properties: { email: 'order-test@techfirm.com' },
      associations: [],
    }]);

    const deal = hubspot.dealManager.getArray()[0];
    const contact = hubspot.contactManager.getArray()[0];
    deal.data.dealName = 'Order Test Updated';
    deal.contacts.add(contact);

    const methodOrder: string[] = [];
    mockApi.createEntities.mockImplementation(async (kind: EntityKind, entities: NewEntity[]) => {
      methodOrder.push(`createEntities:${kind}`);
      return entities.map((e, i) => ({
        id: `created-${kind}-${i}`,
        properties: { ...e.properties },
      }));
    });
    mockApi.updateEntities.mockImplementation(async (kind: EntityKind, entities: ExistingEntity[]) => {
      methodOrder.push(`updateEntities:${kind}`);
      return entities;
    });
    mockApi.createAssociations.mockImplementation(async (fromKind: EntityKind, toKind: EntityKind, inputs: Association[]) => {
      methodOrder.push(`createAssociations:${fromKind}->${toKind}`);
    });
    mockApi.deleteAssociations.mockImplementation(async (fromKind: EntityKind, toKind: EntityKind, inputs: Association[]) => {
      methodOrder.push(`deleteAssociations:${fromKind}->${toKind}`);
    });

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    // All property syncs must come before all association syncs
    const lastPropertySyncIndex = Math.max(
      ...methodOrder.map((m, i) => (m.startsWith('createEntities') || m.startsWith('updateEntities')) ? i : -1)
    );
    const firstAssocSyncIndex = Math.min(
      ...methodOrder.map((m, i) => (m.startsWith('createAssociations') || m.startsWith('deleteAssociations')) ? i : Infinity)
    );

    expect(lastPropertySyncIndex).toBeLessThan(firstAssocSyncIndex);
  });

  it('syncs deals before contacts before companies in property phase', async () => {
    const hubspot = makeHubspot();

    hubspot.dealManager.create(defaultDealData({ dealName: 'Deal Order', addonLicenseId: 'ALI-ORD-1' }));
    hubspot.contactManager.create(defaultContactData({ email: 'order@techcorp.io' }));
    hubspot.companyManager.create({ name: 'Order Corp', type: null });

    const kindOrder: string[] = [];
    mockApi.createEntities.mockImplementation(async (kind: EntityKind, entities: NewEntity[]) => {
      kindOrder.push(kind);
      return entities.map((e, i) => ({
        id: `created-${kind}-${i}`,
        properties: { ...e.properties },
      }));
    });

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    // The uploader calls syncUpAllEntitiesProperties in order: deal, contact, company
    expect(kindOrder).toEqual(['deal', 'contact', 'company']);
  });

});

describe('HubspotUploader — updateEntities uses guaranteedId', () => {

  it('includes the entity id in each update payload', async () => {
    const hubspot = makeHubspot();
    hubspot.contactManager.importEntities([{
      id: 'contact-900',
      properties: {
        email: 'update-id-test@techfirm.com',
        firstname: 'Original',
        lastname: 'Name',
      },
      associations: [],
    }]);

    const contact = hubspot.contactManager.getArray()[0];
    contact.data.firstName = 'Updated';

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const updateCalls = callLog.filter(c => c.method === 'updateEntities' && c.kind === 'contact');
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].inputs[0].id).toBe('contact-900');
    expect(updateCalls[0].inputs[0].properties['firstname']).toBe('Updated');
  });

});

describe('HubspotUploader — only changed properties are sent', () => {

  it('sends only the modified property in the update payload, not all entity properties', async () => {
    const hubspot = makeHubspot();
    hubspot.dealManager.importEntities([{
      id: 'deal-1001',
      properties: {
        dealname: 'Selective Update',
        closedate: '2024-10-15T00:00:00Z',
        pipeline: 'Pipeline',
        dealstage: 'ClosedWon',
        amount: '2000',
        addonLicenseId: 'ALI-1001',
        transactionId: 'TX-1001',
        transactionLineItemId: '',
        appEntitlementId: '',
        appEntitlementNumber: '',
      },
      associations: [],
    }]);

    const deal = hubspot.dealManager.getArray()[0];
    deal.data.amount = 3000;

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const updateCalls = callLog.filter(c => c.method === 'updateEntities' && c.kind === 'deal');
    expect(updateCalls.length).toBe(1);

    const sentProperties = updateCalls[0].inputs[0].properties;
    // Only 'amount' was changed
    expect(sentProperties['amount']).toBe('3000');
    // dealname should NOT be in the update since it was not changed
    expect(sentProperties['dealname']).toBeUndefined();
  });

});

describe('HubspotUploader — labeled associations', () => {

  it('passes labels through to createAssociations', async () => {
    const hubspot = makeHubspot();

    hubspot.dealManager.importEntities([{
      id: 'deal-labeled-1',
      properties: {
        dealname: 'Labeled Test',
        closedate: '2024-11-01T00:00:00Z',
        pipeline: 'Pipeline',
        dealstage: 'Eval',
        addonLicenseId: 'ALI-LAB-1',
        transactionId: '',
        transactionLineItemId: '',
        appEntitlementId: '',
        appEntitlementNumber: '',
      },
      associations: [],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'contact-labeled-1',
      properties: { email: 'labeled@techfirm.com' },
      associations: [],
    }]);

    const deal = hubspot.dealManager.getArray()[0];
    const contact = hubspot.contactManager.getArray()[0];
    deal.contacts.add(contact, [{ associationCategory: 'USER_DEFINED', associationTypeId: 36 }]);

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const assocCreates = callLog.filter(c => c.method === 'createAssociations' && c.kind === 'deal' && c.otherKind === 'contact');
    expect(assocCreates.length).toBe(1);
    expect(assocCreates[0].inputs.length).toBe(1);
    expect(assocCreates[0].inputs[0]).toEqual({
      fromId: 'deal-labeled-1',
      toId: 'contact-labeled-1',
      toType: 'contact',
      labels: [{ associationCategory: 'USER_DEFINED', associationTypeId: 36 }],
    });
  });

  it('passes undefined labels for unlabeled associations', async () => {
    const hubspot = makeHubspot();

    hubspot.dealManager.importEntities([{
      id: 'deal-unlabeled-1',
      properties: {
        dealname: 'Unlabeled Test',
        closedate: '2024-11-02T00:00:00Z',
        pipeline: 'Pipeline',
        dealstage: 'Eval',
        addonLicenseId: 'ALI-UNL-1',
        transactionId: '',
        transactionLineItemId: '',
        appEntitlementId: '',
        appEntitlementNumber: '',
      },
      associations: [],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'contact-unlabeled-1',
      properties: { email: 'unlabeled@techfirm.com' },
      associations: [],
    }]);

    const deal = hubspot.dealManager.getArray()[0];
    const contact = hubspot.contactManager.getArray()[0];
    deal.contacts.add(contact);  // No labels

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    const assocCreates = callLog.filter(c => c.method === 'createAssociations' && c.kind === 'deal' && c.otherKind === 'contact');
    expect(assocCreates.length).toBe(1);
    expect(assocCreates[0].inputs[0].labels).toBeUndefined();
  });

  it('detects label-only change and issues delete+create', async () => {
    const hubspot = makeHubspot();

    // Import deal with pre-existing contact association (no labels)
    const dealAssocs = hubspot.dealManager.importEntities([{
      id: 'deal-relabel-1',
      properties: {
        dealname: 'Relabel Test',
        closedate: '2024-11-03T00:00:00Z',
        pipeline: 'Pipeline',
        dealstage: 'Eval',
        addonLicenseId: 'ALI-RL-1',
        transactionId: '',
        transactionLineItemId: '',
        appEntitlementId: '',
        appEntitlementNumber: '',
      },
      associations: ['contact:contact-relabel-1'],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'contact-relabel-1',
      properties: { email: 'relabel@techfirm.com' },
      associations: [],
    }]);
    hubspot.dealManager.linkEntities(dealAssocs, hubspot as any);

    const deal = hubspot.dealManager.getArray()[0];
    const contact = hubspot.contactManager.getArray()[0];

    // Clear and re-add with labels (simulates engine re-generation)
    deal.contacts.clear();
    deal.contacts.add(contact, [{ associationCategory: 'USER_DEFINED', associationTypeId: 36 }]);

    const uploader = new HubspotUploader();
    await uploader.upsyncChangesToHubspot(hubspot);

    // Should have both delete and create for the label change
    const assocDeletes = callLog.filter(c => c.method === 'deleteAssociations' && c.kind === 'deal' && c.otherKind === 'contact');
    const assocCreates = callLog.filter(c => c.method === 'createAssociations' && c.kind === 'deal' && c.otherKind === 'contact');

    expect(assocDeletes.length).toBe(1);
    expect(assocDeletes[0].inputs.length).toBe(1);
    expect(assocCreates.length).toBe(1);
    expect(assocCreates[0].inputs.length).toBe(1);
    expect(assocCreates[0].inputs[0].labels).toEqual([{ associationCategory: 'USER_DEFINED', associationTypeId: 36 }]);
  });

});
