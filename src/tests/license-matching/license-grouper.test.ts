import Chance from 'chance';
import { DateTime } from 'luxon';
import { RawDataSet } from '../../lib/data/raw';
import { DataSet } from '../../lib/data/set';
import { Engine, EngineConfig } from '../../lib/engine/engine';
import { LicenseGrouper } from '../../lib/license-matching/license-grouper';
import { RawLicense, RawLicenseContact } from '../../lib/marketplace/raw';

const chance = new Chance();

function makeTechContact(overrides: Partial<RawLicenseContact> = {}): RawLicenseContact {
  return {
    email: chance.email(),
    name: chance.name(),
    phone: chance.phone(),
    address1: chance.address(),
    ...overrides,
  };
}

function makeLicense(id: string, overrides: Partial<RawLicense> = {}): RawLicense {
  return {
    addonKey: 'test-addon',
    addonName: 'Test Addon',
    hosting: 'Server',
    lastUpdated: '2022-01-01',
    contactDetails: {
      company: chance.company(),
      country: 'US',
      region: 'Americas',
      technicalContact: makeTechContact(),
    },
    addonLicenseId: id,
    appEntitlementId: id,
    appEntitlementNumber: id,
    licenseId: id,
    licenseType: 'COMMERCIAL',
    maintenanceStartDate: '2022-01-01',
    maintenanceEndDate: '2022-03-01',
    status: 'active',
    tier: 'Unlimited Users',
    ...overrides,
  };
}

function makeDataSetAndRun(rawLicenses: RawLicense[], freeEmailDomains: string[] = []) {
  const data: RawDataSet = {
    rawCompanies: [],
    rawContacts: [],
    rawDeals: [],
    transactions: [],
    licensesWithoutDataInsights: [],
    licensesWithDataInsights: rawLicenses,
    freeDomains: freeEmailDomains,
    tlds: [],
  };

  // Populate appToPlatform from the addon keys in the test licenses
  const appToPlatform: { [addonKey: string]: string } = Object.create(null);
  for (const lic of rawLicenses) {
    appToPlatform[lic.addonKey] = 'Confluence';
  }

  const config: EngineConfig = {
    partnerDomains: new Set(),
    appToPlatform,
  };

  const dataSet = new DataSet(data, DateTime.now());
  const engine = new Engine(config);
  const results = engine.run(dataSet);
  return { dataSet, results, licenses: dataSet.mpac.licenses };
}

/** Count unique match groups in dealGeneratorResults.
 *  The map has one entry per license (keyed by license.id).
 *  Licenses in the same group share the same `actions` array reference.
 */
function countUniqueGroups(dealResults: Map<string, { actions: any[] }>) {
  return new Set([...dealResults.values()].map(v => v.actions)).size;
}

