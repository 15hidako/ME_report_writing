// 開発サーバーの data/ API(scripts/local-data.mjs)を呼ぶ。ボードが読み書きするファイルはすべてここを通る。

import { ARTICLE_PARTS, VARIANT_DIRS, type ArticlePart, type SourcePart } from '../prompt/article-files';
import type { NameDisclosure } from '../prompt/style-profile';
import type { ArticleDraft, DraftVariant } from './articles';

const PREFIX = './__local';

export interface AnswerFile {
  readonly name: string;
  readonly modifiedAt: number;
  readonly text: string;
}

export type CheckFile = 'targets.json' | 'checks.json' | 'board-backup.json';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function errorOf(response: Response): Promise<Error> {
  let message = `ローカルのデータを扱えませんでした(${response.status})`;
  try {
    const body: unknown = await response.json();
    if (isObject(body) && typeof body['error'] === 'string') message = body['error'];
  } catch {
    // 本文がJSONでなければ状態コードだけを伝える
  }
  return new Error(message);
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${PREFIX}/${path}`, { cache: 'no-store', ...init });
  } catch {
    throw new Error('ローカルのデータに届きません。start.bat で開いたボードから使ってください');
  }
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const response = await request(path, init);
  if (!response.ok) throw await errorOf(response);
  return response;
}

async function json(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const body: unknown = await (await call(path, init)).json();
  if (!isObject(body)) throw new Error('ローカルのデータの形式が正しくありません');
  return body;
}

/** API があるか。GitHub Pages やビルド版では false */
export async function localDataAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${PREFIX}/status`, { cache: 'no-store' });
    if (!response.ok) return false;
    const body: unknown = await response.json();
    return isObject(body) && typeof body['articleDir'] === 'string';
  } catch {
    return false;
  }
}

export async function fetchAnswerFiles(onWarning?: (message: string) => void): Promise<AnswerFile[]> {
  const { files, filingError } = await json('answers');
  if (typeof filingError === 'string') onWarning?.(filingError);
  if (!Array.isArray(files)) throw new Error('回答データの一覧が読めません');
  return files.map((file: unknown): AnswerFile => {
    if (!isObject(file) || typeof file['name'] !== 'string' || typeof file['modifiedAt'] !== 'number' || typeof file['text'] !== 'string') {
      throw new Error('回答データの一覧が読めません');
    }
    return { name: file['name'], modifiedAt: file['modifiedAt'], text: file['text'] };
  });
}

const DISCLOSURES = Object.keys(VARIANT_DIRS) as NameDisclosure[];
const PART_IDS = ARTICLE_PARTS.map((part) => part.id) as readonly ArticlePart[];

function parseVariant(value: unknown): DraftVariant {
  if (!isObject(value)) throw new Error('原稿の一覧が読めません');
  const disclosure = DISCLOSURES.find((item) => item === value['disclosure']);
  const parts = Array.isArray(value['parts']) ? value['parts'] : null;
  const updatedAt = value['updatedAt'];
  const rawTimes = value['times'];
  if (disclosure === undefined || parts === null || typeof updatedAt !== 'number' || !isObject(rawTimes)) {
    throw new Error('原稿の一覧が読めません');
  }
  const times = Object.fromEntries(PART_IDS.flatMap((id) => {
    const at = rawTimes[id];
    return typeof at === 'number' ? [[id, at]] : [];
  })) as Partial<Record<ArticlePart, number>>;
  return { disclosure, parts: PART_IDS.filter((id) => parts.includes(id)), updatedAt, times };
}

/** 回答ID → 原稿 */
export async function fetchDrafts(): Promise<Map<string, ArticleDraft>> {
  const { drafts } = await json('articles');
  if (!Array.isArray(drafts)) throw new Error('原稿の一覧が読めません');
  return new Map(drafts.map((draft: unknown): [string, ArticleDraft] => {
    if (!isObject(draft) || typeof draft['recordId'] !== 'string' || typeof draft['folderName'] !== 'string' || !Array.isArray(draft['variants'])) {
      throw new Error('原稿の一覧が読めません');
    }
    const recordId = draft['recordId'];
    return [recordId, { recordId, folderName: draft['folderName'], variants: draft['variants'].map(parseVariant) }];
  }));
}

const partPath = (draft: ArticleDraft, disclosure: NameDisclosure, part: ArticlePart): string =>
  `articles/${[draft.folderName, disclosure, part].map(encodeURIComponent).join('/')}`;

export interface PartText {
  readonly text: string;
  /** 読んだときのファイルの更新時刻。書き戻すときに、ほかで書き換えられていないかを確かめる */
  readonly modifiedAt: number;
}

export async function fetchArticlePart(draft: ArticleDraft, disclosure: NameDisclosure, part: ArticlePart): Promise<PartText> {
  const body = await json(partPath(draft, disclosure, part));
  const { text, modifiedAt } = body;
  if (typeof text !== 'string' || typeof modifiedAt !== 'number') throw new Error('原稿ファイルの形式が正しくありません');
  return { text, modifiedAt };
}

/**
 * 素の文章を書き戻し、書いたあとの更新時刻を返す。
 * baseModifiedAt は読んだときの更新時刻(ファイルがなかったときは 0)。ほかで書き換えられていれば断られる
 */
export async function putArticlePart(
  draft: ArticleDraft, disclosure: NameDisclosure, part: SourcePart, text: string, baseModifiedAt: number,
): Promise<number> {
  const { modifiedAt } = await json(partPath(draft, disclosure, part), {
    method: 'PUT',
    body: text,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'x-base-modified-at': String(baseModifiedAt) },
  });
  if (typeof modifiedAt !== 'number') throw new Error('保存の結果が読めません');
  return modifiedAt;
}

/** まだなければ null */
export async function fetchCheckFile(name: CheckFile): Promise<string | null> {
  const response = await request(`checks/${name}`);
  if (response.status === 404) return null;
  if (!response.ok) throw await errorOf(response);
  return response.text();
}

export async function putCheckFile(name: Exclude<CheckFile, 'checks.json'>, text: string): Promise<void> {
  await call(`checks/${name}`, { method: 'PUT', body: text, headers: { 'content-type': 'application/json' } });
}

/** 週次確認を実行し、今回の結果JSONを返す。対象が多いと数分かかる */
export async function runWeeklyCheck(targets: string): Promise<string> {
  const { checks } = await json('weekly-check', { method: 'POST', body: targets, headers: { 'content-type': 'application/json' } });
  if (typeof checks !== 'string') throw new Error('週次確認の結果が読めません');
  return checks;
}

/** サムネのPNGを回答フォルダの直下(thumb.png)へ書き、書いたファイルの場所を返す */
export async function putThumbnail(folderName: string, png: Blob): Promise<string> {
  const { path } = await json(`thumbnails/${encodeURIComponent(folderName)}`, {
    method: 'PUT',
    body: png,
    headers: { 'content-type': 'image/png' },
  });
  if (typeof path !== 'string') throw new Error('サムネの保存の結果が読めません');
  return path;
}
