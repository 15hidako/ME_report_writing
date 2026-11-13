import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HttpError, isTrustedRequest, listAnswers, localDataPlugin, readArticlePart, readCheckFile, scanArticles, writeArticlePart, writeCheckFile,
} from './local-data.mjs';

let dir;

describe('公開用のビルド', () => {
  it('ローカルの原稿保存先を公開物に含めない', () => {
    expect(localDataPlugin('/repo').config({}, { command: 'build' })).toEqual({
      define: { 'import.meta.env.VITE_ARTICLE_DIR': '""' },
    });
  });
});

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'me-local-data-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function put(relative, text = '') {
  const file = path.join(dir, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text, 'utf8');
  return file;
}

describe('回答データの一覧', () => {
  it('JSONだけを古い順に中身ごと返し、フォルダがなければ空にする', async () => {
    const older = await put('answers/b.json', '[1]');
    const newer = await put('answers/a.json', '[2]');
    await put('answers/memo.txt', 'x');
    await utimes(older, 1000, 1000);
    await utimes(newer, 2000, 2000);
    const files = await listAnswers(path.join(dir, 'answers'));
    expect(files.map((file) => [file.name, file.text])).toEqual([['b.json', '[1]'], ['a.json', '[2]']]);
    expect(await listAnswers(path.join(dir, 'missing'))).toEqual([]);
  });
});

describe('原稿フォルダ', () => {
  it('規則どおりのフォルダから、書き出された部分だけを版ごとに返す', async () => {
    await put('articles/0005-rec-1/standard/title.txt', 't');
    await put('articles/0005-rec-1/standard/paid-part.txt', 'p');
    const html = await put('articles/0005-rec-1/standard/paid-part.html', '<p>p</p>');
    await utimes(html, 3000, 3000);
    await put('articles/0005-rec-1/names/tags.txt', 'g');
    await put('articles/memo/standard/title.txt', 'x');
    await put('articles/0006-rec-2/standard/other.txt', 'x');
    const drafts = await scanArticles(path.join(dir, 'articles'));
    expect(drafts).toEqual([{
      recordId: 'rec-1',
      folderName: '0005-rec-1',
      variants: [
        {
          disclosure: 'paid', parts: ['title', 'paidText', 'paidHtml'], updatedAt: expect.any(Number),
          times: { title: expect.any(Number), paidText: expect.any(Number), paidHtml: 3_000_000 },
        },
        { disclosure: 'free', parts: ['tags'], updatedAt: expect.any(Number), times: { tags: expect.any(Number) } },
      ],
    }]);
  });

  it('原稿を1ファイル更新時刻ごと読み、規則に合わない指定とフォルダの外は断る', async () => {
    const file = await put('articles/0005-rec-1/standard/free-part.html', '<p>無料</p>');
    await utimes(file, 4000, 4000);
    await put('secret.txt', 'secret');
    const articles = path.join(dir, 'articles');
    expect(await readArticlePart(articles, '0005-rec-1', 'paid', 'freeHtml')).toEqual({ text: '<p>無料</p>', modifiedAt: 4_000_000 });
    for (const [folder, disclosure, part] of [
      ['..', 'paid', 'freeHtml'], ['0005-..', 'paid', 'title'], ['0005-a/../..', 'paid', 'title'],
      ['0005-rec-1', 'standard', 'title'], ['0005-rec-1', 'paid', '../../secret.txt'],
    ]) {
      await expect(readArticlePart(articles, folder, disclosure, part)).rejects.toBeInstanceOf(HttpError);
    }
    await expect(readArticlePart(articles, '0005-rec-1', 'paid', 'title')).rejects.toMatchObject({ status: 404 });
  });
});

