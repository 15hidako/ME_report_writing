// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureRecord, MemoryStore } from './test-fixtures';
import { VisitStore } from './storage';
import type { VisitRecord } from './types';
import { bindLocationFields, collectRecord, renderForm } from './ui/form';

const base = {
  id: 'test-id-1', seriesNo: 1, createdAt: '2026-07-01T10:00:00.000Z',
  revisitOf: null, postedUrl: null,
};

function show(record: VisitRecord | null = null, revisitOf: VisitRecord | null = null): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderForm(record, revisitOf);
  document.body.replaceChildren(root);
  return root;
}

function select(root: HTMLElement, name: 'prefecture' | 'area'): HTMLSelectElement {
  const element = root.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
  if (!element) throw new Error(`${name} の選択欄がありません`);
  return element;
}

function other(root: HTMLElement, name: 'prefecture' | 'area'): HTMLInputElement {
  const element = root.querySelector<HTMLInputElement>(`input[name="${name}Other"]`);
  if (!element) throw new Error(`${name} のその他入力欄がありません`);
  return element;
}

function choose(root: HTMLElement, name: 'prefecture' | 'area', value: string): void {
  const element = select(root, name);
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function visitWith(prefecture: string, area: string): VisitRecord {
  const original = fixtureRecord();
  return fixtureRecord({ basic: { ...original.basic, prefecture, area } });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('都道府県とエリアの選択', () => {
  it('選択肢と未選択の初期状態を示し、両方の選択を保存に要求する', () => {
    const root = show();
    bindLocationFields(root, () => {});
    expect([...select(root, 'prefecture').options].map((option) => [option.value, option.textContent?.trim()]))
      .toEqual([['', '未選択'], ['東京都', '東京'], ['神奈川県', '神奈川'], ['other', 'その他']]);
    expect([...select(root, 'area').options].map((option) => [option.value, option.textContent?.trim()]))
      .toEqual([['', '未選択'], ['武蔵小杉', '武蔵小杉'], ['恵比寿', '恵比寿'],
        ['中目黒', '中目黒'], ['新宿', '新宿'], ['蒲田', '蒲田'], ['other', 'その他']]);
    expect(select(root, 'prefecture').value).toBe('');
    expect(select(root, 'area').value).toBe('');
    root.querySelector<HTMLTextAreaElement>('textarea[name="bestMoment"]')!.value = '確認用';

    expect(() => collectRecord(root, base)).toThrow(/都道府県|エリア/);
    choose(root, 'prefecture', '東京都');
    expect(() => collectRecord(root, base)).toThrow(/都道府県|エリア/);
    choose(root, 'area', '武蔵小杉');
    expect(collectRecord(root, base).basic).toMatchObject({ prefecture: '東京都', area: '武蔵小杉' });
  });

  it('その他の入力だけを有効にし、切替後も下書きを保持して選択値を保存する', () => {
    const root = show(fixtureRecord());
    const changed = vi.fn();
    bindLocationFields(root, changed);
    choose(root, 'prefecture', 'other');
    choose(root, 'area', 'other');
    for (const name of ['prefecture', 'area'] as const) {
      expect(root.querySelector<HTMLElement>(`#${name}-other-field`)?.hidden).toBe(false);
      expect(other(root, name).disabled).toBe(false);
      expect(other(root, name).required).toBe(true);
    }
    other(root, 'prefecture').value = '大阪府';
    other(root, 'area').value = '梅田';
    expect(changed).toHaveBeenCalledTimes(2);

    choose(root, 'prefecture', '神奈川県');
    choose(root, 'area', '新宿');
    for (const name of ['prefecture', 'area'] as const) {
      expect(root.querySelector<HTMLElement>(`#${name}-other-field`)?.hidden).toBe(true);
      expect(other(root, name).disabled).toBe(true);
      expect(other(root, name).required).toBe(false);
    }
    expect(collectRecord(root, base).basic).toMatchObject({ prefecture: '神奈川県', area: '新宿' });
    choose(root, 'prefecture', 'other');
    choose(root, 'area', 'other');
    expect(other(root, 'prefecture').value).toBe('大阪府');
    expect(other(root, 'area').value).toBe('梅田');
    expect(collectRecord(root, base).basic).toMatchObject({ prefecture: '大阪府', area: '梅田' });
  });

  it('その他の空白だけを拒否し、保存値に other を入れない', () => {
    const root = show(fixtureRecord());
    bindLocationFields(root, () => {});
    choose(root, 'prefecture', 'other');
    other(root, 'prefecture').value = '   ';
    choose(root, 'area', '恵比寿');
    expect(() => collectRecord(root, base)).toThrow(/都道府県/);
    other(root, 'prefecture').value = '大阪府';
    choose(root, 'area', 'other');
    other(root, 'area').value = '\t  ';
    expect(() => collectRecord(root, base)).toThrow(/エリア/);
    other(root, 'area').value = '難波';
    expect(collectRecord(root, base).basic).toMatchObject({ prefecture: '大阪府', area: '難波' });
  });

  it('旧レコードの任意の地名とHTML記号を安全に復元してJSON往復で保つ', () => {
    const original = visitWith('大阪府', '恵比寿・中目黒 <img src=x onerror=alert(1)>');
    const root = show(original);
    bindLocationFields(root, () => {});
    expect(select(root, 'prefecture').value).toBe('other');
    expect(select(root, 'area').value).toBe('other');
    expect(other(root, 'prefecture').value).toBe('大阪府');
    expect(other(root, 'area').value).toBe(original.basic.area);
    expect(root.querySelector('img')).toBeNull();
    const collected = collectRecord(root, base);
    expect(collected.basic).toMatchObject({ prefecture: original.basic.prefecture, area: original.basic.area });

    const store = new VisitStore(new MemoryStore());
    store.save(collected);
    const restored = new VisitStore(new MemoryStore());
    restored.importJson(store.exportJson());
    expect(restored.get(base.id)?.basic).toMatchObject({
      prefecture: original.basic.prefecture, area: original.basic.area,
    });
  });

  it('再訪入力には前回の都道府県とエリアを引き継ぐ', () => {
    const previous = visitWith('神奈川県', '武蔵小杉');
    const root = show(null, previous);
    bindLocationFields(root, () => {});
    expect(select(root, 'prefecture').value).toBe('神奈川県');
    expect(select(root, 'area').value).toBe('武蔵小杉');
    root.querySelector<HTMLTextAreaElement>('textarea[name="bestMoment"]')!.value = '再訪の記録';
    expect(collectRecord(root, { ...base, id: 'revisit', revisitOf: previous.id }).basic)
      .toMatchObject({ prefecture: '神奈川県', area: '武蔵小杉' });
  });
});
