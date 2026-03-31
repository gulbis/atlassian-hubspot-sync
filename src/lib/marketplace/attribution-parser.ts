import { URL } from 'url';
import { RawAttribution } from './raw';

export interface ParsedAttribution {
  gclid: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  channel: string;
  referrerDomain: string | null;
  eventTimestamp: string;
}

/** MPAC channel values → HubSpot hs_analytics_source enum */
const CHANNEL_MAP: Record<string, string> = {
  // Source A (license export) channel values
  'Organic search': 'ORGANIC_SEARCH',
  'Paid Search': 'PAID_SEARCH',
  'Direct': 'DIRECT_TRAFFIC',
  'Referral': 'REFERRALS',
  'Email': 'EMAIL_MARKETING',
  'Social': 'SOCIAL_MEDIA',
  'Paid Social': 'PAID_SOCIAL',
  'Paid Display': 'PAID_SEARCH',
  'Paid Other': 'PAID_SEARCH',
  'Atlassian': 'OTHER_CAMPAIGNS',
  'Atlassian Comarketing': 'OTHER_CAMPAIGNS',
  'Other': 'OTHER_CAMPAIGNS',
  // Source B (marketing-attribution) channel values
  'organic': 'ORGANIC_SEARCH',
  'paid-search-non-branded': 'PAID_SEARCH',
  'paid-search-branded': 'PAID_SEARCH',
  'direct': 'DIRECT_TRAFFIC',
  'referral-external': 'REFERRALS',
  'referral-internal': 'REFERRALS',
  'self-referral': 'OTHER_CAMPAIGNS',
  'in-product-referral': 'OTHER_CAMPAIGNS',
  'email': 'EMAIL_MARKETING',
  'unpaid-social': 'SOCIAL_MEDIA',
  'paid-social': 'PAID_SOCIAL',
  'paid-display': 'PAID_SEARCH',
  'paid-affiliate': 'PAID_SEARCH',
  'other': 'OTHER_CAMPAIGNS',
};

export function mapChannelToHubspot(channel: string): string {
  return CHANNEL_MAP[channel] ?? 'OTHER_CAMPAIGNS';
}

/** Extract GCLID and UTM params from a marketplace URL. */
export function parseMarketplaceURL(url: string | undefined): {
  gclid: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
} {
  if (!url) return { gclid: null, utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null };

  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    return {
      gclid: params.get('gclid') || null,
      utmSource: params.get('utm_source') || null,
      utmMedium: params.get('utm_medium') || null,
      utmCampaign: params.get('utm_campaign') || null,
      utmContent: params.get('utm_content') || null,
      utmTerm: params.get('utm_term') || null,
    };
  } catch {
    return { gclid: null, utmSource: null, utmMedium: null, utmCampaign: null, utmContent: null, utmTerm: null };
  }
}

/** Extract GCLID from campaignContent if it looks like a raw Base64 GCLID (Cj...) */
export function extractGclidFromContent(content: string | undefined): string | null {
  if (!content) return null;
  // GCLIDs are base64-encoded, start with Cj, typically 70-120 chars
  if (/^Cj[A-Za-z0-9_-]{60,120}$/.test(content)) {
    return content;
  }
  return null;
}

function cleanNullString(value: string | undefined): string | null {
  if (!value || value === 'null') return null;
  return value;
}

/** Parse a raw attribution touchpoint into normalized form. */
export function parseAttribution(raw: RawAttribution): ParsedAttribution {
  const urlParsed = parseMarketplaceURL(raw.marketplaceURL);

  // GCLID priority: URL param > raw GCLID in campaignContent
  const gclid = urlParsed.gclid
    || extractGclidFromContent(raw.campaignContent)
    || null;

  // UTM priority: URL params > top-level fields from API
  const utmSource = urlParsed.utmSource || cleanNullString(raw.campaignSource);
  const utmMedium = urlParsed.utmMedium || cleanNullString(raw.campaignMedium);
  const utmCampaign = urlParsed.utmCampaign || cleanNullString(raw.campaignName);
  const utmContent = urlParsed.utmContent || cleanNullString(raw.campaignContent);
  const utmTerm = urlParsed.utmTerm || null;

  return {
    gclid,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent: gclid && utmContent === gclid ? null : utmContent, // Don't store GCLID as content
    utmTerm,
    channel: cleanNullString(raw.channel) || 'Other',
    referrerDomain: cleanNullString(raw.referrerDomain),
    eventTimestamp: raw.eventTimestamp,
  };
}
