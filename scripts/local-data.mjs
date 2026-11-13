// PJフォルダ内の data/(gitignore済み)を、ローカルの開発サーバー経由でボードに読み書きさせる。
// 回答・原稿・週次確認の受け渡しをすべてここに置き、ブラウザのフォルダ選択を使わない。
// 実データはリポジトリへ入れない。公開ビルド(GitHub Pages)にはこのAPIはない。
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ARTICLE_PARTS, VARIANT_DIRS, isSourcePart, recordIdOfFolder } from '../src/prompt/article-files.ts';
import { recordBase, recordEdit } from './article-history.mjs';

export const API_PREFIX = '/__local';
const MAX_ANSWER_BYTES = 1024 * 1024;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
/** ボードが書く2つと、週次確認のスクリプトが書く1つ */
const CHECK_FILES = ['targets.json', 'checks.json', 'board-backup.json'];
const WRITABLE_CHECK_FILES = ['targets.json', 'board-backup.json'];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const writingArticles = new Set();
const checkWrites = new Map();
const checkingDirs = new Set();

/** @param {string} root リポジトリのルート */
export function dataDirs(root) {
  const data = path.join(root, 'data');
  return { answers: path.join(data, 'answers'), articles: path.join(data, 'articles'), checks: path.join(data, 'checks') };
}

/** @param {unknown} error */
const isMissing = (error) => error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');

