import 'source-map-support/register';
import { dataShiftConfigFromENV, engineConfigFromENV } from "../lib/config/env";
import { DataShiftAnalyzer } from '../lib/data-shift/analyze';
import { loadDataSets } from '../lib/data-shift/loader';
import { DataShiftReporter } from '../lib/data-shift/reporter';
import { dataManager } from '../lib/data/manager';
import { downloadAllData } from '../lib/engine/download';
import { Engine } from "../lib/engine/engine";
import { hubspotConfigFromENV } from '../lib/hubspot/hubspot';
import { HubspotUploader } from '../lib/hubspot/uploader';
import { ConsoleLogger } from '../lib/log/console';
import { AttachableError } from '../lib/util/errors';

/**
 * Single-run sync: download → engine → upload → log → exit.
 * Same as main.ts but runs once and exits (for cron/scheduled execution).
 *
 * Usage: npm run sync
 */

const console2 = new ConsoleLogger();
const uploader = new HubspotUploader(console2);

async function main() {
  const startTime = Date.now();
  console2.printInfo('Sync', '=== Single-Run Sync ===');
  console2.printInfo('Sync', `Started: ${new Date(startTime).toISOString()}`);

  console2.printInfo('Sync', 'Pruning old data sets');
  dataManager.pruneDataSets(console2);

  console2.printInfo('Sync', 'Downloading MPAC + HubSpot data');
  const ms = await downloadAllData(console2, hubspotConfigFromENV());
  const dataSet = dataManager.dataSetFrom(ms, console2);
  const logDir = dataSet.makeLogDir!('sync');

  console2.printInfo('Sync', 'Running engine');
  const engine = new Engine(engineConfigFromENV(), console2, logDir);
  engine.run(dataSet);

  console2.printInfo('Sync', 'Uploading changes to HubSpot');
  await uploader.upsyncChangesToHubspot(dataSet.hubspot);

  console2.printInfo('Sync', 'Writing change log');
  logDir.hubspotOutputLogger()?.logResults(dataSet.hubspot);

  console2.printInfo('Sync', 'Analyzing data shift');
  const dataSets = loadDataSets(console2);
  const analyzer = new DataShiftAnalyzer(dataShiftConfigFromENV(), console2);
  const results = analyzer.run(dataSets);
  const reporter = new DataShiftReporter(console2, undefined);
  reporter.report(results);

  const endTime = Date.now();
  const durationMin = ((endTime - startTime) / 60000).toFixed(1);

  // Summary stats
  const contacts = dataSet.hubspot.contactManager;
  const deals = dataSet.hubspot.dealManager;
  const contactChanges = contacts.getArray().filter(c => Object.keys(c.getPropertyChanges()).length > 0);
  const dealChanges = deals.getArray().filter(d => Object.keys(d.getPropertyChanges()).length > 0);
  const newContacts = contactChanges.filter(c => c.id === null);
  const updatedContacts = contactChanges.filter(c => c.id !== null);
  const newDeals = dealChanges.filter(d => d.id === null);
  const updatedDeals = dealChanges.filter(d => d.id !== null);

  console2.printInfo('Sync', '');
  console2.printInfo('Sync', '=== SYNC COMPLETE ===');
  console2.printInfo('Sync', `Duration: ${durationMin} min`);
  console2.printInfo('Sync', `Contacts: ${newContacts.length} created, ${updatedContacts.length} updated`);
  console2.printInfo('Sync', `Deals: ${newDeals.length} created, ${updatedDeals.length} updated`);
  console2.printInfo('Sync', `MPAC: ${engine.mpac.licenses.length} licenses, ${engine.mpac.transactions.length} transactions`);
}

main().catch(e => {
  if (e instanceof AttachableError) {
    console2.printError('Sync', e.message);
    console2.printError('Sync', e.attachment);
  } else {
    console2.printError('Sync', 'Fatal error:', e);
  }
  process.exit(1);
});
