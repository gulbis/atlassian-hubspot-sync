import { scoreSimilarity } from '../../lib/license-matching/similarity-scorer';

describe('scoreSimilarity', () => {

  it('returns 0 when first string is empty', () => {
    expect(scoreSimilarity(0.5, '', 'hello')).toBe(0);
  });

  it('returns 0 when second string is empty', () => {
    expect(scoreSimilarity(0.5, 'hello', '')).toBe(0);
  });

  it('returns 0 when first string is falsy', () => {
    expect(scoreSimilarity(0.5, undefined as any, 'hello')).toBe(0);
    expect(scoreSimilarity(0.5, null as any, 'hello')).toBe(0);
  });

  it('returns 0 when second string is falsy', () => {
    expect(scoreSimilarity(0.5, 'hello', undefined as any)).toBe(0);
    expect(scoreSimilarity(0.5, 'hello', null as any)).toBe(0);
  });

  it('returns 1 for identical strings', () => {
    expect(scoreSimilarity(0.5, 'hello world', 'hello world')).toBe(1);
  });

  it('returns 1 for identical short strings', () => {
    expect(scoreSimilarity(0.5, 'ab', 'ab')).toBe(1);
  });

  it('returns 1 for identical single-character strings (identity check before length check)', () => {
    // The a === b check runs before the length < 2 check
    expect(scoreSimilarity(0, 'a', 'a')).toBe(1);
  });

  it('returns 0 when first string is single char', () => {
    expect(scoreSimilarity(0, 'a', 'abc')).toBe(0);
  });

  it('returns 0 when second string is single char', () => {
    expect(scoreSimilarity(0, 'abc', 'a')).toBe(0);
  });

  it('returns score above 0 for similar strings with threshold 0', () => {
    const score = scoreSimilarity(0, 'hello', 'hallo');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('returns 0 when score is below atLeast threshold', () => {
    // 'abc' and 'xyz' are very different
    expect(scoreSimilarity(0.9, 'abc', 'xyz')).toBe(0);
  });

  it('returns score when score meets atLeast threshold', () => {
    // 'hello world' and 'hello world!' are very similar
    const score = scoreSimilarity(0.8, 'hello world', 'hello world!');
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it('handles very similar strings', () => {
    const score = scoreSimilarity(0.9, '123 Main Street', '123 Main Stree');
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('handles completely different strings', () => {
    expect(scoreSimilarity(0, 'abcdef', 'zyxwvu')).toBe(0);
  });

  it('is case-sensitive', () => {
    const score = scoreSimilarity(0, 'Hello', 'hello');
    expect(score).toBeLessThan(1);
  });

  it('handles strings with only 2 characters', () => {
    const score = scoreSimilarity(0, 'ab', 'ac');
    expect(score).toBe(0); // Only 1 bigram each, 'ab' vs 'ac', no match
  });

  it('works with threshold of 0 for any similar strings', () => {
    const score = scoreSimilarity(0, 'John Smith', 'Jon Smith');
    expect(score).toBeGreaterThan(0);
  });

  it('produces higher score for more similar strings', () => {
    const closeScore = scoreSimilarity(0, 'acme corporation', 'acme corporaton');
    const farScore = scoreSimilarity(0, 'acme corporation', 'beta industries');
    expect(closeScore).toBeGreaterThan(farScore);
  });

  it('is symmetric', () => {
    const score1 = scoreSimilarity(0, 'hello world', 'world hello');
    const score2 = scoreSimilarity(0, 'world hello', 'hello world');
    expect(score1).toBeCloseTo(score2, 10);
  });

});
