// Claude Code が data/articles へ書き出した原稿を、カードに結び付ける。
// フォルダの読み取りは開発サーバー側(scripts/local-data.mjs)が行い、規則は prompt/article-files.ts と共有する。

import type { ArticlePart } from '../prompt/article-files';
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

/** 原稿がある回答のうち、まだ推敲前の段階にあるものを「推敲中」へ進める */
export function advanceDrafted(
  state: BoardState, drafts: ReadonlyMap<string, ArticleDraft>, stageOf: (recordId: string) => Stage | undefined,
): BoardState {
  return [...drafts.keys()].reduce((next, recordId) => {
    const stage = stageOf(recordId);
    return stage === 'answered' || stage === 'prompted' ? setRecordStage(next, recordId, 'editing') : next;
  }, state);
}
