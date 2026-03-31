import 'source-map-support/register';
import { engineConfigFromENV } from '../lib/config/env';
import { cliArgs } from '../lib/config/params';
import { dataManager } from '../lib/data/manager';
import { RawDataSet } from '../lib/data/raw';
import { Engine } from "../lib/engine/engine";
import { ConsoleLogger } from '../lib/log/console';
import { PreUploadReporter } from '../lib/log/pre-upload-report';
import { RawLicense, RawTransaction } from '../lib/marketplace/raw';
import { DataSet, dataSetConfigFromENV } from '../lib/data/set';
import { DataSetStore } from '../lib/data/store';
import { LogDir } from '../lib/log/logdir';
import DataDir from '../lib/data/dir';
import { DateTime } from 'luxon';
import { AttachableError } from '../lib/util/errors';

/**
 * Runs the engine on a small sample of MPAC data for fast testing.
 *
 * Usage: npm run sample [-- <count> [<dataSetId>]]
 *   count     = number of unique tech-contact emails to include (default: 10)
 *   dataSetId = specific data set timestamp (default: latest)
 *
 * This filters licenses and transactions BEFORE engine processing,
 * so the O(n²) scoring engine only runs on the sample — not the full 113K.
 */

const console = new ConsoleLogger();

// Parse args: first numeric arg = sample size, second = dataSetId
let sampleSize = 10;
let dataSetId: string | undefined;

for (const arg of cliArgs) {
  const n = Number(arg);
  if (!isNaN(n) && n > 0) {
    if (!sampleSize || sampleSize === 10) {
      sampleSize = n;
    } else {
      dataSetId = arg;
    }
  } else {
    dataSetId = arg;
  }
}

// Allow explicit: npm run sample -- 20 1711900000000
if (cliArgs.length >= 2) {
  sampleSize = Number(cliArgs[0]) || 10;
  dataSetId = cliArgs[1];
}

console.printInfo('Sample Run', `Sample size: ${sampleSize} contacts, data set: [${dataSetId ?? 'latest'}]`);

try {
  // Load raw data directly (bypass DataSet construction so we can filter first)
  const allIds = dataManager.allDataSetIds();
  const targetMs = dataSetId ? +dataSetId : allIds[0];
  if (!targetMs || !allIds.includes(targetMs)) {
    throw new Error(`Data set [${dataSetId ?? 'latest'}] not found. Available: ${allIds.join(', ')}`);
  }

  const dataDir = DataDir.root.subdir(`in-${targetMs}`);
  const store = new DataSetStore(dataDir);

  console.printInfo('Sample Run', 'Loading raw data from disk...');
  const rawData = store.load();

  // Stats before filtering
  const totalLicenses = rawData.licensesWithDataInsights.length + rawData.licensesWithoutDataInsights.length;
  const totalTransactions = rawData.transactions.length;
  console.printInfo('Sample Run', `Full data: ${totalLicenses.toLocaleString()} licenses, ${totalTransactions.toLocaleString()} transactions`);
  console.printInfo('Sample Run', `           ${rawData.rawContacts.length.toLocaleString()} HS contacts, ${rawData.rawDeals.length.toLocaleString()} HS deals, ${rawData.rawCompanies.length.toLocaleString()} HS companies`);

  // Collect all unique tech-contact emails from licenses
  const emailSet = new Set<string>();
  for (const lic of [...rawData.licensesWithDataInsights, ...rawData.licensesWithoutDataInsights]) {
    const email = lic.contactDetails?.technicalContact?.email;
    if (email) emailSet.add(email.toLowerCase());
  }

  // Pick N random emails (deterministic seed for reproducibility: use first N sorted)
  const allEmails = [...emailSet].sort();
  // Pick a spread across the alphabet for variety
  const step = Math.max(1, Math.floor(allEmails.length / sampleSize));
  const selectedEmails = new Set<string>();
  for (let i = 0; i < allEmails.length && selectedEmails.size < sampleSize; i += step) {
    selectedEmails.add(allEmails[i]);
  }

  console.printInfo('Sample Run', `Selected ${selectedEmails.size} unique tech-contact emails from ${emailSet.size.toLocaleString()} total`);

  // Filter licenses: keep only those whose tech contact email is in our sample
  function filterLicenses(licenses: RawLicense[]): RawLicense[] {
    return licenses.filter(lic => {
      const email = lic.contactDetails?.technicalContact?.email?.toLowerCase();
      return email && selectedEmails.has(email);
    });
  }

  // Filter transactions: keep only those whose tech contact email is in our sample
  function filterTransactions(transactions: RawTransaction[]): RawTransaction[] {
    return transactions.filter(tx => {
      const email = tx.customerDetails?.technicalContact?.email?.toLowerCase();
      return email && selectedEmails.has(email);
    });
  }

  const filteredData: RawDataSet = {
    ...rawData,
    licensesWithDataInsights: filterLicenses(rawData.licensesWithDataInsights),
    licensesWithoutDataInsights: filterLicenses(rawData.licensesWithoutDataInsights),
    transactions: filterTransactions(rawData.transactions),
    // Keep ALL HubSpot data (contacts/companies/deals) so matching works correctly
  };

  const filteredLicenses = filteredData.licensesWithDataInsights.length + filteredData.licensesWithoutDataInsights.length;
  const filteredTransactions = filteredData.transactions.length;
  console.printInfo('Sample Run', `Filtered: ${filteredLicenses} licenses, ${filteredTransactions} transactions`);

  // Log sample emails
  for (const email of selectedEmails) {
    console.printInfo('Sample Run', `  → ${email}`);
  }

  // Construct DataSet from filtered raw data
  const dataSet = new DataSet(filteredData, DateTime.fromMillis(targetMs), dataSetConfigFromENV(), console);
  dataSet.makeLogDir = (name) => new LogDir(dataDir.subdir(name));

  const logDir = dataSet.makeLogDir(`sample-${sampleSize}-${Date.now()}`);

  // Run engine on filtered data
  const engine = new Engine(engineConfigFromENV(), console, logDir);
  engine.run(dataSet);

  dataSet.hubspot.populateFakeIds();

  // Generate report
  const reporter = new PreUploadReporter();
  const report = reporter.generateReport(dataSet.hubspot, engine.mpac);

  const reportFile = logDir.dryRunReportFile();
  if (reportFile) {
    reporter.writeReportJson(report, reportFile);
  }

  reporter.printSummary(report, console);
  logDir.hubspotOutputLogger()?.logResults(dataSet.hubspot);

  console.printInfo('Sample Run', `Done. Processed ${selectedEmails.size} contacts (${filteredLicenses} licenses, ${filteredTransactions} transactions). NO data sent to HubSpot.`);
}
catch (e: any) {
  if (e instanceof AttachableError) {
    console.printInfo('Sample Run', e.message);
    console.printInfo('Sample Run', e.attachment);
  }
  else {
    throw e;
  }
}
