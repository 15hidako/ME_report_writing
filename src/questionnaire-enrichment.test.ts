// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import adoptionLedger from '../docs/research/men-esthe-2026-10-23/planning/next-adoption-ledger.json';
import { serializeRecord } from './prompt/serialize';
import { VisitStore } from './storage';
import { fixtureRecord, MemoryStore } from './test-fixtures';
import type { VisitRecord } from './types';
import { bindLocationFields, collectRecord, renderForm } from './ui/form';
import { bindNoteSuggestions } from './ui/questionnaire-candidates';
import { bindChips, bindStars } from './ui/widgets';

const base = {
  id: 'test-id-1',
  seriesNo: 1,
  createdAt: '2026-07-01T10:00:00.000Z',
  revisitOf: null,
  postedUrl: null,
};

function mount(record: VisitRecord | null = null, revisitOf: VisitRecord | null = null): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderForm(record, revisitOf);
  bindLocationFields(root, () => {});
  return root;
}

function candidate(root: HTMLElement, id: string, within?: string): HTMLButtonElement {
  const selector = within === undefined
    ? `button[data-candidate="${id}"]`
    : `${within} button[data-candidate="${id}"]`;
  const button = root.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  return button!;
}

function note(root: HTMLElement, key: string): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>(`input[name="note_${key}"]`);
  expect(input).not.toBeNull();
  return input!;
}

function completeRequired(root: HTMLElement): void {
  const prefecture = root.querySelector<HTMLSelectElement>('select[name="prefecture"]')!;
  prefecture.value = '東京都';
  prefecture.dispatchEvent(new Event('change', { bubbles: true }));
  const area = root.querySelector<HTMLSelectElement>('select[name="area"]')!;
  area.value = 'other';
  area.dispatchEvent(new Event('change', { bubbles: true }));
  const other = root.querySelector<HTMLInputElement>('input[name="areaOther"]')!;
  other.value = '確認用';
  other.dispatchEvent(new Event('input', { bubbles: true }));
  root.querySelector<HTMLTextAreaElement>('textarea[name="bestMoment"]')!.value = '今回の記録';
}

const nextAdoption = adoptionLedger.records.filter((record) =>
  record.adoption_stage === 'next_existing_priority' || record.adoption_stage === 'next_existing_conditional');

const ratingTargets = {
  face: ['appearance_02', 'appearance_03', 'appearance_04'],
  style: ['appearance_06'],
  service: [
    'welcome_03', 'welcome_05', 'upsell_01', 'upsell_04', 'upsell_05',
    'conversation_amount_01', 'conversation_amount_03', 'conversation_amount_05',
    'conversation_amount_06', 'professionalism_05', 'professionalism_07',
    'comfort_distance_01', 'scope_confirmation_05', 'satisfaction_05',
  ],
  massage: [
    'assessment_05', 'technique_05', 'focus_08', 'pace_of_time_01', 'scope_confirmation_02',
  ],
} as const;

const actualPhaseChecks = [
  'price_clarity_05', 'upsell_03', 'room_facility_01', 'room_facility_02',
  'amenities_05', 'focus_02', 'focus_04', 'method_02', 'method_03',
  'pace_of_time_03', 'scope_confirmation_01',
] as const;

const downsideIds = [
  'booking_response_03', 'access_02', 'access_04', 'price_clarity_07',
  'cleanliness_04', 'shower_05', 'shower_06', 'scent_06',
  'pace_of_time_04', 'pace_of_time_05', 'downside_07', 'value_03', 'comparison_03',
] as const;

