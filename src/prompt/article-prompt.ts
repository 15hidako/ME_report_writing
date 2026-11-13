// 単体・再訪の記事プロンプトを、入力画面とボードで同じように作る。

import { parseListingCheckDate } from '../date';
import { findOriginalRecord } from '../revisit';
import type { VisitRecord } from '../types';
import { articleSaveSection } from './article-files';
import { buildRevisitPrompt, buildSinglePrompt, type NameDisclosure } from './build-prompt';

export const REVISIT_CYCLE = '再訪の参照が循環しています';

export interface ArticlePrompt {
  readonly text: string;
  /** 再訪元が見つからず単体として作ったときの知らせ */
  readonly notice: string | null;
}

/**
 * 出勤確認日は空欄なら記事に書かない。articleDir があれば、本文を素の文章で書かせ、Claude Code に原稿4ファイルを保存させる指示を付ける。
 * 保存先がない(公開版)ときは、投稿欄へそのまま貼れるHTMLで書かせる。
 * 再訪の参照が輪になっているときは作らずに例外にする。
 */
export function buildArticlePrompt(
  record: VisitRecord,
  records: readonly VisitRecord[],
  disclosure: NameDisclosure,
  listingCheckedOn: string,
  articleDir: string | null,
): ArticlePrompt {
  // 再訪元が見つからないときの知らせより先に、入力の誤りを返す
  parseListingCheckDate(listingCheckedOn);
  const format = articleDir === null ? 'html' : 'plain';
  let body = buildSinglePrompt(record, disclosure, listingCheckedOn, format);
  let notice: string | null = null;
  if (record.revisitOf !== null) {
    const first = findOriginalRecord(record, (id) => records.find((item) => item.id === id));
    if (first === 'cycle') throw new Error(REVISIT_CYCLE);
    if (first === 'missing') notice = '初回レコードが見つかりません。単体として生成します';
    else body = buildRevisitPrompt(record, first, disclosure, listingCheckedOn, format);
  }
  const text = articleDir === null ? body : `${body}\n\n${articleSaveSection(articleDir, record, disclosure)}`;
  return { text, notice };
}
