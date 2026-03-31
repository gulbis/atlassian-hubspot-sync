import { AttributionJoiner } from '../lib/marketplace/attribution-joiner';
import { RawAttribution } from '../lib/marketplace/raw';
import { License } from '../lib/model/license';

function makeLicense(overrides: Partial<{
  addonLicenseId: string | null;
  appEntitlementId: string | null;
  channel: string;
}>): License {
  return License.fromRaw({
    addonLicenseId: overrides.addonLicenseId ?? undefined,
    licenseId: 'lic-1',
    addonKey: 'com.eazybi.jira.plugins.eazybi-jira',
    addonName: 'eazyBI',
    lastUpdated: '2026-01-01',
    contactDetails: {
      technicalContact: { email: 'test@acme.com', name: 'Test User' },
      company: 'Acme',
      country: 'US',
      region: 'Americas',
    },
    tier: '10 Users',
    licenseType: 'COMMERCIAL',
    hosting: 'Cloud',
    maintenanceStartDate: '2026-01-01',
    status: 'active',
    appEntitlementId: overrides.appEntitlementId ?? undefined,
    ...(overrides.channel ? {
      attribution: { channel: overrides.channel },
    } : {}),
  });
}

function makeAttr(overrides: Partial<RawAttribution> = {}): RawAttribution {
  return {
    addonKey: 'com.eazybi',
    channel: 'organic',
    eventTimestamp: '2026-01-15 10:00:00',
    ...overrides,
  };
}

describe('AttributionJoiner', () => {
  it('joins by appEntitlementId', () => {
    const license = makeLicense({ appEntitlementId: 'ent-1' });
    const joiner = new AttributionJoiner([
      makeAttr({ appEntitlementId: 'ent-1', channel: 'organic', referrerDomain: 'www.google.com' }),
    ]);
    const result = joiner.getBestAttribution(license);
    expect(result).not.toBeNull();
    expect(result!.channel).toBe('organic');
    expect(result!.referrerDomain).toBe('www.google.com');
  });

  it('joins by addonLicenseId', () => {
    const license = makeLicense({ addonLicenseId: 'ALI-123' });
    const joiner = new AttributionJoiner([
      makeAttr({ addonLicenseId: 'ALI-123', channel: 'email' }),
    ]);
    const result = joiner.getBestAttribution(license);
    expect(result).not.toBeNull();
    expect(result!.channel).toBe('email');
  });

  it('prefers touchpoint with GCLID over most recent', () => {
    const license = makeLicense({ appEntitlementId: 'ent-1' });
    const joiner = new AttributionJoiner([
      makeAttr({
        appEntitlementId: 'ent-1',
        channel: 'organic',
        eventTimestamp: '2026-03-01 10:00:00', // more recent
      }),
      makeAttr({
        appEntitlementId: 'ent-1',
        channel: 'paid-search-non-branded',
        marketplaceURL: 'https://marketplace.atlassian.com/apps/123?gclid=CjTestGclidValue1234567890abcdefghijklmnopqrstuvwxyz',
        eventTimestamp: '2026-01-15 10:00:00', // older but has GCLID
      }),
    ]);
    const result = joiner.getBestAttribution(license);
    expect(result!.gclid).toBe('CjTestGclidValue1234567890abcdefghijklmnopqrstuvwxyz');
    expect(result!.channel).toBe('paid-search-non-branded');
  });

  it('picks most recent touchpoint when no GCLID', () => {
    const license = makeLicense({ appEntitlementId: 'ent-1' });
    const joiner = new AttributionJoiner([
      makeAttr({ appEntitlementId: 'ent-1', channel: 'organic', eventTimestamp: '2026-01-01 10:00:00' }),
      makeAttr({ appEntitlementId: 'ent-1', channel: 'direct', eventTimestamp: '2026-03-01 10:00:00' }),
    ]);
    const result = joiner.getBestAttribution(license);
    expect(result!.channel).toBe('direct');
  });

  it('falls back to license attribution (Source A) when no touchpoints match', () => {
    const license = makeLicense({ appEntitlementId: 'ent-no-match', channel: 'Organic search' });
    const joiner = new AttributionJoiner([
      makeAttr({ appEntitlementId: 'ent-other', channel: 'direct' }),
    ]);
    const result = joiner.getBestAttribution(license);
    expect(result).not.toBeNull();
    expect(result!.channel).toBe('Organic search');
  });

  it('returns null when no attribution at all', () => {
    const license = makeLicense({ appEntitlementId: 'ent-nothing' });
    const joiner = new AttributionJoiner([]);
    const result = joiner.getBestAttribution(license);
    expect(result).toBeNull();
  });

  it('extracts GCLID from Source A campaignContent fallback', () => {
    const gclid = 'CjwKCAjwu4WoBhBkEiwAojNdXhjJwc2t4MdnkflI7etfVTQo9CRluDW99EUDId1W3vvJ-Wv4SFYqpRoC6akQAvD_BwE';
    const raw = {
      addonLicenseId: undefined,
      licenseId: 'lic-1',
      addonKey: 'com.eazybi.jira.plugins.eazybi-jira',
      addonName: 'eazyBI',
      lastUpdated: '2023-09-01',
      contactDetails: {
        technicalContact: { email: 'test@acme.com', name: 'Test' },
        company: 'Acme', country: 'US', region: 'Americas',
      },
      tier: '10 Users',
      licenseType: 'COMMERCIAL' as const,
      hosting: 'Cloud' as const,
      maintenanceStartDate: '2023-09-01',
      status: 'active' as const,
      attribution: {
        channel: 'Paid Search',
        campaignSource: 'google',
        campaignMedium: 'paidsearch',
        campaignContent: gclid,
      },
    };
    const license = License.fromRaw(raw);
    const joiner = new AttributionJoiner([]);
    const result = joiner.getBestAttribution(license);
    expect(result).not.toBeNull();
    expect(result!.gclid).toBe(gclid);
    expect(result!.utmContent).toBeNull(); // GCLID should not be stored as content
  });

  it('deduplicates touchpoints found via multiple keys', () => {
    const license = makeLicense({ appEntitlementId: 'ent-1', addonLicenseId: 'ALI-1' });
    const attr = makeAttr({
      appEntitlementId: 'ent-1',
      addonLicenseId: 'ALI-1',
      channel: 'organic',
    });
    const joiner = new AttributionJoiner([attr]);
    const result = joiner.getBestAttribution(license);
    expect(result).not.toBeNull();
    expect(result!.channel).toBe('organic');
  });
});
