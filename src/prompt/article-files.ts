// Claude Code に書き出させる原稿ファイルの置き方。記事ボードは同じ規則で読み戻す。
// 原稿はPJ内の data/articles(git の管理外)に置く(AGENTS.md)。
// 記事プロンプトでは素の文章を書かせ、本人がボードで直したあと、別の依頼で投稿用HTMLへマークアップさせる(U-23)。

import type { VisitRecord } from '../types';
import type { NameDisclosure } from './style-profile';

/** 回答ごとのフォルダ名は「通し番号4桁-回答ID」。ボードは末尾の回答IDで照合する */
export function articleFolderName(record: Pick<VisitRecord, 'id' | 'seriesNo'>): string {
  return `${String(record.seriesNo).padStart(4, '0')}-${record.id}`;
}

/** フォルダ名から回答IDを取り出す。規則に合わない名前は null */
export function recordIdOfFolder(name: string): string | null {
  const match = /^\d{4,}-(.+)$/.exec(name);
  return match?.[1] ?? null;
}

/** プロンプトの2種類(通常/名前公開版)を別フォルダに分ける */
export const VARIANT_DIRS: Readonly<Record<NameDisclosure, string>> = { paid: 'standard', free: 'names' };

/**
 * 1つの版を作るファイル。先頭の4つは記事プロンプトで書かせる素の文章で、ボードで直せる。
 * 残りの2つはマークアップの依頼で書かせる投稿用HTML。
 * id は名前の出し方(NameDisclosure の paid/free)と取り違えないよう Text/Html を付ける。保存されない
 */
export const ARTICLE_PARTS = [
  { id: 'title', file: 'title.txt', label: 'タイトル', short: 'タイトル' },
  { id: 'tags', file: 'tags.txt', label: 'タグ', short: 'タグ' },
  { id: 'freeText', file: 'free-part.txt', label: '無料部分', short: '無料' },
  { id: 'paidText', file: 'paid-part.txt', label: '有料部分', short: '有料' },
  { id: 'freeHtml', file: 'free-part.html', label: '無料部分のHTML', short: '無料' },
  { id: 'paidHtml', file: 'paid-part.html', label: '有料部分のHTML', short: '有料' },
] as const;
export type ArticlePart = (typeof ARTICLE_PARTS)[number]['id'];

/** 記事プロンプトで書かせ、ボードで直せる素の文章 */
export const SOURCE_PARTS = ['title', 'tags', 'freeText', 'paidText'] as const satisfies readonly ArticlePart[];
export type SourcePart = (typeof SOURCE_PARTS)[number];

/** 素の文章と、それをマークアップしたHTML */
export const MARKUP_PAIRS = [
  { text: 'freeText', html: 'freeHtml' },
  { text: 'paidText', html: 'paidHtml' },
] as const satisfies readonly { readonly text: ArticlePart; readonly html: ArticlePart }[];

/** 投稿画面へ貼る順。本文はHTMLを貼る */
export const POST_PARTS = ['title', 'tags', 'freeHtml', 'paidHtml'] as const satisfies readonly ArticlePart[];

export const isSourcePart = (part: string): part is SourcePart => (SOURCE_PARTS as readonly string[]).includes(part);

export function partSpec(id: ArticlePart): (typeof ARTICLE_PARTS)[number] {
  const spec = ARTICLE_PARTS.find((part) => part.id === id);
  if (spec === undefined) throw new Error(`原稿の部分が不明です: ${id}`);
  return spec;
}

export function joinPath(base: string, ...parts: readonly string[]): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return [base.replace(/[\\/]+$/, ''), ...parts].join(sep);
}

/** 版のフォルダの絶対パス */
export function variantDir(baseDir: string, folderName: string, disclosure: NameDisclosure): string {
  return joinPath(baseDir, folderName, VARIANT_DIRS[disclosure]);
}

/** 単体・再訪の記事プロンプトの末尾に付ける、保存先の指示 */
export function articleSaveSection(baseDir: string, record: VisitRecord, disclosure: NameDisclosure): string {
  const dir = variantDir(baseDir, articleFolderName(record), disclosure);
  const files = SOURCE_PARTS.map((id) => partSpec(id))
    .map((part) => `- ${part.label}: ${joinPath(dir, part.file)}`).join('\n');
  return `## 保存(Claude Code)
出力形式の1〜4を、コードブロックの中身だけ(\`\`\`は含めない)で次のファイルにUTF-8で保存する。フォルダがなければ作り、既存のファイルは上書きする。チャットへの出力も省かない。
${files}`;
}
