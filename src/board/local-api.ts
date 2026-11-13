// 開発サーバーの data/ API(scripts/local-data.mjs)を呼ぶ。ボードが読み書きするファイルはすべてここを通る。

import { ARTICLE_PARTS, VARIANT_DIRS, type ArticlePart } from '../prompt/article-files';
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

export async function fetchAnswerFiles(): Promise<AnswerFile[]> {
  const { files } = await json('answers');
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
  if (disclosure === undefined || parts === null || typeof updatedAt !== 'number') throw new Error('原稿の一覧が読めません');
  return { disclosure, parts: PART_IDS.filter((id) => parts.includes(id)), updatedAt };
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

export async function fetchArticlePart(draft: ArticleDraft, disclosure: NameDisclosure, part: ArticlePart): Promise<string> {
  const path = [draft.folderName, disclosure, part].map(encodeURIComponent).join('/');
  return (await call(`articles/${path}`)).text();
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

/** 週次確認を実行し、件数の要約を返す。対象が多いと数分かかる */
export async function runWeeklyCheck(): Promise<string> {
  const { output } = await json('weekly-check', { method: 'POST' });
  return typeof output === 'string' ? output : '';
}
