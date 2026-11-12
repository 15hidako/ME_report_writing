// Claude Code に書き出させる原稿ファイルの置き方。記事ボードは同じ規則で読み戻す。
// 原稿はリポジトリ外のフォルダに置く(AGENTS.md)。

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

export const ARTICLE_PARTS = [
  { id: 'title', file: 'title.txt', label: 'タイトル', short: 'タイトル' },
  { id: 'tags', file: 'tags.txt', label: 'タグ', short: 'タグ' },
  { id: 'free', file: 'free-part.html', label: '無料部分', short: '無料' },
  { id: 'paid', file: 'paid-part.html', label: '有料部分', short: '有料' },
] as const;
export type ArticlePart = (typeof ARTICLE_PARTS)[number]['id'];

function joinPath(base: string, ...parts: readonly string[]): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return [base.replace(/[\\/]+$/, ''), ...parts].join(sep);
}

/** 単体・再訪の記事プロンプトの末尾に付ける、保存先の指示 */
export function articleSaveSection(baseDir: string, record: VisitRecord, disclosure: NameDisclosure): string {
  const dir = joinPath(baseDir, articleFolderName(record), VARIANT_DIRS[disclosure]);
  const files = ARTICLE_PARTS.map((part) => `- ${part.label}: ${joinPath(dir, part.file)}`).join('\n');
  return `## 保存(Claude Code)
出力形式の1〜4を、コードブロックの中身だけ(\`\`\`は含めない)で次のファイルにUTF-8で保存する。フォルダがなければ作り、既存のファイルは上書きする。チャットへの出力も省かない。
${files}`;
}
