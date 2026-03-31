import { Hubspot } from '../lib/hubspot/hubspot';
import { DealStage, Pipeline } from '../lib/hubspot/interfaces';

describe('Entity property change tracking', () => {

  function makeHubspot(config = {}) {
    return new Hubspot({ deal: config, contact: config });
  }

  describe('new entities (no id)', () => {

    it('reports all set fields as changes', () => {
      const hubspot = makeHubspot();
      const deal = hubspot.dealManager.create({
        dealName: 'New Deal',
        closeDate: '2022-01-01',
        pipeline: Pipeline.MPAC,
        dealStage: DealStage.EVAL,
        amount: 100,
        addonLicenseId: 'ALI-1',
        transactionId: null,
        transactionLineItemId: null,
        appEntitlementId: null,
        appEntitlementNumber: null,
        relatedProducts: null,
        app: null,
        country: null,
        origin: null,
        deployment: null,
        saleType: null,
        licenseTier: null,
        associatedPartner: null,
        duplicateOf: null,
        maintenanceEndDate: null,
      });

      expect(deal.id).toBeNull();
      expect(deal.hasPropertyChanges()).toBe(true);
      const changes = deal.getPropertyChanges() as Record<string, string>;
      expect(changes['dealname']).toBe('New Deal');
      expect(changes['amount']).toBe('100');
    });

  });

  describe('existing entities (has id)', () => {

    it('reports no changes when nothing is modified', () => {
      const hubspot = makeHubspot();
      hubspot.dealManager.importEntities([{
        id: 'deal-1',
        properties: {
          dealname: 'Test Deal',
          closedate: '2022-01-01T00:00:00Z',
          pipeline: 'Pipeline',
          dealstage: 'ClosedWon',
          amount: '500',
          addonLicenseId: 'ALI-1',
          transactionId: '',
          transactionLineItemId: '',
          appEntitlementId: '',
          appEntitlementNumber: '',
        },
        associations: [],
      }]);

      const deal = hubspot.dealManager.getArray()[0];
      expect(deal.hasPropertyChanges()).toBe(false);
      expect(Object.keys(deal.getPropertyChanges() as Record<string, string>).length).toBe(0);
    });

    it('detects changes to existing fields', () => {
      const hubspot = makeHubspot();
      hubspot.dealManager.importEntities([{
        id: 'deal-1',
        properties: {
          dealname: 'Old Name',
          closedate: '2022-01-01T00:00:00Z',
          pipeline: 'Pipeline',
          dealstage: 'ClosedWon',
          amount: '500',
          addonLicenseId: 'ALI-1',
          transactionId: '',
          transactionLineItemId: '',
          appEntitlementId: '',
          appEntitlementNumber: '',
        },
        associations: [],
      }]);

      const deal = hubspot.dealManager.getArray()[0];
      deal.data.dealName = 'New Name';

      expect(deal.hasPropertyChanges()).toBe(true);
      const changes = deal.getPropertyChanges() as Record<string, string>;
      expect(changes['dealname']).toBe('New Name');
    });

    it('does not report unchanged fields in changes', () => {
      const hubspot = makeHubspot();
      hubspot.dealManager.importEntities([{
        id: 'deal-1',
        properties: {
          dealname: 'Test Deal',
          closedate: '2022-01-01T00:00:00Z',
          pipeline: 'Pipeline',
          dealstage: 'ClosedWon',
          amount: '500',
          addonLicenseId: 'ALI-1',
          transactionId: '',
          transactionLineItemId: '',
          appEntitlementId: '',
          appEntitlementNumber: '',
        },
        associations: [],
      }]);

      const deal = hubspot.dealManager.getArray()[0];
      deal.data.dealName = 'Updated Deal';

      const changes = deal.getPropertyChanges() as Record<string, string>;
      expect(changes['dealname']).toBe('Updated Deal');
      // Amount should NOT be in changes since it wasn't modified
      expect(changes['amount']).toBeUndefined();
    });

  });

  describe('Set comparison with makeComparable', () => {

    it('detects no change when sets have same elements in different order', () => {
      const hubspot = makeHubspot({
        attrs: {
          deployment: 'deployment',
          products: 'products',
        },
      });
      hubspot.contactManager.importEntities([{
        id: 'contact-1',
        properties: {
          email: 'test@acme.com',
          deployment: 'Cloud;Server',
          products: 'addon-b;addon-a',
          // Include all hardcoded-property fields to avoid false-positive changes
          country: '',
          firstname: '',
          lastname: '',
          phone: '',
          city: '',
          state: '',
        },
        associations: [],
      }]);

      const contact = hubspot.contactManager.getArray()[0];
      // Set the same values (different iteration order shouldn't matter due to makeComparable)
      contact.data.deployment = new Set(['Server', 'Cloud']);
      contact.data.products = new Set(['addon-a', 'addon-b']);

      // makeComparable sorts and joins, so order shouldn't matter
      expect(contact.hasPropertyChanges()).toBe(false);
    });

    it('detects changes when sets differ', () => {
      const hubspot = makeHubspot({
        attrs: {
          deployment: 'deployment',
        },
      });
      hubspot.contactManager.importEntities([{
        id: 'contact-1',
        properties: {
          email: 'test@acme.com',
          deployment: 'Server',
        },
        associations: [],
      }]);

      const contact = hubspot.contactManager.getArray()[0];
      contact.data.deployment = new Set(['Server', 'Cloud']);

      expect(contact.hasPropertyChanges()).toBe(true);
      const changes = contact.getPropertyChanges() as Record<string, string>;
      expect(changes['deployment']).toBeDefined();
    });

  });

});

