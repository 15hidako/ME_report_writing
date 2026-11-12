import type { VisitRecord } from './types';

/** 再訪の参照をたどって初回の回答を探す。参照先が消えていれば 'missing'、輪になっていれば 'cycle' */
export function findOriginalRecord(
  start: VisitRecord,
  lookup: (id: string) => VisitRecord | undefined,
): VisitRecord | 'missing' | 'cycle' {
  const seen = new Set<string>();
  let current = start;
  while (true) {
    if (seen.has(current.id)) return 'cycle';
    seen.add(current.id);
    if (current.revisitOf === null) return current;
    const next = lookup(current.revisitOf);
    if (next === undefined) return 'missing';
    current = next;
  }
}
