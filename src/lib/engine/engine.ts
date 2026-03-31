import chalk from "chalk";
import { ContactGenerator } from "../contact-generator/contact-generator";
import { ContactTypeFlagger } from "../contact-generator/contact-types";
import { updateContactsBasedOnMatchResults } from "../contact-generator/update-contacts";
import { DataSet } from "../data/set";
import { DealGenerator } from "../deal-generator/deal-generator";
import { Hubspot } from "../hubspot/hubspot";
import { FullEntity } from "../hubspot/interfaces";
import { LicenseGrouper } from "../license-matching/license-grouper";
import { ConsoleLogger } from "../log/console";
import { LogDir } from "../log/logdir";
import { Table } from "../log/table";
import { Tallier } from "../log/tallier";
import { AttributionJoiner } from "../marketplace/attribution-joiner";
import { mapChannelToHubspot, ParsedAttribution } from "../marketplace/attribution-parser";
import { Marketplace } from "../marketplace/marketplace";
import { RawAttribution } from "../marketplace/raw";
import { License } from "../model/license";
import { formatMoney, formatNumber } from "../util/formatters";
import { printSummary } from "./summary";

export type DealPropertyConfig = {
  dealOrigin?: string;
  dealRelatedProducts?: string;
  dealDealName: string;
};

export type PartnerPipelineConfig = {
  pipelineId: string;
  partnerStages: Set<string>;
  certifiedStages: Set<string>;
};

export interface EngineConfig {
  partnerDomains?: Set<string>;
  appToPlatform?: { [addonKey: string]: string };
  archivedApps?: Set<string>;
  dealProperties?: DealPropertyConfig;
  partnerPipeline?: PartnerPipelineConfig;
}

export class Engine {

  private step = 0;

  public partnerDomains = new Set<string>();
  public eazybiPartnerDomains = new Set<string>();
  public eazybiCertifiedPartnerDomains = new Set<string>();
  private customerDomains = new Set<string>();

  public tallier;

  public appToPlatform: { [addonKey: string]: string };
  public archivedApps: Set<string>;
  public dealPropertyConfig: DealPropertyConfig;
  private partnerPipelineConfig?: PartnerPipelineConfig;

  public hubspot!: Hubspot;
  public mpac!: Marketplace;
  public freeEmailDomains!: Set<string>;

  public constructor(config?: EngineConfig, public console?: ConsoleLogger, public logDir?: LogDir) {
    this.tallier = new Tallier(console);

    this.appToPlatform = config?.appToPlatform ?? Object.create(null);
    this.archivedApps = config?.archivedApps ?? new Set();
    this.partnerDomains = config?.partnerDomains ?? new Set();
    this.dealPropertyConfig = config?.dealProperties ?? {
      dealDealName: 'Deal'
    };
    this.partnerPipelineConfig = config?.partnerPipeline;
  }

  public run(data: DataSet) {
    this.hubspot = data.hubspot;
    this.mpac = data.mpac;
    this.freeEmailDomains = data.freeEmailDomains;

    if (process.env['HUBSPOT_API_KEY']) {
      this.console?.printWarning('Deprecation Notice', 'HUBSPOT_API_KEY is deprecated. See changelog for details.');
    }

    this.logStep('Starting engine');
    this.startEngine();

    const { eazybiPartnerDomains, eazybiCertifiedPartnerDomains } =
      this.extractEazybiPartnerDomains(data.rawData.rawDeals);
    this.eazybiPartnerDomains = eazybiPartnerDomains;
    this.eazybiCertifiedPartnerDomains = eazybiCertifiedPartnerDomains;
    this.logPartnerDomains();

    this.logStep('Identifying and Flagging Contact Types');
    const contactTypeFlagger = new ContactTypeFlagger(
      this.mpac.licenses,
      this.mpac.transactions,
      this.hubspot.contactManager,
      this.freeEmailDomains,
      this.partnerDomains,
      this.customerDomains,
      this.eazybiPartnerDomains,
      this.eazybiCertifiedPartnerDomains,
    );
    contactTypeFlagger.identifyAndFlagContactTypes();

    this.logStep('Generating contacts');
    const contactGenerator = new ContactGenerator(
      this.mpac.licenses,
      this.mpac.transactions,
      this.hubspot.contactManager,
      this.partnerDomains,
      this.archivedApps,
      this.eazybiPartnerDomains,
      this.eazybiCertifiedPartnerDomains,
    );
    contactGenerator.run();

    this.logStep('Running Scoring Engine');
    const licenseGrouper = new LicenseGrouper(
      this.freeEmailDomains,
      this.console,
      this.logDir,
    );
    const allMatches = licenseGrouper.run(this.mpac.licenses);

    this.logStep('Updating Contacts based on Match Results');
    updateContactsBasedOnMatchResults(this, allMatches);

    this.logStep('Enriching Contacts with Marketing Attribution');
    this.enrichContactsWithAttribution(data.rawData.rawAttributions);

    this.logStep('Generating deals');
    const dealGenerator = new DealGenerator(this);
    const dealGeneratorResults = dealGenerator.run(allMatches);

    this.logStep('Summary');
    printSummary(this);

    this.logStep('Done running engine on given data set');

    return { dealGeneratorResults };
  }

