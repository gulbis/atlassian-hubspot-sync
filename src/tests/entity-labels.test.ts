import { Hubspot } from '../lib/hubspot/hubspot';
import { AssociationLabel } from '../lib/hubspot/interfaces';

function makeHubspot() {
  return new Hubspot();
}

const TECH_LABEL: AssociationLabel = { associationCategory: 'USER_DEFINED', associationTypeId: 36 };
const BILLING_LABEL: AssociationLabel = { associationCategory: 'USER_DEFINED', associationTypeId: 37 };
const CUSTOMER_LABEL: AssociationLabel = { associationCategory: 'USER_DEFINED', associationTypeId: 40 };

describe('Entity association labels', () => {

  it('add with labels does not break basic association tracking', () => {
    const hubspot = makeHubspot();
    const deal = hubspot.dealManager.create({
      dealName: 'Test', closeDate: '2024-01-01', pipeline: 0, dealStage: 0, amount: null,
      addonLicenseId: null, transactionId: null, transactionLineItemId: null,
      appEntitlementId: null, appEntitlementNumber: null, relatedProducts: null,
      app: null, country: null, origin: null, deployment: null, saleType: null,
      licenseTier: null, associatedPartner: null, duplicateOf: null, maintenanceEndDate: null,
    });
    hubspot.contactManager.importEntities([{
      id: 'c1', properties: { email: 'tech@test.com' }, associations: [],
    }]);
    const contact = hubspot.contactManager.getArray()[0];

    deal.contacts.add(contact, [TECH_LABEL]);

    expect(deal.contacts.getAll()).toEqual([contact]);
    expect(deal.hasAssociationChanges()).toBe(true);
  });

  it('detects label-only changes when entity link unchanged', () => {
    const hubspot = makeHubspot();

    // Import a deal with a pre-existing contact association (no labels)
    const dealAssocs = hubspot.dealManager.importEntities([{
      id: 'deal-1',
      properties: {
        dealname: 'Test', closedate: '2024-01-01', pipeline: 'Pipeline',
        dealstage: 'Eval', addonLicenseId: 'ALI-1', transactionId: '',
        transactionLineItemId: '', appEntitlementId: '', appEntitlementNumber: '',
      },
      associations: ['contact:contact-1'],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'contact-1', properties: { email: 'tech@test.com' }, associations: [],
    }]);
    hubspot.dealManager.linkEntities(dealAssocs, hubspot as any);

    const deal = hubspot.dealManager.getArray()[0];
    const contact = hubspot.contactManager.getArray()[0];

    // Verify initial state: associated, no labels
    expect(deal.contacts.getAll()).toEqual([contact]);
    expect(deal.hasAssociationChanges()).toBe(false);

    // Clear and re-add with labels (simulates engine re-generation)
    deal.contacts.clear();
    deal.contacts.add(contact, [TECH_LABEL]);

    // Should detect change (label-only)
    expect(deal.hasAssociationChanges()).toBe(true);

    const changes = deal.getAssociationChanges();
    const delChanges = changes.filter(c => c.op === 'del');
    const addChanges = changes.filter(c => c.op === 'add');

    expect(delChanges.length).toBe(1);
    expect(delChanges[0].other).toBe(contact);
    expect(addChanges.length).toBe(1);
    expect(addChanges[0].other).toBe(contact);
    expect(addChanges[0].labels).toEqual([TECH_LABEL]);
  });

  it('no change when same labels re-applied', () => {
    const hubspot = makeHubspot();

    hubspot.contactManager.importEntities([{
      id: 'contact-1', properties: { email: 'tech@test.com' }, associations: [],
    }]);

    const deal = hubspot.dealManager.create({
      dealName: 'Test', closeDate: '2024-01-01', pipeline: 0, dealStage: 0, amount: null,
      addonLicenseId: null, transactionId: null, transactionLineItemId: null,
      appEntitlementId: null, appEntitlementNumber: null, relatedProducts: null,
      app: null, country: null, origin: null, deployment: null, saleType: null,
      licenseTier: null, associatedPartner: null, duplicateOf: null, maintenanceEndDate: null,
    });
    const contact = hubspot.contactManager.getArray()[0];

    // Add with label (initial=false, so goes to newAssocs only)
    deal.contacts.add(contact, [TECH_LABEL]);

    // Since deal is new (no id), all associations are "adds"
    expect(deal.hasAssociationChanges()).toBe(true);
  });

  it('getAssociationChanges includes labels on add operations', () => {
    const hubspot = makeHubspot();

    hubspot.dealManager.importEntities([{
      id: 'deal-1',
      properties: {
        dealname: 'Test', closedate: '2024-01-01', pipeline: 'Pipeline',
        dealstage: 'Eval', addonLicenseId: 'ALI-1', transactionId: '',
        transactionLineItemId: '', appEntitlementId: '', appEntitlementNumber: '',
      },
      associations: [],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'c1', properties: { email: 'tech@test.com' }, associations: [],
    }]);

    const deal = hubspot.dealManager.getArray()[0];
    const contact = hubspot.contactManager.getArray()[0];

    deal.contacts.add(contact, [TECH_LABEL, BILLING_LABEL]);

    const changes = deal.getAssociationChanges();
    expect(changes.length).toBe(1);
    expect(changes[0].op).toBe('add');
    expect(changes[0].labels).toEqual([TECH_LABEL, BILLING_LABEL]);
  });

  it('backward compatible: associations without labels still work', () => {
    const hubspot = makeHubspot();

    hubspot.dealManager.importEntities([{
      id: 'deal-1',
      properties: {
        dealname: 'Test', closedate: '2024-01-01', pipeline: 'Pipeline',
        dealstage: 'Eval', addonLicenseId: 'ALI-1', transactionId: '',
        transactionLineItemId: '', appEntitlementId: '', appEntitlementNumber: '',
      },
      associations: [],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'c1', properties: { email: 'tech@test.com' }, associations: [],
    }]);

    const deal = hubspot.dealManager.getArray()[0];
    const contact = hubspot.contactManager.getArray()[0];

    // Add without labels (old behavior)
    deal.contacts.add(contact);

    const changes = deal.getAssociationChanges();
    expect(changes.length).toBe(1);
    expect(changes[0].op).toBe('add');
    expect(changes[0].labels).toBeUndefined();
  });

  it('company association with label works', () => {
    const hubspot = makeHubspot();

    hubspot.dealManager.importEntities([{
      id: 'deal-1',
      properties: {
        dealname: 'Test', closedate: '2024-01-01', pipeline: 'Pipeline',
        dealstage: 'Eval', addonLicenseId: 'ALI-1', transactionId: '',
        transactionLineItemId: '', appEntitlementId: '', appEntitlementNumber: '',
      },
      associations: [],
    }]);
    hubspot.companyManager.importEntities([{
      id: 'company-1', properties: { name: 'Acme Corp', type: '' }, associations: [],
    }]);

    const deal = hubspot.dealManager.getArray()[0];
    const company = hubspot.companyManager.getArray()[0];

    deal.companies.add(company, [CUSTOMER_LABEL]);

    const changes = deal.getAssociationChanges();
    const companyChanges = changes.filter(c => c.other.kind === 'company');
    expect(companyChanges.length).toBe(1);
    expect(companyChanges[0].op).toBe('add');
    expect(companyChanges[0].labels).toEqual([CUSTOMER_LABEL]);
  });

});
