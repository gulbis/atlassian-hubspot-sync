import { DateTime } from 'luxon';
import { RawDataSet } from '../../lib/data/raw';
import { DataSet } from '../../lib/data/set';
import { Engine, EngineConfig } from '../../lib/engine/engine';
import { FullEntity } from '../../lib/hubspot/interfaces';
import { RawLicense, RawTransaction } from '../../lib/marketplace/raw';

/**
 * Tests for deal→company association logic:
 * - Company is determined by the technical contact's HubSpot company association.
 * - Fallback: match tech contact's email domain against company domains.
 * - Free email domains are excluded from domain matching.
 */

function buildDataSet(opts: {
  techEmail: string;
  billingEmail?: string;
  rawCompanies?: FullEntity[];
  rawContacts?: FullEntity[];
  freeDomains?: string[];
}): { dataSet: DataSet; config: EngineConfig } {
  const addonKey = 'com.test.plugin';
  const licenseId = 'ALI-TEST-1';
  const startDate = '2025-01-01';

  const license: RawLicense = {
    addonKey,
    addonName: 'Test Plugin',
    hosting: 'Server',
    lastUpdated: startDate,
    contactDetails: {
      company: 'Test Corp',
      country: 'US',
      region: 'Americas',
      technicalContact: { email: opts.techEmail, name: 'Tech User' },
      ...(opts.billingEmail ? { billingContact: { email: opts.billingEmail, name: 'Billing User' } } : {}),
    },
    addonLicenseId: licenseId,
    appEntitlementId: licenseId,
    appEntitlementNumber: licenseId,
    licenseId,
    licenseType: 'COMMERCIAL',
    maintenanceStartDate: startDate,
    maintenanceEndDate: '2026-01-01',
    status: 'active',
    tier: '10 Users',
  };

  const transaction: RawTransaction = {
    appEntitlementId: licenseId,
    licenseId,
    addonKey,
    addonName: 'Test Plugin',
    lastUpdated: startDate,
    customerDetails: {
      company: 'Test Corp',
      country: 'US',
      region: 'Americas',
      technicalContact: { email: opts.techEmail, name: 'Tech User' },
    },
    transactionId: 'AT-100001',
    transactionLineItemId: 'TL-1',
    purchaseDetails: {
      billingPeriod: 'Annual',
      tier: '10 Users',
      saleDate: startDate,
      maintenanceStartDate: startDate,
      maintenanceEndDate: '2026-01-01',
      hosting: 'Server',
      licenseType: 'COMMERCIAL',
      purchasePrice: 100,
      vendorAmount: 80,
      saleType: 'New',
    },
  };

  const data: RawDataSet = {
    rawCompanies: opts.rawCompanies ?? [],
    rawContacts: opts.rawContacts ?? [],
    rawDeals: [],
    rawAttributions: [],
    transactions: [transaction],
    licensesWithoutDataInsights: [],
    licensesWithDataInsights: [license],
    freeDomains: opts.freeDomains ?? [],
    tlds: [],
  };

  const config: EngineConfig = {
    partnerDomains: new Set(),
    appToPlatform: { [addonKey]: 'Confluence' },
  };

  return { dataSet: new DataSet(data, DateTime.now()), config };
}

function runEngine(dataSet: DataSet, config: EngineConfig) {
  const engine = new Engine(config);
  engine.run(dataSet);
  dataSet.hubspot.populateFakeIds();
  return {
    deals: dataSet.hubspot.dealManager.getArray(),
    contacts: dataSet.hubspot.contactManager.getArray(),
    companies: dataSet.hubspot.companyManager.getArray(),
  };
}

