import { describe, expect, it } from 'vitest';
import { fixtureRecord } from '../test-fixtures';
import type { VisitRecord } from '../types';
import { scanAnswerFiles } from './answer-sync';

const file = (records: readonly VisitRecord[], name: string, modifiedAt = 1) =>
  ({ name, modifiedAt, text: JSON.stringify(records) });
const at = (updatedAt: string, nominationFee: number): VisitRecord => {
  const base = fixtureRecord();
  return fixtureRecord({ updatedAt, basic: { ...base.basic, nominationFee } });
};

describe('data/answers の回答の選び方', () => {
  it('同じ回答は更新日時がいちばん新しいものを使う。ファイルの順には左右されない', () => {
    const newer = at('2026-07-03T00:00:00.000Z', 3000);
    const older = at('2026-07-02T00:00:00.000Z', 2000);
    const { incoming, errors } = scanAnswerFiles([], [file([newer], 'a.json', 1), file([older], 'b.json', 2)]);
    expect(errors).toEqual([]);
    expect(incoming.map((item) => [item.fileName, item.record.basic.nominationFee])).toEqual([['a.json', 3000]]);
  });

  it('更新日時が同じで中身が違えば、どちらも取り込まずに理由を返す', () => {
    const one = at('2026-07-02T00:00:00.000Z', 2000);
    const other = at('2026-07-02T00:00:00.000Z', 3000);
    const { incoming, errors } = scanAnswerFiles([], [file([one], 'a.json'), file([other], 'b.json', 2)]);
    expect(incoming).toEqual([]);
    expect(errors).toEqual(['えりか: a.json と b.json で、更新日時が同じなのに中身が違います']);
  });

  it('同じ日時の食い違いがあっても、さらに新しい版があればそれを使う', () => {
    const one = at('2026-07-02T00:00:00.000Z', 2000);
    const other = at('2026-07-02T00:00:00.000Z', 3000);
    const newest = at('2026-07-04T00:00:00.000Z', 4000);
    const { incoming, errors } = scanAnswerFiles([], [file([one], 'a.json'), file([other], 'b.json', 2), file([newest], 'c.json', 3)]);
    expect(errors).toEqual([]);
    expect(incoming.map((item) => item.record.basic.nominationFee)).toEqual([4000]);
  });

  it('ボードと同じか、ボードより古い回答は返さない', () => {
    const saved = at('2026-07-03T00:00:00.000Z', 1000);
    const older = at('2026-07-02T00:00:00.000Z', 2000);
    expect(scanAnswerFiles([saved], [file([saved], 'a.json'), file([older], 'b.json', 2)]).incoming).toEqual([]);
  });
});


describe('PC側の管理情報と回答本文を分ける', () => {
  it.each(['2026-11-13T11:00:00.000Z', '2026-11-13T12:00:00.000Z'])('本文差分は%sでも通知し、自動適用しない', (updatedAt) => {
    const saved = at('2026-11-13T12:00:00.000Z', 1000);
    const corrected = at(updatedAt, 2000);
    const result = scanAnswerFiles([saved], [file([corrected], 'correction.json')]);
    expect(result.incoming).toEqual([]);
    expect(result.errors).toEqual([expect.stringMatching(/correction.json.*競合.*回答を追加読込/)]);
    expect(saved.basic.nominationFee).toBe(1000);
  });
  it('管理情報だけが違えば新着も競合も出さない', () => {
    const original = fixtureRecord();
    const saved = { ...original, seriesNo: 9, updatedAt: '2026-11-13T12:00:00.000Z', postedUrl: 'https://wakust.com/reports/1001' };
    expect(scanAnswerFiles([saved], [file([original], 'original.json')])).toEqual({ incoming: [], errors: [] });
  });
});
