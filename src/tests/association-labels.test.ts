import { AssociationLabelService } from '../lib/hubspot/association-labels';

describe('AssociationLabelService', () => {

  it('resolves labels from env config', () => {
    const service = new AssociationLabelService({
      dealContactTechnical: 36,
      dealContactBilling: 37,
      dealCompanyCustomer: 40,
    });

    const tech = service.resolveLabel('deal_contact_technical');
    expect(tech).toEqual({ associationCategory: 'USER_DEFINED', associationTypeId: 36 });

    const billing = service.resolveLabel('deal_contact_billing');
    expect(billing).toEqual({ associationCategory: 'USER_DEFINED', associationTypeId: 37 });

    const customer = service.resolveLabel('deal_company_customer');
    expect(customer).toEqual({ associationCategory: 'USER_DEFINED', associationTypeId: 40 });
  });

  it('returns undefined for unconfigured labels', () => {
    const service = new AssociationLabelService({
      dealContactTechnical: 36,
    });

    expect(service.resolveLabel('deal_contact_partner')).toBeUndefined();
    expect(service.resolveLabel('deal_company_partner')).toBeUndefined();
  });

  it('resolves typeId back to role', () => {
    const service = new AssociationLabelService({
      dealContactTechnical: 36,
      dealCompanyPartner: 41,
    });

    expect(service.resolveTypeId(36)).toBe('deal_contact_technical');
    expect(service.resolveTypeId(41)).toBe('deal_company_partner');
    expect(service.resolveTypeId(999)).toBeUndefined();
  });

  it('reports hasLabels correctly', () => {
    const empty = new AssociationLabelService({});
    expect(empty.hasLabels).toBe(false);

    const withLabels = new AssociationLabelService({ dealContactTechnical: 36 });
    expect(withLabels.hasLabels).toBe(true);
  });

  it('ignores undefined env values', () => {
    const service = new AssociationLabelService({
      dealContactTechnical: undefined,
      dealContactBilling: 37,
    });

    expect(service.resolveLabel('deal_contact_technical')).toBeUndefined();
    expect(service.resolveLabel('deal_contact_billing')).toBeDefined();
  });

  it('works with no config', () => {
    const service = new AssociationLabelService();
    expect(service.hasLabels).toBe(false);
    expect(service.resolveLabel('deal_contact_technical')).toBeUndefined();
  });

});
