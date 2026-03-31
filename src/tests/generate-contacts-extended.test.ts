import { GeneratedContact, mergeContactInfo } from '../lib/contact-generator/contact-generator';

function fakeContact(props: Partial<GeneratedContact> = {}): GeneratedContact {
  return {
    email: 'email1',
    lastUpdated: '2021-04-01',
    contactType: 'customer',
    country: 'country1',
    region: 'region1',
    deployment: new Set(['Server']),
    firstName: null,
    lastName: null,
    phone: null,
    city: null,
    state: null,
    products: new Set(),
    lastMpacEvent: null,
    licenseTier: null,
    relatedProducts: new Set(),
    lastAssociatedPartner: null,
    utmChannel: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    utmReferrer: null,
    googleClickId: null,
    ...props,
  };
}

describe('mergeContactInfo edge cases', () => {

  describe('all-null merging', () => {

    it('handles merging when all contacts have null names', () => {
      const a = fakeContact({});
      mergeContactInfo(a, [
        fakeContact({ firstName: null, lastName: null }),
        fakeContact({ firstName: null, lastName: null }),
        a,
      ]);
      expect(a.firstName).toBeNull();
      expect(a.lastName).toBeNull();
    });

    it('handles merging when all contacts have null phone', () => {
      const a = fakeContact({});
      mergeContactInfo(a, [
        fakeContact({ phone: null }),
        fakeContact({ phone: null }),
        a,
      ]);
      expect(a.phone).toBeNull();
    });

    it('handles merging when all contacts have null city and state', () => {
      const a = fakeContact({});
      mergeContactInfo(a, [
        fakeContact({ city: null, state: null }),
        fakeContact({ city: null, state: null }),
        a,
      ]);
      expect(a.city).toBeNull();
      expect(a.state).toBeNull();
    });

  });

  describe('multi-deployment merging', () => {

    it('merges three different deployments', () => {
      const a = fakeContact({ deployment: new Set(['Server']) });
      mergeContactInfo(a, [
        fakeContact({ deployment: new Set(['Cloud']) }),
        fakeContact({ deployment: new Set(['Data Center']) }),
        a,
      ]);
      expect(a.deployment).toEqual(new Set(['Server', 'Cloud', 'Data Center']));
    });

    it('handles empty deployment sets', () => {
      const a = fakeContact({ deployment: new Set() });
      mergeContactInfo(a, [
        fakeContact({ deployment: new Set() }),
        a,
      ]);
      expect(a.deployment.size).toBe(0);
    });

    it('preserves original deployment when merged with empty', () => {
      const a = fakeContact({ deployment: new Set(['Server']) });
      mergeContactInfo(a, [
        fakeContact({ deployment: new Set() }),
        a,
      ]);
      expect(a.deployment).toEqual(new Set(['Server']));
    });

    it('deduplicates deployment values', () => {
      const a = fakeContact({ deployment: new Set(['Server']) });
      mergeContactInfo(a, [
        fakeContact({ deployment: new Set(['Server']) }),
        fakeContact({ deployment: new Set(['Server', 'Cloud']) }),
        a,
      ]);
      expect(a.deployment).toEqual(new Set(['Server', 'Cloud']));
    });

  });

  describe('multi-product merging', () => {

    it('merges products from many contacts', () => {
      const a = fakeContact({ products: new Set(['p1']) });
      mergeContactInfo(a, [
        fakeContact({ products: new Set(['p2']) }),
        fakeContact({ products: new Set(['p3']) }),
        fakeContact({ products: new Set(['p4']) }),
        a,
      ]);
      expect(a.products).toEqual(new Set(['p1', 'p2', 'p3', 'p4']));
    });

    it('handles overlapping product sets', () => {
      const a = fakeContact({ products: new Set(['p1', 'p2']) });
      mergeContactInfo(a, [
        fakeContact({ products: new Set(['p2', 'p3']) }),
        fakeContact({ products: new Set(['p3', 'p4']) }),
        a,
      ]);
      expect(a.products).toEqual(new Set(['p1', 'p2', 'p3', 'p4']));
    });

  });

  describe('Four-tier contact type priority', () => {

    it('keeps customer when no partner present', () => {
      const a = fakeContact({ contactType: 'customer' });
      mergeContactInfo(a, [
        fakeContact({ contactType: 'customer' }),
        fakeContact({ contactType: 'customer' }),
        a,
      ]);
      expect(a.contactType).toBe('customer');
    });

    it('upgrades to atlassian_expert when MPAC partner present', () => {
      const a = fakeContact({ contactType: 'customer' });
      mergeContactInfo(a, [
        fakeContact({ contactType: 'customer' }),
        fakeContact({ contactType: 'atlassian_expert' }),
        fakeContact({ contactType: 'customer' }),
        a,
      ]);
      expect(a.contactType).toBe('atlassian_expert');
    });

    it('preserves atlassian_expert when target is already atlassian_expert', () => {
      const a = fakeContact({ contactType: 'atlassian_expert' });
      mergeContactInfo(a, [
        fakeContact({ contactType: 'customer' }),
        a,
      ]);
      expect(a.contactType).toBe('atlassian_expert');
    });

    it('partner wins over atlassian_expert in merge', () => {
      const a = fakeContact({ contactType: 'atlassian_expert' });
      mergeContactInfo(a, [
        fakeContact({ contactType: 'customer' }),
        fakeContact({ contactType: 'partner' }),
        a,
      ]);
      expect(a.contactType).toBe('partner');
    });

    it('partner wins over customer in merge', () => {
      const a = fakeContact({ contactType: 'customer' });
      mergeContactInfo(a, [
        fakeContact({ contactType: 'customer' }),
        fakeContact({ contactType: 'partner' }),
        a,
      ]);
      expect(a.contactType).toBe('partner');
    });

    it('partner wins when target is already partner', () => {
      const a = fakeContact({ contactType: 'partner' });
      mergeContactInfo(a, [
        fakeContact({ contactType: 'atlassian_expert' }),
        fakeContact({ contactType: 'customer' }),
        a,
      ]);
      expect(a.contactType).toBe('partner');
    });

    it('atlassian_expert still wins over customer when no partner', () => {
      const a = fakeContact({ contactType: 'customer' });
      mergeContactInfo(a, [
        fakeContact({ contactType: 'atlassian_expert' }),
        a,
      ]);
      expect(a.contactType).toBe('atlassian_expert');
    });

    it('certified_partner wins over partner in merge', () => {
      const a = fakeContact({ contactType: 'partner' });
      mergeContactInfo(a, [
        fakeContact({ contactType: 'partner' }),
        fakeContact({ contactType: 'certified_partner' }),
        a,
      ]);
      expect(a.contactType).toBe('certified_partner');
    });

    it('certified_partner wins over atlassian_expert in merge', () => {
      const a = fakeContact({ contactType: 'atlassian_expert' });
      mergeContactInfo(a, [
        fakeContact({ contactType: 'atlassian_expert' }),
        fakeContact({ contactType: 'certified_partner' }),
        a,
      ]);
      expect(a.contactType).toBe('certified_partner');
    });

    it('certified_partner wins over customer in merge', () => {
      const a = fakeContact({ contactType: 'customer' });
      mergeContactInfo(a, [
        fakeContact({ contactType: 'customer' }),
        fakeContact({ contactType: 'certified_partner' }),
        a,
      ]);
      expect(a.contactType).toBe('certified_partner');
    });

    it('certified_partner preserved when target already certified_partner', () => {
      const a = fakeContact({ contactType: 'certified_partner' });
      mergeContactInfo(a, [
        fakeContact({ contactType: 'partner' }),
        fakeContact({ contactType: 'atlassian_expert' }),
        fakeContact({ contactType: 'customer' }),
        a,
      ]);
      expect(a.contactType).toBe('certified_partner');
    });

    it('certified_partner wins over all types combined', () => {
      const a = fakeContact({ contactType: 'customer' });
      mergeContactInfo(a, [
        fakeContact({ contactType: 'partner' }),
        fakeContact({ contactType: 'atlassian_expert' }),
        fakeContact({ contactType: 'certified_partner' }),
        fakeContact({ contactType: 'customer' }),
        a,
      ]);
      expect(a.contactType).toBe('certified_partner');
    });

  });

  describe('name selection priority', () => {

    it('prefers full name pair over partial names even if older', () => {
      const a = fakeContact({});
      mergeContactInfo(a, [
        fakeContact({
          lastUpdated: '2021-05-01',
          firstName: 'NewFirst',
          lastName: null,
        }),
        fakeContact({
          lastUpdated: '2021-01-01',
          firstName: 'OldFirst',
          lastName: 'OldLast',
        }),
        a,
      ]);
      // Full pair wins even if older
      expect(a.firstName).toBe('OldFirst');
      expect(a.lastName).toBe('OldLast');
    });

    it('uses individual firstName and lastName when no pair exists', () => {
      const a = fakeContact({});
      mergeContactInfo(a, [
        fakeContact({ firstName: 'First1' }),
        fakeContact({ lastName: 'Last2' }),
        a,
      ]);
      expect(a.firstName).toBe('First1');
      expect(a.lastName).toBe('Last2');
    });

  });

  describe('address pair selection', () => {

    it('prefers city+state pair over individual values', () => {
      const a = fakeContact({});
      mergeContactInfo(a, [
        fakeContact({ city: 'CityOnly' }),
        fakeContact({ state: 'StateOnly' }),
        fakeContact({ city: 'PairCity', state: 'PairState' }),
        a,
      ]);
      expect(a.city).toBe('PairCity');
      expect(a.state).toBe('PairState');
    });

    it('uses individual city and state when no pair present', () => {
      const a = fakeContact({});
      mergeContactInfo(a, [
        fakeContact({ city: 'CityOnly' }),
        fakeContact({ state: 'StateOnly' }),
        a,
      ]);
      expect(a.city).toBe('CityOnly');
      expect(a.state).toBe('StateOnly');
    });

  });

  describe('single contact merge', () => {

    it('handles merging with only the target contact', () => {
      const a = fakeContact({
        firstName: 'John',
        lastName: 'Smith',
        phone: '+1-555-0100',
      });
      mergeContactInfo(a, [a]);
      expect(a.firstName).toBe('John');
      expect(a.lastName).toBe('Smith');
      expect(a.phone).toBe('+1-555-0100');
    });

  });

  describe('phone selection', () => {

    it('picks first available phone', () => {
      const a = fakeContact({});
      mergeContactInfo(a, [
        fakeContact({ phone: null }),
        fakeContact({ phone: '+1-555-0100' }),
        fakeContact({ phone: '+1-555-0200' }),
        a,
      ]);
      expect(a.phone).toBe('+1-555-0100');
    });

  });

});
