import { describe, expect, it } from 'vitest';
import { isAnswerFileName, looksLikeVisitRecords, planFiling } from './files';

describe('isAnswerFileName', () => {
  it('共有・保存で付く名前を拾う', () => {
    expect(isAnswerFileName('me-report-12.json')).toBe(true);
    expect(isAnswerFileName('me-report-backup-2026-11-13.json')).toBe(true);
    expect(isAnswerFileName('ME-REPORT-3.JSON')).toBe(true);
  });

  it('ほかのファイルは拾わない', () => {
    expect(isAnswerFileName('me-report-.json')).toBe(false);
    expect(isAnswerFileName('me-report-12.json.crdownload')).toBe(false);
    expect(isAnswerFileName('targets.json')).toBe(false);
  });
});

describe('looksLikeVisitRecords', () => {
  it('id と seriesNo を持つ要素の配列だけを訪問記録とみなす', () => {
    expect(looksLikeVisitRecords([{ id: 'a', seriesNo: 1 }])).toBe(true);
    expect(looksLikeVisitRecords([])).toBe(false);
    expect(looksLikeVisitRecords({ cards: [] })).toBe(false);
    expect(looksLikeVisitRecords([{ id: 'a', seriesNo: '1' }])).toBe(false);
    expect(looksLikeVisitRecords([{ id: 'a', seriesNo: 1 }, null])).toBe(false);
  });
});

describe('planFiling', () => {
  it('新しいファイルはそのままの名前で移す', () => {
    expect(planFiling([{ name: 'me-report-4.json', hash: 'aaaa1111', isRecords: true }], [])).toEqual([
      { kind: 'move', from: 'me-report-4.json', to: 'me-report-4.json' },
    ]);
  });

  it('同じ中身が移し先にあれば重複として扱う', () => {
    expect(
      planFiling([{ name: 'me-report-4 (1).json', hash: 'aaaa1111', isRecords: true }], [{ name: 'me-report-4.json', hash: 'aaaa1111' }]),
    ).toEqual([{ kind: 'duplicate', from: 'me-report-4 (1).json', sameAs: 'me-report-4.json' }]);
  });

  it('名前が同じで中身が違えば、ハッシュの頭を足して両方残す', () => {
    expect(
      planFiling([{ name: 'ME-REPORT-4.json', hash: 'bbbb2222cccc', isRecords: true }], [{ name: 'me-report-4.json', hash: 'aaaa1111' }]),
    ).toEqual([{ kind: 'move', from: 'ME-REPORT-4.json', to: 'ME-REPORT-4-bbbb2222.json' }]);
  });

  it('同じ回で届いた同じ中身は1つだけ移す', () => {
    expect(
      planFiling(
        [
          { name: 'me-report-4 (1).json', hash: 'aaaa1111', isRecords: true },
          { name: 'me-report-4.json', hash: 'aaaa1111', isRecords: true },
        ],
        [],
      ),
    ).toEqual([
      { kind: 'move', from: 'me-report-4.json', to: 'me-report-4.json' },
      { kind: 'duplicate', from: 'me-report-4 (1).json', sameAs: 'me-report-4.json' },
    ]);
  });

  it('訪問記録でないものは触らない', () => {
    expect(planFiling([{ name: 'me-report-board-2026-11-13.json', hash: 'x', isRecords: false }], [])).toEqual([
      { kind: 'skip', from: 'me-report-board-2026-11-13.json', reason: '訪問記録の配列ではない' },
    ]);
  });
});
