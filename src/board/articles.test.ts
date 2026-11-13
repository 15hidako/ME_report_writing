// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { fixtureRecord } from '../test-fixtures';
import { articleFolderName, articleSaveSection, recordIdOfFolder } from '../prompt/article-files';
import { advanceDrafted, markupState, type ArticleDraft, type DraftVariant } from './articles';
import { buildCards } from './cards';
import { EMPTY_BOARD, setArticleAngle, setRecordStage, type Stage } from './state';
import { boardHtml } from './view';

const record = { ...fixtureRecord(), id: 'rec-abc', seriesNo: 7 };

const AT = Date.parse('2026-11-12T05:03:00Z');

/** times の部分を書き出された部分とみなす */
function variant(times: DraftVariant['times'], disclosure: DraftVariant['disclosure'] = 'paid'): DraftVariant {
  const parts = Object.keys(times) as DraftVariant['parts'][number][];
  return { disclosure, parts, updatedAt: Math.max(...Object.values(times)), times };
}

const SOURCE = { title: AT, tags: AT, freeText: AT, paidText: AT };

function draft(recordId: string, variants: readonly DraftVariant[] = [variant(SOURCE)]): ArticleDraft {
  return { recordId, folderName: `0007-${recordId}`, variants };
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
    expect(section).toContain('C:\\Articles\\0007-rec-abc\\names\\paid-part.txt');
    expect(articleSaveSection('/srv/a', record, 'paid')).toContain('/srv/a/0007-rec-abc/standard/free-part.txt');
  });

  it('記事プロンプトでは素の文章だけを保存させ、HTMLは書かせない', () => {
    expect(articleSaveSection('/srv/a', record, 'paid')).not.toContain('.html');
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

describe('投稿用HTMLの状態', () => {
  it('両方の本文のHTMLが素の文章より新しければ貼れる', () => {
    expect(markupState(variant({ ...SOURCE, freeHtml: AT + 1, paidHtml: AT }))).toBe('ready');
  });

  it('まだHTMLがなければマークアップ前、片方でも素の文章のほうが新しければ未反映', () => {
    expect(markupState(variant(SOURCE))).toBe('none');
    expect(markupState(variant({ ...SOURCE, freeHtml: AT + 1 }))).toBe('stale');
    expect(markupState(variant({ ...SOURCE, freeHtml: AT + 1, paidHtml: AT - 1 }))).toBe('stale');
  });

  it('素の文章がない、この規則より前のHTMLだけの原稿は貼れる', () => {
    expect(markupState(variant({ title: AT, freeHtml: AT, paidHtml: AT }))).toBe('ready');
  });
});

describe('カードの原稿表示', () => {
  const rowHtml = (variants: readonly DraftVariant[]): string =>
    boardHtml(buildCards([record], EMPTY_BOARD, new Date(), new Map([[record.id, draft(record.id, variants)]])), 'all');
  /** コピーボタンは部分の id、マークアップは markup として並びを返す */
  const parts = (html: string): string[] =>
    [...html.matchAll(/data-act="(copy-part|markup)"[^>]*?(?:data-part="([^"]+)"|>)/g)].map((match) => match[2] ?? match[1]!);

  it('マークアップ前は読むボタンと、タイトル・タグのコピーと、マークアップを出す', () => {
    const html = rowHtml([variant(SOURCE)]);
    expect(html).toContain('data-act="read"');
    expect(html).toContain('data-markup="none"');
    expect(parts(html)).toEqual(['title', 'tags', 'markup']);
  });

  it('HTMLができたら本文はHTMLをコピーする', () => {
    const html = rowHtml([variant({ ...SOURCE, freeHtml: AT + 1, paidHtml: AT + 1 })]);
    expect(html).toContain('data-markup="ready"');
    expect(parts(html)).toEqual(['title', 'tags', 'freeHtml', 'paidHtml']);
  });

  it('直した文章がHTMLに入っていなければ、古いHTMLは出さずにマークアップし直させる', () => {
    const html = rowHtml([variant({ ...SOURCE, freeHtml: AT - 1, paidHtml: AT - 1 })]);
    expect(html).toContain('data-markup="stale"');
    expect(html).toContain('直した文章をマークアップし直す');
    expect(parts(html)).toEqual(['title', 'tags', 'markup']);
  });

  it('HTMLだけの古い原稿は読む画面を出さず、コピーだけにする', () => {
    const html = rowHtml([variant({ title: AT, freeHtml: AT })]);
    expect(html).not.toContain('data-act="read"');
    expect(parts(html)).toEqual(['title', 'freeHtml']);
  });

  it('販売型に対応する側の原稿を先に並べ、もう一方も残す', () => {
    const both: ArticleDraft = draft(record.id, [variant({ title: AT }, 'paid'), variant({ title: AT + 60_000 }, 'free')]);
    const order = (state: typeof EMPTY_BOARD): string[] => {
      const html = boardHtml(buildCards([record], state, new Date(), new Map([[record.id, both]])), 'all');
      return [...html.matchAll(/class="draft-name">([^<]+)</g)].map((match) => match[1]!);
    };
    expect(order(EMPTY_BOARD)).toEqual(['通常版', '名前公開版']);
    expect(order(setArticleAngle(EMPTY_BOARD, record.id, 'therapist'))).toEqual(['名前公開版', '通常版']);
    expect(order(setArticleAngle(EMPTY_BOARD, record.id, 'experience'))).toEqual(['通常版', '名前公開版']);
  });

  it('原稿がなければ何も出さない', () => {
    expect(boardHtml(buildCards([record], EMPTY_BOARD, new Date()), 'all')).not.toContain('class="draft"');
  });
});
