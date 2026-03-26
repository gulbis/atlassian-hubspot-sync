import { Entity } from '../hubspot/entity';
import { Hubspot } from '../hubspot/hubspot';
import { EntityManager } from '../hubspot/manager';
import { Marketplace } from '../marketplace/marketplace';
import { ConsoleLogger } from './console';
import { DataFile, LogWriteStream } from '../data/file';
import { withAutoClose } from '../util/helpers';

interface EntityReport {
  total: number;
  toCreate: number;
  toUpdate: number;
  unchanged: number;
  sampleCreates: Record<string, string>[];
  sampleUpdates: { id: string; changes: Record<string, string> }[];
  propertyChangeCounts: Record<string, number>;
}

interface AssociationReport {
  toAdd: number;
  toDelete: number;
}

export interface DryRunReport {
  timestamp: string;
  mpac: {
    totalLicenses: number;
    totalTransactions: number;
    uniqueAddonKeys: string[];
    licensesByType: Record<string, number>;
    transactionsBySaleType: Record<string, number>;
  };
  hubspotExisting: {
    deals: number;
    contacts: number;
    companies: number;
  };
  deals: EntityReport;
  contacts: EntityReport;
  companies: EntityReport;
  associations: {
    deal_contact: AssociationReport;
    deal_company: AssociationReport;
    contact_company: AssociationReport;
  };
}

const SAMPLE_LIMIT = 20;

export class PreUploadReporter {

  public generateReport(hubspot: Hubspot, mpac: Marketplace): DryRunReport {
    const addonKeys = new Set<string>();
    const licensesByType: Record<string, number> = {};
    for (const lic of mpac.licenses) {
      addonKeys.add(lic.data.addonKey);
      const lt = lic.data.licenseType ?? 'unknown';
      licensesByType[lt] = (licensesByType[lt] ?? 0) + 1;
    }

    const transactionsBySaleType: Record<string, number> = {};
    for (const tx of mpac.transactions) {
      const st = tx.data.saleType ?? 'unknown';
      transactionsBySaleType[st] = (transactionsBySaleType[st] ?? 0) + 1;
    }

    const dealReport = this.buildEntityReport(hubspot.dealManager);
    const contactReport = this.buildEntityReport(hubspot.contactManager);
    const companyReport = this.buildEntityReport(hubspot.companyManager);

    return {
      timestamp: new Date().toISOString(),
      mpac: {
        totalLicenses: mpac.licenses.length,
        totalTransactions: mpac.transactions.length,
        uniqueAddonKeys: [...addonKeys].sort(),
        licensesByType,
        transactionsBySaleType,
      },
      hubspotExisting: {
        deals: hubspot.dealManager.getArray().filter(e => e.id !== null && !e.id.startsWith('fake-')).length,
        contacts: hubspot.contactManager.getArray().filter(e => e.id !== null && !e.id.startsWith('fake-')).length,
        companies: hubspot.companyManager.getArray().filter(e => e.id !== null && !e.id.startsWith('fake-')).length,
      },
      deals: dealReport,
      contacts: contactReport,
      companies: companyReport,
      associations: {
        deal_contact: this.buildAssociationReport(hubspot.dealManager, 'contact'),
        deal_company: this.buildAssociationReport(hubspot.dealManager, 'company'),
        contact_company: this.buildAssociationReport(hubspot.contactManager, 'company'),
      },
    };
  }

  private buildEntityReport<D extends Record<string, any>, E extends Entity<D>>(
    manager: EntityManager<D, E>
  ): EntityReport {
    const entities = manager.getArray();
    const creates: E[] = [];
    const updates: E[] = [];
    let unchanged = 0;
    const propertyChangeCounts: Record<string, number> = {};

    for (const entity of entities) {
      const isNew = entity.id === null || entity.id.startsWith('fake-');
      const changes = entity.getPropertyChanges();
      const hasChanges = Object.keys(changes).length > 0;

      if (isNew && hasChanges) {
        creates.push(entity);
      } else if (!isNew && hasChanges) {
        updates.push(entity);
      } else {
        unchanged++;
      }

      for (const key of Object.keys(changes)) {
        propertyChangeCounts[key] = (propertyChangeCounts[key] ?? 0) + 1;
      }
    }

    return {
      total: entities.length,
      toCreate: creates.length,
      toUpdate: updates.length,
      unchanged,
      sampleCreates: creates.slice(0, SAMPLE_LIMIT).map(e => ({ ...e.getPropertyChanges() as Record<string, string> })),
      sampleUpdates: updates.slice(0, SAMPLE_LIMIT).map(e => ({
        id: e.id!,
        changes: { ...e.getPropertyChanges() as Record<string, string> },
      })),
      propertyChangeCounts,
    };
  }

  private buildAssociationReport<D extends Record<string, any>, E extends Entity<D>>(
    manager: EntityManager<D, E>,
    otherKind: string,
  ): AssociationReport {
    let toAdd = 0;
    let toDelete = 0;

    for (const entity of manager.getArray()) {
      for (const change of entity.getAssociationChanges()) {
        if (change.other.kind === otherKind) {
          if (change.op === 'add') toAdd++;
          else toDelete++;
        }
      }
    }

    return { toAdd, toDelete };
  }