/** フォルダがまだなければ空として扱う */
async function entries(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

/**
 * 回答データフォルダの JSON を、古い順に中身ごと返す。どれを取り込むかはボードが決める。
 * @returns {Promise<{ name: string; modifiedAt: number; text: string }[]>}
 */
export async function listAnswers(dir) {
  const files = (await entries(dir)).filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'));
  const listed = await Promise.all(files.map(async (entry) => {
    const file = path.join(dir, entry.name);
    const info = await stat(file);
    if (info.size > MAX_ANSWER_BYTES) return null;
    return { name: entry.name, modifiedAt: info.mtimeMs, text: await readFile(file, 'utf8') };
  }));
  return listed.filter((item) => item !== null).sort((a, b) => a.modifiedAt - b.modifiedAt || a.name.localeCompare(b.name));
}

/**
 * 原稿フォルダ直下の「通し番号-回答ID」フォルダを読み、書き出された部分を返す。
 * times は部分ごとの更新時刻。素の文章とHTMLのどちらが新しいかで、マークアップし直しが要るかをボードが決める
 * @returns {Promise<{ recordId: string; folderName: string; variants: { disclosure: string; parts: string[]; updatedAt: number; times: Record<string, number> }[] }[]>}
 */
export async function scanArticles(dir) {
  const drafts = [];
  for (const entry of await entries(dir)) {
    if (!entry.isDirectory()) continue;
    const recordId = recordIdOfFolder(entry.name);
    if (recordId === null) continue;
    const variants = [];
    for (const [disclosure, sub] of Object.entries(VARIANT_DIRS)) {
      const found = [];
      for (const part of ARTICLE_PARTS) {
        try {
          const info = await stat(path.join(dir, entry.name, sub, part.file));
          if (info.isFile()) found.push({ part: part.id, updatedAt: info.mtimeMs });
        } catch (error) {
          if (!isMissing(error)) throw error;
        }
      }
      if (found.length > 0) {
        variants.push({
          disclosure,
          parts: found.map((item) => item.part),
          updatedAt: Math.max(...found.map((item) => item.updatedAt)),
          times: Object.fromEntries(found.map((item) => [item.part, item.updatedAt])),
        });
      }
    }
    if (variants.length > 0) drafts.push({ recordId, folderName: entry.name, variants });
  }
  return drafts;
}

/** 原稿の1ファイルの場所。名前は規則どおりのものだけ受け付け、data/articles の外を指させない */
function articleFile(dir, folderName, disclosure, partId) {
  const sub = Object.hasOwn(VARIANT_DIRS, disclosure) ? VARIANT_DIRS[disclosure] : undefined;
  const part = ARTICLE_PARTS.find((item) => item.id === partId);
  if (recordIdOfFolder(folderName) === null || /[\\/]|^\.\.?$/.test(folderName) || sub === undefined || part === undefined) {
    throw new HttpError(400, '原稿の指定が正しくありません');
  }
  return { variantDir: path.join(dir, folderName, sub), file: path.join(dir, folderName, sub, part.file), partFile: part.file };
}

/**
 * 原稿の1ファイルと、その更新時刻。
 * @returns {Promise<{ text: string; modifiedAt: number }>}
 */
export async function readArticlePart(dir, folderName, disclosure, partId) {
  const { file } = articleFile(dir, folderName, disclosure, partId);
  try {
    const handle = await open(file, 'r');
    try {
      const before = await handle.stat();
      const text = await handle.readFile('utf8');
      const after = await handle.stat();
      if (before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.size !== after.size) {
        throw new HttpError(409, '読み込み中に原稿が変わりました。開き直してください');
      }
      return { text, modifiedAt: after.mtimeMs };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (isMissing(error)) throw new HttpError(404, '原稿ファイルが見つかりません。ボードを読み込み直してください');
    throw error;
  }
}

/** ファイルがなければ 0 */
async function modifiedAtOf(file) {
  try {
    return (await stat(file)).mtimeMs;
  } catch (error) {
    if (isMissing(error)) return 0;
    throw error;
  }
}

/**
 * ボードで直した素の文章を書く。HTMLは Claude がマークアップで書くので、ボードからは書かせない。
 * 読んだあとに Claude などが同じファイルを書き換えていれば、上書きせずに断る。
 * 保存の前後に、上書きされる文章(base)と直した文章(edit)を版フォルダの .history に残す(article-history.mjs)。
 * @param {number} baseModifiedAt 読んだときの更新時刻。ファイルがなかったときは 0
 * @returns {Promise<number>} 書いたあとの更新時刻
 */
export async function writeArticlePart(dir, folderName, disclosure, partId, text, baseModifiedAt) {
  if (!isSourcePart(partId)) throw new HttpError(400, 'ボードから書けるのは素の文章だけです');
  const { variantDir, file, partFile } = articleFile(dir, folderName, disclosure, partId);
  if (writingArticles.has(file)) throw new HttpError(409, '同じ原稿を保存中です。保存が終わってから開き直してください');
  writingArticles.add(file);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    let isDir = false;
    try {
      isDir = (await stat(variantDir)).isDirectory();
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    if (!isDir) throw new HttpError(404, '原稿のフォルダが見つかりません。ボードを読み込み直してください');
    if ((await modifiedAtOf(file)) !== baseModifiedAt) {
      throw new HttpError(409, '開いたあとに原稿ファイルが書き換えられています。閉じて開き直してください');
    }
    await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
    if ((await modifiedAtOf(file)) !== baseModifiedAt) {
      throw new HttpError(409, '開いたあとに原稿ファイルが書き換えられています。閉じて開き直してください');
    }
    // 上書きが決まってから base を残す。残せなければ保存もしない(生成時の文章を失わないため)
    await recordBase(variantDir, partFile, baseModifiedAt === 0 ? null : await readFile(file, 'utf8'));
    await rename(temporary, file);
    const modifiedAt = await modifiedAtOf(file);
    try {
      await recordEdit(variantDir, partFile, text);
    } catch (error) {
      // 原稿は保存済み。ここで失敗を返すとボードが保存失敗と見なし、次の保存が 409 になるため、成功を返して開発サーバーに記録する
      process.stderr.write(`[local-data] 原稿は保存しましたが、手直しの履歴を残せませんでした(${file}): ${error instanceof Error ? error.message : String(error)}
`);
    }
    return modifiedAt;
  } finally {
    writingArticles.delete(file);
    await rm(temporary, { force: true });
  }
}

/** 週次確認の受け渡しファイル。まだなければ null */
export async function readCheckFile(dir, name) {
  if (!CHECK_FILES.includes(name)) throw new HttpError(400, `読めないファイルです: ${name}`);
  try {
    return await readFile(path.join(dir, name), 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** 書き途中のファイルを読ませないよう、一時ファイルから置き換える */
export async function writeCheckFile(dir, name, text) {
  if (!WRITABLE_CHECK_FILES.includes(name)) throw new HttpError(400, `書けないファイルです: ${name}`);
  JSON.parse(text);
  const target = path.resolve(dir, name);
  if (name === 'targets.json' && checkingDirs.has(path.resolve(dir))) throw new HttpError(409, '週次確認を実行中です。終了後にやり直してください');
  const previous = checkWrites.get(target) ?? Promise.resolve();
  const saving = previous.catch(() => {}).then(async () => {
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  });
  checkWrites.set(target, saving);
  try {
    await saving;
  } finally {
    if (checkWrites.get(target) === saving) checkWrites.delete(target);
  }
}

/** scripts/weekly-check.mjs を子プロセスで動かし、終わるまで待つ */
export function runWeeklyCheck(root, checksDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', 'weekly-check.mjs'), checksDir], { cwd: root });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `週次確認が終了コード ${code} で止まりました`));
    });
  });
}

export class HttpError extends Error {
  /** @param {number} status @param {string} message */
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * このPCのボードからの要求だけを通す。別のサイトからの書き込みと、localhost 以外の名前での接続を断る。
 * @param {{ method?: string; headers: Record<string, string | string[] | undefined> }} req
 */
export function isTrustedRequest(req) {
  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  const hostname = host.replace(/:\d+$/, '').toLowerCase();
  if (!LOCAL_HOSTS.has(hostname)) return false;
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return false;
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.origin;
  if (typeof origin !== 'string') return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, '送られた内容が大きすぎます'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(text);
}

/** API の中身。Vite の開発サーバーとプレビューサーバーの両方に付ける */
export function createHandler(root) {
  const dirs = dataDirs(root);

  return async (req, res, next) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) return next();
      if (!isTrustedRequest(req)) return send(res, 403, { error: 'このPCのボードからだけ使えます' });
      const route = url.pathname.slice(API_PREFIX.length).split('/').filter((part) => part !== '').map(decodeURIComponent);
      const [head, ...rest] = route;
      if (req.method === 'GET' && head === 'status' && rest.length === 0) {
        return send(res, 200, { articleDir: dirs.articles });
      }
      if (req.method === 'GET' && head === 'answers' && rest.length === 0) {
        return send(res, 200, { files: await listAnswers(dirs.answers) });
      }
      if (req.method === 'GET' && head === 'articles' && rest.length === 0) {
        return send(res, 200, { drafts: await scanArticles(dirs.articles) });
      }
      if (head === 'articles' && rest.length === 3) {
        const [folderName, disclosure, part] = rest;
        if (req.method === 'GET') return send(res, 200, await readArticlePart(dirs.articles, folderName, disclosure, part));
        if (req.method === 'PUT') {
          const base = Number(req.headers['x-base-modified-at']);
          if (!Number.isFinite(base)) throw new HttpError(400, '読んだときの更新時刻がありません');
          const modifiedAt = await writeArticlePart(dirs.articles, folderName, disclosure, part, await readBody(req), base);
          return send(res, 200, { modifiedAt });
        }
      }
      if (head === 'checks' && rest.length === 1) {
        const [name] = rest;
        if (req.method === 'GET') {
          const text = await readCheckFile(dirs.checks, name);
          return text === null ? send(res, 404, { error: `${name} はまだありません` }) : send(res, 200, text);
        }
        if (req.method === 'PUT') {
          await writeCheckFile(dirs.checks, name, await readBody(req));
          return send(res, 200, { ok: true });
        }
      }
      if (req.method === 'POST' && head === 'weekly-check' && rest.length === 0) {
        const key = path.resolve(dirs.checks);
        if (checkingDirs.has(key)) return send(res, 409, { error: '週次確認を実行中です' });
        checkingDirs.add(key);
        try {
          const expected = await readBody(req);
          JSON.parse(expected);
          await checkWrites.get(path.resolve(dirs.checks, 'targets.json'));
          if (await readCheckFile(dirs.checks, 'targets.json') !== expected) throw new HttpError(409, '確認対象が変更されています。週次確認をやり直してください');
          const output = await runWeeklyCheck(root, dirs.checks);
          const checks = await readCheckFile(dirs.checks, 'checks.json');
          if (checks === null) throw new Error('週次確認の結果がありません');
          return send(res, 200, { output, checks });
        } finally {
          checkingDirs.delete(key);
        }
      }
      return send(res, 404, { error: '不明な操作です' });
    } catch (error) {
      if (error instanceof URIError || (error instanceof TypeError && 'code' in error && error.code === 'ERR_INVALID_URL')) return send(res, 400, { error: 'URLの形式が正しくありません' });
      if (error instanceof SyntaxError) return send(res, 400, { error: `JSONとして読めません: ${error.message}` });
      const status = error instanceof HttpError ? error.status : 500;
      return send(res, status, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}

/**
 * Vite のプラグイン。開発サーバー(serve)のときだけ、原稿の保存先を記事プロンプトへ渡す。
 * テスト(vitest)では各テストが保存先を決めるので渡さない。
 */
export function localDataPlugin(root) {
  return {
    name: 'local-data',
    config(_config, { command }) {
      if (command === 'build') {
        return { define: { 'import.meta.env.VITE_ARTICLE_DIR': JSON.stringify('') } };
      }
      if (command === 'serve' && process.env['VITEST'] === undefined) {
        // .env.local の古い設定より、PJ内の data/articles を優先する
        process.env['VITE_ARTICLE_DIR'] = dataDirs(root).articles;
      }
    },
    configureServer(server) {
      server.middlewares.use(createHandler(root));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createHandler(root));
    },
  };
}
