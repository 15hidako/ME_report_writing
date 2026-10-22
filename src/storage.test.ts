import { describe, expect, it } from 'vitest';
import { VisitStore } from './storage';
import { MemoryStore, fixtureRecord } from './test-fixtures';

describe('VisitStore', () => {
  it('空の状態では空配列を返す', () => {
    const store = new VisitStore(new MemoryStore());
    expect(store.loadAll()).toEqual([]);
    expect(store.nextSeriesNo()).toBe(1);
  });

  it('保存と取得ができる', () => {
    const store = new VisitStore(new MemoryStore());
    const r = fixtureRecord();
    store.save(r);
    expect(store.loadAll()).toHaveLength(1);
    expect(store.get(r.id)?.basic.therapistName).toBe('えりか');
  });

  it('同一idの保存は置換になる(重複しない)', () => {
    const store = new VisitStore(new MemoryStore());
    store.save(fixtureRecord());
    store.save(fixtureRecord({ postedUrl: 'https://wakust.com/x/1/' }));
    const all = store.loadAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.postedUrl).toBe('https://wakust.com/x/1/');
  });

  it('シリーズ番号は既存最大+1', () => {
    const store = new VisitStore(new MemoryStore());
    store.save(fixtureRecord({ id: 'a', seriesNo: 3 }));
    store.save(fixtureRecord({ id: 'b', seriesNo: 7 }));
    expect(store.nextSeriesNo()).toBe(8);
  });

  it('削除できる', () => {
    const store = new VisitStore(new MemoryStore());
    store.save(fixtureRecord());
    store.delete('test-id-1');
    expect(store.loadAll()).toEqual([]);
  });

  it('破損データは意味のあるエラーを投げる', () => {
    const kv = new MemoryStore();
    kv.setItem('me-report-writer/visits/v1', '{broken');
    const store = new VisitStore(kv);
    expect(() => store.loadAll()).toThrow(/読み込みに失敗/);
  });

  it('エクスポート→インポートで復元できる', () => {
    const store = new VisitStore(new MemoryStore());
    store.save(fixtureRecord());
    const json = store.exportJson();

    const store2 = new VisitStore(new MemoryStore());
    store2.importJson(json);
    expect(store2.loadAll()).toHaveLength(1);
  });

  it('不正なインポートデータは拒否する', () => {
    const store = new VisitStore(new MemoryStore());
    expect(() => store.importJson('{"not":"array"}')).toThrow(/配列/);
    expect(() => store.importJson('[{"noId":true}]')).toThrow(/id/);
  });

  it('不完全なJSONを読んでも既存データを書き換えない', () => {
    const store = new VisitStore(new MemoryStore());
    store.save(fixtureRecord());
    const before = store.exportJson();
    expect(() => store.importJson('[{"id":"incomplete"}]')).toThrow();
    expect(store.exportJson()).toBe(before);
  });

  it('保存データの配列要素も検証し、破損時は書換えを拒否する', () => {
    const kv = new MemoryStore();
    kv.setItem('me-report-writer/visits/v1', '[{"id":"incomplete"}]');
    const store = new VisitStore(kv);
    expect(() => store.loadAll()).toThrow(/読み込みに失敗/);
    expect(() => store.save(fixtureRecord())).toThrow();
    expect(store.exportRawJson()).toBe('[{"id":"incomplete"}]');
  });

  it.each([
    ['重複ID', [fixtureRecord(), fixtureRecord({ seriesNo: 2 })]],
    ['重複番号', [fixtureRecord(), fixtureRecord({ id: 'another' })]],
    ['負の番号', [fixtureRecord({ seriesNo: -1 })]],
    ['小数番号', [fixtureRecord({ seriesNo: 1.5 })]],
    ['範囲外評価', [{ ...fixtureRecord(), ratings: { ...fixtureRecord().ratings, face: { stars: 6, note: '' } } }]],
    ['存在しない日付', [{ ...fixtureRecord(), basic: { ...fixtureRecord().basic, visitDate: '2026-02-30' } }]],
    ['不正URL', [fixtureRecord({ postedUrl: 'javascript:alert(1)' })]],
  ])('%sを含むインポートを拒否する', (_name, records) => {
    const store = new VisitStore(new MemoryStore());
    expect(() => store.importJson(JSON.stringify(records))).toThrow();
    expect(store.loadAll()).toEqual([]);
  });

  it('型を偽装した保存値も拒否する', () => {
    const store = new VisitStore(new MemoryStore());
    expect(() => store.save(fixtureRecord({ seriesNo: NaN }))).toThrow();
    expect(store.loadAll()).toEqual([]);
  });

  it('既知の旧形式だけを正規化し、入力オブジェクトを変更しない', () => {
    const record = fixtureRecord();
    const { updatedAt: _updatedAt, postedUrl: _postedUrl, revisitOf: _revisitOf, ...rest } = record;
    const legacy = {
      ...rest,
      ratings: { ...record.ratings, face: { stars: 3 } },
      flow: { ...record.flow, downside: null, meeting: { checks: [], note: null } },
    };
    const store = new VisitStore(new MemoryStore());
    const restored = store.importJson(JSON.stringify([legacy]))[0];
    expect(restored?.updatedAt).toBe(record.createdAt);
    expect(restored?.postedUrl).toBeNull();
    expect(restored?.revisitOf).toBeNull();
    expect(restored?.ratings.face.note).toBe('');
    expect(restored?.flow.downside).toBe('');
    expect(restored?.flow.meeting.note).toBe('');
    expect(legacy.flow.downside).toBeNull();
  });

  it('インポートの事前検証では保存もバックアップも変更しない', () => {
    const kv = new MemoryStore();
    const store = new VisitStore(kv);
    store.save(fixtureRecord());
    expect(store.validateImport('[]')).toEqual([]);
    expect(store.loadAll()).toHaveLength(1);
    expect(store.hasBackup()).toBe(false);
  });

  it('旧スキーマで省略できた任意メモは空欄として扱う', () => {
    const record = fixtureRecord();
    const { downside: _downside, ...flow } = record.flow;
    const store = new VisitStore(new MemoryStore());
    const imported = store.importJson(JSON.stringify([{ ...record, flow: { ...flow, meeting: { checks: [] } } }]))[0];
    expect(imported?.flow.downside).toBe('');
    expect(imported?.flow.meeting.note).toBe('');
  });

  it('全件置換と削除の直前のデータを復元できる', () => {
    const store = new VisitStore(new MemoryStore());
    store.save(fixtureRecord());
    store.importJson('[]');
    expect(store.loadAll()).toEqual([]);
    expect(store.hasBackup()).toBe(true);
    expect(store.restoreBackup()).toHaveLength(1);
    store.delete('test-id-1');
    expect(store.restoreBackup()[0]?.id).toBe('test-id-1');
  });

  it('読込不能な元データも取り出せ、復旧時は別キーに退避する', () => {
    const kv = new MemoryStore();
    const store = new VisitStore(kv);
    store.save(fixtureRecord());
    store.save(fixtureRecord({ postedUrl: 'https://wakust.com/x/1/' }));
    kv.setItem('me-report-writer/visits/v1', '{broken');
    expect(store.exportRawJson()).toBe('{broken');
    expect(store.restoreBackup()[0]?.postedUrl).toBeNull();
    expect(kv.getItem('me-report-writer/visits/v1/recovery')).toBe('{broken');
  });

  it('バックアップがない場合や破損している場合は現在のデータを変えない', () => {
    const kv = new MemoryStore();
    const store = new VisitStore(kv);
    store.save(fixtureRecord());
    const before = store.exportRawJson();
    expect(() => store.restoreBackup()).toThrow(/バックアップ/);
    kv.setItem('me-report-writer/visits/v1/backup', '[{"id":"broken"}]');
    expect(() => store.restoreBackup()).toThrow();
    expect(store.exportRawJson()).toBe(before);
  });

  it.each(['me-report-writer/visits/v1/backup', 'me-report-writer/visits/v1/backup/pending', 'me-report-writer/visits/v1'])('書込失敗(%s)でも元データと直前のバックアップが残る', (key) => {
    class FailingStore extends MemoryStore {
      fail = false;
      override setItem(k: string, value: string): void {
        if (this.fail && k === key) throw new Error('quota exceeded');
        super.setItem(k, value);
      }
    }
    const kv = new FailingStore();
    const store = new VisitStore(kv);
    store.save(fixtureRecord());
    store.save(fixtureRecord({ postedUrl: 'https://wakust.com/u/second/' }));
    const before = store.exportRawJson();
    kv.fail = true;
    expect(() => store.importJson('[]')).toThrow(/保存|バックアップ/);
    expect(store.exportRawJson()).toBe(before);
    kv.fail = false;
    expect(store.restoreBackup()[0]?.postedUrl).toBeNull();
  });

  it('復旧先への書込が失敗しても正常なバックアップを維持する', () => {
    class FailingStore extends MemoryStore {
      fail = false;
      override setItem(key: string, value: string): void {
        if (this.fail && key === 'me-report-writer/visits/v1') throw new Error('quota exceeded');
        super.setItem(key, value);
      }
    }
    const kv = new FailingStore();
    const store = new VisitStore(kv);
    store.save(fixtureRecord());
    store.importJson('[]');
    kv.fail = true;
    expect(() => store.restoreBackup()).toThrow();
    expect(store.loadAll()).toEqual([]);
    kv.fail = false;
    expect(store.restoreBackup()[0]?.id).toBe('test-id-1');
  });

  it('繰り返し復元しても退避した破損データを上書きしない', () => {
    const kv = new MemoryStore();
    const store = new VisitStore(kv);
    store.save(fixtureRecord());
    store.importJson('[]');
    kv.setItem('me-report-writer/visits/v1', '{broken');
    store.restoreBackup();
    store.restoreBackup();
    expect(kv.getItem('me-report-writer/visits/v1/recovery')).toBe('{broken');
    kv.setItem('me-report-writer/visits/v1', '{second-corruption');
    store.restoreBackup();
    expect(kv.getItem('me-report-writer/visits/v1/recovery')).toBe('{broken');
    expect(kv.getItem('me-report-writer/visits/v1/recovery/1')).toBe('{second-corruption');
  });

  it.each(['me-report-writer/visits/v1', 'me-report-writer/visits/v1/backup/pending', 'me-report-writer/visits/v1/backup'])('読取失敗(%s)の復旧処理では書き込まない', (failedKey) => {
    class ReadFailureStore extends MemoryStore {
      fail = false;
      writes = 0;
      override getItem(key: string): string | null {
        if (this.fail && key === failedKey) throw new Error('storage disabled');
        return super.getItem(key);
      }
      override setItem(key: string, value: string): void {
        this.writes++;
        super.setItem(key, value);
      }
    }
    const kv = new ReadFailureStore();
    const store = new VisitStore(kv);
    store.save(fixtureRecord());
    kv.setItem('me-report-writer/visits/v1/backup', store.exportRawJson());
    const writesBefore = kv.writes;
    kv.fail = true;
    expect(() => store.restoreBackup()).toThrow(/復元に失敗/);
    expect(kv.writes).toBe(writesBefore);
    kv.fail = false;
    expect(store.loadAll()).toHaveLength(1);
  });
});
