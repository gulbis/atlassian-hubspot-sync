import { Hubspot } from '../lib/hubspot/hubspot';
import { DealStage, FullEntity, Pipeline } from '../lib/hubspot/interfaces';

describe('Deal field mappings', () => {

  function makeDealManager(config = {}) {
    const hubspot = new Hubspot({ deal: config });
    return hubspot.dealManager;
  }

  describe('down transforms (HubSpot → internal)', () => {

    it('imports deal with all required fields', () => {
      const dealManager = makeDealManager();
      const rawDeal: FullEntity = {
        id: 'deal-1',
        properties: {
          dealname: 'Test Deal',
          closedate: '2022-06-15T00:00:00Z',
          pipeline: 'Pipeline',
          dealstage: 'ClosedWon',
          amount: '500',
          addonLicenseId: 'ALI-123',
          transactionId: 'TX-456',
          transactionLineItemId: 'TXL-789',
          appEntitlementId: 'AEI-123',
          appEntitlementNumber: 'AEN-123',
        },
        associations: [],
      };

      dealManager.importEntities([rawDeal]);
      const deals = dealManager.getArray();
      expect(deals.length).toBe(1);

      const deal = deals[0];
      expect(deal.id).toBe('deal-1');
      expect(deal.data.dealName).toBe('Test Deal');
      expect(deal.data.closeDate).toBe('2022-06-15');
      expect(deal.data.pipeline).toBe(Pipeline.MPAC);
      expect(deal.data.dealStage).toBe(DealStage.CLOSED_WON);
      expect(deal.data.amount).toBe(500);
      expect(deal.data.addonLicenseId).toBe('ALI-123');
      expect(deal.data.transactionId).toBe('TX-456');
      expect(deal.data.transactionLineItemId).toBe('TXL-789');
    });

    it('truncates closeDate to date-only', () => {
      const dealManager = makeDealManager();
      dealManager.importEntities([{
        id: 'deal-1',
        properties: {
          dealname: 'Test',
          closedate: '2022-06-15T14:30:00.000Z',
          pipeline: 'Pipeline',
          dealstage: 'Eval',
          addonLicenseId: '', transactionId: '', transactionLineItemId: '',
          appEntitlementId: '', appEntitlementNumber: '',
        },
        associations: [],
      }]);

      expect(dealManager.getArray()[0].data.closeDate).toBe('2022-06-15');
    });

    it('converts amount string to number', () => {
      const dealManager = makeDealManager();
      dealManager.importEntities([{
        id: 'deal-1',
        properties: {
          dealname: 'Test', closedate: '2022-01-01T00:00:00Z',
          pipeline: 'Pipeline', dealstage: 'ClosedWon',
          amount: '1234.56',
          addonLicenseId: '', transactionId: '', transactionLineItemId: '',
          appEntitlementId: '', appEntitlementNumber: '',
        },
        associations: [],
      }]);
      expect(dealManager.getArray()[0].data.amount).toBe(1234.56);
    });

    it('treats empty amount as null', () => {
      const dealManager = makeDealManager();
      dealManager.importEntities([{
        id: 'deal-1',
        properties: {
          dealname: 'Test', closedate: '2022-01-01T00:00:00Z',
          pipeline: 'Pipeline', dealstage: 'ClosedWon',
          amount: '',
          addonLicenseId: '', transactionId: '', transactionLineItemId: '',
          appEntitlementId: '', appEntitlementNumber: '',
        },
        associations: [],
      }]);
      expect(dealManager.getArray()[0].data.amount).toBeNull();
    });

    it('treats null amount as null', () => {
      const dealManager = makeDealManager();
      dealManager.importEntities([{
        id: 'deal-1',
        properties: {
          dealname: 'Test', closedate: '2022-01-01T00:00:00Z',
          pipeline: 'Pipeline', dealstage: 'ClosedWon',
          addonLicenseId: '', transactionId: '', transactionLineItemId: '',
          appEntitlementId: '', appEntitlementNumber: '',
        },
        associations: [],
      }]);
      expect(dealManager.getArray()[0].data.amount).toBeNull();
    });

    it('converts empty identifier fields to null', () => {
      const dealManager = makeDealManager();
      dealManager.importEntities([{
        id: 'deal-1',
        properties: {
          dealname: 'Test', closedate: '2022-01-01T00:00:00Z',
          pipeline: 'Pipeline', dealstage: 'ClosedWon',
          addonLicenseId: '', transactionId: '', transactionLineItemId: '',
          appEntitlementId: '', appEntitlementNumber: '',
        },
        associations: [],
      }]);
      const deal = dealManager.getArray()[0];
      expect(deal.data.addonLicenseId).toBeNull();
      expect(deal.data.transactionId).toBeNull();
    });

    it('always sets pipeline to MPAC regardless of input', () => {
      const dealManager = makeDealManager();
      dealManager.importEntities([{
        id: 'deal-1',
        properties: {
          dealname: 'Test', closedate: '2022-01-01T00:00:00Z',
          pipeline: 'Pipeline',  // The actual value doesn't matter for down transform
          dealstage: 'ClosedWon',
          addonLicenseId: '', transactionId: '', transactionLineItemId: '',
          appEntitlementId: '', appEntitlementNumber: '',
        },
        associations: [],
      }]);
      expect(dealManager.getArray()[0].data.pipeline).toBe(Pipeline.MPAC);
    });

  });

  describe('up transforms (internal → HubSpot)', () => {

    it('creates deal with correct HubSpot properties', () => {
      const dealManager = makeDealManager();
      const deal = dealManager.create({
        dealName: 'New Deal',
        closeDate: '2022-06-15',
        pipeline: Pipeline.MPAC,
        dealStage: DealStage.EVAL,
        amount: 250,
        addonLicenseId: 'ALI-999',
        transactionId: null,
        transactionLineItemId: null,
        appEntitlementId: 'AEI-999',
        appEntitlementNumber: 'AEN-999',
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

      const changes = deal.getPropertyChanges() as Record<string, string>;
      expect(changes['dealname']).toBe('New Deal');
      expect(changes['closedate']).toBe('2022-06-15');
      expect(changes['dealstage']).toBe('Eval');
      expect(changes['amount']).toBe('250');
      expect(changes['addonLicenseId']).toBe('ALI-999');
      expect(changes['transactionId']).toBe('');
      expect(changes['appEntitlementId']).toBe('AEI-999');
    });

    it('converts null amount to empty string', () => {
      const dealManager = makeDealManager();
      const deal = dealManager.create({
        dealName: 'Test', closeDate: '2022-01-01',
        pipeline: Pipeline.MPAC, dealStage: DealStage.EVAL,
        amount: null,
        addonLicenseId: null, transactionId: null, transactionLineItemId: null,
        appEntitlementId: null, appEntitlementNumber: null,
        relatedProducts: null, app: null, country: null, origin: null,
        deployment: null, saleType: null, licenseTier: null,
        associatedPartner: null, duplicateOf: null, maintenanceEndDate: null,
      });
      const changes = deal.getPropertyChanges() as Record<string, string>;
      expect(changes['amount']).toBe('');
    });

    it('converts licenseTier number to string', () => {
      const dealManager = makeDealManager({
        attrs: { licenseTier: 'license_tier' },
      });
      const deal = dealManager.create({
        dealName: 'Test', closeDate: '2022-01-01',
        pipeline: Pipeline.MPAC, dealStage: DealStage.EVAL,
        amount: null, licenseTier: 50,
        addonLicenseId: null, transactionId: null, transactionLineItemId: null,
        appEntitlementId: null, appEntitlementNumber: null,
        relatedProducts: null, app: null, country: null, origin: null,
        deployment: null, saleType: null,
        associatedPartner: null, duplicateOf: null, maintenanceEndDate: null,
      });
      const changes = deal.getPropertyChanges() as Record<string, string>;
      expect(changes['license_tier']).toBe('50');
    });

  });

  describe('shouldReject', () => {

    it('rejects deals not in MPAC pipeline', () => {
      const dealManager = makeDealManager();
      dealManager.importEntities([{
        id: 'deal-1',
        properties: {
          dealname: 'Partner Deal',
          closedate: '2022-01-01T00:00:00Z',
          pipeline: 'PartnerPipeline',
          dealstage: 'ClosedWon',
          addonLicenseId: 'ALI-1', transactionId: '', transactionLineItemId: '',
          appEntitlementId: '', appEntitlementNumber: '',
        },
        associations: [],
      }]);
      expect(dealManager.getArray().length).toBe(0);
    });

    it('accepts deals in MPAC pipeline', () => {
      const dealManager = makeDealManager();
      dealManager.importEntities([{
        id: 'deal-1',
        properties: {
          dealname: 'MPAC Deal',
          closedate: '2022-01-01T00:00:00Z',
          pipeline: 'Pipeline',
          dealstage: 'ClosedWon',
          addonLicenseId: 'ALI-1', transactionId: '', transactionLineItemId: '',
          appEntitlementId: '', appEntitlementNumber: '',
        },
        associations: [],
      }]);
      expect(dealManager.getArray().length).toBe(1);
    });

    it('rejects deals marked as duplicates when duplicateOf is configured', () => {
      const dealManager = makeDealManager({
        attrs: { duplicateOf: 'duplicate_of' },
      });
      dealManager.importEntities([{
        id: 'deal-1',
        properties: {
          dealname: 'Duplicate Deal',
          closedate: '2022-01-01T00:00:00Z',
          pipeline: 'Pipeline',
          dealstage: 'ClosedWon',
          duplicate_of: 'original-deal-id',
          addonLicenseId: '', transactionId: '', transactionLineItemId: '',
          appEntitlementId: '', appEntitlementNumber: '',
        },
        associations: [],
      }]);
      expect(dealManager.getArray().length).toBe(0);
    });

  });

});

describe('Contact field mappings', () => {

  function makeContactManager(config = {}) {
    const hubspot = new Hubspot({ contact: config });
    return hubspot.contactManager;
  }

  describe('down transforms (HubSpot → internal)', () => {

    it('imports contact with basic fields', () => {
      const contactManager = makeContactManager();
      contactManager.importEntities([{
        id: 'contact-1',
        properties: {
          email: 'john@acme.com',
          firstname: 'John',
          lastname: 'Smith',
          phone: '+1-555-0100',
          city: 'New York',
          state: 'NY',
          country: 'US',
        },
        associations: [],
      }]);

      const contacts = contactManager.getArray();
      expect(contacts.length).toBe(1);
      expect(contacts[0].data.email).toBe('john@acme.com');
      expect(contacts[0].data.firstName).toBe('John');
      expect(contacts[0].data.lastName).toBe('Smith');
      expect(contacts[0].data.phone).toBe('+1-555-0100');
      expect(contacts[0].data.city).toBe('New York');
      expect(contacts[0].data.state).toBe('NY');
    });

    it('trims whitespace from name fields', () => {
      const contactManager = makeContactManager();
      contactManager.importEntities([{
        id: 'contact-1',
        properties: {
          email: 'test@acme.com',
          firstname: '  John  ',
          lastname: '  Smith  ',
        },
        associations: [],
      }]);
      expect(contactManager.getArray()[0].data.firstName).toBe('John');
      expect(contactManager.getArray()[0].data.lastName).toBe('Smith');
    });

    it('treats empty trimmed name as null', () => {
      const contactManager = makeContactManager();
      contactManager.importEntities([{
        id: 'contact-1',
        properties: {
          email: 'test@acme.com',
          firstname: '   ',
          lastname: '',
        },
        associations: [],
      }]);
      expect(contactManager.getArray()[0].data.firstName).toBeNull();
      expect(contactManager.getArray()[0].data.lastName).toBeNull();
    });

    it('parses semicolon-delimited sets (deployment, products)', () => {
      const contactManager = makeContactManager({
        attrs: {
          deployment: 'deployment',
          products: 'products',
        },
      });
      contactManager.importEntities([{
        id: 'contact-1',
        properties: {
          email: 'test@acme.com',
          deployment: 'Server;Cloud',
          products: 'addon-a;addon-b;addon-c',
        },
        associations: [],
      }]);
      const contact = contactManager.getArray()[0];
      expect(contact.data.deployment).toEqual(new Set(['Server', 'Cloud']));
      expect(contact.data.products).toEqual(new Set(['addon-a', 'addon-b', 'addon-c']));
    });

    it('parses licenseTier as number', () => {
      const contactManager = makeContactManager({
        attrs: { licenseTier: 'license_tier' },
      });
      contactManager.importEntities([{
        id: 'contact-1',
        properties: { email: 'test@acme.com', license_tier: '50' },
        associations: [],
      }]);
      expect(contactManager.getArray()[0].data.licenseTier).toBe(50);
    });

    it('treats null licenseTier as null', () => {
      const contactManager = makeContactManager({
        attrs: { licenseTier: 'license_tier' },
      });
      contactManager.importEntities([{
        id: 'contact-1',
        properties: { email: 'test@acme.com' },
        associations: [],
      }]);
      expect(contactManager.getArray()[0].data.licenseTier).toBeNull();
    });

  });

  describe('up transforms (internal → HubSpot)', () => {

    it('joins sets with semicolons', () => {
      const contactManager = makeContactManager({
        attrs: {
          deployment: 'deployment',
          products: 'products',
        },
      });
      const contact = contactManager.create({
        email: 'test@acme.com',
        firstName: null, lastName: null, phone: null,
        city: null, state: null, country: null, region: null,
        contactType: 'customer',
        products: new Set(['addon-a', 'addon-b']),
        deployment: new Set(['Server', 'Cloud']),
        relatedProducts: new Set(),
        licenseTier: null, lastMpacEvent: null,
        lastAssociatedPartner: null,
      });
      const changes = contact.getPropertyChanges() as Record<string, string>;
      // Sets should be joined with semicolons (order may vary)
      expect(changes['products']!.split(';').sort()).toEqual(['addon-a', 'addon-b']);
      expect(changes['deployment']!.split(';').sort()).toEqual(['Cloud', 'Server']);
    });

    it('converts null strings to empty strings', () => {
      const contactManager = makeContactManager();
      const contact = contactManager.create({
        email: 'test@acme.com',
        firstName: null, lastName: null, phone: null,
        city: null, state: null, country: null, region: null,
        contactType: null,
        products: new Set(), deployment: new Set(),
        relatedProducts: new Set(),
        licenseTier: null, lastMpacEvent: null,
        lastAssociatedPartner: null,
      });
      const changes = contact.getPropertyChanges() as Record<string, string>;
      expect(changes['firstname']).toBe('');
      expect(changes['lastname']).toBe('');
      expect(changes['phone']).toBe('');
    });

  });

  describe('email index', () => {

    it('finds contact by primary email', () => {
      const contactManager = makeContactManager();
      contactManager.importEntities([{
        id: 'contact-1',
        properties: { email: 'john@acme.com' },
        associations: [],
      }]);
      expect(contactManager.getByEmail('john@acme.com')?.id).toBe('contact-1');
    });

    it('finds contact by additional email', () => {
      const contactManager = makeContactManager();
      contactManager.importEntities([{
        id: 'contact-1',
        properties: {
          email: 'john@acme.com',
          hs_additional_emails: 'john.smith@acme.com;jsmith@acme.com',
        },
        associations: [],
      }]);
      expect(contactManager.getByEmail('john.smith@acme.com')?.id).toBe('contact-1');
      expect(contactManager.getByEmail('jsmith@acme.com')?.id).toBe('contact-1');
    });

    it('returns undefined for unknown email', () => {
      const contactManager = makeContactManager();
      contactManager.importEntities([{
        id: 'contact-1',
        properties: { email: 'john@acme.com' },
        associations: [],
      }]);
      expect(contactManager.getByEmail('unknown@acme.com')).toBeUndefined();
    });

  });

});

describe('Company field mappings', () => {

  function makeCompanyManager() {
    const hubspot = new Hubspot();
    return hubspot.companyManager;
  }

  it('imports company with name and type', () => {
    const companyManager = makeCompanyManager();
    companyManager.importEntities([{
      id: 'company-1',
      properties: { name: 'Acme Corp', type: 'PARTNER' },
      associations: [],
    }]);
    const company = companyManager.getArray()[0];
    expect(company.data.name).toBe('Acme Corp');
    expect(company.data.type).toBe('Partner');
  });

  it('treats non-PARTNER type as null', () => {
    const companyManager = makeCompanyManager();
    companyManager.importEntities([{
      id: 'company-1',
      properties: { name: 'Acme Corp', type: 'CUSTOMER' },
      associations: [],
    }]);
    expect(companyManager.getArray()[0].data.type).toBeNull();
  });

  it('converts Partner type back to PARTNER for upload', () => {
    const companyManager = makeCompanyManager();
    const company = companyManager.create({ name: 'Acme Corp', type: 'Partner' });
    const changes = company.getPropertyChanges() as Record<string, string>;
    expect(changes['type']).toBe('PARTNER');
  });

  it('converts null type to empty string for upload', () => {
    const companyManager = makeCompanyManager();
    const company = companyManager.create({ name: 'Acme Corp', type: null });
    const changes = company.getPropertyChanges() as Record<string, string>;
    expect(changes['type']).toBe('');
  });

});