describe('Managed fields', () => {

  it('allows setting managed fields on new entities', () => {
    const hubspot = new Hubspot({
      contact: {
        managedFields: new Set(['firstname', 'lastname']),
      },
    });
    const contact = hubspot.contactManager.create({
      email: 'test@acme.com',
      firstName: 'John',
      lastName: 'Smith',
      phone: null, city: null, state: null,
      country: null, region: null,
      contactType: 'customer',
      products: new Set(), deployment: new Set(),
      relatedProducts: new Set(),
      licenseTier: null, lastMpacEvent: null,
      lastAssociatedPartner: null,
      utmChannel: null, utmSource: null, utmMedium: null, utmCampaign: null,
      utmTerm: null, utmContent: null, utmReferrer: null, googleClickId: null,
    });

    // New entity (no id) should have all fields set
    expect(contact.data.firstName).toBe('John');
    expect(contact.data.lastName).toBe('Smith');
  });

  it('prevents overwriting managed fields on existing entities', () => {
    const hubspot = new Hubspot({
      contact: {
        managedFields: new Set(['firstname', 'lastname']),
      },
    });
    hubspot.contactManager.importEntities([{
      id: 'contact-1',
      properties: {
        email: 'test@acme.com',
        firstname: 'John',
        lastname: 'Smith',
      },
      associations: [],
    }]);

    const contact = hubspot.contactManager.getArray()[0];
    // Try to overwrite managed fields
    contact.data.firstName = 'Jane';
    contact.data.lastName = 'Doe';

    // Should be preserved (not overwritten)
    expect(contact.data.firstName).toBe('John');
    expect(contact.data.lastName).toBe('Smith');
  });

  it('allows setting managed fields when existing value is empty', () => {
    const hubspot = new Hubspot({
      contact: {
        managedFields: new Set(['firstname', 'lastname']),
      },
    });
    hubspot.contactManager.importEntities([{
      id: 'contact-1',
      properties: {
        email: 'test@acme.com',
        // firstname and lastname not provided → treated as falsy
      },
      associations: [],
    }]);

    const contact = hubspot.contactManager.getArray()[0];
    contact.data.firstName = 'John';
    contact.data.lastName = 'Smith';

    // Should be set since old values were empty/null
    expect(contact.data.firstName).toBe('John');
    expect(contact.data.lastName).toBe('Smith');
  });

  it('does not restrict non-managed fields on existing entities', () => {
    const hubspot = new Hubspot({
      contact: {
        managedFields: new Set(['firstname']),
      },
    });
    hubspot.contactManager.importEntities([{
      id: 'contact-1',
      properties: {
        email: 'test@acme.com',
        firstname: 'John',
        lastname: 'Smith',
        phone: '+1-555-0100',
      },
      associations: [],
    }]);

    const contact = hubspot.contactManager.getArray()[0];
    contact.data.phone = '+1-555-9999';

    // Non-managed fields should be modifiable
    expect(contact.data.phone).toBe('+1-555-9999');
    // Managed field should be protected
    contact.data.firstName = 'Jane';
    expect(contact.data.firstName).toBe('John');
  });

});