describe('Deal-Company Association', () => {

  it('uses tech contact existing HubSpot company association', () => {
    const techEmail = 'tech@acme.com';

    // Create a company and a contact pre-linked to it in HubSpot
    const rawCompany: FullEntity = {
      id: 'company-1',
      properties: { name: 'Acme Corp', domain: 'acme.com' },
      associations: [`contact_to_company:contact-1`],
    };
    const rawContact: FullEntity = {
      id: 'contact-1',
      properties: { email: techEmail, firstname: 'Tech', lastname: 'User', contact_type: 'customer' },
      associations: [`company:company-1`],
    };

    const { dataSet, config } = buildDataSet({
      techEmail,
      rawCompanies: [rawCompany],
      rawContacts: [rawContact],
    });

    const { deals } = runEngine(dataSet, config);
    expect(deals.length).toBeGreaterThan(0);

    const deal = deals[0];
    const companies = deal.companies.getAll();
    expect(companies.length).toBe(1);
    expect(companies[0].id).toBe('company-1');
  });

  it('falls back to domain match when tech contact has no company', () => {
    const techEmail = 'tech@widgetco.com';

    // Company exists with matching domain, but contact is NOT pre-linked
    const rawCompany: FullEntity = {
      id: 'company-2',
      properties: { name: 'Widget Co', domain: 'widgetco.com' },
      associations: [],
    };
    const rawContact: FullEntity = {
      id: 'contact-2',
      properties: { email: techEmail, firstname: 'Tech', lastname: 'User', contact_type: 'customer' },
      associations: [],  // no company association
    };

    const { dataSet, config } = buildDataSet({
      techEmail,
      rawCompanies: [rawCompany],
      rawContacts: [rawContact],
    });

    const { deals } = runEngine(dataSet, config);
    const deal = deals[0];
    const companies = deal.companies.getAll();
    expect(companies.length).toBe(1);
    expect(companies[0].id).toBe('company-2');
  });

  it('matches against additional (secondary) domains', () => {
    const techEmail = 'tech@subsidiary.com';

    const rawCompany: FullEntity = {
      id: 'company-3',
      properties: { name: 'Parent Corp', domain: 'parentcorp.com', hs_additional_domains: 'subsidiary.com;otherbrand.com' },
      associations: [],
    };
    const rawContact: FullEntity = {
      id: 'contact-3',
      properties: { email: techEmail, firstname: 'Tech', lastname: 'User', contact_type: 'customer' },
      associations: [],
    };

    const { dataSet, config } = buildDataSet({
      techEmail,
      rawCompanies: [rawCompany],
      rawContacts: [rawContact],
    });

    const { deals } = runEngine(dataSet, config);
    const deal = deals[0];
    const companies = deal.companies.getAll();
    expect(companies.length).toBe(1);
    expect(companies[0].id).toBe('company-3');
  });

  it('does not match free email domains to companies', () => {
    const techEmail = 'tech@gmail.com';

    const rawCompany: FullEntity = {
      id: 'company-4',
      properties: { name: 'Gmail Inc', domain: 'gmail.com' },
      associations: [],
    };
    const rawContact: FullEntity = {
      id: 'contact-4',
      properties: { email: techEmail, firstname: 'Tech', lastname: 'User', contact_type: 'customer' },
      associations: [],
    };

    const { dataSet, config } = buildDataSet({
      techEmail,
      rawCompanies: [rawCompany],
      rawContacts: [rawContact],
      freeDomains: ['gmail.com'],
    });

    const { deals } = runEngine(dataSet, config);
    // Free-email-provider contacts may not generate deals (filtered as free-email-provider transactions).
    // If a deal is generated, it should NOT have a company matched via the free domain.
    for (const deal of deals) {
      const companies = deal.companies.getAll();
      const companyIds = companies.map(c => c.id);
      expect(companyIds).not.toContain('company-4');
    }
  });

  it('assigns no company when no domain match exists', () => {
    const techEmail = 'tech@unknown-domain.com';

    const rawContact: FullEntity = {
      id: 'contact-5',
      properties: { email: techEmail, firstname: 'Tech', lastname: 'User', contact_type: 'customer' },
      associations: [],
    };

    const { dataSet, config } = buildDataSet({
      techEmail,
      rawCompanies: [],
      rawContacts: [rawContact],
    });

    const { deals } = runEngine(dataSet, config);
    const deal = deals[0];
    expect(deal.companies.getAll().length).toBe(0);
  });

  it('still associates all contacts (tech + billing) with the deal', () => {
    const techEmail = 'tech@corp.com';
    const billingEmail = 'billing@corp.com';

    const rawContact1: FullEntity = {
      id: 'contact-t',
      properties: { email: techEmail, firstname: 'Tech', lastname: 'User', contact_type: 'customer' },
      associations: [],
    };
    const rawContact2: FullEntity = {
      id: 'contact-b',
      properties: { email: billingEmail, firstname: 'Billing', lastname: 'User', contact_type: 'customer' },
      associations: [],
    };

    const { dataSet, config } = buildDataSet({
      techEmail,
      billingEmail,
      rawContacts: [rawContact1, rawContact2],
    });

    const { deals } = runEngine(dataSet, config);
    const deal = deals[0];
    const contactEmails = deal.contacts.getAll().map(c => c.data.email);
    expect(contactEmails).toContain(techEmail);
    expect(contactEmails).toContain(billingEmail);
  });

});
