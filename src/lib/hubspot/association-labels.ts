import { AssociationLabelEnvConfig } from '../config/env';
import { ConsoleLogger } from '../log/console';
import { AssociationLabel } from './interfaces';

export type LabelRole =
  | 'deal_contact_technical'
  | 'deal_contact_billing'
  | 'deal_contact_partner'
  | 'deal_company_customer'
  | 'deal_company_partner';

const LABEL_NAMES: Record<LabelRole, string> = {
  deal_contact_technical: 'Technical Contact',
  deal_contact_billing: 'Billing Contact',
  deal_contact_partner: 'Partner Contact',
  deal_company_customer: 'Customer',
  deal_company_partner: 'Partner',
};

export class AssociationLabelService {

  private labels = new Map<LabelRole, AssociationLabel>();
  private typeIdToRole = new Map<number, LabelRole>();

  constructor(envConfig?: AssociationLabelEnvConfig) {
    if (envConfig) this.loadFromEnv(envConfig);
  }

  private loadFromEnv(config: AssociationLabelEnvConfig) {
    const entries: [LabelRole, number | undefined][] = [
      ['deal_contact_technical', config.dealContactTechnical],
      ['deal_contact_billing', config.dealContactBilling],
      ['deal_contact_partner', config.dealContactPartner],
      ['deal_company_customer', config.dealCompanyCustomer],
      ['deal_company_partner', config.dealCompanyPartner],
    ];
    for (const [role, typeId] of entries) {
      if (typeId != null) {
        const label: AssociationLabel = {
          associationCategory: 'USER_DEFINED',
          associationTypeId: typeId,
        };
        this.labels.set(role, label);
        this.typeIdToRole.set(typeId, role);
      }
    }
  }

  /** Fetch label definitions from HubSpot v4 API and merge with env overrides. */
  public async fetchFromHubSpot(client: any, console?: ConsoleLogger): Promise<void> {
    const pairs: [string, string, LabelRole[]][] = [
      ['deal', 'contact', ['deal_contact_technical', 'deal_contact_billing', 'deal_contact_partner']],
      ['deal', 'company', ['deal_company_customer', 'deal_company_partner']],
    ];

    for (const [fromType, toType, roles] of pairs) {
      try {
        const response = await client.crm.associations.v4.schema.getAll(fromType, toType);
        const results = response?.results ?? response ?? [];
        for (const item of results) {
          if (!item.label) continue;
          const matchingRole = roles.find(
            role => LABEL_NAMES[role].toLowerCase() === item.label.toLowerCase()
          );
          if (matchingRole && !this.labels.has(matchingRole)) {
            const label: AssociationLabel = {
              associationCategory: item.category ?? 'USER_DEFINED',
              associationTypeId: item.typeId,
            };
            this.labels.set(matchingRole, label);
            this.typeIdToRole.set(item.typeId, matchingRole);
          }
        }
      } catch (err: any) {
        console?.printWarning('AssociationLabels',
          `Failed to fetch labels for ${fromType}→${toType}: ${err.body?.message ?? err.message ?? err}`);
      }
    }
  }

  /** Resolve a role to its label spec. Returns undefined if label is not configured. */
  public resolveLabel(role: LabelRole): AssociationLabel | undefined {
    return this.labels.get(role);
  }

  /** Resolve a HubSpot typeId to a role name (for download/import). */
  public resolveTypeId(typeId: number): LabelRole | undefined {
    return this.typeIdToRole.get(typeId);
  }

  /** Check if any labels are configured. */
  public get hasLabels(): boolean {
    return this.labels.size > 0;
  }

  /** Get all configured labels for debugging/logging. */
  public getConfiguredLabels(): Map<LabelRole, AssociationLabel> {
    return new Map(this.labels);
  }

}
