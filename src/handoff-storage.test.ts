import { describe, expect, it } from 'vitest';
import { VisitStore } from './storage';
import { MAX_HANDOFF_FILE_BYTES } from './handoff-import';
import { MemoryStore, fixtureRecord } from './test-fixtures';
import type { VisitRecord } from './types';

const STORAGE_KEY = 'me-report-writer/visits/v1';
const BACKUP_KEY = `${STORAGE_KEY}/backup`;
const PENDING_KEY = `${BACKUP_KEY}/pending`;

class TrackingStore extends MemoryStore {
  writes = 0;
  failedKey: string | null = null;
  override setItem(key: string, value: string): void {
    this.writes++;
    if (key === this.failedKey) throw new Error('quota exceeded');
    super.setItem(key, value);
  }
}

function json(record: VisitRecord): string {
  return JSON.stringify([record]);
}

describe('VisitStore handoff import', () => {
  it.each(['size', 'depth', 'current depth'])('大きすぎるデータの拒否では回答もバックアップも変更しない: %s', (kind) => {
    const kv = new TrackingStore();
    const store = new VisitStore(kv);
    store.save(fixtureRecord());
    let nested: unknown = '末端';
    for (let index = 0; index < 40; index++) nested = { nested };
    const deepRecord = { ...fixtureRecord(), extra: nested };
    store.save(kind === 'current depth' ? deepRecord : fixtureRecord({ postedUrl: 'https://example.com/article' }));
    const input = kind === 'size'
      ? 'x'.repeat(MAX_HANDOFF_FILE_BYTES + 1)
      : kind === 'depth' ? json(deepRecord) : json(fixtureRecord({ id: 'phone', seriesNo: 2 }));
    const raw = store.exportRawJson();
    const backup = kv.getItem(BACKUP_KEY);
    const pending = kv.getItem(PENDING_KEY);
    const writesBefore = kv.writes;
    expect(() => store.prepareHandoffImport(input)).toThrow(/1 MiB|深さ32/);
    expect(() => store.importHandoffJson(input, '')).toThrow(/1 MiB|深さ32/);
    expect(kv.writes).toBe(writesBefore);
    expect(store.exportRawJson()).toBe(raw);
    expect(kv.getItem(BACKUP_KEY)).toBe(backup);
    expect(kv.getItem(PENDING_KEY)).toBe(pending);
  });

  it('事前確認では保存せず、確認後に他の回答を残して1件を追加する', () => {
    const kv = new TrackingStore();
    const store = new VisitStore(kv);
    const previous = fixtureRecord();
    store.save(previous);
    const input = json(fixtureRecord({ id: 'phone', seriesNo: 2 }));
    const writesBefore = kv.writes;
    const plan = store.prepareHandoffImport(input);
    expect(plan.kind).toBe('add');
    expect(kv.writes).toBe(writesBefore);
    expect(store.loadAll()).toEqual([previous]);
    expect(store.importHandoffJson(input, plan.snapshot).map((record) => record.id)).toEqual([previous.id, 'phone']);
    expect(store.loadAll()[0]).toEqual(previous);
    expect(store.restoreBackup()).toEqual([previous]);
  });

  it('確認された番号変更を保存する', () => {
    const store = new VisitStore(new MemoryStore());
    store.save(fixtureRecord({ seriesNo: 8 }));
    const input = json(fixtureRecord({ id: 'phone', seriesNo: 8 }));
    const plan = store.prepareHandoffImport(input);
    expect(plan).toMatchObject({ kind: 'add', renumberedFrom: 8, record: { seriesNo: 9 } });
    expect(store.importHandoffJson(input, plan.snapshot)[1]).toMatchObject({ id: 'phone', seriesNo: 9 });
  });

  it('同じ回答の再取り込みではメタデータもバックアップも書き換えない', () => {
    const kv = new TrackingStore();
    const store = new VisitStore(kv);
    store.save(fixtureRecord());
    const current = fixtureRecord({ seriesNo: 7, postedUrl: 'https://example.com/article' });
    store.save(current);
    const raw = store.exportRawJson();
    const backup = kv.getItem(BACKUP_KEY);
    const pending = kv.getItem(PENDING_KEY);
    const writesBefore = kv.writes;
    const input = json(fixtureRecord({ updatedAt: '2026-10-01T00:00:00Z' }));
    const plan = store.prepareHandoffImport(input);
    expect(plan.kind).toBe('unchanged');
    expect(store.importHandoffJson(input, plan.snapshot)).toEqual([current]);
    expect(kv.writes).toBe(writesBefore);
    expect(store.exportRawJson()).toBe(raw);
    expect(kv.getItem(BACKUP_KEY)).toBe(backup);
    expect(kv.getItem(PENDING_KEY)).toBe(pending);
    expect(store.restoreBackup()).toEqual([fixtureRecord()]);
  });

  it('確認された変更だけを反映してPCの管理項目と他の回答を保持する', () => {
    const store = new VisitStore(new MemoryStore());
    const previous = fixtureRecord({ seriesNo: 7, postedUrl: 'https://example.com/article' });
    const other = fixtureRecord({ id: 'other', seriesNo: 8 });
    store.importJson(JSON.stringify([previous, other]));
    const incoming = fixtureRecord({
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
      basic: { ...previous.basic, shopName: '変更後' },
    });
    const input = json(incoming);
    const plan = store.prepareHandoffImport(input);
    expect(plan.kind).toBe('update');
    expect(store.importHandoffJson(input, plan.snapshot)).toEqual([
      { ...incoming, seriesNo: previous.seriesNo, createdAt: previous.createdAt, postedUrl: previous.postedUrl }, other,
    ]);
    expect(store.restoreBackup()).toEqual([previous, other]);
  });

  it('確認後に保存内容が変わったら取り込みもバックアップ更新もしない', () => {
    const kv = new TrackingStore();
    const store = new VisitStore(kv);
    store.save(fixtureRecord());
    const input = json(fixtureRecord({ id: 'phone', seriesNo: 2 }));
    const plan = store.prepareHandoffImport(input);
    store.save(fixtureRecord({ postedUrl: 'https://example.com/article' }));
    const raw = store.exportRawJson();
    const backup = kv.getItem(BACKUP_KEY);
    const pending = kv.getItem(PENDING_KEY);
    const writesBefore = kv.writes;
    expect(() => store.importHandoffJson(input, plan.snapshot)).toThrow(/変更されています/);
    expect(kv.writes).toBe(writesBefore);
    expect(store.exportRawJson()).toBe(raw);
    expect(kv.getItem(BACKUP_KEY)).toBe(backup);
    expect(kv.getItem(PENDING_KEY)).toBe(pending);
  });

  it.each(['{broken', '[]', '[{"id":"incomplete"}]', json(fixtureRecord({
    id: 'phone', seriesNo: 2, revisitOf: 'missing', sales: { points: 100, articleType: 'revisit' },
  }))])('取り込みの検証エラーでは保存領域を変更しない: %s', (input) => {
    const kv = new TrackingStore();
    const store = new VisitStore(kv);
    store.save(fixtureRecord());
    const validInput = json(fixtureRecord({ id: 'phone', seriesNo: 2 }));
    const snapshot = store.prepareHandoffImport(validInput).snapshot;
    const writesBefore = kv.writes;
    const raw = store.exportRawJson();
    expect(() => store.prepareHandoffImport(input)).toThrow();
    expect(() => store.importHandoffJson(input, snapshot)).toThrow();
    expect(store.exportRawJson()).toBe(raw);
    expect(kv.writes).toBe(writesBefore);
    expect(store.hasBackup()).toBe(false);
  });

  it.each([STORAGE_KEY, BACKUP_KEY, PENDING_KEY])('書込失敗時に元回答と既存バックアップを守る: %s', (failedKey) => {
    const kv = new TrackingStore();
    const store = new VisitStore(kv);
    const original = fixtureRecord();
    store.save(original);
    const current = fixtureRecord({ postedUrl: 'https://example.com/article' });
    store.save(current);
    const input = json(fixtureRecord({ id: 'phone', seriesNo: 2 }));
    const plan = store.prepareHandoffImport(input);
    kv.failedKey = failedKey;
    expect(() => store.importHandoffJson(input, plan.snapshot)).toThrow(/保存に失敗/);
    expect(store.loadAll()).toEqual([current]);
    kv.failedKey = null;
    expect(store.restoreBackup()).toEqual([original]);
  });
});
