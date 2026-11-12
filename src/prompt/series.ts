import type { VisitRecord } from '../types';

/** コンマ区切りの通し番号から対象の回答を引く。番号の書式が違うか、存在しない番号があれば Error */
export function seriesTargets(records: readonly VisitRecord[], raw: string): VisitRecord[] {
  const parts = raw.split(',').map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => part === '')) {
    throw new Error('通し番号をコンマ区切りで入力してください');
  }
  if (parts.some((part) => !/^-?\d+$/.test(part) || !Number.isSafeInteger(Number(part)))) {
    throw new Error('通し番号は整数で指定してください');
  }
  const wanted = new Set(parts.map((part) => Number(part)));
  const targets = records.filter((record) => wanted.has(record.seriesNo));
  const found = new Set(targets.map((record) => record.seriesNo));
  if ([...wanted].some((no) => !found.has(no))) throw new Error('存在しない通し番号があります');
  return targets;
}
