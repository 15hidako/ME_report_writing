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
});
