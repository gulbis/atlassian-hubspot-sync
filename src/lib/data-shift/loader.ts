import { dataManager } from "../data/manager";
import { ConsoleLogger } from "../log/console";

export function loadDataSets(console: ConsoleLogger) {
  const allIds = dataManager.allDataSetIds();
  if (allIds.length < 2) {
    console.printInfo('Data Shift Analyzer', 'Need at least 2 datasets for comparison — skipping');
    return [];
  }

  // Only load the 2 most recent datasets to avoid OOM
  // (each dataset is ~2.5 GB in memory with entity objects + associations)
  const recentIds = allIds.slice(0, 2);

  console.printInfo('Data Shift Analyzer', `Loading ${recentIds.length} most recent data sets (of ${allIds.length} total)`);
  console.printInfo('Data Shift Analyzer', 'Node.js Memory Usage', memoryUsage());
  const dataSets = recentIds.sort().map(id => {
    console.printInfo('Data Shift Analyzer', `Loading data set ${id}: Starting...`);
    const ds = dataManager.dataSetFrom(id);
    console.printInfo('Data Shift Analyzer', `Loading data set ${id}: Done`);
    console.printInfo('Data Shift Analyzer', 'Node.js Memory Usage', memoryUsage());
    return ds;
  });
  console.printInfo('Data Shift Analyzer', 'Loading data sets: Done');
  return dataSets;
}

function memoryUsage() {
  const mem = process.memoryUsage();
  const used = mem.heapUsed;
  const total = mem.heapTotal;
  const usedStr = (used / 1024 / 1024).toFixed(2) + ' MB';
  const totalStr = (total / 1024 / 1024).toFixed(2) + ' MB';
  const percent = ((used / total) * 100).toFixed();
  return `${percent}% (${usedStr} used / ${totalStr} total)`;
}