describe('ボードで直した原稿の書き戻し', () => {
  const articles = () => path.join(dir, 'articles');

  it('読んだときと同じ更新時刻なら素の文章を書き、新しい更新時刻を返す', async () => {
    const file = await put('articles/0005-rec-1/standard/free-part.txt', '前');
    await utimes(file, 5000, 5000);
    const modifiedAt = await writeArticlePart(articles(), '0005-rec-1', 'paid', 'freeText', '後', 5_000_000);
    expect(await readFile(file, 'utf8')).toBe('後');
    expect(modifiedAt).not.toBe(5_000_000);
  });

  it('まだない部分は、読んだときの更新時刻 0 で新しく書ける', async () => {
    await put('articles/0005-rec-1/standard/title.txt', 't');
    await writeArticlePart(articles(), '0005-rec-1', 'paid', 'tags', 'a,b', 0);
    expect(await readFile(path.join(articles(), '0005-rec-1/standard/tags.txt'), 'utf8')).toBe('a,b');
  });

  it('同じ原稿を同時に保存しても内容を混ぜず、一方を競合として断る', async () => {
    const file = await put('articles/0005-rec-1/standard/free-part.txt', '前');
    await utimes(file, 5000, 5000);
    const results = await Promise.allSettled(['left', 'right'].map((text) =>
      writeArticlePart(articles(), '0005-rec-1', 'paid', 'freeText', text, 5_000_000)));
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { status: 409 } });
    expect(await readFile(file, 'utf8')).toBe('left');
    expect(await readdir(path.dirname(file))).toEqual(['free-part.txt']);
    const { modifiedAt } = await readArticlePart(articles(), '0005-rec-1', 'paid', 'freeText');
    await writeArticlePart(articles(), '0005-rec-1', 'paid', 'freeText', '再保存', modifiedAt);
    expect(await readFile(file, 'utf8')).toBe('再保存');
  });

  it('開いたあとにほかで書き換えられていれば上書きしない', async () => {
    const file = await put('articles/0005-rec-1/standard/free-part.txt', 'Claude が直した');
    await utimes(file, 6000, 6000);
    await expect(writeArticlePart(articles(), '0005-rec-1', 'paid', 'freeText', '本人', 5_000_000)).rejects.toMatchObject({ status: 409 });
    expect(await readFile(file, 'utf8')).toBe('Claude が直した');
  });

  it('HTMLと、まだない版のフォルダと、規則に合わない指定には書かない', async () => {
    await put('articles/0005-rec-1/standard/free-part.html', '<p>x</p>');
    await expect(writeArticlePart(articles(), '0005-rec-1', 'paid', 'freeHtml', 'x', 0)).rejects.toMatchObject({ status: 400 });
    await expect(writeArticlePart(articles(), '0005-rec-1', 'free', 'title', 'x', 0)).rejects.toMatchObject({ status: 404 });
    await expect(writeArticlePart(articles(), '..', 'paid', 'title', 'x', 0)).rejects.toMatchObject({ status: 400 });
    await expect(writeArticlePart(articles(), '0005-rec-1', 'paid', '../../x', 'x', 0)).rejects.toMatchObject({ status: 400 });
  });
});

describe('週次確認の受け渡しファイル', () => {
  it('決まった名前だけを読み書きし、JSONでない内容は書かない', async () => {
    const checks = path.join(dir, 'checks');
    expect(await readCheckFile(checks, 'checks.json')).toBeNull();
    await writeCheckFile(checks, 'targets.json', '{"version":1}');
    expect(await readFile(path.join(checks, 'targets.json'), 'utf8')).toBe('{"version":1}');
    await expect(writeCheckFile(checks, 'checks.json', '{}')).rejects.toBeInstanceOf(HttpError);
    await expect(writeCheckFile(checks, '../x.json', '{}')).rejects.toBeInstanceOf(HttpError);
    await expect(writeCheckFile(checks, 'board-backup.json', '{')).rejects.toBeInstanceOf(SyntaxError);
    await expect(readCheckFile(checks, '../secret.txt')).rejects.toBeInstanceOf(HttpError);
  });
});

describe('要求の出どころ', () => {
  const request = (method, headers) => ({ method, headers: { host: 'localhost:5173', ...headers } });

  it('このPCの同じ画面からの読み書きを通す', () => {
    expect(isTrustedRequest(request('GET', { 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(isTrustedRequest(request('PUT', { origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });

  it('別のサイトからの要求と、localhost 以外の名前での接続を断る', () => {
    expect(isTrustedRequest(request('GET', { 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(isTrustedRequest(request('POST', { origin: 'https://evil.example' }))).toBe(false);
    expect(isTrustedRequest(request('POST', {}))).toBe(false);
    expect(isTrustedRequest({ method: 'GET', headers: { host: 'evil.example:5173' } })).toBe(false);
  });
});
