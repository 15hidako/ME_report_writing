// Claude Code が原稿フォルダへ書き出した記事を読み、カードに結び付ける。
// 規則は prompt/article-files.ts と共有する。

import { ARTICLE_PARTS, VARIANT_DIRS, recordIdOfFolder, type ArticlePart } from '../prompt/article-files';
import type { NameDisclosure } from '../prompt/style-profile';
import { setRecordStage, type BoardState, type Stage } from './state';

export interface DraftVariant {
  readonly disclosure: NameDisclosure;
  readonly parts: readonly ArticlePart[];
  /** 最後にファイルが更新された時刻(ms) */
  readonly updatedAt: number;
}

export interface ArticleDraft {
  readonly recordId: string;
  readonly folderName: string;
  readonly variants: readonly DraftVariant[];
}

type Entry = FileSystemDirectoryHandle | FileSystemFileHandle;
type IterableDir = FileSystemDirectoryHandle & { values(): AsyncIterable<Entry> };

const DISCLOSURES = Object.keys(VARIANT_DIRS) as NameDisclosure[];

async function childDir(dir: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await dir.getDirectoryHandle(name);
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError')) return null;
    throw error;
  }
}

async function fileOf(dir: FileSystemDirectoryHandle, name: string): Promise<File | null> {
  try {
    return await (await dir.getFileHandle(name)).getFile();
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError')) return null;
    throw error;
  }
}

async function readVariant(recordDir: FileSystemDirectoryHandle, disclosure: NameDisclosure): Promise<DraftVariant | null> {
  const dir = await childDir(recordDir, VARIANT_DIRS[disclosure]);
  if (dir === null) return null;
  const files = await Promise.all(ARTICLE_PARTS.map(async (part) => ({ part: part.id, file: await fileOf(dir, part.file) })));
  const found = files.filter((item): item is { part: ArticlePart; file: File } => item.file !== null);
  if (found.length === 0) return null;
  return {
    disclosure,
    parts: found.map((item) => item.part),
    updatedAt: Math.max(...found.map((item) => item.file.lastModified)),
  };
}

/** 原稿フォルダ直下の「通し番号-回答ID」フォルダを読み、回答ID → 原稿 を返す */
export async function scanArticles(root: FileSystemDirectoryHandle): Promise<Map<string, ArticleDraft>> {
  const drafts = new Map<string, ArticleDraft>();
  for await (const entry of (root as IterableDir).values()) {
    if (entry.kind !== 'directory') continue;
    const recordId = recordIdOfFolder(entry.name);
    if (recordId === null) continue;
    const variants = (await Promise.all(DISCLOSURES.map((disclosure) => readVariant(entry, disclosure))))
      .filter((variant): variant is DraftVariant => variant !== null);
    if (variants.length > 0) drafts.set(recordId, { recordId, folderName: entry.name, variants });
  }
  return drafts;
}

/** カードのボタンから、原稿の1ファイルを読む */
export async function readArticlePart(
  root: FileSystemDirectoryHandle, draft: ArticleDraft, disclosure: NameDisclosure, part: ArticlePart,
): Promise<string> {
  const spec = ARTICLE_PARTS.find((item) => item.id === part);
  const dir = await childDir(root, draft.folderName);
  const variantDir = dir === null ? null : await childDir(dir, VARIANT_DIRS[disclosure]);
  const file = spec === undefined || variantDir === null ? null : await fileOf(variantDir, spec.file);
  if (file === null) throw new Error('原稿ファイルが見つかりません。原稿フォルダを読み直してください');
  return file.text();
}

/** 原稿がある回答のうち、まだ推敲前の段階にあるものを「推敲中」へ進める */
export function advanceDrafted(
  state: BoardState, drafts: ReadonlyMap<string, ArticleDraft>, stageOf: (recordId: string) => Stage | undefined,
): BoardState {
  return [...drafts.keys()].reduce((next, recordId) => {
    const stage = stageOf(recordId);
    return stage === 'answered' || stage === 'prompted' ? setRecordStage(next, recordId, 'editing') : next;
  }, state);
}