describe('Association tracking', () => {

  it('detects new associations', () => {
    const hubspot = new Hubspot();
    hubspot.dealManager.importEntities([{
      id: 'deal-1',
      properties: {
        dealname: 'Test', closedate: '2022-01-01T00:00:00Z',
        pipeline: 'Pipeline', dealstage: 'ClosedWon',
        addonLicenseId: '', transactionId: '', transactionLineItemId: '',
        appEntitlementId: '', appEntitlementNumber: '',
      },
      associations: [],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'contact-1',
      properties: { email: 'test@acme.com' },
      associations: [],
    }]);

    const deal = hubspot.dealManager.getArray()[0];
    const contact = hubspot.contactManager.getArray()[0];

    expect(deal.hasAssociationChanges()).toBe(false);
    deal.contacts.add(contact);
    expect(deal.hasAssociationChanges()).toBe(true);

    const changes = deal.getAssociationChanges();
    expect(changes.length).toBe(1);
    expect(changes[0].op).toBe('add');
  });

  it('detects removed associations', () => {
    const hubspot = new Hubspot();
    const dealAssocs = hubspot.dealManager.importEntities([{
      id: 'deal-1',
      properties: {
        dealname: 'Test', closedate: '2022-01-01T00:00:00Z',
        pipeline: 'Pipeline', dealstage: 'ClosedWon',
        addonLicenseId: '', transactionId: '', transactionLineItemId: '',
        appEntitlementId: '', appEntitlementNumber: '',
      },
      associations: ['contact:contact-1'],
    }]);
    hubspot.contactManager.importEntities([{
      id: 'contact-1',
      properties: { email: 'test@acme.com' },
      associations: [],
    }]);

    // Link entities using stored associations from import
    hubspot.dealManager.linkEntities(dealAssocs, hubspot as any);

    const deal = hubspot.dealManager.getArray()[0];
    // Verify association was linked
    expect(deal.contacts.getAll().length).toBe(1);
    // Clear associations
    deal.contacts.clear();
    expect(deal.hasAssociationChanges()).toBe(true);
  });

  it('tracks bidirectional associations', () => {
    const hubspot = new Hubspot();
    const deal = hubspot.dealManager.create({
      dealName: 'Test', closeDate: '2022-01-01',
      pipeline: Pipeline.MPAC, dealStage: DealStage.EVAL,
      amount: null,
      addonLicenseId: null, transactionId: null, transactionLineItemId: null,
      appEntitlementId: null, appEntitlementNumber: null,
      relatedProducts: null, app: null, country: null, origin: null,
      deployment: null, saleType: null, licenseTier: null,
      associatedPartner: null, duplicateOf: null, maintenanceEndDate: null,
    });
    const contact = hubspot.contactManager.create({
      email: 'test@acme.com',
      firstName: null, lastName: null, phone: null,
      city: null, state: null, country: null, region: null,
      contactType: 'customer',
      products: new Set(), deployment: new Set(),
      relatedProducts: new Set(),
      licenseTier: null, lastMpacEvent: null,
      lastAssociatedPartner: null,
      utmChannel: null, utmSource: null, utmMedium: null, utmCampaign: null,
      utmTerm: null, utmContent: null, utmReferrer: null, googleClickId: null,
    });

    deal.contacts.add(contact);

    // Deal sees the contact
    expect(deal.contacts.getAll().length).toBe(1);
    expect(deal.contacts.getAll()[0]).toBe(contact);
  });

});
