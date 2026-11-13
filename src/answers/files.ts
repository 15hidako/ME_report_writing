// ダウンロードフォルダに届いた回答JSONを、回答データフォルダへ移すときの判定。
// scripts/file-answers.mjs が Node から直接読み込むため、値のimportと型以外のTS構文を使わない。

/** 入力画面の「保存して共有」(me-report-<通し番号>.json)と「保存」(me-report-backup-<日付>.json)の名前 */
const ANSWER_FILE = /^me-report-.+\.json$/i;

export function isAnswerFileName(name: string): boolean {
  return ANSWER_FILE.test(name);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 訪問記録の配列か。ボードの控え(me-report-board-*.json)は配列でないので外れる */
export function looksLikeVisitRecords(json: unknown): boolean {
  return (
    Array.isArray(json) &&
    json.length > 0 &&
    json.every((item) => isObject(item) && typeof item['id'] === 'string' && typeof item['seriesNo'] === 'number')
  );
}

export interface SourceFile {
  readonly name: string;
  readonly hash: string;
  readonly isRecords: boolean;
}

export interface StoredFile {
  readonly name: string;
  readonly hash: string;
}

export type FilingAction =
  | { readonly kind: 'move'; readonly from: string; readonly to: string }
  | { readonly kind: 'duplicate'; readonly from: string; readonly sameAs: string }
  | { readonly kind: 'skip'; readonly from: string; readonly reason: string };

const HASH_SUFFIX_LENGTH = 8;

function withHashSuffix(name: string, hash: string): string {
  const dot = name.lastIndexOf('.');
  return `${name.slice(0, dot)}-${hash.slice(0, HASH_SUFFIX_LENGTH)}${name.slice(dot)}`;
}

/**
 * 移し方を決める。同じ中身が移し先にあれば重複として扱い、
 * 名前だけ同じで中身が違う(同じ回答を直して送り直した)ときは、名前にハッシュの頭を足して両方残す。
 */
export function planFiling(sources: readonly SourceFile[], stored: readonly StoredFile[]): FilingAction[] {
  const byHash = new Map(stored.map((file) => [file.hash, file.name]));
  const names = new Set(stored.map((file) => file.name.toLowerCase()));
  const actions: FilingAction[] = [];
  // ブラウザが付ける「 (1)」より元の名前を先に見て、元の名前で残す
  const ordered = [...sources].sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  for (const source of ordered) {
    if (!source.isRecords) {
      actions.push({ kind: 'skip', from: source.name, reason: '訪問記録の配列ではない' });
      continue;
    }
    const sameAs = byHash.get(source.hash);
    if (sameAs !== undefined) {
      actions.push({ kind: 'duplicate', from: source.name, sameAs });
      continue;
    }
    const to = names.has(source.name.toLowerCase()) ? withHashSuffix(source.name, source.hash) : source.name;
    byHash.set(source.hash, to);
    names.add(to.toLowerCase());
    actions.push({ kind: 'move', from: source.name, to });
  }
  return actions;
}
