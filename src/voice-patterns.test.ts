// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { fixtureRecord, MemoryStore } from './test-fixtures';
import { VisitStore } from './storage';
import { serializeRecord } from './prompt/serialize';
import { collectRecord, renderForm } from './ui/form';
import { bindNoteSuggestions } from './ui/questionnaire-candidates';
import { renderVoiceFields } from './ui/voice-patterns';
import { bindChips, chipValues } from './ui/widgets';
import type { Voice } from './types';

function mountVoice(voice?: Voice): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `<form>${renderVoiceFields(voice)}</form>`;
  document.body.replaceChildren(root);
  return root;
}

function mountForm() {
  const record = fixtureRecord({ voice: { ...fixtureRecord().voice, speechTopics: [] } });
  const root = document.createElement('div');
  root.innerHTML = renderForm(record, null);
  document.body.replaceChildren(root);
  return { record, root };
}

describe('臨場感素材', () => {
  it('会話の話題は新規では未選択で、セリフ欄には何も補わない', () => {
    const root = mountVoice(undefined);
    expect(chipValues(root, 'speechTopics')).toEqual([]);
    expect(root.querySelector<HTMLInputElement>('input[name="herLine1"]')?.value).toBe('');
    expect(root.querySelector<HTMLInputElement>('input[name="herLine2"]')?.value).toBe('');
    expect(root.querySelector<HTMLInputElement>('input[name="herLine3"]')?.value).toBe('');
  });

  it('保存済みの話題と実際のセリフ・心の声・フックを復元する', () => {
    const voice = {
      ...fixtureRecord().voice,
      speechTopics: ['welcome', 'conversation'] as const,
      herLines: ['本人が覚えている発言', '続きの発言'],
      innerVoice: ['自分の感想'],
      titleHook: '自分の見出し',
    };
    const root = mountVoice(voice);
    expect(chipValues(root, 'speechTopics')).toEqual(['welcome', 'conversation']);
    expect(root.querySelector('details:has(input[name="herLine1"])')?.hasAttribute('open')).toBe(true);
    expect(root.querySelector<HTMLInputElement>('input[name="herLine1"]')?.value).toBe('本人が覚えている発言');
    expect(root.querySelector<HTMLInputElement>('input[name="herLine2"]')?.value).toBe('続きの発言');
    expect(root.querySelector<HTMLInputElement>('input[name="inner1"]')?.value).toBe('自分の感想');
    expect(root.querySelector<HTMLInputElement>('input[name="titleHook"]')?.value).toBe('自分の見出し');
  });

  it('候補は手動入力を残して追記し、重複を避けて入力イベントを発火する', () => {
    const root = mountVoice(undefined);
    bindNoteSuggestions(root);
    const field = root.querySelector<HTMLInputElement>('input[name="inner1"]')!;
    const candidate = root.querySelector<HTMLButtonElement>('button.note-action[data-note-target="inner1"]')!;
    field.value = '元の感想';
    const onInput = vi.fn();
    field.addEventListener('input', onInput);
    expect(candidate.type).toBe('button');
    candidate.click();
    expect(field.value).toBe(`元の感想 ／ ${candidate.dataset.phrase}`);
    expect(onInput).toHaveBeenCalledOnce();
    candidate.click();
    expect(field.value).toBe(`元の感想 ／ ${candidate.dataset.phrase}`);
    expect(onInput).toHaveBeenCalledOnce();
    expect(root.querySelector<HTMLInputElement>('input[name="herLine1"]')?.value).toBe('');
  });

  it('話題チップは通常のボタンとして選択でき、セリフ入力は変えない', () => {
    const root = mountVoice(undefined);
    const onChange = vi.fn();
    bindChips(root, onChange);
    const topic = root.querySelector<HTMLButtonElement>('[data-chips="speechTopics"] button[data-value="preference_check"]')!;
    expect(topic.type).toBe('button');
    topic.click();
    expect(chipValues(root, 'speechTopics')).toEqual(['preference_check']);
    expect(topic.getAttribute('aria-pressed')).toBe('true');
    expect(onChange).toHaveBeenCalledOnce();
    expect(root.querySelector<HTMLInputElement>('input[name="herLine1"]')?.value).toBe('');
  });

  it('選んだ話題をフォームから保存し、JSON取込後も保持する', () => {
    const { record, root } = mountForm();
    bindChips(root, () => {});
    root.querySelector<HTMLButtonElement>('[data-chips="speechTopics"] button[data-value="aftercare"]')!.click();
    const collected = collectRecord(root, {
      id: record.id,
      seriesNo: record.seriesNo,
      createdAt: record.createdAt,
      revisitOf: record.revisitOf,
      postedUrl: record.postedUrl,
    });
    expect(collected.voice.speechTopics).toEqual(['aftercare']);
    expect(collected.voice.herLines).toEqual(record.voice.herLines);
    const source = new VisitStore(new MemoryStore());
    source.save(collected);
    const target = new VisitStore(new MemoryStore());
    target.importJson(source.exportJson());
    expect(target.get(record.id)?.voice.speechTopics).toEqual(['aftercare']);
  });

  it('記事素材では話題を独立して渡し、発言を補わない', () => {
    const base = fixtureRecord();
    const record = fixtureRecord({
      voice: {
        ...base.voice,
        speechTopics: ['welcome'],
        herLines: [],
        innerVoice: [],
        titleHook: '',
      },
    });
    const text = serializeRecord(record);
    expect(text).toMatch(/- [^\n]*話題[^\n]*出迎え・あいさつ/);
    expect(text).toContain('- 彼女のセリフ: なし');
    expect(text).not.toMatch(/- 彼女のセリフ:.*「/);
  });
});