  public writeReportJson(report: DryRunReport, reportFile: DataFile<any>) {
    withAutoClose(reportFile.writeStream(), (stream: LogWriteStream) => {
      stream.writeLine(JSON.stringify(report, null, 2));
    });
  }

  public printSummary(report: DryRunReport, console: ConsoleLogger) {
    const lines: string[] = [];
    const ln = (s = '') => lines.push(s);
    const fmt = (n: number) => n.toLocaleString('en-US');

    ln('=== DRY-RUN REPORT ===');
    ln(`Generated: ${report.timestamp}`);
    ln();

    ln('--- MPAC DATA ---');
    ln(`  Licenses:     ${fmt(report.mpac.totalLicenses)}`);
    ln(`  Transactions: ${fmt(report.mpac.totalTransactions)}`);
    ln(`  Addon Keys:   ${report.mpac.uniqueAddonKeys.join(', ')}`);
    ln();
    ln('  Licenses by type:');
    for (const [type, count] of Object.entries(report.mpac.licensesByType).sort((a, b) => b[1] - a[1])) {
      ln(`    ${type}: ${fmt(count)}`);
    }
    ln('  Transactions by sale type:');
    for (const [type, count] of Object.entries(report.mpac.transactionsBySaleType).sort((a, b) => b[1] - a[1])) {
      ln(`    ${type}: ${fmt(count)}`);
    }
    ln();

    ln('--- EXISTING HUBSPOT DATA ---');
    ln(`  Deals:     ${fmt(report.hubspotExisting.deals)}`);
    ln(`  Contacts:  ${fmt(report.hubspotExisting.contacts)}`);
    ln(`  Companies: ${fmt(report.hubspotExisting.companies)}`);
    ln();

    this.printEntitySection(lines, 'DEALS', report.deals);
    this.printEntitySection(lines, 'CONTACTS', report.contacts);
    this.printEntitySection(lines, 'COMPANIES', report.companies);

    ln('--- ASSOCIATIONS ---');
    ln(`  Deal→Contact:    ${fmt(report.associations.deal_contact.toAdd)} to add, ${fmt(report.associations.deal_contact.toDelete)} to delete`);
    ln(`  Deal→Company:    ${fmt(report.associations.deal_company.toAdd)} to add, ${fmt(report.associations.deal_company.toDelete)} to delete`);
    ln(`  Contact→Company: ${fmt(report.associations.contact_company.toAdd)} to add, ${fmt(report.associations.contact_company.toDelete)} to delete`);
    ln();

    const summary = lines.join('\n');
    console.printInfo('Dry Run Report', '\n' + summary);
    return summary;
  }

  private printEntitySection(lines: string[], label: string, report: EntityReport) {
    const ln = (s = '') => lines.push(s);
    const fmt = (n: number) => n.toLocaleString('en-US');

    ln(`--- ${label} ---`);
    ln(`  Total:     ${fmt(report.total)}`);
    ln(`  Create:    ${fmt(report.toCreate)}`);
    ln(`  Update:    ${fmt(report.toUpdate)}`);
    ln(`  Unchanged: ${fmt(report.unchanged)}`);
    ln();

    const sortedChanges = Object.entries(report.propertyChangeCounts).sort((a, b) => b[1] - a[1]);
    if (sortedChanges.length > 0) {
      ln('  Most changed fields:');
      for (const [field, count] of sortedChanges.slice(0, 15)) {
        ln(`    ${field}: ${fmt(count)} changes`);
      }
      ln();
    }

    if (report.sampleCreates.length > 0) {
      ln(`  Sample creates (first ${Math.min(report.sampleCreates.length, SAMPLE_LIMIT)}):`);
      for (let i = 0; i < Math.min(report.sampleCreates.length, 5); i++) {
        const props = report.sampleCreates[i];
        const keys = Object.keys(props).slice(0, 6);
        const preview = keys.map(k => `${k}=${JSON.stringify(props[k])}`).join(' ');
        ln(`    [${i + 1}] ${preview}`);
      }
      if (report.sampleCreates.length > 5) {
        ln(`    ... and ${report.sampleCreates.length - 5} more in JSON report`);
      }
      ln();
    }

    if (report.sampleUpdates.length > 0) {
      ln(`  Sample updates (first ${Math.min(report.sampleUpdates.length, SAMPLE_LIMIT)}):`);
      for (let i = 0; i < Math.min(report.sampleUpdates.length, 5); i++) {
        const { id, changes } = report.sampleUpdates[i];
        const keys = Object.keys(changes).slice(0, 4);
        const preview = keys.map(k => `${k}=${JSON.stringify(changes[k])}`).join(' ');
        ln(`    [${i + 1}] id=${id} ${preview}`);
      }
      if (report.sampleUpdates.length > 5) {
        ln(`    ... and ${report.sampleUpdates.length - 5} more in JSON report`);
      }
      ln();
    }
  }
}
