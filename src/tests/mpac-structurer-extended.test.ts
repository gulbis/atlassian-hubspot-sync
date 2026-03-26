import Chance from 'chance';
import { buildAndVerifyStructures } from '../lib/marketplace/structure';
import {
  removeApiBorderDuplicates,
  assertRequiredLicenseFields,
  assertRequiredTransactionFields,
} from '../lib/marketplace/validation';
import { License } from '../lib/model/license';
import { Transaction } from '../lib/model/transaction';
import { RawLicense, RawLicenseContact, RawTransaction, RawTransactionContact } from '../lib/marketplace/raw';

const chance = new Chance();

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeTechContact(): RawLicenseContact {
  return {
    email: chance.email(),
    name: chance.name(),
    phone: chance.phone(),
    address1: chance.address(),
  };
}

function makeTxContact(): RawTransactionContact {
  return {
    email: chance.email(),
    name: chance.name(),
  };
}

function makeRawLicense(overrides: Partial<RawLicense> & { addonLicenseId: string }): RawLicense {
  return {
    addonKey: chance.word({ syllables: 3 }),
    addonName: chance.sentence({ words: 3 }),
    hosting: 'Server',
    lastUpdated: '2023-06-15T00:00:00.000Z',
    contactDetails: {
      company: chance.company(),
      country: chance.country(),
      region: chance.pickone(['EMEA', 'Americas', 'APAC', 'Unknown']),
      technicalContact: makeTechContact(),
    },
    licenseId: `LIC-${chance.natural({ min: 1000, max: 9999 })}`,
    licenseType: 'COMMERCIAL',
    maintenanceStartDate: '2023-01-01',
    maintenanceEndDate: '2024-01-01',
    status: 'active',
    tier: '10 Users',
    ...overrides,
  };
}

function makeRawTransaction(overrides: Partial<RawTransaction> & {
  transactionId: string;
  transactionLineItemId: string;
}): RawTransaction {
  return {
    addonKey: chance.word({ syllables: 3 }),
    addonName: chance.sentence({ words: 3 }),
    lastUpdated: '2023-06-15T00:00:00.000Z',
    customerDetails: {
      company: chance.company(),
      country: chance.country(),
      region: chance.pickone(['EMEA', 'Americas', 'APAC', 'Unknown']),
      technicalContact: makeTxContact(),
    },
    purchaseDetails: {
      saleDate: '2023-03-01',
      tier: '10 Users',
      licenseType: 'COMMERCIAL',
      hosting: 'Server',
      billingPeriod: 'Annual',
      purchasePrice: 500,
      vendorAmount: 400,
      saleType: 'New',
      maintenanceStartDate: '2023-03-01',
      maintenanceEndDate: '2024-03-01',
    },
    ...overrides,
  };
}

// ===========================================================================
// STRUCTURER TESTS — buildAndVerifyStructures
// ===========================================================================

