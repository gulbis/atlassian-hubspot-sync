import { Entity } from "../hubspot/entity";
import { EntityAdapter } from "../hubspot/interfaces";
import { EntityManager } from "../hubspot/manager";
import { Contact } from "./contact";

type CompanyData = {
  name: string;
  type: 'Partner' | 'Certified Partner' | 'Atlassian Expert' | null;
};

export class Company extends Entity<CompanyData> {

  public contacts = this.makeDynamicAssociation<Contact>('contact');

  /** Primary company domain from HubSpot */
  get domain(): string | undefined {
    return this.downloadedData['domain'] || undefined;
  }

  /** Secondary domains (semicolon-separated in HubSpot) */
  get additionalDomains(): string[] {
    const raw = this.downloadedData['hs_additional_domains'];
    if (!raw) return [];
    return raw.split(';').map(d => d.trim()).filter(d => d.length > 0);
  }

  /** All domains: primary + secondary */
  get allDomains(): string[] {
    const domains: string[] = [];
    if (this.domain) domains.push(this.domain);
    domains.push(...this.additionalDomains);
    return domains;
  }

}

export const CompanyAdapter: EntityAdapter<CompanyData> = {

  kind: 'company',

  associations: {
    contact: 'down',
  },

  data: {
    name: {
      property: 'name',
      down: name => name ?? '',
      up: name => name,
    },
    type: {
      property: 'type',
      down: type => {
        switch (type) {
          case 'PARTNER': return 'Partner';
          case 'CERTIFIED': return 'Certified Partner';
          case 'ATLASSIAN_PARTNER': return 'Atlassian Expert';
          default: return null;
        }
      },
      up: type => {
        switch (type) {
          case 'Partner': return 'PARTNER';
          case 'Certified Partner': return 'CERTIFIED';
          case 'Atlassian Expert': return 'ATLASSIAN_PARTNER';
          default: return '';
        }
      },
    },
  },

  additionalProperties: ['domain', 'hs_additional_domains'],

  managedFields: new Set(),

};

export class CompanyManager extends EntityManager<CompanyData, Company> {

  protected override Entity = Company;
  public override entityAdapter = CompanyAdapter;

  public getByDomain = this.makeIndex(
    c => c.allDomains.map(d => d.toLowerCase()),
    []
  );

}
