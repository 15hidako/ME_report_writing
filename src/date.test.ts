import { describe, expect, it } from 'vitest';
import { localDate } from './date';

describe('localDate', () => {
  it('現地日付を使い、午前0時でも前日にならない', () => {
    expect(localDate(new Date(2026, 9, 19, 0, 1))).toBe('2026-10-19');
  });
  it('月日を2桁で返す', () => {
    expect(localDate(new Date(2026, 0, 2, 23, 59))).toBe('2026-01-02');
  });
});