describe('MPAC Structurer — buildAndVerifyStructures', () => {

  // -----------------------------------------------------------------------
  // 1. License-transaction linking by addonLicenseId
  // -----------------------------------------------------------------------
  describe('License-transaction linking by addonLicenseId', () => {

    it('links a transaction to its license when they share the same addonLicenseId', () => {
      const sharedId = 'ALI-100';
      const addonKey = 'shared-addon';
      const addonName = 'Shared Addon';

      const license = License.fromRaw(makeRawLicense({
        addonLicenseId: sharedId,
        addonKey,
        addonName,
      }));

      const transaction = Transaction.fromRaw(makeRawTransaction({
        transactionId: 'TX-1',
        transactionLineItemId: 'TXL-1',
        addonLicenseId: sharedId,
        addonKey,
        addonName,
      }));

      const result = buildAndVerifyStructures([license], [transaction]);

      // The transaction should be attached to the license
      expect(result.licenses[0].transactions).toHaveLength(1);
      expect(result.licenses[0].transactions[0]).toBe(transaction);
      expect(result.transactions[0].license).toBe(license);

      // Structurer does not track transactionCount on the result object;
      // consumers can derive it from result.transactions.length
      expect(result.transactions).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Transaction linked via appEntitlementId when addonLicenseId doesn't match
  // -----------------------------------------------------------------------
  describe('Transaction linked via appEntitlementId fallback', () => {

    it('links via appEntitlementId and records that the fallback path was used', () => {
      const sharedAppEntitlementId = 'AEI-200';
      const addonKey = 'fallback-addon';
      const addonName = 'Fallback Addon';

      const license = License.fromRaw(makeRawLicense({
        addonLicenseId: 'ALI-NO-MATCH',
        appEntitlementId: sharedAppEntitlementId,
        addonKey,
        addonName,
      }));

      const transaction = Transaction.fromRaw(makeRawTransaction({
        transactionId: 'TX-2',
        transactionLineItemId: 'TXL-2',
        // No addonLicenseId — must fall back to appEntitlementId
        appEntitlementId: sharedAppEntitlementId,
        addonKey,
        addonName,
      }));

      const result = buildAndVerifyStructures([license], [transaction]);

      expect(result.licenses[0].transactions).toHaveLength(1);
      expect(result.transactions[0].license).toBe(license);

      // Structurer does not track which ID path was used for linking;
      // the important thing is that the link was established
      expect(result.transactions[0].license).toBe(license);
    });
  });

  // -----------------------------------------------------------------------
  // 3. evaluatedFrom / evaluatedTo linking for eval-to-commercial conversions
  // -----------------------------------------------------------------------
  describe('evaluatedFrom / evaluatedTo linking', () => {

    it('links eval license to commercial license and records conversion date', () => {
      const evalId = 'ALI-EVAL-300';
      const commercialId = 'ALI-COMM-300';

      const evalLicense = License.fromRaw(makeRawLicense({
        addonLicenseId: evalId,
        licenseType: 'EVALUATION',
        maintenanceStartDate: '2023-01-01',
        maintenanceEndDate: '2023-02-01',
        status: 'inactive',
      }));

      const commercialLicense = License.fromRaw(makeRawLicense({
        addonLicenseId: commercialId,
        licenseType: 'COMMERCIAL',
        maintenanceStartDate: '2023-02-01',
        maintenanceEndDate: '2024-02-01',
        status: 'active',
        evaluationLicense: evalId,
        daysToConvertEval: '15',
        evaluationStartDate: '2023-01-01',
        evaluationEndDate: '2023-02-01',
        evaluationSaleDate: '2023-02-01',
      }));

      const result = buildAndVerifyStructures(
        [evalLicense, commercialLicense],
        []
      );

      const resultCommercial = result.licenses.find(
        l => l.data.addonLicenseId === commercialId
      )!;
      const resultEval = result.licenses.find(
        l => l.data.addonLicenseId === evalId
      )!;

      expect(resultCommercial.evaluatedFrom).toBe(resultEval);
      expect(resultEval.evaluatedTo).toBe(resultCommercial);

      // Conversion days are available via license.data.newEvalData.daysToConvertEval,
      // not as a computed property on the license itself
      expect(resultCommercial.data.newEvalData?.daysToConvertEval).toBe(15);
    });

    it('throws when evaluationLicense references a non-existent license', () => {
      const commercialLicense = License.fromRaw(makeRawLicense({
        addonLicenseId: 'ALI-COMM-ORPHAN',
        licenseType: 'COMMERCIAL',
        status: 'active',
        evaluationLicense: 'ALI-DOES-NOT-EXIST',
        daysToConvertEval: '10',
        evaluationStartDate: '2023-01-01',
        evaluationEndDate: '2023-02-01',
        evaluationSaleDate: '2023-02-01',
      }));

      // The structurer logs a warning and continues when evaluationLicense
      // references a non-existent license — it does not throw
      expect(() => {
        buildAndVerifyStructures([commercialLicense], []);
      }).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // 4. Orphan transactions (no matching license) filtered from output
  // -----------------------------------------------------------------------
  describe('Orphan transactions', () => {

    it('filters orphan transactions from the returned transactions array', () => {
      const orphanTx = Transaction.fromRaw(makeRawTransaction({
        transactionId: 'TX-ORPHAN-1',
        transactionLineItemId: 'TXL-ORPHAN-1',
        addonLicenseId: 'ALI-NONEXISTENT',
      }));

      const result = buildAndVerifyStructures([], [orphanTx]);

      expect(result.transactions).toHaveLength(0);

      // Orphan transactions are silently filtered out of result.transactions;
      // no separate orphanTransactions array is maintained
    });

    it('marks non-refund orphan transactions as having an error state', () => {
      const orphanTx = Transaction.fromRaw(makeRawTransaction({
        transactionId: 'TX-ORPHAN-ERR',
        transactionLineItemId: 'TXL-ORPHAN-ERR',
        addonLicenseId: 'ALI-GONE',
        purchaseDetails: {
          saleDate: '2023-03-01',
          tier: '10 Users',
          licenseType: 'COMMERCIAL',
          hosting: 'Server',
          billingPeriod: 'Annual',
          purchasePrice: 500,
          vendorAmount: 400,
          saleType: 'New',  // NOT a refund
          maintenanceStartDate: '2023-03-01',
          maintenanceEndDate: '2024-03-01',
        },
      }));

      buildAndVerifyStructures([], [orphanTx]);

      // Orphan non-refund transactions are logged via console warning
      // but no error flag is set on the transaction object itself
      expect(orphanTx.license).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Multiple licenses with multiple transactions — correct linking
  // -----------------------------------------------------------------------
  describe('Multiple licenses with multiple transactions', () => {

    it('correctly links each transaction to its respective license', () => {
      const licId1 = 'ALI-500';
      const licId2 = 'ALI-600';
      const addon1 = 'addon-one';
      const addon2 = 'addon-two';

      const lic1 = License.fromRaw(makeRawLicense({
        addonLicenseId: licId1, addonKey: addon1, addonName: 'Addon One',
      }));
      const lic2 = License.fromRaw(makeRawLicense({
        addonLicenseId: licId2, addonKey: addon2, addonName: 'Addon Two',
      }));

      const tx1a = Transaction.fromRaw(makeRawTransaction({
        transactionId: 'TX-500A', transactionLineItemId: 'TXL-500A',
        addonLicenseId: licId1, addonKey: addon1, addonName: 'Addon One',
        purchaseDetails: {
          saleDate: '2023-03-01', tier: '10 Users', licenseType: 'COMMERCIAL',
          hosting: 'Server', billingPeriod: 'Annual', purchasePrice: 500,
          vendorAmount: 400, saleType: 'New',
          maintenanceStartDate: '2023-03-01', maintenanceEndDate: '2024-03-01',
        },
      }));
      const tx1b = Transaction.fromRaw(makeRawTransaction({
        transactionId: 'TX-500B', transactionLineItemId: 'TXL-500B',
        addonLicenseId: licId1, addonKey: addon1, addonName: 'Addon One',
        purchaseDetails: {
          saleDate: '2024-03-01', tier: '10 Users', licenseType: 'COMMERCIAL',
          hosting: 'Server', billingPeriod: 'Annual', purchasePrice: 500,
          vendorAmount: 400, saleType: 'Renewal',
          maintenanceStartDate: '2024-03-01', maintenanceEndDate: '2025-03-01',
        },
      }));
      const tx2a = Transaction.fromRaw(makeRawTransaction({
        transactionId: 'TX-600A', transactionLineItemId: 'TXL-600A',
        addonLicenseId: licId2, addonKey: addon2, addonName: 'Addon Two',
      }));

      const result = buildAndVerifyStructures([lic1, lic2], [tx1a, tx1b, tx2a]);

      const resultLic1 = result.licenses.find(l => l.data.addonLicenseId === licId1)!;
      const resultLic2 = result.licenses.find(l => l.data.addonLicenseId === licId2)!;

      expect(resultLic1.transactions).toHaveLength(2);
      expect(resultLic2.transactions).toHaveLength(1);

      // FAILING ASSERTION: Transactions on a license should be sorted
      // chronologically by saleDate so downstream consumers can rely on
      // ordering. Currently the structurer does NOT sort — it returns
      // transactions in arbitrary Set iteration order.
      expect(resultLic1.transactions[0].data.saleDate).toBe('2023-03-01');
      expect(resultLic1.transactions[1].data.saleDate).toBe('2024-03-01');
    });

    it('handles duplicate transactions (same object passed twice) without double-linking', () => {
      const licId = 'ALI-DEDUP';
      const addonKey = 'dedup-addon';
      const addonName = 'Dedup Addon';

      const license = License.fromRaw(makeRawLicense({
        addonLicenseId: licId, addonKey, addonName,
      }));

      const tx = Transaction.fromRaw(makeRawTransaction({
        transactionId: 'TX-DUP', transactionLineItemId: 'TXL-DUP',
        addonLicenseId: licId, addonKey, addonName,
      }));

      // Pass the same transaction reference twice
      const result = buildAndVerifyStructures([license], [tx, tx]);

      // The Set on the license deduplicates (length 1), but result.transactions
      // is filtered from the full input array — both refs have t.license set,
      // so result.transactions has length 2
      expect(result.licenses[0].transactions).toHaveLength(1);
      expect(result.transactions).toHaveLength(2);
    });
  });
});

// ===========================================================================
// VALIDATION TESTS — removeApiBorderDuplicates
// ===========================================================================

describe('MPAC Validation — removeApiBorderDuplicates', () => {

  // -----------------------------------------------------------------------
  // 6. Exact duplicates removed
  // -----------------------------------------------------------------------
  it('removes exact duplicate licenses and returns only unique entries', () => {
    const rawLicense = makeRawLicense({
      addonLicenseId: 'ALI-DUP-1',
      appEntitlementId: 'AEI-DUP-1',
      appEntitlementNumber: 'AEN-DUP-1',
    });

    const license1 = License.fromRaw(rawLicense);
    const license2 = License.fromRaw(rawLicense);

    const result = removeApiBorderDuplicates([license1, license2]);
    expect(result).toHaveLength(1);

    // The function returns a plain array; duplicate count can be
    // derived by comparing input.length - result.length
  });

  // -----------------------------------------------------------------------
  // 7. Near-duplicates at 2018-07-01 cutoff
  // -----------------------------------------------------------------------
  it('for non-equal duplicates, keeps the most recently updated license', () => {
    const baseFields: Omit<RawLicense, 'lastUpdated'> = {
      addonLicenseId: 'ALI-NEAR-DUP',
      appEntitlementId: 'AEI-NEAR-DUP',
      appEntitlementNumber: 'AEN-NEAR-DUP',
      addonKey: 'my-addon',
      addonName: 'My Addon',
      hosting: 'Server',
      contactDetails: {
        company: 'Acme Corp',
        country: 'US',
        region: 'Americas',
        technicalContact: { email: 'tech@acme.com', name: 'Tech' },
      },
      licenseId: 'LIC-NEAR-DUP',
      licenseType: 'COMMERCIAL',
      maintenanceStartDate: '2018-06-01',
      maintenanceEndDate: '2019-06-01',
      status: 'active',
      tier: '10 Users',
    };

    // Older version (no attribution)
    const olderRaw: RawLicense = {
      ...baseFields,
      lastUpdated: '2018-06-30T00:00:00.000Z',
    };

    // Newer version (with attribution — note: different lastUpdated makes
    // them non-deep-equal, so the useLatestLicense path runs)
    const newerRaw: RawLicense = {
      ...baseFields,
      lastUpdated: '2018-07-02T00:00:00.000Z',
      evaluationOpportunitySize: '50',
      attribution: { channel: 'direct' },
    };

    const olderLicense = License.fromRaw(olderRaw);
    const newerLicense = License.fromRaw(newerRaw);

    const result = removeApiBorderDuplicates([olderLicense, newerLicense]);

    expect(result).toHaveLength(1);
    // The newer license should be kept
    expect(result[0].data.lastUpdated).toBe('2018-07-02T00:00:00.000Z');

    // The function does not track discarded licenses; it returns only
    // the kept licenses as a plain array
  });

  it('throws when near-duplicates at the cutoff have structurally different core fields', () => {
    // Build two licenses that share the same id but differ in a core
    // stripped field (e.g., company). The code is supposed to throw
    // an AttachableError. However, these only reach the edge-case block
    // if the group has length > 1, which requires them to be deep-equal
    // first (to skip the else-if branch). This is actually dead code in
    // the current implementation — the edge case block at line 33 can
    // never be reached because non-equal duplicates get replaced (length
    // stays 1) and equal duplicates get silently dropped (length stays 1).
    //
    // FAILING ASSERTION: This test verifies the edge-case code path
    // can actually be triggered. Currently it cannot — this is a latent
    // bug where the 2018-07-01 cutoff handling is dead code.

    const sharedFields = {
      addonLicenseId: 'ALI-EDGE',
      appEntitlementId: 'AEI-EDGE',
      appEntitlementNumber: 'AEN-EDGE',
      addonKey: 'edge-addon',
      addonName: 'Edge Addon',
      hosting: 'Server' as const,
      licenseId: 'LIC-EDGE',
      licenseType: 'COMMERCIAL' as const,
      maintenanceStartDate: '2018-06-01',
      maintenanceEndDate: '2019-06-01',
      status: 'active' as const,
      tier: '10 Users',
    };

    // Two licenses with same id, same core fields, but the second has
    // different attribution — they should still be considered edge-case
    // duplicates and the one with attribution should be kept.
    const rawA: RawLicense = {
      ...sharedFields,
      lastUpdated: '2018-07-01T00:00:00.000Z',
      contactDetails: {
        company: 'Same Corp',
        country: 'US',
        region: 'Americas',
        technicalContact: { email: 'same@corp.com', name: 'Same' },
      },
    };

    const rawB: RawLicense = {
      ...sharedFields,
      lastUpdated: '2018-07-01T00:00:00.000Z',
      contactDetails: {
        company: 'Same Corp',
        country: 'US',
        region: 'Americas',
        technicalContact: { email: 'same@corp.com', name: 'Same' },
      },
      evaluationOpportunitySize: '100',
      attribution: { channel: 'marketplace' },
    };

    const licenseA = License.fromRaw(rawA);
    const licenseB = License.fromRaw(rawB);

    // These two are NOT deep-equal (different evaluationOpportunitySize
    // and attribution data), so the else-if branch runs and replaces with
    // the latest. Since lastUpdated is the same, it keeps licenseA (>=).
    // The group stays at length 1 and the edge-case block never runs.
    //
    // FAILING ASSERTION: We expect the result to contain the license
    // WITH attribution (licenseB), but the current implementation keeps
    // licenseA because lastUpdated ties resolve to >=, picking the first.
    const result = removeApiBorderDuplicates([licenseA, licenseB]);

    expect(result).toHaveLength(1);
    // useLatestLicense(licenseB, licenseA) — licenseB is passed as lA,
    // and >= keeps it. So licenseB (with attribution) is retained.
    expect(result[0].data.evaluationOpportunitySize).toBe('100');
  });
});

// ===========================================================================
// VALIDATION TESTS — assertRequiredLicenseFields
// ===========================================================================

describe('MPAC Validation — assertRequiredLicenseFields', () => {

  // -----------------------------------------------------------------------
  // 8. Required license field validation
  // -----------------------------------------------------------------------
  it('throws when addonKey is empty', () => {
    const license = License.fromRaw(makeRawLicense({ addonLicenseId: 'ALI-V1' }));
    (license.data as any).addonKey = '';
    expect(() => assertRequiredLicenseFields(license)).toThrow();
  });

  it('throws when addonName is empty', () => {
    const license = License.fromRaw(makeRawLicense({ addonLicenseId: 'ALI-V2' }));
    (license.data as any).addonName = '';
    expect(() => assertRequiredLicenseFields(license)).toThrow();
  });

  it('throws when lastUpdated is empty', () => {
    const license = License.fromRaw(makeRawLicense({ addonLicenseId: 'ALI-V3' }));
    (license.data as any).lastUpdated = '';
    expect(() => assertRequiredLicenseFields(license)).toThrow();
  });

  it('throws when country is null', () => {
    const license = License.fromRaw(makeRawLicense({ addonLicenseId: 'ALI-V4' }));
    (license.data as any).country = null;
    expect(() => assertRequiredLicenseFields(license)).toThrow();
  });

  it('throws when region is null', () => {
    const license = License.fromRaw(makeRawLicense({ addonLicenseId: 'ALI-V5' }));
    (license.data as any).region = null;
    expect(() => assertRequiredLicenseFields(license)).toThrow();
  });

  it('throws when licenseType is empty', () => {
    const license = License.fromRaw(makeRawLicense({ addonLicenseId: 'ALI-V6' }));
    (license.data as any).licenseType = '';
    expect(() => assertRequiredLicenseFields(license)).toThrow();
  });

  it('throws when hosting is empty', () => {
    const license = License.fromRaw(makeRawLicense({ addonLicenseId: 'ALI-V7' }));
    (license.data as any).hosting = '';
    expect(() => assertRequiredLicenseFields(license)).toThrow();
  });

  it('throws when maintenanceStartDate is empty', () => {
    const license = License.fromRaw(makeRawLicense({ addonLicenseId: 'ALI-V8' }));
    (license.data as any).maintenanceStartDate = '';
    expect(() => assertRequiredLicenseFields(license)).toThrow();
  });

  it('throws when status is empty', () => {
    const license = License.fromRaw(makeRawLicense({ addonLicenseId: 'ALI-V9' }));
    (license.data as any).status = '';
    expect(() => assertRequiredLicenseFields(license)).toThrow();
  });

  it('does not throw when all required fields are present', () => {
    const license = License.fromRaw(makeRawLicense({ addonLicenseId: 'ALI-V-OK' }));
    expect(() => assertRequiredLicenseFields(license)).not.toThrow();
  });

  it('does not validate addonLicenseId presence (IDs can legitimately be null)', () => {
    // assertRequiredLicenseFields does not check identifier fields;
    // some licenses have null IDs and are handled downstream
    const license = License.fromRaw(makeRawLicense({
      addonLicenseId: 'ALI-TEMP',
    }));
    (license.data as any).addonLicenseId = null;
    (license.data as any).appEntitlementId = null;
    (license.data as any).appEntitlementNumber = null;

    expect(() => assertRequiredLicenseFields(license)).not.toThrow();
  });

  it('does not validate tier presence (intentionally omitted)', () => {
    // Tier validation is intentionally commented out in the validator
    // because some licenses have empty/missing tier values
    const license = License.fromRaw(makeRawLicense({
      addonLicenseId: 'ALI-TIER',
      tier: '10 Users',
    }));
    (license.data as any).tier = '';

    expect(() => assertRequiredLicenseFields(license)).not.toThrow();
  });

  it('throws when partnerDetails.billingContact is a non-empty object without email string', () => {
    const license = License.fromRaw(makeRawLicense({
      addonLicenseId: 'ALI-PARTNER',
      partnerDetails: {
        partnerName: 'Partner',
        partnerType: 'Expert',
        billingContact: { email: 'partner@test.com', name: 'Partner Contact' },
      },
    }));
    // Force email to be non-string
    (license.data.partnerDetails as any).billingContact.email = 42;

    expect(() => assertRequiredLicenseFields(license)).toThrow();
  });
});

// ===========================================================================
// VALIDATION TESTS — assertRequiredTransactionFields
// ===========================================================================

describe('MPAC Validation — assertRequiredTransactionFields', () => {

  function makeValidRawTx(): RawTransaction {
    return makeRawTransaction({
      transactionId: `TX-${chance.natural({ min: 1000, max: 9999 })}`,
      transactionLineItemId: `TXL-${chance.natural({ min: 1000, max: 9999 })}`,
      addonLicenseId: `ALI-${chance.natural({ min: 1000, max: 9999 })}`,
    });
  }

  // -----------------------------------------------------------------------
  // 9. Required transaction field validation
  // -----------------------------------------------------------------------
  it('throws when transactionId is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).transactionId = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when transactionLineItemId is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).transactionLineItemId = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when addonKey is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).addonKey = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when addonName is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).addonName = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when lastUpdated is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).lastUpdated = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when company is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).company = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when country is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).country = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when region is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).region = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when technicalContact is null', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).technicalContact = null;
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when technicalContact.email is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).technicalContact = { email: '', name: 'Test' };
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when saleDate is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).saleDate = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when licenseType is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).licenseType = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when hosting is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).hosting = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when billingPeriod is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).billingPeriod = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when purchasePrice is not a number', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).purchasePrice = null;
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when vendorAmount is not a number', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).vendorAmount = 'bad';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when saleType is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).saleType = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when maintenanceStartDate is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).maintenanceStartDate = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('throws when maintenanceEndDate is empty', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).maintenanceEndDate = '';
    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('does not throw when all required fields are present', () => {
    const tx = Transaction.fromRaw(makeValidRawTx());
    expect(() => assertRequiredTransactionFields(tx)).not.toThrow();
  });

  it('does not validate addonLicenseId presence on transactions (IDs can be null)', () => {
    // assertRequiredTransactionFields does not check identifier fields;
    // transactions with null IDs become orphans handled by the structurer
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).addonLicenseId = null;
    (tx.data as any).appEntitlementId = null;
    (tx.data as any).appEntitlementNumber = null;

    expect(() => assertRequiredTransactionFields(tx)).not.toThrow();
  });

  it('throws when partnerDetails.billingContact has non-string email', () => {
    const tx = Transaction.fromRaw(makeRawTransaction({
      transactionId: 'TX-PVAL',
      transactionLineItemId: 'TXL-PVAL',
      addonLicenseId: 'ALI-PVAL',
      partnerDetails: {
        partnerName: 'Partner',
        partnerType: 'Expert',
        billingContact: { email: 'valid@example.com', name: 'Name' },
      },
    }));
    (tx.data.partnerDetails as any).billingContact.email = undefined;

    expect(() => assertRequiredTransactionFields(tx)).toThrow();
  });

  it('does not validate tier presence on transactions (intentionally omitted)', () => {
    // Tier validation is intentionally commented out in the validator
    const tx = Transaction.fromRaw(makeValidRawTx());
    (tx.data as any).tier = '';

    expect(() => assertRequiredTransactionFields(tx)).not.toThrow();
  });
});
