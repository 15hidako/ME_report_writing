import { createServer, request as httpRequest } from 'node:http';
import { Readable } from 'node:stream';
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHandler, HttpError, isTrustedRequest, listAnswers, localDataPlugin, readArticlePart, readCheckFile, scanArticles, writeArticlePart, writeCheckFile,
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

const io = vi.hoisted(() => ({ beforeWrite: null, beforeRename: null }));
vi.mock('node:fs/promises', async (original) => {
  const fs = await original();
  return { ...fs,
    writeFile: async (...args) => { if (io.beforeWrite) await io.beforeWrite(...args); return fs.writeFile(...args); },
    rename: async (...args) => { if (io.beforeRename) await io.beforeRename(...args); return fs.rename(...args); },
  };
});
afterEach(() => { io.beforeWrite = null; io.beforeRename = null; });

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function callHandler(handler, url, method = 'GET', body = '') {
  const req = Readable.from(body === '' ? [] : [Buffer.from(body)]);
  Object.assign(req, { url, method, headers: { host: 'localhost:5183', origin: 'http://localhost:5183' } });
  const res = { statusCode: 0, setHeader() {}, end(text) { this.body = text; } };
  await handler(req, res, () => { res.statusCode = 299; });
  return res;
}

describe('確認ファイルの保存競合', () => {
  it('先行書込が止まっても同じ保存先の本文を混ぜず、別ファイルは進む', async () => {
    const entered = deferred(); const release = deferred();
    let writes = 0;
    io.beforeWrite = async (file) => {
      if (String(file).includes('targets.json') && ++writes === 1) { entered.resolve(); await release.promise; }
    };
    const first = writeCheckFile(dir, 'targets.json', '{"long":"' + 'a'.repeat(10000) + '"}');
    await entered.promise;
    const second = writeCheckFile(dir, 'targets.json', '{"short":2}');
    await writeCheckFile(dir, 'board-backup.json', '{}');
    const simultaneous = writes;
    release.resolve();
    const results = await Promise.allSettled([first, second]);
    expect(simultaneous).toBe(1);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await readFile(path.join(dir, 'targets.json'), 'utf8')).toBe('{"short":2}');
    expect((await readdir(dir)).sort()).toEqual(['board-backup.json', 'targets.json']);
  });
  it.each(['write', 'rename'])('%s失敗でも旧JSONと後続保存を保ち、一時ファイルを残さない', async (failure) => {
    await writeCheckFile(dir, 'targets.json', '{"old":true}');
    const key = failure === 'write' ? 'beforeWrite' : 'beforeRename';
    io[key] = () => { throw new Error('synthetic I/O failure'); };
    await expect(writeCheckFile(dir, 'targets.json', '{"bad":true}')).rejects.toThrow('synthetic');
    io[key] = null;
    expect(await readCheckFile(dir, 'targets.json')).toBe('{"old":true}');
    expect(await readdir(dir)).toEqual(['targets.json']);
    await writeCheckFile(dir, 'targets.json', '{"next":true}');
    expect(await readCheckFile(dir, 'targets.json')).toBe('{"next":true}');
  });
  it('別タブが対象を差し替えたら実行を409にする', async () => {
    const handler = createHandler(dir);
    await callHandler(handler, '/__local/checks/targets.json', 'PUT', '{"a":1}');
    await callHandler(handler, '/__local/checks/targets.json', 'PUT', '{"b":2}');
    expect((await callHandler(handler, '/__local/weekly-check', 'POST', '{"a":1}')).statusCode).toBe(409);
  });
});


describe('週次実行中の排他', () => {
  it('対象更新と二重実行を断り、今回の結果を応答内で返す。失敗後も再実行できる', async () => {
    await put('scripts/weekly-check.mjs', `
      import { writeFile, access } from 'node:fs/promises';
      import path from 'node:path';
      const dir = process.argv[2];
      await writeFile(path.join(dir, 'entered'), '');
      while (true) { try { await access(path.join(dir, 'release')); break; } catch { await new Promise(r => setTimeout(r, 10)); } }
      await writeFile(path.join(dir, 'checks.json'), '{"version":1,"results":[]}');
    `);
    const handler = createHandler(dir);
    const route = '/__local/checks/targets.json';
    expect((await callHandler(handler, route, 'PUT', '{}')).statusCode).toBe(200);
    const running = callHandler(handler, '/__local/weekly-check', 'POST', '{}');
    await vi.waitFor(async () => expect(await readFile(path.join(dir, 'data/checks/entered'), 'utf8')).toBe(''));
    expect((await callHandler(handler, route, 'PUT', '{"other":1}')).statusCode).toBe(409);
    expect((await callHandler(createHandler(dir), '/__local/weekly-check', 'POST', '{}')).statusCode).toBe(409);
    await put('data/checks/release');
    const response = await running;
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).checks).toBe('{"version":1,"results":[]}');
    expect(await readFile(path.join(dir, 'data/checks/targets.json'), 'utf8')).toBe('{}');
    await put('scripts/weekly-check.mjs', 'process.exit(1)');
    expect((await callHandler(handler, '/__local/weekly-check', 'POST', '{}')).statusCode).toBe(500);
    expect((await callHandler(handler, route, 'PUT', '{"next":1}')).statusCode).toBe(200);
  });
});


describe('APIのURL解析', () => {
  it.each(['%ZZ', '%E3%81'])('不正エンコード%sを400で完了する', async (encoded) => {
    const response = await callHandler(createHandler(dir), `/__local/articles/${encoded}/paid/title`);
    expect(response.statusCode).toBe(400);
  });
  it('API外は次へ渡し、日本語フォルダを読め、パス逸脱を断る', async () => {
    const handler = createHandler(dir);
    expect((await callHandler(handler, '/outside/%ZZ')).statusCode).toBe(299);
    await put('data/articles/0001-合成/standard/title.txt', '合成タイトル');
    expect(JSON.parse((await callHandler(handler, '/__local/articles/0001-%E5%90%88%E6%88%90/paid/title')).body).text).toBe('合成タイトル');
    expect((await callHandler(handler, '/__local/articles/%2e%2e%2fsecret/paid/title')).statusCode).toBe(400);
  });
  it('HTTP経由の不正URLも応答を完了し、その後の正常要求に応答する', async () => {
    const handler = createHandler(dir);
    const server = createServer((req, res) => { void handler(req, res, () => res.end('next')); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const get = (url) => new Promise((resolve, reject) => {
        httpRequest({ hostname: '127.0.0.1', port: server.address().port, path: url, headers: { host: 'localhost:5183' } }, (res) => {
          res.resume(); res.on('end', () => resolve(res.statusCode));
        }).on('error', reject).end();
      });
      expect(await get('/__local/%ZZ')).toBe(400);
      expect(await get('/__local/status')).toBe(200);
    } finally { await new Promise((resolve) => server.close(resolve)); }
  });
});
