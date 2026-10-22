import { describe, expect, it } from 'vitest';
import { VisitStore } from './storage';
import { MemoryStore, fixtureRecord } from './test-fixtures';

const costFields = ['courseFee', 'optionFee'] as const;
const validAmounts = [null, 0, 6000, Number.MAX_SAFE_INTEGER] as const;

describe('VisitStore の追加料金', () => {
  it.each(costFields.flatMap((field) => validAmounts.map((amount) => [field, amount] as const)))(
    '%s=%s を保存し、JSON の書き出しと読み込みで復元する',
    (field, amount) => {
      const base = fixtureRecord();
      const record = fixtureRecord({ basic: { ...base.basic, [field]: amount } });
      const store = new VisitStore(new MemoryStore());

      store.save(record);
      expect(store.get(record.id)?.basic).toHaveProperty(field, amount);

      const exported = store.exportJson();
      expect(JSON.parse(exported)[0].basic).toHaveProperty(field, amount);
      const restored = new VisitStore(new MemoryStore());
      restored.importJson(exported);
      expect(restored.get(record.id)?.basic).toHaveProperty(field, amount);
      expect(restored.get(record.id)?.basic.nominationFee).toBe(base.basic.nominationFee);
    },
  );

  it.each(costFields.flatMap((field) => [
    ['負数', -1],
    ['小数', 0.5],
    ['安全な整数の上限超過', Number.MAX_SAFE_INTEGER + 1],
    ['文字列', '1000'],
  ].map(([reason, amount]) => [field, reason, amount] as const)))(
    '%s の%sを保存・読み込み時に拒否し、元データを保持する',
    (field, _reason, amount) => {
      const base = fixtureRecord();
      const invalid = fixtureRecord({ basic: { ...base.basic, [field]: amount } });
      const store = new VisitStore(new MemoryStore());
      store.save(base);
      const before = store.exportRawJson();

      expect(() => store.save(invalid)).toThrow();
      expect(store.exportRawJson()).toBe(before);
      expect(() => store.importJson(JSON.stringify([invalid]))).toThrow();
      expect(store.exportRawJson()).toBe(before);
    },
  );

  it.each(costFields.flatMap((field) => [NaN, Infinity].map((amount) => [field, amount] as const)))(
    '%s の非有限値 %s を直接保存すると拒否し、元データを保持する',
    (field, amount) => {
      const base = fixtureRecord();
      const store = new VisitStore(new MemoryStore());
      store.save(base);
      const before = store.exportRawJson();

      expect(() => store.save(fixtureRecord({ basic: { ...base.basic, [field]: amount } }))).toThrow();
      expect(store.exportRawJson()).toBe(before);
    },
  );

  it('旧レコードの追加料金は、別レコードの保存とJSON往復後も省略されたままになる', () => {
    const oldRecord = fixtureRecord();
    const newBase = fixtureRecord({ id: 'new-record', seriesNo: 2 });
    const basicWithCosts = { ...newBase.basic, courseFee: 18000, optionFee: 0 };
    const newRecord = fixtureRecord({
      id: newBase.id,
      seriesNo: newBase.seriesNo,
      basic: basicWithCosts,
    });
    const store = new VisitStore(new MemoryStore());

    store.save(oldRecord);
    store.save(newRecord);
    const exported = store.exportJson();
    const restored = new VisitStore(new MemoryStore());
    restored.importJson(exported);

    for (const records of [store.loadAll(), restored.loadAll(), JSON.parse(exported)]) {
      const old = records.find((record: { id: string }) => record.id === oldRecord.id);
      const current = records.find((record: { id: string }) => record.id === newRecord.id);
      expect(old?.basic).not.toHaveProperty('courseFee');
      expect(old?.basic).not.toHaveProperty('optionFee');
      expect(current?.basic).toHaveProperty('courseFee', 18000);
      expect(current?.basic).toHaveProperty('optionFee', 0);
    }
  });
});