  private startEngine() {
    const transactionTotal = (this.mpac.transactions
      .map(t => t.data.vendorAmount)
      .reduce((a, b) => a + b, 0));

    this.printDownloadSummary(transactionTotal);

    this.tallier.first('Transaction total', transactionTotal);
  }

  private printDownloadSummary(transactionTotal: number) {
    const deals = this.hubspot.dealManager.getArray();
    const dealSum = (deals
      .map(d => d.data.amount ?? 0)
      .reduce((a, b) => a + b, 0));

    const contacts = this.hubspot.contactManager.getArray();

    const table = new Table([{}, { align: 'right' }]);
    table.rows.push(['# Licenses', formatNumber(this.mpac.licenses.length)]);
    table.rows.push(['# Transactions', formatNumber(this.mpac.transactions.length)]);
    table.rows.push(['$ Transactions', formatMoney(transactionTotal)]);
    table.rows.push(['# Contacts', formatNumber(contacts.length)]);
    table.rows.push(['# Deals', formatNumber(deals.length)]);
    table.rows.push(['$ Deals', formatMoney(dealSum)]);

    this.console?.printInfo('Downloader', 'Download Summary');
    for (const row of table.eachRow()) {
      this.console?.printInfo('Downloader', '  ' + row);
    }

  }

  private extractEazybiPartnerDomains(rawDeals: readonly FullEntity[]): {
    eazybiPartnerDomains: Set<string>;
    eazybiCertifiedPartnerDomains: Set<string>;
  } {
    const partnerDomains = new Set<string>();
    const certifiedDomains = new Set<string>();
    const config = this.partnerPipelineConfig;

    if (!config) return { eazybiPartnerDomains: partnerDomains, eazybiCertifiedPartnerDomains: certifiedDomains };

    const partnerCompanyIds = new Set<string>();
    const certifiedCompanyIds = new Set<string>();

    for (const rawDeal of rawDeals) {
      if (rawDeal.properties['pipeline'] !== config.pipelineId) continue;
      const stage = rawDeal.properties['dealstage'];

      const targetSet = config.certifiedStages.has(stage) ? certifiedCompanyIds
                      : config.partnerStages.has(stage) ? partnerCompanyIds
                      : null;
      if (!targetSet) continue;

      for (const rawAssoc of rawDeal.associations) {
        const [typeRaw, id] = rawAssoc.split(':');
        const type = typeRaw.replace(/_unlabeled$/, '');
        if (type === 'company' || (type.includes('_to_') && type.split('_to_').includes('company'))) {
          targetSet.add(id);
        }
      }
    }

    // Certified wins over partner if company appears in both
    for (const companyId of partnerCompanyIds) {
      if (certifiedCompanyIds.has(companyId)) continue;
      this.extractDomainsFromCompany(companyId, partnerDomains);
    }
    for (const companyId of certifiedCompanyIds) {
      this.extractDomainsFromCompany(companyId, certifiedDomains);
    }

    return { eazybiPartnerDomains: partnerDomains, eazybiCertifiedPartnerDomains: certifiedDomains };
  }

