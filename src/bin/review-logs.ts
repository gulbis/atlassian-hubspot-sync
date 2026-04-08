import 'source-map-support/register';
import { SyncLogger, SyncLogEntry } from '../lib/data/sync-log';

/**
 * Review sync logs and flag issues.
 * Usage: npm run review-logs [-- --last N]
 */

const lastN = (() => {
  const idx = process.argv.indexOf('--last');
  return idx >= 0 ? parseInt(process.argv[idx + 1], 10) : 10;
})();

function fmt(ms: number): string {
  return `${(ms / 60000).toFixed(1)} min`;
}

function main() {
  const logger = new SyncLogger();
  const entries = logger.readRecent(lastN);

  if (entries.length === 0) {
    console.log('No sync log entries found.');
    process.exit(0);
  }

  console.log(`\n=== Sync Log Review (${entries.length} entries) ===\n`);

  let issues = 0;

  for (const e of entries) {
    const ts = e.timestamp.slice(0, 16).replace('T', ' ');
    const dur = fmt(e.duration?.totalMs ?? 0);
    const mode = e.mode.toUpperCase().padEnd(11);
    const status = e.status === 'success' ? '\x1b[32mOK\x1b[0m' : '\x1b[31mFAIL\x1b[0m';

    const u = e.upload;
    const created = (u?.contacts?.created ?? 0) + (u?.deals?.created ?? 0) + (u?.companies?.created ?? 0);
    const updated = (u?.contacts?.updated ?? 0) + (u?.deals?.updated ?? 0) + (u?.companies?.updated ?? 0);
    const failed = (u?.contacts?.failed ?? 0) + (u?.deals?.failed ?? 0) + (u?.companies?.failed ?? 0);

    console.log(`${ts}  ${mode} ${status}  ${dur.padStart(9)}  +${created} ~${updated} x${failed}`);

    const flags: string[] = [];

    if (e.status !== 'success') {
      flags.push(`Status: ${e.status}`);
    }

    if (failed > 0) {
      flags.push(`${failed} upload failures (contacts: ${u?.contacts?.failed}, deals: ${u?.deals?.failed}, companies: ${u?.companies?.failed})`);
    }

    if (e.duration && e.duration.totalMs > 60 * 60 * 1000) {
      flags.push(`Slow: ${fmt(e.duration.totalMs)} (dl: ${fmt(e.duration.downloadMs)}, eng: ${fmt(e.duration.engineMs)}, up: ${fmt(e.duration.uploadMs)})`);
    }

    if (e.merge) {
      const shrinkPct = ((e.merge.baselineLicenses - e.merge.mergedLicenses) / e.merge.baselineLicenses * 100);
      if (shrinkPct > 50) {
        flags.push(`License count dropped ${shrinkPct.toFixed(1)}% after merge (${e.merge.baselineLicenses} -> ${e.merge.mergedLicenses})`);
      }
    }

    if (e.errors && e.errors.length > 0) {
      flags.push(`Errors: ${e.errors.join('; ')}`);
    }

    for (const flag of flags) {
      console.log(`  \x1b[33m! ${flag}\x1b[0m`);
      issues++;
    }
  }

  // Trends
  if (entries.length >= 3) {
    console.log('\n--- Trends ---');
    const durations = entries.filter(e => e.duration).map(e => e.duration!.totalMs);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    console.log(`  Avg duration: ${fmt(avg)} | Latest: ${fmt(durations[durations.length - 1])}`);

    const failStreak = entries.slice().reverse().findIndex(e => {
      const u = e.upload;
      return (u?.contacts?.failed ?? 0) + (u?.deals?.failed ?? 0) + (u?.companies?.failed ?? 0) === 0;
    });
    if (failStreak > 0) {
      console.log(`  \x1b[33m! ${failStreak} consecutive syncs with upload failures\x1b[0m`);
    }
  }

  console.log(`\n${issues === 0 ? '\x1b[32mNo issues found.\x1b[0m' : `\x1b[33m${issues} issue(s) flagged.\x1b[0m`}\n`);
}

main();
