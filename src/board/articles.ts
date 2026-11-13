// Claude Code が data/articles へ書き出した原稿を、カードに結び付ける。
// フォルダの読み取りは開発サーバー側(scripts/local-data.mjs)が行い、規則は prompt/article-files.ts と共有する。

import { MARKUP_PAIRS, type ArticlePart } from '../prompt/article-files';
import type { NameDisclosure } from '../prompt/style-profile';
import { setRecordStage, type BoardState, type Stage } from './state';

export interface DraftVariant {
  readonly disclosure: NameDisclosure;
  readonly parts: readonly ArticlePart[];
  /** 最後にファイルが更新された時刻(ms) */
  readonly updatedAt: number;
  /** 部分ごとの更新時刻(ms)。ない部分は入らない */
  readonly times: Readonly<Partial<Record<ArticlePart, number>>>;
}

export interface ArticleDraft {
  readonly recordId: string;
  readonly folderName: string;
  readonly variants: readonly DraftVariant[];
}

/**
 * 投稿用HTMLの状態。ready はすべての本文のHTMLが素の文章より新しい。
 * stale は直した素の文章がまだHTMLに入っていない。none はまだマークアップしていない。
 * 素の文章がない部分(この規則より前に書き出したHTMLだけの原稿)は、HTMLがあれば ready とみなす
 */
export type MarkupState = 'ready' | 'stale' | 'none';

export function markupState(variant: DraftVariant): MarkupState {
  // 素の文章もHTMLもない部分は数えない
  const states = MARKUP_PAIRS.flatMap(({ text, html }): MarkupState[] => {
    const textAt = variant.times[text];
    const htmlAt = variant.times[html];
    if (htmlAt === undefined) return textAt === undefined ? [] : ['none'];
    return [textAt === undefined || htmlAt >= textAt ? 'ready' : 'stale'];
  });
  if (states.length === 0) return 'none';
  if (states.every((state) => state === 'ready')) return 'ready';
  return states.every((state) => state === 'none') ? 'none' : 'stale';
}

/** 素の文章があり、ボードで読んで直せるか */
export const hasSource = (variant: DraftVariant): boolean =>
  MARKUP_PAIRS.some(({ text }) => variant.parts.includes(text));

/** 原稿がある回答のうち、まだ推敲前の段階にあるものを「推敲中」へ進める */
export function advanceDrafted(
  state: BoardState, drafts: ReadonlyMap<string, ArticleDraft>, stageOf: (recordId: string) => Stage | undefined,
): BoardState {
  return [...drafts.keys()].reduce((next, recordId) => {
    const stage = stageOf(recordId);
    return stage === 'answered' || stage === 'prompted' ? setRecordStage(next, recordId, 'editing') : next;
  }, state);
}
