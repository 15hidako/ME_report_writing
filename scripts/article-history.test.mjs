import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectEdits, diffLines, formatEdits, HISTORY_DIR, snapshotsOf } from './article-history.mjs';
import { readArticlePart, writeArticlePart } from './local-data.mjs';

let dir;
const articles = () => path.join(dir, 'articles');
const variant = () => path.join(articles(), '0005-rec-1', 'standard');

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'me-article-history-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function put(relative, text) {
  const file = path.join(articles(), relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, 'utf8');
  return file;
}

async function save(partId, text) {
  const { modifiedAt } = await readArticlePart(articles(), '0005-rec-1', 'paid', partId).catch(() => ({ modifiedAt: 0 }));
  return writeArticlePart(articles(), '0005-rec-1', 'paid', partId, text, modifiedAt);
}

const texts = async (partFile) => Promise.all((await snapshotsOf(variant(), partFile))
  .map(async (snapshot) => [snapshot.kind, await readFile(snapshot.file, 'utf8')]));

describe('ボードで保存したときの手直し履歴', () => {
  it('初めての保存では、生成された文章を base、直した文章を edit として残す', async () => {
    await put('0005-rec-1/standard/free-part.txt', '生成');
    await save('freeText', '手直し');
    expect(await texts('free-part.txt')).toEqual([['base', '生成'], ['edit', '手直し']]);
  });

  it('続けて保存しても base は増やさず、edit を順に重ねる', async () => {
    await put('0005-rec-1/standard/free-part.txt', '生成');
    await save('freeText', '1回目');
    await save('freeText', '2回目');
    expect(await texts('free-part.txt')).toEqual([['base', '生成'], ['edit', '1回目'], ['edit', '2回目']]);
  });

  it('保存のあいだに Claude が書き直していれば、その文章を新しい base にする', async () => {
    const file = await put('0005-rec-1/standard/free-part.txt', '生成');
    await save('freeText', '手直し');
    await writeFile(file, '再生成', 'utf8');
    await utimes(file, 9000, 9000);
    await save('freeText', '再手直し');
    expect(await texts('free-part.txt')).toEqual([['base', '生成'], ['edit', '手直し'], ['base', '再生成'], ['edit', '再手直し']]);
  });

  it('まだなかった部分は edit だけを残す', async () => {
    await put('0005-rec-1/standard/title.txt', 't');
    await save('tags', 'a,b');
    expect(await texts('tags.txt')).toEqual([['edit', 'a,b']]);
  });

  it('上書きを断った保存では履歴を残さない', async () => {
    const file = await put('0005-rec-1/standard/free-part.txt', '生成');
    await utimes(file, 6000, 6000);
    await expect(writeArticlePart(articles(), '0005-rec-1', 'paid', 'freeText', '本人', 5_000_000)).rejects.toMatchObject({ status: 409 });
    expect(await readdir(variant())).toEqual(['free-part.txt']);
  });

  it('履歴はその版のフォルダの .history に部分ごとに置く', async () => {
    await put('0005-rec-1/standard/paid-part.txt', '生成');
    await save('paidText', '手直し');
    expect(await readdir(path.join(variant(), HISTORY_DIR))).toEqual(['paid-part.txt']);
  });
});

describe('行の差分', () => {
  it('同じ行を残し、消えた行と足した行を順に並べる', () => {
    expect(diffLines('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { op: ' ', line: 'a' }, { op: '-', line: 'b' }, { op: '+', line: 'B' }, { op: ' ', line: 'c' }, { op: '+', line: 'd' },
    ]);
  });

  it('同じ文章なら変更なし', () => {
    expect(diffLines('a\nb', 'a\nb').every((item) => item.op === ' ')).toBe(true);
  });
});

describe('手直しの一覧', () => {
  it('最新の base と今の原稿を比べ、変わった部分だけを返す', async () => {
    await put('0005-rec-1/standard/free-part.txt', '導入\n本文');
    await put('0005-rec-1/standard/paid-part.txt', '有料');
    await save('freeText', '導入\n直した本文');
    await save('paidText', '有料');
    const edits = await collectEdits(articles());
    expect(edits).toEqual([{
      folderName: '0005-rec-1', variant: 'standard', partFile: 'free-part.txt',
      baseName: expect.stringMatching(/-base\.txt$/),
      diff: [{ op: ' ', line: '導入' }, { op: '-', line: '本文' }, { op: '+', line: '直した本文' }],
    }]);
    const text = formatEdits(edits);
    expect(text).toContain('## 0005-rec-1/standard/free-part.txt');
    expect(text).toContain('- 本文\n+ 直した本文');
    expect(text).not.toContain('  導入');
  });

  it('記事を絞り込める', async () => {
    await put('0005-rec-1/standard/free-part.txt', 'a');
    await save('freeText', 'b');
    expect(await collectEdits(articles(), '0006')).toEqual([]);
    expect(await collectEdits(articles(), '0005')).toHaveLength(1);
  });

  it('原稿フォルダがなければ空にする', async () => {
    expect(await collectEdits(path.join(dir, 'none'))).toEqual([]);
  });
});

describe('履歴を残せないとき', () => {
  it('上書きされる文章を base に残せなければ、原稿も保存しない', async () => {
    await put('0005-rec-1/standard/free-part.txt', '生成');
    await save('freeText', '1回目');
    const historyOfPart = path.join(variant(), HISTORY_DIR, 'free-part.txt');
    await rm(historyOfPart, { recursive: true });
    await writeFile(historyOfPart, 'ふさぐ', 'utf8');
    await expect(save('freeText', '2回目')).rejects.toThrow();
    expect(await readFile(path.join(variant(), 'free-part.txt'), 'utf8')).toBe('1回目');
    expect((await readdir(variant())).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
