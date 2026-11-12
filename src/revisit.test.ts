import { describe, expect, it } from 'vitest';
import { findOriginalRecord } from './revisit';
import { fixtureRecord } from './test-fixtures';
import type { VisitRecord } from './types';

const lookupIn = (records: readonly VisitRecord[]) => (id: string): VisitRecord | undefined =>
  records.find((record) => record.id === id);

describe('再訪元の初回回答', () => {
  it('再訪でない回答はそのまま返す', () => {
    const first = fixtureRecord({ id: 'a' });
    expect(findOriginalRecord(first, lookupIn([first]))).toBe(first);
  });

  it('再訪を重ねていても初回までたどる', () => {
    const first = fixtureRecord({ id: 'a' });
    const second = fixtureRecord({ id: 'b', revisitOf: 'a' });
    const third = fixtureRecord({ id: 'c', revisitOf: 'b' });
    expect(findOriginalRecord(third, lookupIn([first, second, third]))).toBe(first);
  });

  it('参照先が消えていれば missing', () => {
    const revisit = fixtureRecord({ id: 'b', revisitOf: 'gone' });
    expect(findOriginalRecord(revisit, lookupIn([revisit]))).toBe('missing');
  });

  it('参照が輪になっていれば cycle', () => {
    const a = fixtureRecord({ id: 'a', revisitOf: 'b' });
    const b = fixtureRecord({ id: 'b', revisitOf: 'a' });
    expect(findOriginalRecord(a, lookupIn([a, b]))).toBe('cycle');
  });
});