describe('次の既存欄へ採用する58語', () => {
  it('台帳の表示語を全て出し、先行29語と合わせて87種類にする', () => {
    const root = mount();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button[data-candidate]')];
    const renderedIds = new Set(buttons.map((button) => button.dataset.candidate));
    const expectedIds = nextAdoption.map((record) => record.candidate_id);

    expect(nextAdoption.filter((record) => record.adoption_stage === 'next_existing_priority')).toHaveLength(35);
    expect(nextAdoption.filter((record) => record.adoption_stage === 'next_existing_conditional')).toHaveLength(23);
    expect(new Set(expectedIds).size).toBe(58);
    expect(renderedIds.size).toBe(87);
    for (const record of nextAdoption) {
      const matches = buttons.filter((button) => button.dataset.candidate === record.candidate_id);
      expect(matches.length, record.candidate_id).toBeGreaterThan(0);
      const expectedLabel = record.candidate_id === 'price_clarity_05'
        ? '追加内容と料金の説明があった'
        : record.display_label_proposal;
      for (const button of matches) {
        expect(button.textContent?.trim(), record.candidate_id).toBe(expectedLabel);
      }
    }
  });

  it('評価理由、実際の段階、残念ポイントへ台帳どおりに配置する', () => {
    const root = mount();
    for (const [rating, ids] of Object.entries(ratingTargets)) {
      for (const id of ids) {
        expect(candidate(root, id).dataset.noteTarget, id).toBe(`note_${rating}`);
      }
    }
    const comfortTargets = [...root.querySelectorAll<HTMLButtonElement>('[data-candidate="comfort_distance_02"]')]
      .map((button) => button.dataset.noteTarget);
    expect(comfortTargets).toContain('note_service');
    expect(comfortTargets).toContain('note_massage');
    expect(comfortTargets).toContain('flownote_meeting');
    expect(root.querySelector('[data-candidate="satisfaction_05"][data-note-target="flownote_meeting"]')).not.toBeNull();

    for (const id of ['booking_flow_04', 'price_clarity_02', 'amenities_01']) {
      candidate(root, id, '[data-chips="flow_meeting"]');
    }
    for (const id of ['amenities_02', 'aftercare_02']) {
      candidate(root, id, '[data-chips="flow_after"]');
    }
    for (const id of actualPhaseChecks) {
      expect(root.querySelector(`[data-chips^="flow_"] button[data-candidate="${id}"]`), id).not.toBeNull();
    }
    for (const phase of ['meeting', 'faceDown', 'oilSp', 'faceUp', 'climax']) {
      const explanation = candidate(root, 'price_clarity_05', `[data-chips="flow_${phase}"]`);
      expect(explanation.dataset.value).toBe('追加内容と料金の説明があった');
    }
    expect(root.querySelector('[data-chips="flow_after"] [data-candidate="price_clarity_05"]')).toBeNull();
    for (const id of ['pace_of_time_02', 'comfort_distance_03']) {
      expect(candidate(root, id).dataset.noteTarget, id).toBe('flownote_meeting');
    }
    for (const id of ['cleanliness_01', 'comfort_03', 'scent_03']) {
      expect(candidate(root, id).dataset.noteTarget, id).toMatch(/^flownote_(meeting|faceDown|oilSp|faceUp|climax|after)$/);
    }
    for (const id of downsideIds) {
      expect(candidate(root, id).dataset.noteTarget, id).toBe('downside');
    }
  });

  it('残念ポイント候補は手入力と改行を保ち、再押下で重複せず保存・書出し・読込・serializeに渡る', () => {
    const root = mount();
    completeRequired(root);
    const downside = root.querySelector<HTMLTextAreaElement>('textarea[name="downside"]')!;
    downside.value = '自分の感想\n次の行';
    const input = vi.fn();
    downside.addEventListener('input', input);
    bindStars(root, vi.fn());
    bindChips(root, vi.fn());
    bindNoteSuggestions(root);
    const stars = root.querySelector('[data-star="service"]')?.getAttribute('data-value');
    const checks = collectRecord(root, base).flow.faceDown.checks;
    const button = candidate(root, 'value_03');
    button.click();
    expect(downside.value).toContain('自分の感想\n次の行');
    expect(downside.value).toContain('内容に対して割高に感じた');
    expect(input).toHaveBeenCalledOnce();
    const appended = downside.value;
    button.click();
    expect(downside.value).toBe(appended);
    expect(input).toHaveBeenCalledOnce();
    expect(collectRecord(root, base).flow.faceDown.checks).toEqual(checks);
    expect(root.querySelector('[data-star="service"]')?.getAttribute('data-value')).toBe(stars);

    const store = new VisitStore(new MemoryStore());
    store.save(collectRecord(root, base));
    expect(store.loadAll()[0]?.flow.downside).toBe(appended);
    const restored = new VisitStore(new MemoryStore());
    restored.importJson(store.exportJson());
    const loaded = restored.loadAll()[0]!;
    expect(loaded.flow.downside).toBe(appended);
    expect(collectRecord(mount(loaded), base).flow.downside).toBe(appended);
    expect(serializeRecord(loaded)).toContain(appended);
  });

  it('残念ポイントの読点リストにある語を再追加しない', () => {
    const root = mount();
    const downside = root.querySelector<HTMLTextAreaElement>('textarea[name="downside"]')!;
    const input = vi.fn();
    downside.addEventListener('input', input);
    bindNoteSuggestions(root);
    const button = candidate(root, 'value_03');
    downside.value = '前置き、内容に対して割高に感じた、別件';
    button.click();
    expect(downside.value).toBe('前置き、内容に対して割高に感じた、別件');
    downside.value = '前置き,内容に対して割高に感じた,別件';
    button.click();
    expect(downside.value).toBe('前置き,内容に対して割高に感じた,別件');
    expect(input).not.toHaveBeenCalled();
  });

  it('段階メモ候補は押した段階のメモだけへ入り、段階チップは同じ段階で保存される', () => {
    const root = mount();
    completeRequired(root);
    const meeting = root.querySelector<HTMLInputElement>('input[name="flownote_meeting"]')!;
    const after = root.querySelector<HTMLInputElement>('input[name="flownote_after"]')!;
    meeting.value = '対面時の感想';
    bindNoteSuggestions(root);
    bindChips(root, vi.fn());
    candidate(root, 'pace_of_time_02').click();
    candidate(root, 'booking_flow_04', '[data-chips="flow_meeting"]').click();
    expect(meeting.value).toContain('対面時の感想');
    expect(meeting.value).toContain('施術前の準備時間が長く感じられた');
    expect(after.value).toBe('');
    const collected = collectRecord(root, base);
    expect(collected.flow.meeting.note).toBe(meeting.value);
    expect(collected.flow.meeting.checks).toContain('入室後にコースの確認があった');
    expect(collected.flow.after.checks).not.toContain('入室後にコースの確認があった');
  });
});

