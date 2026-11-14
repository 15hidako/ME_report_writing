// ボードが Claude Code に渡す依頼文と skill(SKILL.md)が共有する名前。
// skillは依頼文の項目をこの見出しで指すので、両方がここを参照して食い違わないようにする(docs/19)。

import type { StructureSlot } from './build-prompt';

export const ARTICLE_SKILL_NAME = 'me-article';
export const MARKUP_SKILL_NAME = 'me-markup';

/** 依頼文の見出し */
export const BRIEF_LABELS = {
  disclosure: '販売型',
  nameRule: '名前の開示',
  title: 'タイトル',
  structure: '記事構成の行',
  revisit: '記事構成(再訪)',
  lookup: '店舗情報の確認',
  save: '保存先',
} as const;

/** 記事構成の差し込み口の見出し。依頼文では販売型ごとの値をこの名前で並べる */
export const STRUCTURE_SLOT_LABELS: Readonly<Record<StructureSlot, string>> = {
  intro: '導入',
  profile: '今回のセラピスト',
  paidSummary: '有料部分の内容',
  shopInfo: '店舗・セラピスト情報',
  listingCheck: '出勤確認',
  review: '総評',
};
