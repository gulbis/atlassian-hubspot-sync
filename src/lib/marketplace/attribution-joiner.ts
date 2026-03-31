import { RawAttribution } from './raw';
import { ParsedAttribution, parseAttribution } from './attribution-parser';
import { License } from '../model/license';

/**
 * Joins marketing-attribution touchpoints to licenses and selects the best one.
 *
 * Priority:
 *   1. Any touchpoint with a GCLID (most recent if multiple)
 *   2. Most recent touchpoint by eventTimestamp
 *
 * Falls back to license.data.attribution (Source A) if no marketing-attribution match.
 */
export class AttributionJoiner {

  /** appEntitlementId → touchpoints */
  private byEntitlementId = new Map<string, RawAttribution[]>();
  /** addonLicenseId → touchpoints */
  private byAddonLicenseId = new Map<string, RawAttribution[]>();

  constructor(rawAttributions: RawAttribution[]) {
    for (const attr of rawAttributions) {
      if (attr.appEntitlementId) {
        let list = this.byEntitlementId.get(attr.appEntitlementId);
        if (!list) this.byEntitlementId.set(attr.appEntitlementId, list = []);
        list.push(attr);
      }
      if (attr.addonLicenseId) {
        let list = this.byAddonLicenseId.get(attr.addonLicenseId);
        if (!list) this.byAddonLicenseId.set(attr.addonLicenseId, list = []);
        list.push(attr);
      }
    }
  }

  public get touchpointCount(): number {
    return [...this.byEntitlementId.values()].reduce((sum, list) => sum + list.length, 0)
      + [...this.byAddonLicenseId.values()].reduce((sum, list) => sum + list.length, 0);
  }

  /** Get the best attribution for a license, or null if none found. */
  public getBestAttribution(license: License): ParsedAttribution | null {
    // Find touchpoints matching this license via any join key
    const touchpoints = this.findTouchpoints(license);

    if (touchpoints.length > 0) {
      return this.selectBest(touchpoints);
    }

    // Fallback: use Source A (license export attribution)
    return this.fallbackFromLicenseAttribution(license);
  }

  private findTouchpoints(license: License): RawAttribution[] {
    const seen = new Set<RawAttribution>();
    const result: RawAttribution[] = [];

    const addFrom = (map: Map<string, RawAttribution[]>, key: string | null) => {
      if (!key) return;
      const list = map.get(key);
      if (!list) return;
      for (const attr of list) {
        if (!seen.has(attr)) {
          seen.add(attr);
          result.push(attr);
        }
      }
    };

    addFrom(this.byEntitlementId, license.data.appEntitlementId);
    addFrom(this.byAddonLicenseId, license.data.addonLicenseId);

    return result;
  }

  private selectBest(touchpoints: RawAttribution[]): ParsedAttribution {
    const parsed = touchpoints.map(tp => parseAttribution(tp));

    // Priority 1: touchpoints with GCLID, most recent first
    const withGclid = parsed
      .filter(p => p.gclid)
      .sort((a, b) => b.eventTimestamp.localeCompare(a.eventTimestamp));

    if (withGclid.length > 0) {
      return withGclid[0];
    }

    // Priority 2: most recent touchpoint
    parsed.sort((a, b) => b.eventTimestamp.localeCompare(a.eventTimestamp));
    return parsed[0];
  }

  private fallbackFromLicenseAttribution(license: License): ParsedAttribution | null {
    const attr = license.data.attribution;
    if (!attr || attr.channel === 'null') return null;

    // Check for raw GCLID in campaignContent (Source A pattern)
    const gclidMatch = attr.campaignContent && /^Cj[A-Za-z0-9_-]{60,120}$/.test(attr.campaignContent)
      ? attr.campaignContent
      : null;

    return {
      gclid: gclidMatch,
      utmSource: attr.campaignSource && attr.campaignSource !== 'null' ? attr.campaignSource : null,
      utmMedium: attr.campaignMedium && attr.campaignMedium !== 'null' ? attr.campaignMedium : null,
      utmCampaign: attr.campaignName && attr.campaignName !== 'null' ? attr.campaignName : null,
      utmContent: gclidMatch ? null : (attr.campaignContent && attr.campaignContent !== 'null' ? attr.campaignContent : null),
      utmTerm: null,
      channel: attr.channel,
      referrerDomain: attr.referrerDomain && attr.referrerDomain !== 'null' ? attr.referrerDomain : null,
      eventTimestamp: license.data.maintenanceStartDate,
    };
  }
}
