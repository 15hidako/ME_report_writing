// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import catalog from '../docs/research/men-esthe-2026-10-23/planning/c-vocabulary-candidates.json';
import { serializeRecord, specSummary, tagCandidates } from './prompt/serialize';
import { VisitStore } from './storage';
import { fixtureRecord, MemoryStore } from './test-fixtures';
import type { VisitRecord } from './types';
import { collectRecord, renderForm } from './ui/form';
import { bindChips } from './ui/widgets';

const groupName = { genre: 'genre', body: 'body', notes: 'specNotes' } as const;
const base = {
  id: 'test-id-1',
  seriesNo: 1,
  createdAt: '2026-07-01T10:00:00.000Z',
  revisitOf: null,
  postedUrl: null,
};

function mount(record: VisitRecord | null = null): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderForm(record, null);
  return root;
}

describe('C の追加語彙', () => {
  it('承認された20語を既存の系統・体型・特記のチップに表示する', () => {
    const root = mount();
    expect(catalog.candidates).toHaveLength(20);
    for (const entry of catalog.candidates) {
      const group = groupName[entry.group as keyof typeof groupName];
      expect(group, entry.id).toBeDefined();
      const chip = root.querySelector<HTMLButtonElement>(`[data-chips="${group}"] [data-value="${entry.proposed_value}"]`);
      expect(chip, entry.id).not.toBeNull();
      expect(chip!.textContent, entry.id).toBe(entry.proposed_label);
    }
  });

  it('新旧の複数選択と自由タグを収集し、検証付き保存・書出し・読込・再編集で保持する', () => {
    const root = mount(fixtureRecord());
    bindChips(root, vi.fn());
    for (const entry of catalog.candidates) {
      const group = groupName[entry.group as keyof typeof groupName];
      root.querySelector<HTMLButtonElement>(`[data-chips="${group}"] [data-value="${entry.proposed_value}"]`)!.click();
    }

    const collected = collectRecord(root, base);
    for (const [group, specKey] of [['genre', 'genre'], ['body', 'body'], ['notes', 'notes']] as const) {
      const values = catalog.candidates.filter((entry) => entry.group === group).map((entry) => entry.proposed_value);
      expect(collected.spec[specKey]).toEqual(expect.arrayContaining(values));
    }
    expect(collected.spec.genre).toContain('gal');
    expect(collected.spec.body).toContain('petite');
    expect(collected.spec.notes).toContain('ex_menesu');
    expect(collected.spec.freeTags).toEqual(['オイル']);

    const saved = new VisitStore(new MemoryStore());
    saved.save(collected);
    const imported = new VisitStore(new MemoryStore());
    imported.importJson(saved.exportJson());
    const loaded = imported.get(base.id)!;
    expect(loaded.spec).toEqual(collected.spec);
    expect(collectRecord(mount(loaded), base).spec).toEqual(collected.spec);
  });

  it('追加語彙をスペック文に出し、体型と自由タグの出力先を守る', () => {
    const source = fixtureRecord();
    const record = fixtureRecord({
      spec: {
        ...source.spec,
        genre: ['natural'],
        body: ['average_build'],
        notes: ['short_hair'],
        freeTags: ['手入力タグ'],
      },
    });

    expect(specSummary(record)).toBe('自然な雰囲気 / 標準的な体格 / Fカップ(盛ってる疑惑) / ショートヘア');
    expect(serializeRecord(record)).toContain(`[スペック]\n${specSummary(record)}`);
    const tags = tagCandidates(record);
    expect(tags).toContain('自然な雰囲気');
    expect(tags).toContain('ショートヘア');
    expect(tags).toContain('手入力タグ');
    expect(tags).not.toContain('標準的な体格');
    expect(specSummary(record)).not.toContain('手入力タグ');
  });
});
