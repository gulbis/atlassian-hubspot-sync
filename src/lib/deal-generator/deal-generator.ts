import assert from "assert";
import { Engine } from "../engine/engine";
import { AssociationLabel } from "../hubspot/interfaces";
import { AssociationLabelService } from "../hubspot/association-labels";
import { RelatedLicenseSet } from "../license-matching/license-grouper";
import { Table } from "../log/table";
import { Deal } from "../model/deal";
import { License, LicenseData } from "../model/license";
import { Transaction } from "../model/transaction";
import { formatMoney } from "../util/formatters";
import { isPresent, sorter, withAutoClose } from "../util/helpers";
import { Action, ActionGenerator } from "./actions";
import { DealRelevantEvent, EventGenerator } from "./events";
import {BlockingDeal} from '../util/errors'


export type IgnoredLicense = LicenseData & {
  reason: string;
  details: string;
};

interface DealGeneratorResult {
  records: (License | Transaction)[];
  events: DealRelevantEvent[];
  actions: Action[];
}

/** Generates deal actions based on match data */
export class DealGenerator {

  private actionGenerator: ActionGenerator;

  private ignoredAmounts = new Map<string, number>();

  public constructor(private engine: Engine) {
    this.actionGenerator = new ActionGenerator(
      engine.hubspot.dealManager,
      engine.dealPropertyConfig,
      (reason, amount) => this.ignore(reason, amount),
      engine.console,
    );
  }

  public run(matchGroups: RelatedLicenseSet[]) {
    return withAutoClose(this.engine.logDir?.dealGeneratorLog(), logger => {
      const results = new Map<string, DealGeneratorResult>();

      for (const relatedLicenses of matchGroups) {
        try {
          const { records, events, actions } = this.generateActionsForMatchedGroup(relatedLicenses);

          logger?.logRecords(records);
          logger?.logEvents(events);
          logger?.logActions(actions);

          for (const license of relatedLicenses) {
            results.set(license.id, { records, events, actions })
          }

          for (const action of actions) {
            const deal = (action.type === 'create'
              ? this.engine.hubspot.dealManager.create(action.properties)
              : action.deal);

            if (deal) {
              this.associateDealContactsAndCompanies(relatedLicenses, deal);
            }
          }
        } catch (error: unknown) {
          if (error instanceof BlockingDeal) {
            this.engine.console?.printError('Deal Generator', 'Blocking deal detected', {
              deal: {
                id: error.deal.id,
                data: error.deal.data
              }
            })
          } else {
            throw error;
          }
        }
      }

      for (const [reason, amount] of this.ignoredAmounts) {
        this.engine.tallier.less('Ignored: ' + reason, amount);
      }

      this.printIgnoredTransactionsTable();

      return results;
    });
  }

  private printIgnoredTransactionsTable() {
    const table = new Table([
      { title: 'Reason Ignored' },
      { title: 'Amount Ignored', align: 'right' },
    ]);
    for (const [reason, amount] of this.ignoredAmounts) {
      table.rows.push([reason, formatMoney(amount)]);
    }

    this.engine.console?.printInfo('Deal Actions', 'Amount of Transactions Ignored');
    for (const row of table.eachRow()) {
      this.engine.console?.printInfo('Deal Actions', '  ' + row);
    }
  }

  private generateActionsForMatchedGroup(group: RelatedLicenseSet) {
    assert.ok(group.length > 0);

    const eventGenerator = new EventGenerator(
      this.engine.archivedApps,
      this.engine.partnerDomains,
      this.engine.freeEmailDomains,
      this.engine.eazybiPartnerDomains,
      this.engine.eazybiCertifiedPartnerDomains,
      this.engine.console
    );

    const records = eventGenerator.getSortedRecords(group);
    const events = eventGenerator.interpretAsEvents(records);
    const actions = this.actionGenerator.generateFrom(records, events);

    return { records, events, actions };
  }

