import 'source-map-support/register';
import { incrementalSyncConfigFromENV } from '../lib/config/env';
import { SyncStateManager } from '../lib/data/sync-state';
import { orchestrateDownload } from '../lib/engine/download-orchestrator';
import { hubspotConfigFromENV } from '../lib/hubspot/hubspot';
import { ConsoleLogger } from '../lib/log/console';

const console = new ConsoleLogger();
const syncState = new SyncStateManager();
const forceFull = process.argv.includes('--full');

orchestrateDownload(
  console,
  hubspotConfigFromENV(),
  syncState,
  incrementalSyncConfigFromENV(),
  { forceFull },
).then(result => {
  console.printInfo('Download', `Complete (${result.mode} mode, dataset in-${result.dataSetId})`);
}).catch(e => {
  console.printError('Download', 'Fatal error:', e);
  process.exit(1);
});