describe('保存済みの段階別観察', () => {
  it('定義外の観察を編集して再収集しても元の段階に保持する', () => {
    const original = fixtureRecord({
      flow: {
        ...fixtureRecord().flow,
        faceDown: { checks: ['指圧', '旧い観察'], note: '' },
      },
    });
    const root = mount(original);

    const collected = collectRecord(root, base);

    expect(collected.flow.faceDown.checks).toEqual(['指圧', '旧い観察']);
  });

  it('HTML記号を含む旧値を選択済みで表示し、明示的な解除まで保存・書出し・読込で保持する', () => {
    const legacy = '旧い観察 <& "引用">';
    const source = fixtureRecord({
      flow: { ...fixtureRecord().flow, faceDown: { checks: ['指圧', legacy, ''], note: '' } },
    });
    const root = mount(source);
    const wrap = root.querySelector('[data-chips="flow_faceDown"]');
    expect(root.querySelectorAll('[data-chips="flow_faceDown"]')).toHaveLength(1);
    expect(root.querySelector('script, [onclick]')).toBeNull();
    const savedChip = [...(wrap?.querySelectorAll<HTMLButtonElement>('button.chip') ?? [])]
      .find((button) => button.getAttribute('data-value') === legacy);
    expect(savedChip?.getAttribute('aria-pressed')).toBe('true');
    expect([...wrap!.querySelectorAll<HTMLButtonElement>('button.chip')]
      .some((button) => button.getAttribute('data-value') === '' && button.getAttribute('aria-pressed') === 'true')).toBe(true);
    const store = new VisitStore(new MemoryStore());
    store.save(collectRecord(root, base));
    expect(store.loadAll()[0]?.flow.faceDown.checks).toContain(legacy);
    expect(store.loadAll()[0]?.flow.faceDown.checks).toContain('');

    const restored = new VisitStore(new MemoryStore());
    restored.importJson(store.exportJson());
    const again = mount(restored.loadAll()[0]);
    const collected = collectRecord(again, base);
    expect(collected.flow.faceDown.checks).toContain(legacy);
    expect(collected.flow.faceDown.checks).toContain('');
    expect(serializeRecord(collected)).toContain(`うつ伏せ前半: 指圧 / ${legacy}`);

    bindChips(again, vi.fn());
    const chip = [...again.querySelectorAll<HTMLButtonElement>('[data-chips="flow_faceDown"] button.chip')]
      .find((button) => button.getAttribute('data-value') === legacy)!;
    chip.click();
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(collectRecord(again, base).flow.faceDown.checks).not.toContain(legacy);
  });
});

