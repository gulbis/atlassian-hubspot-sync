import { Contact } from '../../lib/model/contact';
import { LicenseMatcher, ScorableLicense } from '../../lib/license-matching/license-matcher';

const NINETY_DAYS_MS = 1000 * 60 * 60 * 24 * 90;
const ONE_DAY_MS = 1000 * 60 * 60 * 24;
const THRESHOLD = 130;
const NO_PARTNER_DOMAINS = {
  partnerDomains: new Set<string>(),
  eazybiPartnerDomains: new Set<string>(),
  eazybiCertifiedPartnerDomains: new Set<string>(),
};

function fakeContact(): Contact {
  return {} as Contact;
}

function fakeContactWithEmail(email: string): Contact {
  return { data: { email } } as Contact;
}

function makeScorableLicense(overrides: Partial<ScorableLicense> = {}): ScorableLicense {
  return {
    momentStarted: new Date('2022-01-01').getTime(),
    momentEnded: new Date('2022-03-01').getTime(),
    techContact: fakeContact(),
    billingContact: null,
    company: 'acme corporation',
    companyDomain: 'acme.com',
    techContactEmailPart: 'john.smith',
    techContactAddress: '123 main street, new york',
    techContactPhone: '+1-555-0100',
    techContactName: 'john smith',
    ...overrides,
  };
}

