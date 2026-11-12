import { describe, expect, it } from 'vitest';
import { seriesTargets } from './series';
import { fixtureRecord } from '../test-fixtures';

const records = [1, 2, 3].map((no) => fixtureRecord({ id: `r${no}`, seriesNo: no }));

describe('通し番号からの対象選び', () => {
  it('前後の空白を許し、指定した番号の回答を返す', () => {
    expect(seriesTargets(records, ' 1, 3 ').map((record) => record.seriesNo)).toEqual([1, 3]);
  });

  it('空の項目があれば拒否する', () => {
    expect(() => seriesTargets(records, '1,,3')).toThrow('通し番号をコンマ区切りで入力してください');
    expect(() => seriesTargets(records, '')).toThrow('通し番号をコンマ区切りで入力してください');
  });

  it('整数でない番号を拒否する', () => {
    expect(() => seriesTargets(records, '1,2.5')).toThrow('通し番号は整数で指定してください');
    expect(() => seriesTargets(records, '1,a')).toThrow('通し番号は整数で指定してください');
  });

  it('存在しない番号があれば拒否する', () => {
    expect(() => seriesTargets(records, '1,9')).toThrow('存在しない通し番号があります');
  });
});
