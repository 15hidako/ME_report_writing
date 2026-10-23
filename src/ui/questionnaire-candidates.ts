import { CANDIDATE_LABELS, DOWNSIDE_SUGGESTIONS, NOTE_SUGGESTIONS, PHASE_NOTE_SUGGESTIONS, PHASE_SUGGESTIONS } from '../questionnaire-options';
import type { CandidateGroup } from '../questionnaire-options';
import { FLOW_PHASES, RATING_LABELS } from '../types';
import type { Ratings } from '../types';
import { chipButton, esc } from './widgets';

function renderPhraseSuggestions(groups: readonly CandidateGroup[] | undefined, target: string, targetLabel: string, description: string): string {
  if (groups === undefined) return '';
  const count = groups.reduce((total, group) => total + group.ids.length, 0);
  return `<details class="candidate-details">
    <summary>メモへ追加する表現（${count}）</summary>
    <p>${esc(description)}</p>
    ${groups.map((group) => `<h5>${esc(group.label)}</h5>${group.hint === undefined ? '' : `<p>${esc(group.hint)}</p>`}<div class="chips">
      ${group.ids.map((id) => {
        const label = CANDIDATE_LABELS[id];
        return `<button type="button" class="chip note-action" data-candidate="${esc(id)}" data-note-target="${esc(target)}" data-phrase="${esc(label)}" aria-label="${esc(`${label}を${targetLabel}へ追加`)}">${esc(label)}</button>`;
      }).join('')}
    </div>`).join('')}
    <p class="candidate-status" role="status" aria-live="polite"></p>
  </details>`;
}

export function renderNoteSuggestions(rating: keyof Ratings): string {
  return renderPhraseSuggestions(NOTE_SUGGESTIONS[rating], `note_${rating}`, `${RATING_LABELS[rating]}のメモ`,
    '押すとこの評価のメモへ追記します。実際の印象に合う表現を選び、必要に応じて書き換えてください。');
}

export function renderPhaseNoteSuggestions(phase: keyof typeof FLOW_PHASES): string {
  return renderPhraseSuggestions(PHASE_NOTE_SUGGESTIONS[phase], `flownote_${phase}`, `${FLOW_PHASES[phase].label}のメモ`,
    '押すとこの段階のメモへ追記します。実際に感じた段階だけで選び、必要に応じて書き換えてください。');
}

export function renderDownsideSuggestions(): string {
  return renderPhraseSuggestions(DOWNSIDE_SUGGESTIONS, 'downside', '残念ポイント',
    '押すと残念ポイントへ追記します。自分が気になった体験だけを選び、具体的な状況を書き足せます。');
}

export function renderFlowChecks(phase: keyof typeof FLOW_PHASES, selected: readonly string[]): string {
  const defaults = FLOW_PHASES[phase].checks;
  const candidates = PHASE_SUGGESTIONS[phase] ?? [];
  const known = new Set<string>([...defaults, ...candidates.map((id) => CANDIDATE_LABELS[id])]);
  const legacy = [...new Set(selected)].filter((value) => !known.has(value));
  const expanded = candidates.some((id) => selected.includes(CANDIDATE_LABELS[id]));
  return `<div class="chips" data-chips="flow_${phase}" data-multi="1">
    ${defaults.map((value) => chipButton({ value, label: value }, selected.includes(value))).join('')}
    ${candidates.length === 0 ? '' : `<details class="candidate-details" ${expanded ? 'open' : ''}>
      <summary>観察候補を開く（${candidates.length}）</summary>
      <p>この段階で実際にあったものを選びます。もう一度押すと解除できます。段階が不明な場合は選ばないでください。</p>
      <div class="chips">${candidates.map((id) => {
        const value = CANDIDATE_LABELS[id];
        return chipButton({ value, label: value, candidateId: id }, selected.includes(value));
      }).join('')}</div>
    </details>`}
    ${legacy.length === 0 ? '' : `<div class="legacy-values">
      <p class="legacy-caption">保存済みの観察（現在の候補にない表現も保持。押すと解除）</p>
      <div class="chips">${legacy.map((value) => chipButton({ value, label: value === '' ? '（空の保存値）' : value }, true)).join('')}</div>
    </div>`}
  </div>`;
}

export function bindNoteSuggestions(root: HTMLElement): void {
  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('button.note-action');
    if (button === null) return;
    const target = button.dataset.noteTarget;
    const input = target === undefined ? null : button.closest('form')?.elements.namedItem(target);
    const status = button.closest('.candidate-details')?.querySelector<HTMLElement>('.candidate-status');
    const phrase = button.dataset.phrase;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || phrase === undefined) return;
    // 部分一致では否定文などを誤判定するため、独立した区切りの一致だけを扱う。
    const segments = input.value.split(/[／/。；;、,\r\n]+/u).map((part) => part.trim());
    if (segments.includes(phrase)) {
      if (status) status.textContent = '同じ表現がメモにあるため、そのままにしました。';
      return;
    }
    const separator = input.value === '' || /[／/。；;、,\r\n]\s*$/u.test(input.value) ? '' : ' ／ ';
    input.value += separator + phrase;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (status) status.textContent = 'メモに追加しました。削除や書き換えは入力欄でできます。';
  });
}
