import { DateTime, Settings } from 'luxon';
import { dataInsightDateRanges, incrementalDateRanges } from '../lib/marketplace/api/api';

describe('incrementalDateRanges', () => {

  it('generates fewer ranges than full dataInsightDateRanges', () => {
    const full = dataInsightDateRanges();
    const incremental = incrementalDateRanges('2025-12-01');

    expect(incremental.length).toBeLessThan(full.length);
    expect(incremental.length).toBeGreaterThan(0);
  });

  it('starts from the given since date', () => {
    const ranges = incrementalDateRanges('2025-06-15');

    expect(ranges[0].startDate).toBe('2025-06-15');
  });

  it('ends at or after today', () => {
    const ranges = incrementalDateRanges('2025-06-15');
    const lastRange = ranges[ranges.length - 1];
    const today = DateTime.local().toISODate();

    expect(lastRange.endDate! >= today!).toBe(true);
  });

  it('produces a single range when since is recent (< 2 months ago)', () => {
    const recentDate = DateTime.local().minus({ days: 10 }).toISODate()!;
    const ranges = incrementalDateRanges(recentDate);

    expect(ranges.length).toBe(1);
  });

  it('produces multiple ranges when since is further back', () => {
    const ranges = incrementalDateRanges('2024-01-01');

    expect(ranges.length).toBeGreaterThan(1);
    // Each range should be ~2 months
    for (let i = 0; i < ranges.length - 1; i++) {
      const start = DateTime.fromISO(ranges[i].startDate!);
      const end = DateTime.fromISO(ranges[i].endDate!);
      const months = end.diff(start, 'months').months;
      expect(months).toBeCloseTo(2, 0);
    }
  });

  it('has contiguous ranges (no gaps)', () => {
    const ranges = incrementalDateRanges('2024-06-01');

    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].startDate).toBe(ranges[i - 1].endDate);
    }
  });

});