  private associateDealContactsAndCompanies(group: RelatedLicenseSet, deal: Deal) {
    const records = group.flatMap(license => [license, ...license.transactions]);
    const labelService = this.engine.associationLabels;

    // Build role sets for label assignment
    const techEmails = new Set(records.map(r => r.techContact.data.email));
    const billingEmails = new Set(records.flatMap(r =>
      r.billingContact ? [r.billingContact.data.email] : []
    ));
    const partnerEmails = new Set(records.flatMap(r =>
      r.partnerContact ? [r.partnerContact.data.email] : []
    ));

    // Collect unique contacts with their role labels (deduplicated by entity)
    const allEmails = [...new Set(records.flatMap(r => r.allContacts.map(c => c.data.email)))];
    const contactLabelMap = new Map<import('../model/contact').Contact, AssociationLabel[]>();

    for (const email of allEmails) {
      const contact = this.engine.hubspot.contactManager.getByEmail(email);
      if (!contact || contactLabelMap.has(contact)) continue;

      const labels: AssociationLabel[] = [];
      if (labelService) {
        if (techEmails.has(email)) {
          const l = labelService.resolveLabel('deal_contact_technical');
          if (l) labels.push(l);
        }
        if (billingEmails.has(email)) {
          const l = labelService.resolveLabel('deal_contact_billing');
          if (l) labels.push(l);
        }
        if (partnerEmails.has(email)) {
          const l = labelService.resolveLabel('deal_contact_partner');
          if (l) labels.push(l);
        }
      }
      contactLabelMap.set(contact, labels);
    }

    // Sort: labeled contacts first (tech > billing > partner), then unlabeled.
    // Limit to 3 contacts (HubSpot association limit).
    const sorted = [...contactLabelMap.entries()].sort(([, a], [, b]) => {
      const score = (labels: AssociationLabel[]) =>
        labels.some(l => l === labelService?.resolveLabel('deal_contact_technical')) ? 3 :
        labels.some(l => l === labelService?.resolveLabel('deal_contact_billing')) ? 2 :
        labels.some(l => l === labelService?.resolveLabel('deal_contact_partner')) ? 1 : 0;
      return score(b) - score(a);
    });
    const topContacts = sorted.slice(0, 3);

    deal.contacts.clear();
    for (const [contact, labels] of topContacts) {
      deal.contacts.add(contact, labels.length > 0 ? labels : undefined);
    }

    // Associate deal with ONE company.
    // Tier 1: tech contact's company (HubSpot association, then domain fallback).
    // Tier 2: if tech contact is at a partner domain, use billing contact's company instead.
    deal.companies.clear();

    const isPartnerDomain = (email: string | undefined) => {
      if (!email) return false;
      const domain = email.split('@')[1]?.toLowerCase();
      if (!domain) return false;
      return this.engine.partnerDomains.has(domain)
        || this.engine.eazybiPartnerDomains.has(domain)
        || this.engine.eazybiCertifiedPartnerDomains.has(domain);
    };

    const findCompanyForContact = (contact: import('../model/contact').Contact | undefined) => {
      if (!contact) return undefined;
      const existing = contact.companies.getAll();
      if (existing.length > 0) return existing[0];
      const domain = contact.data.email?.split('@')[1]?.toLowerCase();
      if (domain && !this.engine.freeEmailDomains.has(domain)) {
        return this.engine.hubspot.companyManager.getByDomain(domain);
      }
      return undefined;
    };

    const techContact = [...techEmails]
      .map(email => this.engine.hubspot.contactManager.getByEmail(email))
      .filter(isPresent)[0];

    let company = findCompanyForContact(techContact);

    // If tech contact is at a partner domain, fall back to billing contact's company
    if (techContact && isPartnerDomain(techContact.data.email)) {
      const billingContact = [...billingEmails]
        .map(email => this.engine.hubspot.contactManager.getByEmail(email))
        .filter(isPresent)[0];
      const billingCompany = findCompanyForContact(billingContact);
      if (billingCompany) {
        company = billingCompany;
      }
      // If billing also has no company (or is also partner), keep tech contact's company
    }

    if (company) {
      let companyLabels: AssociationLabel[] | undefined;
      if (labelService) {
        const isPartner = company.data.type !== null;
        const label = labelService.resolveLabel(isPartner ? 'deal_company_partner' : 'deal_company_customer');
        if (label) companyLabels = [label];
      }
      deal.companies.add(company, companyLabels);
    }
  }

  private ignore(reason: string, amount: number) {
    const oldAmount = this.ignoredAmounts.get(reason) ?? 0;
    this.ignoredAmounts.set(reason, oldAmount + amount);
  }

}
