import { Contact, ContactManager, domainFor } from "../model/contact";
import { License } from "../model/license";
import { Transaction } from "../model/transaction";

export class ContactTypeFlagger {

  constructor(
    private licenses: License[],
    private transactions: Transaction[],
    private contactManager: ContactManager,
    private freeEmailDomains: Set<string>,
    private partnerDomains: Set<string>,
    private customerDomains: Set<string>,
    private eazybiPartnerDomains: Set<string>,
    private eazybiCertifiedPartnerDomains: Set<string>,
  ) { }

  public identifyAndFlagContactTypes() {
    // Identifying contact types
    this.identifyContactTypesFromRecordDomains(this.licenses);
    this.identifyContactTypesFromRecordDomains(this.transactions);
    this.removeFreeEmailDomainsFromPartnerDomains();
    this.separatePartnerDomainsFromCustomerDomains();

    // Flagging contacts and companies
    this.flagKnownContactTypesByDomain();
  }

  private identifyContactTypesFromRecordDomains(records: (Transaction | License)[]) {
    for (const record of records) {
      maybeAddDomain(this.partnerDomains, record.data.partnerDetails?.billingContact.email);
      maybeAddDomain(this.customerDomains, record.data.billingContact?.email);
      maybeAddDomain(this.customerDomains, record.data.technicalContact?.email);
    }
  }

  private removeFreeEmailDomainsFromPartnerDomains() {
    for (const domain of this.freeEmailDomains) {
      this.partnerDomains.delete(domain);
      this.customerDomains.add(domain);
    }
  }

  private separatePartnerDomainsFromCustomerDomains() {
    // If it's a partner domain, then it's not a customer domain
    for (const domain of this.partnerDomains) {
      this.customerDomains.delete(domain);
    }
    for (const domain of this.eazybiPartnerDomains) {
      this.customerDomains.delete(domain);
    }
    for (const domain of this.eazybiCertifiedPartnerDomains) {
      this.customerDomains.delete(domain);
    }
  }

  private flagKnownContactTypesByDomain() {
    for (const contact of this.contactManager.getAll()) {
      if (usesDomains(contact, this.eazybiCertifiedPartnerDomains)) {
        contact.data.contactType = 'certified_partner';
      }
      else if (usesDomains(contact, this.eazybiPartnerDomains)) {
        contact.data.contactType = 'partner';
      }
      else if (usesDomains(contact, this.partnerDomains)) {
        contact.data.contactType = 'atlassian_expert';
      }
      else if (usesDomains(contact, this.customerDomains)) {
        contact.data.contactType = 'customer';
      }
    }
  }

}

function maybeAddDomain(set: Set<string>, email: string | undefined) {
  if (email) set.add(domainFor(email));
}

function usesDomains(contact: Contact, domains: Set<string>) {
  return contact.allEmails.some(email => domains.has(domainFor(email)));
}
