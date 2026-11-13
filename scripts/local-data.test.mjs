import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HttpError, isTrustedRequest, listAnswers, readArticlePart, readCheckFile, scanArticles, writeCheckFile,
} from './local-data.mjs';

let dir;

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
    await put('articles/0005-rec-1/standard/paid-part.html', 'p');
    await put('articles/0005-rec-1/names/tags.txt', 'g');
    await put('articles/memo/standard/title.txt', 'x');
    await put('articles/0006-rec-2/standard/other.txt', 'x');
    const drafts = await scanArticles(path.join(dir, 'articles'));
    expect(drafts).toEqual([{
      recordId: 'rec-1',
      folderName: '0005-rec-1',
      variants: [
        { disclosure: 'paid', parts: ['title', 'paidPart'], updatedAt: expect.any(Number) },
        { disclosure: 'free', parts: ['tags'], updatedAt: expect.any(Number) },
      ],
    }]);
  });

  it('原稿を1ファイル読み、規則に合わない指定とフォルダの外は断る', async () => {
    await put('articles/0005-rec-1/standard/free-part.html', '<p>無料</p>');
    await put('secret.txt', 'secret');
    const articles = path.join(dir, 'articles');
    expect(await readArticlePart(articles, '0005-rec-1', 'paid', 'freePart')).toBe('<p>無料</p>');
    for (const [folder, disclosure, part] of [
      ['..', 'paid', 'freePart'], ['0005-..', 'paid', 'title'], ['0005-a/../..', 'paid', 'title'],
      ['0005-rec-1', 'standard', 'title'], ['0005-rec-1', 'paid', '../../secret.txt'],
    ]) {
      await expect(readArticlePart(articles, folder, disclosure, part)).rejects.toBeInstanceOf(HttpError);
    }
    await expect(readArticlePart(articles, '0005-rec-1', 'paid', 'title')).rejects.toMatchObject({ status: 404 });
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
