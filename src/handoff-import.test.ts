import { describe, expect, it } from 'vitest';
import { MAX_HANDOFF_FILE_BYTES, prepareHandoffImport } from './handoff-import';
import { fixtureRecord } from './test-fixtures';
import type { VisitRecord } from './types';

function json(record: VisitRecord): string {
  return JSON.stringify([record]);
}

function revisit(overrides: Partial<VisitRecord> = {}): VisitRecord {
  return fixtureRecord({
    id: 'revisit', seriesNo: 2, revisitOf: 'initial', sales: { points: 100, articleType: 'revisit' }, ...overrides,
  });
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseObjectKeys(item)]));
}

function nestedExtra(depth: number): unknown {
  let value: unknown = '末端';
  for (let index = 0; index < depth; index++) value = { nested: value };
  return value;
}

describe('prepareHandoffImport', () => {
  it('1 MiBを超える文字列はJSON解析より先に拒否する', () => {
    expect(() => prepareHandoffImport([], 'x'.repeat(MAX_HANDOFF_FILE_BYTES + 1))).toThrow(/1 MiB/);
  });

  it('ファイルサイズはUTF-8のバイト数で制限する', () => {
    const record = fixtureRecord();
    const input = json({ ...record, flow: { ...record.flow, bestMoment: 'あ'.repeat(Math.ceil(MAX_HANDOFF_FILE_BYTES / 3)) } });
    expect(input.length).toBeLessThan(MAX_HANDOFF_FILE_BYTES);
    expect(() => prepareHandoffImport([], input)).toThrow(/1 MiB/);
  });

  it('1 MiBちょうどのJSONは受け付ける', () => {
    const input = json(fixtureRecord());
    const padded = input + ' '.repeat(MAX_HANDOFF_FILE_BYTES - new TextEncoder().encode(input).byteLength);
    expect(new TextEncoder().encode(padded).byteLength).toBe(MAX_HANDOFF_FILE_BYTES);
    expect(prepareHandoffImport([], padded).kind).toBe('add');
  });

  it('通常の改行を含む日本語の回答を変更せず受け付ける', () => {
    const record = fixtureRecord();
    const incoming = { ...record, flow: { ...record.flow, bestMoment: '最初の会話が楽しかった。\n丁寧な説明も印象に残った。\nまた来たいと思った。' } };
    expect(prepareHandoffImport([], JSON.stringify([incoming], null, 2))).toMatchObject({ kind: 'add', record: incoming });
  });

  it('任意の追加プロパティも深さ32まで受け付け、それを超えると拒否する', () => {
    const accepted = { ...fixtureRecord(), extra: nestedExtra(30) };
    expect(prepareHandoffImport([], json(accepted))).toMatchObject({ kind: 'add', record: accepted });
    const rejected = { ...fixtureRecord(), extra: nestedExtra(31) };
    expect(() => prepareHandoffImport([], json(rejected))).toThrow(/深さ32/);
  });

  it('既存コレクションの深い追加プロパティも再帰比較の前に拒否する', () => {
    const current = { ...fixtureRecord(), extra: nestedExtra(31) };
    expect(() => prepareHandoffImport([current], json(fixtureRecord({ id: 'phone', seriesNo: 2 })))).toThrow(/深さ32/);
  });

  it('未登録IDは元のIDと空いている通し番号で追加する', () => {
    const current = fixtureRecord();
    const incoming = fixtureRecord({ id: 'phone', seriesNo: 5 });
    expect(prepareHandoffImport([current], json(incoming))).toMatchObject({
      kind: 'add', record: incoming, renumberedFrom: null,
    });
    expect(current).toEqual(fixtureRecord());
  });

  it('通し番号が重複した新規IDには既存最大番号の次を提示する', () => {
    const current = [fixtureRecord(), fixtureRecord({ id: 'other', seriesNo: 8 })];
    const incoming = fixtureRecord({ id: 'phone' });
    expect(prepareHandoffImport(current, json(incoming))).toMatchObject({
      kind: 'add', record: { id: 'phone', seriesNo: 9 }, renumberedFrom: 1,
    });
    expect(incoming.seriesNo).toBe(1);
  });

  it('採番が安全な整数の上限を超える取り込みを拒否する', () => {
    const current = [fixtureRecord({ seriesNo: Number.MAX_SAFE_INTEGER })];
    expect(() => prepareHandoffImport(current, json(fixtureRecord({ id: 'phone', seriesNo: Number.MAX_SAFE_INTEGER })))).toThrow(/上限/);
    expect(prepareHandoffImport(current, json(fixtureRecord({ id: 'phone', seriesNo: 2 })))).toMatchObject({
      kind: 'add', record: { seriesNo: 2 },
    });
  });

  it('同じIDでメタデータとプロパティ順だけが異なる場合は既存回答を維持する', () => {
    const previous = fixtureRecord({ seriesNo: 7, postedUrl: 'https://example.com/article' });
    const incoming = {
      ...previous, seriesNo: 1, postedUrl: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
    };
    const result = prepareHandoffImport([previous], JSON.stringify([reverseObjectKeys(incoming)]));
    expect(result).toMatchObject({ kind: 'unchanged', record: previous });
  });

  it('回答の変更だけをドット区切りの差分として提示し、PCの管理項目を保つ', () => {
    const previous = fixtureRecord({ seriesNo: 7, postedUrl: 'https://example.com/article' });
    const incoming = fixtureRecord({
      seriesNo: 9, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
      basic: { ...previous.basic, shopName: '変更後' },
      ratings: { ...previous.ratings, face: { ...previous.ratings.face, stars: 5 } },
    });
    const result = prepareHandoffImport([previous], json(incoming));
    expect(result).toMatchObject({
      kind: 'update', previous,
      record: { seriesNo: 7, postedUrl: previous.postedUrl, createdAt: previous.createdAt, updatedAt: incoming.updatedAt },
      changes: [
        { path: 'basic.shopName', before: previous.basic.shopName, after: '変更後' },
        { path: 'ratings.face.stars', before: 3, after: 5 },
      ],
    });
  });

  it('古い更新日時でも回答が異なれば更新確認を求める', () => {
    const previous = fixtureRecord({ updatedAt: '2026-10-01T00:00:00Z' });
    const incoming = fixtureRecord({ voice: { ...previous.voice, titleHook: '古い端末での編集' } });
    expect(prepareHandoffImport([previous], json(incoming))).toMatchObject({
      kind: 'update', record: { updatedAt: incoming.updatedAt },
      changes: [{ path: 'voice.titleHook', before: previous.voice.titleHook, after: '古い端末での編集' }],
    });
  });

  it('選択順と配列要素の順は回答の変更として扱う', () => {
    const previous = fixtureRecord();
    const incoming = fixtureRecord({ spec: { ...previous.spec, notes: [...previous.spec.notes].reverse() } });
    expect(prepareHandoffImport([previous], json(incoming))).toMatchObject({
      kind: 'update', changes: [{ path: 'spec.notes', before: previous.spec.notes, after: incoming.spec.notes }],
    });
  });

  it('追加・削除された任意項目も差分に含む', () => {
    const previous = fixtureRecord({ basic: { ...fixtureRecord().basic, courseFee: 18000 } });
    const incoming = fixtureRecord({ voice: { ...previous.voice, speechTopics: ['welcome'] } });
    expect(prepareHandoffImport([previous], json(incoming))).toMatchObject({
      kind: 'update', changes: [
        { path: 'basic.courseFee', before: 18000, after: undefined },
        { path: 'voice.speechTopics', before: undefined, after: ['welcome'] },
      ],
    });
  });

  it('既存の旧形式正規化を引き継ぎファイルにも適用する', () => {
    const previous = fixtureRecord();
    const { updatedAt: _updatedAt, postedUrl: _postedUrl, revisitOf: _revisitOf, ...legacy } = previous;
    expect(prepareHandoffImport([previous], JSON.stringify([legacy]))).toMatchObject({ kind: 'unchanged' });
  });

  it.each(['[]', JSON.stringify([fixtureRecord(), fixtureRecord({ id: 'other', seriesNo: 2 })])])('回答が1件でない配列を拒否する: %s', (input) => {
    expect(() => prepareHandoffImport([], input)).toThrow(/1件/);
  });

  it.each(['{broken', '{}', '[{"id":"incomplete"}]'])('不正なJSONまたはスキーマを拒否する: %s', (input) => {
    expect(() => prepareHandoffImport([], input)).toThrow();
  });

  it('再訪先は通し番号で代用せず固定IDで検証する', () => {
    expect(() => prepareHandoffImport([fixtureRecord({ id: 'different', seriesNo: 1 })], json(revisit()))).toThrow(/再訪先.*見つかりません/);
  });

  it('自分自身への参照を拒否する', () => {
    expect(() => prepareHandoffImport([], json(revisit({ revisitOf: 'revisit' })))).toThrow(/自分自身/);
  });

  it('既存回答を更新してできる循環参照を拒否する', () => {
    const initial = fixtureRecord({ id: 'initial' });
    const child = revisit();
    const incoming = revisit({ id: 'initial', seriesNo: 1, revisitOf: child.id });
    expect(() => prepareHandoffImport([initial, child], json(incoming))).toThrow(/循環/);
  });

  it('参照先の祖先が欠けている場合も拒否する', () => {
    const orphan = revisit({ id: 'orphan', revisitOf: 'missing' });
    expect(() => prepareHandoffImport([orphan], json(revisit({ id: 'phone', seriesNo: 3, revisitOf: orphan.id })))).toThrow(/missing/);
  });

  it('初回で終わる既存の再訪チェーンは許可し、無関係な参照切れは取り込みを妨げない', () => {
    const initial = fixtureRecord({ id: 'initial' });
    const child = revisit();
    const orphan = revisit({ id: 'orphan', seriesNo: 3, revisitOf: 'missing' });
    expect(prepareHandoffImport([initial, child, orphan], json(revisit({ id: 'phone', seriesNo: 4, revisitOf: child.id })))).toMatchObject({ kind: 'add' });
  });

  it('番号を変えても再訪先の固定IDを維持する', () => {
    const initial = fixtureRecord({ id: 'initial', seriesNo: 2 });
    expect(prepareHandoffImport([initial], json(revisit()))).toMatchObject({
      kind: 'add', record: { seriesNo: 3, revisitOf: 'initial' }, renumberedFrom: 2,
    });
  });

  it('スナップショットはオブジェクトのキー順に依存せず、メタデータ変更も検出できる', () => {
    const current = fixtureRecord();
    const incoming = json(fixtureRecord({ id: 'phone', seriesNo: 2 }));
    const snapshot = prepareHandoffImport([current], incoming).snapshot;
    expect(prepareHandoffImport([reverseObjectKeys(current) as VisitRecord], incoming).snapshot).toBe(snapshot);
    expect(prepareHandoffImport([{ ...current, postedUrl: 'https://example.com/article' }], incoming).snapshot).not.toBe(snapshot);
  });
});
