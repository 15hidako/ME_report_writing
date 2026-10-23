// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as form from './ui/form';
import { serializeRecord } from './prompt/serialize';
import { VisitStore } from './storage';
import { fixtureRecord, MemoryStore } from './test-fixtures';
import type { VisitRecord } from './types';

type Option = { type: string; detail: string; price: number | null };

const base = {
  id: 'test-id-1', seriesNo: 1, createdAt: '2026-07-01T10:00:00.000Z',
  revisitOf: null, postedUrl: null,
};

function withOptions(options: readonly Option[] | undefined): VisitRecord {
  const original = fixtureRecord();
  return fixtureRecord({
    basic: { ...original.basic, ...(options === undefined ? {} : { options }) },
  });
}

function show(record: VisitRecord | null = null, revisitOf: VisitRecord | null = null): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = form.renderForm(record, revisitOf);
  document.body.replaceChildren(root);
  return root;
}

function control(root: HTMLElement, name: string): HTMLInputElement | HTMLSelectElement {
  const element = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`);
  if (!element) throw new Error(`入力欄がありません: ${name}`);
  return element;
}

function change(root: HTMLElement, name: string, value: string): void {
  const element = control(root, name);
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function activeRows(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-option-index]')].filter((row) => !row.hidden);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('オプション種類の入力', () => {
  it('未確認と0種類を区別し、件数に応じた入力行を表示する', () => {
    const root = show(withOptions(undefined));
    form.bindOptionFields(root, () => {});

    expect(control(root, 'optionCount').value).toBe('');
    expect([...((control(root, 'optionCount') as HTMLSelectElement).options)].map((option) => option.value))
      .toEqual(['', ...Array.from({ length: 11 }, (_, index) => String(index))]);
    expect(activeRows(root)).toHaveLength(0);
    change(root, 'optionCount', '2');
    expect(activeRows(root).map((row) => row.dataset.optionIndex)).toEqual(['0', '1']);
    expect(control(root, 'optionType_1').disabled).toBe(false);

    change(root, 'optionCount', '0');
    expect(activeRows(root)).toHaveLength(0);
    expect(form.collectRecord(root, base).basic).toHaveProperty('options', []);
    change(root, 'optionCount', '');
    expect(form.collectRecord(root, base).basic).not.toHaveProperty('options');
  });

  it('件数を減らして戻した下書きを保ち、保存対象は有効な行だけにする', () => {
    const root = show(withOptions([]));
    const onChange = vi.fn();
    form.bindOptionFields(root, onChange);

    change(root, 'optionCount', '2');
    expect(onChange).toHaveBeenCalledOnce();
    onChange.mockClear();
    change(root, 'optionType_0', 'costume');
    expect(onChange).toHaveBeenCalledOnce();
    change(root, 'optionType_1', 'powder');
    change(root, 'optionDetail_1', '追加パウダー');
    change(root, 'optionPrice_1', '4000');

    change(root, 'optionCount', '1');
    expect(root.querySelector<HTMLFieldSetElement>('[data-option-index="1"]')?.disabled).toBe(true);
    expect(form.collectRecord(root, base).basic).toHaveProperty('options', [
      { type: 'costume', detail: '', price: null },
    ]);
    change(root, 'optionCount', '2');
    expect(control(root, 'optionType_1').value).toBe('powder');
    expect(control(root, 'optionDetail_1').value).toBe('追加パウダー');
    expect(control(root, 'optionPrice_1').value).toBe('4000');
    expect(form.collectRecord(root, base).basic).toHaveProperty('options', [
      { type: 'costume', detail: '', price: null },
      { type: 'powder', detail: '追加パウダー', price: 4000 },
    ]);
  });

  it('既存の未知の種類、0円、未確認額を保持し、実際の選択と支払額は変えない', () => {
    const original = withOptions([
      { type: 'legacy-special', detail: '以前の特別コース', price: 0 },
      { type: 'wash', detail: '洗体', price: null },
    ]);
    const root = show(original);
    form.bindOptionFields(root, () => {});

    expect(control(root, 'optionCount').value).toBe('2');
    expect(control(root, 'optionType_0').value).toBe('legacy-special');
    expect(control(root, 'optionPrice_0').value).toBe('0');
    expect(control(root, 'optionPrice_1').value).toBe('');
    const saved = form.collectRecord(root, base);
    expect(saved.basic).toMatchObject({
      options: original.basic.options,
      optionSystem: original.basic.optionSystem,
      optionChosen: original.basic.optionChosen,
      optionFee: null,
    });
  });

  it('未知の種類名とHTML記号を含む詳細を再編集で安全に保持する', () => {
    const original = withOptions([
      { type: '__proto__', detail: '<img src=x onerror=alert(1)>', price: 0 },
    ]);
    const root = show(original);
    form.bindOptionFields(root, () => {});

    expect(root.querySelector('img')).toBeNull();
    expect(control(root, 'optionType_0').value).toBe('__proto__');
    expect(control(root, 'optionDetail_0').value).toBe('<img src=x onerror=alert(1)>');
    expect(form.collectRecord(root, base).basic.options).toEqual(original.basic.options);
  });

  it.each(['-1', '0.5', '1.0000000000000001', '9007199254740992'])(
    '種類別の金額 %s を保存時に拒否する', (raw) => {
      const root = show(withOptions([{ type: 'other', detail: '', price: null }]));
      form.bindOptionFields(root, () => {});
      control(root, 'optionPrice_0').value = raw;
      expect(() => form.collectRecord(root, base)).toThrow(/金額|料金/);
      expect(control(root, 'optionPrice_0').value).toBe(raw);
    },
  );

  it('再訪では前回の種類別料金を今回の入力へ引き継がない', () => {
    const previous = withOptions([{ type: 'extension', detail: '延長30分', price: 5000 }]);
    const root = show(null, previous);
    expect(control(root, 'optionCount').value).toBe('');
    expect(activeRows(root)).toHaveLength(0);
  });
});

describe('オプション種類の保存と出力', () => {
  it('種類別情報をJSON往復で保持し、旧記録には推測した配列を追加しない', () => {
    const current = withOptions([
      { type: 'costume', detail: '衣装A', price: 4000 },
      { type: 'other', detail: '詳細未確認', price: null },
      { type: 'wash', detail: '洗体', price: 0 },
    ]);
    const old = fixtureRecord({ id: 'old', seriesNo: 2 });
    const store = new VisitStore(new MemoryStore());
    store.save(current);
    store.save(old);
    const json = store.exportJson();
    const restored = new VisitStore(new MemoryStore());
    restored.importJson(json);

    expect(restored.get(current.id)?.basic).toMatchObject({
      options: current.basic.options,
      optionSystem: current.basic.optionSystem,
      optionChosen: current.basic.optionChosen,
    });
    expect(restored.get(old.id)?.basic).not.toHaveProperty('options');
    expect(JSON.parse(json)[1].basic).not.toHaveProperty('options');
  });

  it.each([
    ['配列以外', 'unknown'],
    ['種類が文字列以外', [{ type: 1, detail: '', price: null }]],
    ['詳細が欠落', [{ type: 'costume', price: null }]],
    ['金額が文字列', [{ type: 'costume', detail: '', price: '4000' }]],
    ['負の金額', [{ type: 'costume', detail: '', price: -1 }]],
    ['小数の金額', [{ type: 'costume', detail: '', price: 0.5 }]],
    ['安全な整数の上限超過', [{ type: 'costume', detail: '', price: Number.MAX_SAFE_INTEGER + 1 }]],
    ['上限を超える11件', Array.from({ length: 11 }, () => ({ type: 'costume', detail: '', price: null }))],
  ])('不正な種類別情報（%s）を保存・読込の両方で拒否する', (_reason, options) => {
    const valid = fixtureRecord();
    const invalid = fixtureRecord({ basic: { ...valid.basic, options } as VisitRecord['basic'] });
    const store = new VisitStore(new MemoryStore());
    store.save(valid);
    const before = store.exportRawJson();

    expect(() => store.save(invalid)).toThrow();
    expect(store.exportRawJson()).toBe(before);
    expect(() => store.importJson(JSON.stringify([invalid]))).toThrow();
    expect(store.exportRawJson()).toBe(before);
  });

  it('種類・詳細・設定料金を全件出力し、実際の選択欄も区別して残す', () => {
    const original = withOptions([
      { type: 'costume', detail: '限定衣装A', price: 4000 },
      { type: 'powder', detail: '追加パウダーB', price: null },
      { type: 'other', detail: '特別メニューC', price: 0 },
    ]);
    const text = serializeRecord(original);
    expect(text).toContain('限定衣装A');
    expect(text).toContain('追加パウダーB');
    expect(text).toContain('特別メニューC');
    expect(text).toMatch(/4,?000円/);
    expect(text).toContain('0円');
    expect(text).toContain(original.basic.optionChosen);
  });
});