describe('Bの評価メモ候補', () => {
  it('手入力を残して対象メモだけへ追記し、星を変えず入力変更を通知する', () => {
    const root = mount();
    const service = note(root, 'service');
    const face = note(root, 'face');
    service.value = '自分の感想  ';
    const input = vi.fn();
    service.addEventListener('input', input);
    bindStars(root, vi.fn());
    bindNoteSuggestions(root);
    const stars = root.querySelector('[data-star="service"]')?.getAttribute('data-value');
    const button = candidate(root, 'conversation_style_03');
    expect(button.getAttribute('data-note-target')).toBe('note_service');
    expect(button.getAttribute('aria-pressed')).toBeNull();
    button.click();
    expect(service.value).toBe('自分の感想   ／ 話しやすかった');
    expect(face.value).toBe('');
    expect(input).toHaveBeenCalledOnce();
    expect(root.querySelector('[data-star="service"]')?.getAttribute('data-value')).toBe(stars);
    expect(button.getAttribute('aria-pressed')).toBeNull();
  });

  it('独立語は再追加せず、否定文中の部分一致は追加する', () => {
    const root = mount();
    const service = note(root, 'service');
    bindNoteSuggestions(root);
    const button = candidate(root, 'conversation_style_03');
    const input = vi.fn();
    service.addEventListener('input', input);
    service.value = '話しやすかったとは言えない';
    button.click();
    expect(service.value).toBe('話しやすかったとは言えない ／ 話しやすかった');
    expect(input).toHaveBeenCalledOnce();
    button.click();
    expect(service.value).toBe('話しやすかったとは言えない ／ 話しやすかった');
    expect(input).toHaveBeenCalledOnce();
    service.value = '前置き。 話しやすかった；別件';
    button.click();
    expect(service.value).toBe('前置き。 話しやすかった；別件');
  });

  it('評価メモの読点リストにある語を再追加せず、末尾の読点の後にはそのまま追記する', () => {
    const root = mount();
    const service = note(root, 'service');
    const input = vi.fn();
    service.addEventListener('input', input);
    bindNoteSuggestions(root);
    const button = candidate(root, 'conversation_style_03');
    service.value = '話しやすかった、気配りがあった';
    button.click();
    expect(service.value).toBe('話しやすかった、気配りがあった');
    service.value = '気配りがあった,話しやすかった';
    button.click();
    expect(service.value).toBe('気配りがあった,話しやすかった');
    expect(input).not.toHaveBeenCalled();
    service.value = '気配りがあった、';
    button.click();
    expect(service.value).toBe('気配りがあった、話しやすかった');
    expect(input).toHaveBeenCalledOnce();
  });
});

