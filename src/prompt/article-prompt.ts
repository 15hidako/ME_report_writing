// 単体・再訪の記事プロンプトを、入力画面とボードで同じように作る。
// ボード(PC)からは、規則を skill(me-article)に任せた短い依頼文も作る(docs/19)。

import { parseListingCheckDate } from '../date';
import { articleLookupSection } from '../identity-lookup';
import { findOriginalRecord } from '../revisit';
import type { VisitRecord } from '../types';
import { VARIANT_DIRS, articleSaveFileLines, articleSaveSection } from './article-files';
import { ARTICLE_SKILL_NAME, BRIEF_LABELS, STRUCTURE_SLOT_LABELS } from './brief-labels';
import {
  SINGLE_STRUCTURE, buildRevisitPrompt, buildSinglePrompt, revisitStructure, revisitVisitData, singleHints, structureSlots,
  tagHint, titleLead, titleRule, type NameDisclosure,
} from './build-prompt';
import { serializeRecord } from './serialize';
import { DISCLOSURE_LABELS, nameRule } from './style-profile';

export const REVISIT_CYCLE = '再訪の参照が循環しています';

export interface ArticlePrompt {
  readonly text: string;
  /** 再訪元が見つからず単体として作ったときの知らせ */
  readonly notice: string | null;
}

interface ArticleSource {
  /** 再訪記事なら初回のレコード。単体記事、または再訪元が見つからないときは null */
  readonly first: VisitRecord | null;
  readonly notice: string | null;
}

/**
 * 出勤確認日の誤りを先に返し、再訪元を探す。
 * 再訪の参照が輪になっているときは作らずに例外にする
 */
function resolveSource(record: VisitRecord, records: readonly VisitRecord[], listingCheckedOn: string): ArticleSource {
  // 再訪元が見つからないときの知らせより先に、入力の誤りを返す
  parseListingCheckDate(listingCheckedOn);
  if (record.revisitOf === null) return { first: null, notice: null };
  const first = findOriginalRecord(record, (id) => records.find((item) => item.id === id));
  if (first === 'cycle') throw new Error(REVISIT_CYCLE);
  if (first === 'missing') return { first: null, notice: '初回レコードが見つかりません。単体として生成します' };
  return { first, notice: null };
}

/**
 * 出勤確認日は空欄なら記事に書かない。articleDir があれば、本文を素の文章で書かせ、Claude Code に原稿4ファイルを保存させる指示を付ける。
 * 保存先がない(公開版)ときは、投稿欄へそのまま貼れるHTMLで書かせる。
 */
export function buildArticlePrompt(
  record: VisitRecord,
  records: readonly VisitRecord[],
  disclosure: NameDisclosure,
  listingCheckedOn: string,
  articleDir: string | null,
): ArticlePrompt {
  const { first, notice } = resolveSource(record, records, listingCheckedOn);
  const format = articleDir === null ? 'html' : 'plain';
  const body = first === null
    ? buildSinglePrompt(record, disclosure, listingCheckedOn, format)
    : buildRevisitPrompt(record, first, disclosure, listingCheckedOn, format);
  const text = articleDir === null ? body : `${body}\n\n${articleSaveSection(articleDir, record, disclosure)}`;
  return { text, notice };
}

const section = (label: string, body: string): string => `## ${label}\n${body}`;

/** 記事構成の差し込み口に入る行。skillの記事構成と同じ順に、同じ名前で並べる */
function structureSection(disclosure: NameDisclosure, listingCheckedOn: string): string {
  const values = structureSlots(disclosure, listingCheckedOn);
  const lines = SINGLE_STRUCTURE.flatMap((line) => (typeof line === 'string'
    ? []
    : [`### ${STRUCTURE_SLOT_LABELS[line.slot]}\n${values[line.slot]}`]));
  return section(BRIEF_LABELS.structure, lines.join('\n'));
}

/**
 * Claude Code に me-article の skill で書かせる依頼文。
 * 規則は skill に置き、ここには販売型で変わる行、タイトルの規則、出勤確認、保存先、訪問データだけを入れる
 */
export function buildArticleBrief(
  record: VisitRecord,
  records: readonly VisitRecord[],
  disclosure: NameDisclosure,
  listingCheckedOn: string,
  articleDir: string,
): ArticlePrompt {
  const { first, notice } = resolveSource(record, records, listingCheckedOn);
  const lookup = articleLookupSection(record);
  const parts = [
    `/${ARTICLE_SKILL_NAME}`,
    section(BRIEF_LABELS.disclosure, `${DISCLOSURE_LABELS[disclosure]}(保存先のフォルダは ${VARIANT_DIRS[disclosure]})`),
    section(BRIEF_LABELS.nameRule, nameRule(disclosure)),
    section(BRIEF_LABELS.title, titleRule(disclosure, titleLead(record, listingCheckedOn))),
    structureSection(disclosure, listingCheckedOn),
    ...(lookup === null ? [] : [lookup]),
    ...(first === null ? [] : [revisitStructure(first)]),
    section(BRIEF_LABELS.save, articleSaveFileLines(articleDir, record, disclosure)),
    first === null ? singleHints(record) : tagHint(record),
    first === null ? serializeRecord(record) : revisitVisitData(record, first),
  ];
  return { text: parts.join('\n\n'), notice };
}