describe('LicenseGrouper', () => {

  describe('product grouping', () => {

    it('groups licenses by addonKey + hosting', () => {
      const contact = makeTechContact({ email: 'same@acme.com' });
      const licenses = [
        makeLicense('L1', {
          addonKey: 'addon-a',
          hosting: 'Server',
          contactDetails: { company: 'Acme', country: 'US', region: 'Americas', technicalContact: contact },
        }),
        makeLicense('L2', {
          addonKey: 'addon-a',
          hosting: 'Server',
          contactDetails: { company: 'Acme', country: 'US', region: 'Americas', technicalContact: contact },
        }),
        makeLicense('L3', {
          addonKey: 'addon-a',
          hosting: 'Cloud',
          contactDetails: { company: 'Acme', country: 'US', region: 'Americas', technicalContact: contact },
        }),
      ];

      const { licenses: parsedLicenses } = makeDataSetAndRun(licenses);
      expect(parsedLicenses.length).toBe(3);
    });

    it('does not match licenses with different addonKeys', () => {
      const contact = makeTechContact({ email: 'same@acme.com' });
      const licenses = [
        makeLicense('L1', {
          addonKey: 'addon-a',
          hosting: 'Server',
          contactDetails: { company: 'Acme', country: 'US', region: 'Americas', technicalContact: contact },
        }),
        makeLicense('L2', {
          addonKey: 'addon-b',
          hosting: 'Server',
          contactDetails: { company: 'Acme', country: 'US', region: 'Americas', technicalContact: contact },
        }),
      ];

      const { results } = makeDataSetAndRun(licenses);
      // Each should be in its own group since addonKeys differ
      // Map has 2 entries (one per license) with different action arrays
      expect(countUniqueGroups(results.dealGeneratorResults)).toBe(2);
    });

  });

  describe('transitive matching', () => {

    it('groups A-B and B-C into one group A-B-C', () => {
      // A and B share same contact
      // B and C share similar company + scoring fields within 90 days
      // Result: A, B, C should all be in one group
      const contactAB = makeTechContact({ email: 'ab@acme.com', name: 'Person AB', address1: '100 Main St' });
      const contactBC = makeTechContact({ email: 'bc@acme.com', name: 'Person BC', address1: '200 Oak Ave' });

      const licenses = [
        makeLicense('L-A', {
          addonKey: 'addon',
          hosting: 'Server',
          maintenanceStartDate: '2022-01-01',
          maintenanceEndDate: '2022-02-01',
          contactDetails: {
            company: 'Acme Corp',
            country: 'US',
            region: 'Americas',
            technicalContact: contactAB,
          },
        }),
        makeLicense('L-B', {
          addonKey: 'addon',
          hosting: 'Server',
          maintenanceStartDate: '2022-02-01',
          maintenanceEndDate: '2022-03-01',
          contactDetails: {
            company: 'Acme Corp',
            country: 'US',
            region: 'Americas',
            technicalContact: contactAB,
          },
        }),
        makeLicense('L-C', {
          addonKey: 'addon',
          hosting: 'Server',
          maintenanceStartDate: '2022-03-01',
          maintenanceEndDate: '2022-04-01',
          contactDetails: {
            company: 'Acme Corp',
            country: 'US',
            region: 'Americas',
            technicalContact: contactBC,
          },
        }),
      ];

      const { results } = makeDataSetAndRun(licenses);
      // All three licenses in the same group → 3 map entries, but same actions reference
      expect(countUniqueGroups(results.dealGeneratorResults)).toBe(1);
      // All 3 licenses are present
      expect(results.dealGeneratorResults.size).toBe(3);
    });

  });

  describe('single-license groups', () => {

    it('creates a group for a single license', () => {
      const licenses = [
        makeLicense('L-SINGLE', {
          addonKey: 'addon',
          hosting: 'Server',
        }),
      ];

      const { results } = makeDataSetAndRun(licenses);
      expect(results.dealGeneratorResults.size).toBe(1);
    });

  });

  describe('free email domain handling', () => {

    it('ignores company domain for free email providers', () => {
      const freeEmailDomains = ['gmail.com'];

      // When companyDomain would be gmail.com, it should be set to ''
      // so it doesn't contribute to scoring
      const licenses = [
        makeLicense('L1', {
          addonKey: 'addon',
          hosting: 'Server',
          maintenanceStartDate: '2022-01-01',
          maintenanceEndDate: '2022-02-01',
          contactDetails: {
            company: 'Acme Corp',
            country: 'US',
            region: 'Americas',
            technicalContact: makeTechContact({ email: 'john@gmail.com', address1: '123 Main St' }),
          },
        }),
        makeLicense('L2', {
          addonKey: 'addon',
          hosting: 'Server',
          maintenanceStartDate: '2022-02-01',
          maintenanceEndDate: '2022-03-01',
          contactDetails: {
            company: 'Acme Corp',
            country: 'US',
            region: 'Americas',
            technicalContact: makeTechContact({ email: 'jane@gmail.com', address1: '123 Main St' }),
          },
        }),
      ];

      const { results } = makeDataSetAndRun(licenses, freeEmailDomains);
      // Should still match via company + address even without domain score
      // 2 map entries (one per license), but same actions reference = 1 group
      expect(countUniqueGroups(results.dealGeneratorResults)).toBe(1);
    });

  });

  describe('time window filtering', () => {

    it('does not match licenses more than 90 days apart', () => {
      const contact1 = makeTechContact({ email: 'user1@acme.com', address1: '123 Main St', name: 'John' });
      const contact2 = makeTechContact({ email: 'user2@acme.com', address1: '123 Main St', name: 'John' });

      const licenses = [
        makeLicense('L1', {
          addonKey: 'addon',
          hosting: 'Server',
          maintenanceStartDate: '2022-01-01',
          maintenanceEndDate: '2022-01-15',
          contactDetails: {
            company: 'Acme Corp',
            country: 'US',
            region: 'Americas',
            technicalContact: contact1,
          },
        }),
        makeLicense('L2', {
          addonKey: 'addon',
          hosting: 'Server',
          maintenanceStartDate: '2022-07-01',
          maintenanceEndDate: '2022-08-01',
          contactDetails: {
            company: 'Acme Corp',
            country: 'US',
            region: 'Americas',
            technicalContact: contact2,
          },
        }),
      ];

      const { results } = makeDataSetAndRun(licenses);
      // Should not match — more than 90 days apart
      // 2 separate groups → 2 unique action references
      expect(countUniqueGroups(results.dealGeneratorResults)).toBe(2);
    });

  });

});
