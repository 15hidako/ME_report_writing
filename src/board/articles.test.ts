// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { fixtureRecord } from '../test-fixtures';
import { articleFolderName, articleSaveSection, recordIdOfFolder } from '../prompt/article-files';
import { advanceDrafted, type ArticleDraft } from './articles';
import { buildCards } from './cards';
import { EMPTY_BOARD, setRecordStage, type Stage } from './state';
import { boardHtml } from './view';

const record = { ...fixtureRecord(), id: 'rec-abc', seriesNo: 7 };

function draft(recordId: string): ArticleDraft {
  return {
    recordId, folderName: `0007-${recordId}`,
    variants: [{ disclosure: 'paid', parts: ['title', 'freePart'], updatedAt: Date.parse('2026-11-12T05:03:00Z') }],
  };
}

describe('原稿フォルダの名前', () => {
  it('通し番号4桁と回答IDで作り、回答IDを読み戻せる', () => {
    const name = articleFolderName(record);
    expect(name).toBe('0007-rec-abc');
    expect(recordIdOfFolder(name)).toBe('rec-abc');
  });

  it('規則に合わない名前は無視する', () => {
    expect(recordIdOfFolder('memo')).toBeNull();
    expect(recordIdOfFolder('12-x')).toBeNull();
  });
});

describe('プロンプトの保存指示', () => {
  it('Windowsのパスでは区切りを \\ にし、開示ごとに別フォルダへ保存させる', () => {
    const section = articleSaveSection('C:\\Articles\\', record, 'free');
    expect(section).toContain('C:\\Articles\\0007-rec-abc\\names\\title.txt');
    expect(section).toContain('C:\\Articles\\0007-rec-abc\\names\\paid-part.html');
    expect(articleSaveSection('/srv/a', record, 'paid')).toContain('/srv/a/0007-rec-abc/standard/free-part.html');
  });
});

describe('原稿がある回答の段階', () => {
  const drafts = new Map([['a', draft('a')], ['b', draft('b')], ['c', draft('c')], ['gone', draft('gone')]]);
  const stages: Record<string, Stage> = { a: 'answered', b: 'prompted', c: 'posted' };

  it('推敲前だけを推敲中へ進め、投稿済みと消えた回答は触らない', () => {
    const next = advanceDrafted(EMPTY_BOARD, drafts, (id) => stages[id]);
    expect(next.stages).toEqual({ a: 'editing', b: 'editing' });
  });

  it('進めるものがなければ同じ状態を返す', () => {
    const state = setRecordStage(EMPTY_BOARD, 'a', 'editing');
    expect(advanceDrafted(state, new Map([['a', draft('a')]]), () => 'editing')).toBe(state);
  });
});

describe('カードの原稿表示', () => {
  it('書き出された部分だけコピーボタンを出す', () => {
    const cards = buildCards([record], EMPTY_BOARD, new Date(), new Map([[record.id, draft(record.id)]]));
    const html = boardHtml(cards, 'all');
    expect(html).toContain('data-part="title"');
    expect(html).toContain('data-part="freePart"');
    expect(html).not.toContain('data-part="paidPart"');
  });

  it('原稿がなければ何も出さない', () => {
    expect(boardHtml(buildCards([record], EMPTY_BOARD, new Date()), 'all')).not.toContain('class="draft"');
  });
});
