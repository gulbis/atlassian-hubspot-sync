import {
  parseMarketplaceURL,
  extractGclidFromContent,
  parseAttribution,
  mapChannelToHubspot,
} from '../lib/marketplace/attribution-parser';
import { RawAttribution } from '../lib/marketplace/raw';

describe('parseMarketplaceURL', () => {
  it('extracts GCLID from URL', () => {
    const url = 'https://marketplace.atlassian.com/apps/123?gclid=Cj0KCQiAgribBhDkARIsAASA5bt7p0zUWa2CvtZp&utm_source=google';
    const result = parseMarketplaceURL(url);
    expect(result.gclid).toBe('Cj0KCQiAgribBhDkARIsAASA5bt7p0zUWa2CvtZp');
    expect(result.utmSource).toBe('google');
  });

  it('extracts all UTM params', () => {
    const url = 'https://marketplace.atlassian.com/apps/123?utm_source=google&utm_medium=cpc&utm_campaign=brand&utm_content=ad1&utm_term=eazybi';
    const result = parseMarketplaceURL(url);
    expect(result.utmSource).toBe('google');
    expect(result.utmMedium).toBe('cpc');
    expect(result.utmCampaign).toBe('brand');
    expect(result.utmContent).toBe('ad1');
    expect(result.utmTerm).toBe('eazybi');
    expect(result.gclid).toBeNull();
  });

  it('returns nulls for URL without params', () => {
    const result = parseMarketplaceURL('https://marketplace.atlassian.com/apps/123');
    expect(result.gclid).toBeNull();
    expect(result.utmSource).toBeNull();
  });

  it('returns nulls for undefined URL', () => {
    const result = parseMarketplaceURL(undefined);
    expect(result.gclid).toBeNull();
  });

  it('returns nulls for malformed URL', () => {
    const result = parseMarketplaceURL('not-a-url');
    expect(result.gclid).toBeNull();
  });
});

describe('extractGclidFromContent', () => {
  it('detects Base64 GCLID pattern (Cj...)', () => {
    const gclid = 'CjwKCAjwu4WoBhBkEiwAojNdXhjJwc2t4MdnkflI7etfVTQo9CRluDW99EUDId1W3vvJ-Wv4SFYqpRoC6akQAvD_BwE';
    expect(extractGclidFromContent(gclid)).toBe(gclid);
  });

  it('rejects short strings', () => {
    expect(extractGclidFromContent('CjShort')).toBeNull();
  });

  it('rejects non-GCLID content', () => {
    expect(extractGclidFromContent('rm_agile')).toBeNull();
    expect(extractGclidFromContent('topic')).toBeNull();
    expect(extractGclidFromContent('Wildfire - Atlassian Tracking--TEXT_LINK--')).toBeNull();
  });

  it('handles undefined/null', () => {
    expect(extractGclidFromContent(undefined)).toBeNull();
    expect(extractGclidFromContent('')).toBeNull();
  });
});

describe('mapChannelToHubspot', () => {
  it('maps Source A channels', () => {
    expect(mapChannelToHubspot('Organic search')).toBe('ORGANIC_SEARCH');
    expect(mapChannelToHubspot('Paid Search')).toBe('PAID_SEARCH');
    expect(mapChannelToHubspot('Direct')).toBe('DIRECT_TRAFFIC');
    expect(mapChannelToHubspot('Referral')).toBe('REFERRALS');
    expect(mapChannelToHubspot('Email')).toBe('EMAIL_MARKETING');
    expect(mapChannelToHubspot('Social')).toBe('SOCIAL_MEDIA');
    expect(mapChannelToHubspot('Atlassian')).toBe('OTHER_CAMPAIGNS');
  });

  it('maps Source B channels', () => {
    expect(mapChannelToHubspot('organic')).toBe('ORGANIC_SEARCH');
    expect(mapChannelToHubspot('paid-search-non-branded')).toBe('PAID_SEARCH');
    expect(mapChannelToHubspot('paid-search-branded')).toBe('PAID_SEARCH');
    expect(mapChannelToHubspot('direct')).toBe('DIRECT_TRAFFIC');
    expect(mapChannelToHubspot('referral-external')).toBe('REFERRALS');
    expect(mapChannelToHubspot('in-product-referral')).toBe('OTHER_CAMPAIGNS');
    expect(mapChannelToHubspot('email')).toBe('EMAIL_MARKETING');
  });

  it('defaults unknown channels to OTHER_CAMPAIGNS', () => {
    expect(mapChannelToHubspot('unknown-channel')).toBe('OTHER_CAMPAIGNS');
  });
});

describe('parseAttribution', () => {
  it('extracts GCLID from marketplaceURL', () => {
    const raw: RawAttribution = {
      appEntitlementId: 'ent-1',
      addonKey: 'com.eazybi',
      channel: 'paid-search-non-branded',
      referrerDomain: 'https://www.google.com/',
      marketplaceURL: 'https://marketplace.atlassian.com/apps/123?gclid=Cj0TEST1234567890abcdefghijklmnopqrstuvwxyz&utm_source=google&utm_medium=cpc',
      eventTimestamp: '2026-03-15 14:51:05',
    };
    const result = parseAttribution(raw);
    expect(result.gclid).toBe('Cj0TEST1234567890abcdefghijklmnopqrstuvwxyz');
    expect(result.utmSource).toBe('google');
    expect(result.utmMedium).toBe('cpc');
    expect(result.channel).toBe('paid-search-non-branded');
  });

  it('uses top-level fields when URL has no params', () => {
    const raw: RawAttribution = {
      addonKey: 'com.eazybi',
      channel: 'email',
      campaignSource: 'atlcomm',
      campaignMedium: 'email',
      campaignName: 'newsletter-q1',
      marketplaceURL: 'https://marketplace.atlassian.com/apps/123',
      eventTimestamp: '2026-02-01 10:00:00',
    };
    const result = parseAttribution(raw);
    expect(result.gclid).toBeNull();
    expect(result.utmSource).toBe('atlcomm');
    expect(result.utmMedium).toBe('email');
    expect(result.utmCampaign).toBe('newsletter-q1');
  });

  it('filters null string values', () => {
    const raw: RawAttribution = {
      addonKey: 'com.eazybi',
      channel: 'null',
      campaignSource: 'null',
      referrerDomain: 'null',
      eventTimestamp: '2026-01-01 00:00:00',
    };
    const result = parseAttribution(raw);
    expect(result.channel).toBe('Other');
    expect(result.utmSource).toBeNull();
    expect(result.referrerDomain).toBeNull();
  });

  it('does not store GCLID as utmContent when content equals GCLID', () => {
    const gclid = 'CjwKCAjwu4WoBhBkEiwAojNdXhjJwc2t4MdnkflI7etfVTQo9CRluDW99EUDId1W3vvJ-Wv4SFYqpRoC6akQAvD_BwE';
    const raw: RawAttribution = {
      addonKey: 'com.eazybi',
      channel: 'Paid Search',
      campaignContent: gclid,
      eventTimestamp: '2023-09-18 12:00:00',
    };
    const result = parseAttribution(raw);
    expect(result.gclid).toBe(gclid);
    expect(result.utmContent).toBeNull(); // Should not duplicate GCLID as content
  });
});