  private extractDomainsFromCompany(companyId: string, domains: Set<string>) {
    const company = this.hubspot.companyManager.get(companyId);
    if (!company) return;
    for (const contact of company.contacts.getAll()) {
      if (contact.data.email) {
        const domain = contact.data.email.split('@')[1];
        if (domain && !this.freeEmailDomains.has(domain)) {
          domains.add(domain);
        }
      }
    }
  }

  private logPartnerDomains() {
    const sortedPartner = [...this.eazybiPartnerDomains].sort();
    const sortedCertified = [...this.eazybiCertifiedPartnerDomains].sort();

    this.console?.printInfo('Engine', `Extracted ${sortedPartner.length} eazyBI Partner domains`);
    for (const domain of sortedPartner) {
      this.console?.printInfo('Engine', `  eazyBI Partner: ${domain}`);
    }
    this.console?.printInfo('Engine', `Extracted ${sortedCertified.length} eazyBI Certified Partner domains`);
    for (const domain of sortedCertified) {
      this.console?.printInfo('Engine', `  eazyBI Certified: ${domain}`);
    }

    const partnerDomainsFile = this.logDir?.partnerDomainsFile();
    if (partnerDomainsFile) {
      const stream = partnerDomainsFile.writeStream();
      stream.writeLine(JSON.stringify({
        eazybiPartnerDomains: sortedPartner,
        eazybiCertifiedPartnerDomains: sortedCertified,
        mpacPartnerDomains: [...this.partnerDomains].sort(),
        partnerOverlap: sortedPartner.filter(d => this.partnerDomains.has(d)),
        certifiedOverlap: sortedCertified.filter(d => this.partnerDomains.has(d)),
      }, null, 2));
      stream.close();
    }
  }

  private enrichContactsWithAttribution(rawAttributions: RawAttribution[]) {
    const joiner = new AttributionJoiner(rawAttributions);

    let enriched = 0;
    let withGclid = 0;

    for (const contact of this.hubspot.contactManager.getAll()) {
      // Find the best attribution across all of this contact's licenses
      let bestAttribution: ParsedAttribution | null = null;

      for (const record of contact.records) {
        if (!(record instanceof License)) continue;
        const attr = joiner.getBestAttribution(record);
        if (!attr) continue;

        // GCLID always wins; otherwise most recent
        if (!bestAttribution
          || (attr.gclid && !bestAttribution.gclid)
          || (attr.gclid && bestAttribution.gclid && attr.eventTimestamp > bestAttribution.eventTimestamp)
          || (!bestAttribution.gclid && !attr.gclid && attr.eventTimestamp > bestAttribution.eventTimestamp)) {
          bestAttribution = attr;
        }
      }

      if (bestAttribution) {
        contact.data.utmChannel = mapChannelToHubspot(bestAttribution.channel);
        contact.data.utmSource = bestAttribution.utmSource;
        contact.data.utmMedium = bestAttribution.utmMedium;
        contact.data.utmCampaign = bestAttribution.utmCampaign;
        contact.data.utmTerm = bestAttribution.utmTerm;
        contact.data.utmContent = bestAttribution.utmContent;
        contact.data.utmReferrer = bestAttribution.referrerDomain;
        contact.data.googleClickId = bestAttribution.gclid;
        enriched++;
        if (bestAttribution.gclid) withGclid++;
      }
    }

    this.console?.printInfo('Attribution', `Enriched ${formatNumber(enriched)} contacts with attribution data`);
    this.console?.printInfo('Attribution', `  ${formatNumber(withGclid)} contacts with GCLID`);
    this.console?.printInfo('Attribution', `  ${formatNumber(rawAttributions.length)} marketing-attribution touchpoints loaded`);
  }

  private logStep(description: string) {
    this.console?.printInfo('Engine', chalk.bold.blueBright(`Step ${++this.step}: ${description}`));
  }

}