describe('LicenseMatcher', () => {

  const matcher = new LicenseMatcher(THRESHOLD, NO_PARTNER_DOMAINS);

  describe('90-day window', () => {

    it('matches licenses within 90-day window', () => {
      const l1 = makeScorableLicense({
        momentStarted: new Date('2022-01-01').getTime(),
        momentEnded: new Date('2022-03-01').getTime(),
      });
      const l2 = makeScorableLicense({
        ...l1,
        techContact: l1.techContact,
        momentStarted: new Date('2022-05-01').getTime(),
        momentEnded: new Date('2022-07-01').getTime(),
      });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(true);
    });

    it('rejects licenses more than 90 days apart (l2 after l1)', () => {
      const l1 = makeScorableLicense({
        momentStarted: new Date('2022-01-01').getTime(),
        momentEnded: new Date('2022-01-15').getTime(),
      });
      const l2 = makeScorableLicense({
        momentStarted: new Date('2022-01-15').getTime() + NINETY_DAYS_MS + ONE_DAY_MS,
        momentEnded: new Date('2022-07-01').getTime(),
      });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(false);
    });

    it('rejects licenses more than 90 days apart (l1 after l2)', () => {
      const l2 = makeScorableLicense({
        momentStarted: new Date('2022-01-01').getTime(),
        momentEnded: new Date('2022-01-15').getTime(),
      });
      const l1 = makeScorableLicense({
        momentStarted: new Date('2022-01-15').getTime() + NINETY_DAYS_MS + ONE_DAY_MS,
        momentEnded: new Date('2022-07-01').getTime(),
      });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(false);
    });

    it('matches licenses exactly 90 days apart', () => {
      const base = new Date('2022-01-01').getTime();
      const l1 = makeScorableLicense({
        momentStarted: base,
        momentEnded: base,
      });
      const sharedContact = l1.techContact;
      const l2 = makeScorableLicense({
        momentStarted: base + NINETY_DAYS_MS,
        momentEnded: base + NINETY_DAYS_MS,
        techContact: sharedContact,
      });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(true);
    });

  });

  describe('contact identity matching', () => {

    it('matches when same tech contact object', () => {
      const sharedContact = fakeContact();
      const l1 = makeScorableLicense({ techContact: sharedContact });
      const l2 = makeScorableLicense({ techContact: sharedContact });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(true);
    });

    it('matches when same billing contact object', () => {
      const sharedBilling = fakeContact();
      const l1 = makeScorableLicense({ billingContact: sharedBilling });
      const l2 = makeScorableLicense({ billingContact: sharedBilling });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(true);
    });

    it('matches when tech contact of l1 equals billing of l2', () => {
      const sharedContact = fakeContact();
      const l1 = makeScorableLicense({ techContact: sharedContact });
      const l2 = makeScorableLicense({ billingContact: sharedContact });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(true);
    });

    it('matches when billing contact of l1 equals tech of l2', () => {
      const sharedContact = fakeContact();
      const l1 = makeScorableLicense({ billingContact: sharedContact });
      const l2 = makeScorableLicense({ techContact: sharedContact });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(true);
    });

    it('does not match on null billing contacts', () => {
      const l1 = makeScorableLicense({
        billingContact: null,
        company: '',
        techContactAddress: '',
        techContactPhone: '',
        techContactName: '',
        techContactEmailPart: '',
        companyDomain: '',
      });
      const l2 = makeScorableLicense({
        billingContact: null,
        company: '',
        techContactAddress: '',
        techContactPhone: '',
        techContactName: '',
        techContactEmailPart: '',
        companyDomain: '',
      });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(false);
    });

  });

  describe('similarity scoring', () => {

    it('matches licenses with identical address and company (160 pts >= 130)', () => {
      const l1 = makeScorableLicense({
        techContactAddress: '123 main street new york',
        company: 'acme corporation',
      });
      const l2 = makeScorableLicense({
        techContactAddress: '123 main street new york',
        company: 'acme corporation',
        techContactEmailPart: 'different.person',
        techContactName: 'different name',
        techContactPhone: '+9-999-9999',
        companyDomain: 'other.com',
      });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(true);
    });

    it('rejects licenses with only address match (80 pts < 130)', () => {
      const l1 = makeScorableLicense({
        techContactAddress: '123 main street new york',
        company: 'totally different company name here',
        companyDomain: 'different.com',
        techContactEmailPart: 'alice',
        techContactName: 'alice wonderland',
        techContactPhone: '+1-111-1111',
      });
      const l2 = makeScorableLicense({
        techContactAddress: '123 main street new york',
        company: 'another unique corporation xyz',
        companyDomain: 'another.com',
        techContactEmailPart: 'bob',
        techContactName: 'bob marley',
        techContactPhone: '+2-222-2222',
      });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(false);
    });

    it('matches with company + domain + email + name (170 pts >= 130)', () => {
      const l1 = makeScorableLicense({
        techContactAddress: 'completely different address 1',
        company: 'acme corporation',
        companyDomain: 'acme.com',
        techContactEmailPart: 'john.smith',
        techContactName: 'john smith',
        techContactPhone: '+1-111-1111',
      });
      const l2 = makeScorableLicense({
        techContactAddress: 'some other address entirely 2',
        company: 'acme corporation',
        companyDomain: 'acme.com',
        techContactEmailPart: 'john.smith',
        techContactName: 'john smith',
        techContactPhone: '+2-222-2222',
      });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(true);
    });

    it('handles empty company domain (free email)', () => {
      const l1 = makeScorableLicense({
        companyDomain: '',
        techContactAddress: '123 main street',
        company: 'acme corporation',
      });
      const l2 = makeScorableLicense({
        companyDomain: '',
        techContactAddress: '123 main street',
        company: 'acme corporation',
      });
      // Address (80) + Company (80) = 160 >= 130
      expect(matcher.isSimilarEnough(l1, l2)).toBe(true);
    });

    it('empty strings score 0 for all fields', () => {
      const l1 = makeScorableLicense({
        techContactAddress: '',
        company: '',
        companyDomain: '',
        techContactEmailPart: '',
        techContactName: '',
        techContactPhone: '',
      });
      const l2 = makeScorableLicense({
        techContactAddress: '',
        company: '',
        companyDomain: '',
        techContactEmailPart: '',
        techContactName: '',
        techContactPhone: '',
      });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(false);
    });

  });

  describe('bail optimization', () => {

    it('bails early when score exceeds threshold', () => {
      const matcherNoBail = new LicenseMatcher(THRESHOLD, NO_PARTNER_DOMAINS);
      // Address match (80) + Company match (80) = 160 >= 130
      // Should bail after company
      const l1 = makeScorableLicense({
        techContactAddress: '123 main street new york ny',
        company: 'acme corporation inc',
      });
      const l2 = makeScorableLicense({
        techContactAddress: '123 main street new york ny',
        company: 'acme corporation inc',
      });
      expect(matcherNoBail.isSimilarEnough(l1, l2)).toBe(true);
    });

    it('bails early when remaining opportunity cannot reach threshold', () => {
      // Address: 0, Company: 0 → remaining opportunity = 30+30+30+30 = 120 < 130
      const l1 = makeScorableLicense({
        techContactAddress: 'completely unique address alpha',
        company: 'totally unrelated company xyz',
        companyDomain: 'alpha.com',
        techContactEmailPart: 'john.smith',
        techContactName: 'john smith',
        techContactPhone: '+1-555-0100',
      });
      const l2 = makeScorableLicense({
        techContactAddress: 'very different location beta',
        company: 'another different business abc',
        companyDomain: 'beta.com',
        techContactEmailPart: 'jane.doe',
        techContactName: 'jane doe',
        techContactPhone: '+2-555-0200',
      });
      expect(matcher.isSimilarEnough(l1, l2)).toBe(false);
    });

    it('does not bail when score logger is provided', () => {
      const logs: { score: number; reason: string }[] = [];
      const scoreLog = {
        logScore(score: number, reason: string) {
          logs.push({ score, reason });
        },
      };
      const matcherWithLog = new LicenseMatcher(THRESHOLD, NO_PARTNER_DOMAINS, scoreLog);
      const l1 = makeScorableLicense({
        techContactAddress: '123 main street',
        company: 'acme corp',
      });
      const l2 = makeScorableLicense({
        techContactAddress: '123 main street',
        company: 'acme corp',
      });
      matcherWithLog.isSimilarEnough(l1, l2);
      // Should have logged all 6 fields even though it matched early
      expect(logs.length).toBe(6);
    });

  });

  describe('partner billing contact exclusion', () => {

    const partnerDomains = {
      partnerDomains: new Set(['cprime.com', 'eficode.com']),
      eazybiPartnerDomains: new Set(['adaptavist.com']),
      eazybiCertifiedPartnerDomains: new Set(['clearvision-cm.com']),
    };
    const matcherWithPartners = new LicenseMatcher(THRESHOLD, partnerDomains);

    // Use distinct company/address/domain to ensure matches come only from billing contact, not similarity
    const distinctLicense1 = {
      company: 'boeing aerospace corporation',
      companyDomain: 'boeing.com',
      techContactAddress: '100 north riverside, chicago il',
      techContactEmailPart: 'jorge.gonzalez',
      techContactName: 'jorge gonzalez',
      techContactPhone: '+1-312-555-0100',
    };
    const distinctLicense2 = {
      company: 'harvard business publishing',
      companyDomain: 'harvardbusiness.org',
      techContactAddress: '60 harvard way, boston ma',
      techContactEmailPart: 'bobby.deng',
      techContactName: 'bobby deng',
      techContactPhone: '+1-617-555-0200',
    };

    it('does NOT match on shared billing contact when contact is at a partner domain', () => {
      const partnerContact = fakeContactWithEmail('tom@cprime.com');
      const l1 = makeScorableLicense({ ...distinctLicense1, billingContact: partnerContact });
      const l2 = makeScorableLicense({ ...distinctLicense2, billingContact: partnerContact });
      expect(matcherWithPartners.isSimilarEnough(l1, l2)).toBe(false);
    });

    it('does NOT match on shared billing contact in eazyBI partner domains', () => {
      const partnerContact = fakeContactWithEmail('sales@adaptavist.com');
      const l1 = makeScorableLicense({ ...distinctLicense1, billingContact: partnerContact });
      const l2 = makeScorableLicense({ ...distinctLicense2, billingContact: partnerContact });
      expect(matcherWithPartners.isSimilarEnough(l1, l2)).toBe(false);
    });

    it('does NOT match on shared billing contact in certified partner domains', () => {
      const partnerContact = fakeContactWithEmail('billing@clearvision-cm.com');
      const l1 = makeScorableLicense({ ...distinctLicense1, billingContact: partnerContact });
      const l2 = makeScorableLicense({ ...distinctLicense2, billingContact: partnerContact });
      expect(matcherWithPartners.isSimilarEnough(l1, l2)).toBe(false);
    });

    it('still matches on shared billing contact when contact is NOT a partner', () => {
      const customerContact = fakeContactWithEmail('billing@customercorp.com');
      const l1 = makeScorableLicense({ ...distinctLicense1, billingContact: customerContact });
      const l2 = makeScorableLicense({ ...distinctLicense2, billingContact: customerContact });
      expect(matcherWithPartners.isSimilarEnough(l1, l2)).toBe(true);
    });

    it('does NOT match tech/billing cross when billing is a partner contact', () => {
      const partnerContact = fakeContactWithEmail('tom@eficode.com');
      const l1 = makeScorableLicense({ ...distinctLicense1, techContact: partnerContact });
      const l2 = makeScorableLicense({ ...distinctLicense2, billingContact: partnerContact });
      expect(matcherWithPartners.isSimilarEnough(l1, l2)).toBe(false);
    });

    it('still matches tech/billing cross when billing is a customer contact', () => {
      const sharedContact = fakeContactWithEmail('admin@customercorp.com');
      const l1 = makeScorableLicense({ ...distinctLicense1, techContact: sharedContact });
      const l2 = makeScorableLicense({ ...distinctLicense2, billingContact: sharedContact });
      expect(matcherWithPartners.isSimilarEnough(l1, l2)).toBe(true);
    });

    it('still matches on shared tech contacts regardless of partner status', () => {
      // Tech contacts should always match — a partner tech contact means
      // they are genuinely the same installation
      const techContact = fakeContactWithEmail('tech@cprime.com');
      const l1 = makeScorableLicense({ techContact });
      const l2 = makeScorableLicense({ techContact });
      expect(matcherWithPartners.isSimilarEnough(l1, l2)).toBe(true);
    });

  });

});
