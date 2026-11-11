import { parseRecordsJson, parseVisitRecords } from './record-validation';
import { IDENTITY_FIELDS, pageKey } from './identity';
import type { BasicInfo, VisitRecord } from './types';

export const MAX_HANDOFF_FILE_BYTES = 1024 * 1024;

export interface HandoffChange {
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
}

export type HandoffImportPlan =
  | { readonly kind: 'add'; readonly record: VisitRecord; readonly renumberedFrom: number | null; readonly snapshot: string }
  | { readonly kind: 'update'; readonly record: VisitRecord; readonly previous: VisitRecord; readonly changes: readonly HandoffChange[]; readonly snapshot: string }
  | { readonly kind: 'unchanged'; readonly record: VisitRecord; readonly snapshot: string };

const LOCAL_METADATA = new Set(['id', 'seriesNo', 'createdAt', 'updatedAt', 'postedUrl']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateNesting(value: unknown): void {
  const pending = [{ value, depth: 0 }];
  while (pending.length > 0) {
    const item = pending.pop()!;
    if (typeof item.value !== 'object' || item.value === null) continue;
    const depth = item.depth + 1;
    if (depth > 32) throw new Error('引き継ぎデータの入れ子が深すぎます。深さ32以下にしてください');
    for (const child of Object.values(item.value)) pending.push({ value: child, depth });
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function changesBetween(before: unknown, after: unknown, path = ''): HandoffChange[] {
  if (JSON.stringify(canonicalValue(before)) === JSON.stringify(canonicalValue(after))) return [];
  if (!isObject(before) || !isObject(after)) return [{ path, before, after }];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap((key) =>
    path === '' && LOCAL_METADATA.has(key)
      ? []
      : changesBetween(before[key], after[key], path ? `${path}.${key}` : key),
  );
}

/** 同じプロフィールURLの再共有では、PC側で補完した店とセラピストの情報を空欄で消さない */
function keepResolvedIdentity(previous: BasicInfo, incoming: BasicInfo): BasicInfo {
  const page = pageKey(incoming.therapistProfileUrl);
  if (page === null || page !== pageKey(previous.therapistProfileUrl)) return incoming;
  const kept = Object.fromEntries(IDENTITY_FIELDS.flatMap((field) =>
    incoming[field].trim() === '' && previous[field] !== '' ? [[field, previous[field]]] : []));
  const identityLookup = incoming.identityLookup ?? previous.identityLookup;
  return { ...incoming, ...kept, ...(identityLookup === undefined ? {} : { identityLookup }) };
}

function validateRevisit(record: VisitRecord, records: readonly VisitRecord[]): void {
  const byId = new Map(records.map((item) => [item.id, item]));
  const visited = new Set([record.id]);
  let current = record;
  while (current.revisitOf !== null) {
    const parent = byId.get(current.revisitOf);
    if (!parent) throw new Error(`再訪先の回答が見つかりません: ${current.revisitOf}`);
    if (visited.has(parent.id)) throw new Error('再訪先の参照が循環しています');
    visited.add(parent.id);
    current = parent;
  }
}

export function prepareHandoffImport(currentRecords: readonly VisitRecord[], json: string): HandoffImportPlan {
  if (json.length > MAX_HANDOFF_FILE_BYTES || new TextEncoder().encode(json).byteLength > MAX_HANDOFF_FILE_BYTES) {
    throw new Error('引き継ぎファイルは1 MiB以下にしてください');
  }
  validateNesting(currentRecords);
  const current = parseVisitRecords(currentRecords);
  const incoming = parseRecordsJson(json);
  validateNesting(incoming);
  if (incoming.length !== 1) throw new Error('引き継ぎファイルには回答1件だけを含めてください');
  const record = incoming[0]!;
  const previous = current.find((item) => item.id === record.id);
  const snapshot = JSON.stringify(canonicalValue(current));
  if (previous) {
    const replacement = {
      ...record, seriesNo: previous.seriesNo, createdAt: previous.createdAt, postedUrl: previous.postedUrl,
      basic: keepResolvedIdentity(previous.basic, record.basic),
    };
    validateRevisit(replacement, current.map((item) => item.id === replacement.id ? replacement : item));
    const changes = changesBetween(previous, replacement);
    return changes.length === 0
      ? { kind: 'unchanged', record: previous, snapshot }
      : { kind: 'update', record: replacement, previous, changes, snapshot };
  }

  let addition = record;
  let renumberedFrom: number | null = null;
  if (current.some((item) => item.seriesNo === record.seriesNo)) {
    const max = current.reduce((value, item) => Math.max(value, item.seriesNo), 0);
    if (max === Number.MAX_SAFE_INTEGER) throw new Error('通し番号の上限に達したため取り込めません');
    renumberedFrom = record.seriesNo;
    addition = { ...record, seriesNo: max + 1 };
  }
  validateRevisit(addition, [...current, addition]);
  return { kind: 'add', record: addition, renumberedFrom, snapshot };
}
