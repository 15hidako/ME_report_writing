import { describe, expect, it } from 'vitest';
import { formatJapaneseDate, formatMonthPeriod, localDate, parseListingCheckDate } from './date';

describe('localDate', () => {
  it('現地日付を使い、午前0時でも前日にならない', () => {
    expect(localDate(new Date(2026, 9, 19, 0, 1))).toBe('2026-10-19');
  });
  it('月日を2桁で返す', () => {
    expect(localDate(new Date(2026, 0, 2, 23, 59))).toBe('2026-01-02');
  });
});

describe('parseListingCheckDate', () => {
  it('空欄は出勤確認なしとして null を返す', () => {
    expect(parseListingCheckDate('')).toBeNull();
    expect(parseListingCheckDate('   ')).toBeNull();
  });
  it('YYYY-MM-DD の実在する日付を返す', () => {
    expect(parseListingCheckDate(' 2026-11-11 ')).toBe('2026-11-11');
  });
  it.each(['2026/11/11', '2026-13-01', '2026-02-30', '11月11日'])('%s は理由付きで拒否する', (input) => {
    expect(() => parseListingCheckDate(input)).toThrow(/出勤確認日はYYYY-MM-DD/);
  });
});

describe('formatJapaneseDate', () => {
  it('ゼロ埋めなしの年月日にする', () => {
    expect(formatJapaneseDate('2026-11-03')).toBe('2026年11月3日');
  });
});

describe('formatMonthPeriod', () => {
  it.each([
    ['2026-11-01', '2026年11月上旬'], ['2026-11-10', '2026年11月上旬'],
    ['2026-11-11', '2026年11月中旬'], ['2026-11-20', '2026年11月中旬'],
    ['2026-11-21', '2026年11月下旬'], ['2026-02-28', '2026年2月下旬'],
  ])('%s → %s', (input, expected) => {
    expect(formatMonthPeriod(input)).toBe(expected);
  });

  it('書式が不正なら止める', () => {
    expect(() => formatMonthPeriod('2026/11/01')).toThrow(/日付の書式/);
  });
});
