import 'source-map-support/register';
import { engineConfigFromENV } from '../lib/config/env';
import { cliArgs } from '../lib/config/params';
import { dataManager } from '../lib/data/manager';
import { Engine } from "../lib/engine/engine";
import { ConsoleLogger } from '../lib/log/console';
import { PreUploadReporter } from '../lib/log/pre-upload-report';
import { AttachableError } from '../lib/util/errors';

const dataSetId = cliArgs[0];

const console = new ConsoleLogger();

console.printInfo('Dry Run', `Running on [${dataSetId ?? 'latest'}] data set`);

try {
  const dataSet = (dataSetId
    ? dataManager.dataSetFrom(+dataSetId)
    : dataManager.latestDataSet());

  const logDir = dataSet.makeLogDir!(`dry-run-${Date.now()}`);

  const engine = new Engine(engineConfigFromENV(), console, logDir);

  engine.run(dataSet);

  dataSet.hubspot.populateFakeIds();

  // Generate structured report
  const reporter = new PreUploadReporter();
  const report = reporter.generateReport(dataSet.hubspot, engine.mpac);

  // Write JSON report
  const reportFile = logDir.dryRunReportFile();
  if (reportFile) {
    reporter.writeReportJson(report, reportFile);
  }

  // Print human-readable summary
  reporter.printSummary(report, console);

  // Also write the existing log format
  logDir.hubspotOutputLogger()?.logResults(dataSet.hubspot);

  console.printInfo('Dry Run', 'Report complete. NO data was sent to HubSpot.');
}
catch (e: any) {
  if (e instanceof AttachableError) {
    console.printInfo('Dry Run', e.message);
    console.printInfo('Dry Run', e.attachment);
  }
  else {
    throw e;
  }
}