describe('Dの段階別候補', () => {
  it('定番チェックと追加候補を押した順に収集し、保存後の無操作再保存でも順番を保つ', () => {
    const root = mount();
    completeRequired(root);
    bindChips(root, vi.fn());
    const extra = candidate(root, 'focus_06', '[data-chips="flow_faceDown"]');
    const standard = root.querySelector<HTMLButtonElement>('[data-chips="flow_faceDown"] [data-value="指圧"]')!;
    extra.click();
    standard.click();
    const expected = [extra.dataset.value!, '指圧'];
    expect(collectRecord(root, base).flow.faceDown.checks).toEqual(expected);
    const order = root.querySelector('[data-chips="flow_faceDown"] .selection-order');
    expect([...order!.querySelectorAll('li')].map((item) => item.textContent)).toEqual(expected);

    const store = new VisitStore(new MemoryStore());
    store.save(collectRecord(root, base));
    const reloaded = mount(store.get(base.id)!);
    expect(collectRecord(reloaded, base).flow.faceDown.checks).toEqual(expected);
    store.save(collectRecord(reloaded, base));
    expect(store.get(base.id)!.flow.faceDown.checks).toEqual(expected);
  });

  it('途中の解除で残った順番を変えず、再選択は末尾へ追加し、全解除も保存できる', () => {
    const root = mount();
    completeRequired(root);
    const changed = vi.fn();
    bindChips(root, changed);
    const wrap = root.querySelector('[data-chips="flow_faceDown"]')!;
    const first = candidate(root, 'focus_06', '[data-chips="flow_faceDown"]');
    const middle = wrap.querySelector<HTMLButtonElement>('[data-value="圧弱め"]')!;
    const last = wrap.querySelector<HTMLButtonElement>('[data-value="指圧"]')!;
    first.click();
    middle.click();
    last.click();
    middle.click();
    expect(collectRecord(root, base).flow.faceDown.checks).toEqual([first.dataset.value, '指圧']);
    middle.click();
    expect(collectRecord(root, base).flow.faceDown.checks).toEqual([first.dataset.value, '指圧', '圧弱め']);
    for (const chip of [first, middle, last]) chip.click();
    const collected = collectRecord(root, base);
    const store = new VisitStore(new MemoryStore());
    store.save(collected);
    expect(store.get(base.id)!.flow.faceDown.checks).toEqual([]);
    expect(wrap.querySelector<HTMLElement>('.selection-order')!.hidden).toBe(true);
    expect(changed).toHaveBeenCalledTimes(8);
  });

  it('旧値の保存順と空文字を保持し、追加しても旧順が確認済みの経過にはならない', () => {
    const legacy = '旧い観察 <& "引用">';
    const selected = [legacy, '', '圧弱め', '指圧'];
    const source = fixtureRecord({ flow: { ...fixtureRecord().flow, faceDown: { checks: selected, note: '' } } });
    const root = mount(source);
    const wrap = root.querySelector('[data-chips="flow_faceDown"]')!;
    expect(collectRecord(root, base).flow.faceDown.checks).toEqual(selected);
    expect([...wrap.querySelectorAll('.selection-order li')].map((item) => item.textContent))
      .toEqual([legacy, '（空の保存値）', '圧弱め', '指圧']);
    expect(wrap.querySelector('.selection-order')!.textContent).toContain('旧記録は保存された並び');
    expect(wrap.querySelector('.selection-order script, .selection-order [onclick]')).toBeNull();
    const store = new VisitStore(new MemoryStore());
    store.save(collectRecord(root, base));
    const reloaded = mount(store.get(base.id)!);
    store.save(collectRecord(reloaded, base));
    expect(store.get(base.id)!.flow.faceDown.checks).toEqual(selected);
    bindChips(root, vi.fn());
    candidate(root, 'focus_06', '[data-chips="flow_faceDown"]').click();
    expect(collectRecord(root, base).flow.faceDown.checks.slice(0, 4)).toEqual(selected);
    const empty = wrap.querySelector<HTMLButtonElement>('[data-value=""]')!;
    empty.click();
    expect(collectRecord(root, base).flow.faceDown.checks).not.toContain('');
    empty.click();
    expect(collectRecord(root, base).flow.faceDown.checks.at(-1)).toBe('');
  });

  it('二つの段階の同じ語を独立した順番で保持する', () => {
    const root = mount();
    completeRequired(root);
    bindChips(root, vi.fn());
    const down = candidate(root, 'focus_06', '[data-chips="flow_faceDown"]');
    const oil = candidate(root, 'focus_06', '[data-chips="flow_oilSp"]');
    const downStandard = root.querySelector<HTMLButtonElement>('[data-chips="flow_faceDown"] [data-value="指圧"]')!;
    const oilStandard = root.querySelector<HTMLButtonElement>('[data-chips="flow_oilSp"] [data-value="SPPN"]')!;
    down.click();
    downStandard.click();
    oilStandard.click();
    oil.click();
    expect(collectRecord(root, base).flow.faceDown.checks).toEqual([down.dataset.value, '指圧']);
    expect(collectRecord(root, base).flow.oilSp.checks).toEqual(['SPPN', oil.dataset.value]);
    down.click();
    expect(collectRecord(root, base).flow.oilSp.checks).toEqual(['SPPN', oil.dataset.value]);
  });

  it('同じ候補を二つの段階で独立に選択・解除できる', () => {
    const root = mount();
    completeRequired(root);
    bindChips(root, vi.fn());
    const down = candidate(root, 'focus_06', '[data-chips="flow_faceDown"]');
    const oil = candidate(root, 'focus_06', '[data-chips="flow_oilSp"]');
    down.click();
    oil.click();
    expect(collectRecord(root, base).flow.faceDown.checks).toContain(down.getAttribute('data-value'));
    expect(collectRecord(root, base).flow.oilSp.checks).toContain(oil.getAttribute('data-value'));
    down.click();
    expect(down.getAttribute('aria-pressed')).toBe('false');
    expect(oil.getAttribute('aria-pressed')).toBe('true');
    expect(collectRecord(root, base).flow.faceDown.checks).not.toContain(down.getAttribute('data-value'));
    expect(collectRecord(root, base).flow.oilSp.checks).toContain(oil.getAttribute('data-value'));
  });

  it('再訪の新規入力へ前回の評価理由や段階別観察を事前選択しない', () => {
    const previous = fixtureRecord({
      flow: { ...fixtureRecord().flow, faceDown: { checks: ['指圧', '手のひらまでケア', '旧い観察'], note: '前回の記録' } },
    });
    const root = mount(null, previous);
    completeRequired(root);
    expect(note(root, 'service').value).toBe('');
    expect(collectRecord(root, { ...base, id: 'revisit-id', revisitOf: previous.id }).flow.faceDown)
      .toEqual({ checks: [], note: '' });
  });
});

it.each([
  { id: 'conversation_style_03', selector: 'input[name="note_service"]', phrase: '話しやすかった' },
  { id: 'value_03', selector: 'textarea[name="downside"]', phrase: '内容に対して割高に感じた' },
])('候補 $id の追記だけでも新規入力への切替前に破棄確認する', async ({ id, selector, phrase }) => {
  vi.resetModules();
  window.localStorage.clear();
  document.body.innerHTML = '<nav><button data-tab="list">履歴</button><button data-tab="form">入力</button><button data-tab="thumb">サムネ</button></nav><main id="app"></main>';
  try {
    await import('./main');
    const button = (name: string): HTMLButtonElement => {
      const match = [...document.querySelectorAll<HTMLButtonElement>('button')]
        .find((item) => item.textContent?.trim() === name);
      expect(match, name).toBeDefined();
      return match!;
    };
    button('入力').click();
    candidate(document.body, id).click();
    expect(document.body.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)?.value).toBe(phrase);
    button('履歴').click();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    button('+ 新規入力').click();
    expect(confirm).toHaveBeenCalledOnce();
    button('入力').click();
    expect(document.body.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)?.value).toBe(phrase);
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    window.localStorage.clear();
  }
});
