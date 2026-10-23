import '../../src/styles.css';
import './questionnaire-enrichment.css';
import { bindCourseFields, collectRecord, renderForm } from '../../src/ui/form';
import { bindChips, bindStars } from '../../src/ui/widgets';
import { bindNoteSuggestions } from '../../src/ui/questionnaire-candidates';
import type { VisitRecord } from '../../src/types';
import { serializeRecord } from '../../src/prompt/serialize';

function requiredElement<T extends Element>(selector: string, scope: ParentNode = document): T {
  const element = scope.querySelector<T>(selector);
  if (element === null) throw new Error(`確認用の要素が見つかりません: ${selector}`);
  return element;
}

const root = requiredElement<HTMLElement>('#prototype-form');
const status = requiredElement<HTMLElement>('#prototype-status');
const output = requiredElement<HTMLElement>('#prototype-output');
const base = {
  id: 'questionnaire-ui-example', seriesNo: 1, createdAt: '2026-10-23T00:00:00.000Z',
  revisitOf: null, postedUrl: null,
};

function changed(): void {
  output.hidden = true;
  status.textContent = '入力を変更しました。このページ内だけで保持しています。';
}

function showForm(record: VisitRecord): void {
  root.innerHTML = renderForm(record, null);
  const mode = requiredElement<HTMLElement>('.form-mode', root);
  mode.textContent = '確認用の架空入力';
  mode.tabIndex = -1;
  bindCourseFields(root, changed);
  const form = requiredElement<HTMLFormElement>('#visit-form', root);
  const actions = requiredElement<HTMLElement>('.actions', form);
  actions.classList.add('prototype-actions');
  requiredElement<HTMLButtonElement>('[type="submit"]', actions).textContent = '記事素材を確認';
  const restore = document.createElement('button');
  restore.type = 'button';
  restore.textContent = '入力を再表示';
  restore.addEventListener('click', () => {
    try {
      const collected = collectRecord(root, base);
      showForm(collected);
      output.hidden = true;
      status.textContent = '入力を再表示しました。ページ内だけの確認で、保存はしていません。';
      requiredElement<HTMLElement>('.form-mode', root).focus();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  actions.append(restore);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      requiredElement<HTMLElement>('pre', output).textContent = serializeRecord(collectRecord(root, base));
      output.hidden = false;
      status.textContent = '入力から記事素材を作りました。保存はしていません。';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  });
}

root.innerHTML = renderForm(null, null);
for (const [name, value] of Object.entries({ prefecture: '東京都', area: '確認用エリア', bestMoment: '肩のケアで楽になった' })) {
  requiredElement<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`, root).value = value;
}
const empty = collectRecord(root, base);
const example: VisitRecord = {
  ...empty,
  ratings: { ...empty.ratings, service: { ...empty.ratings.service, note: '最初は静かに過ごせた' } },
  flow: { ...empty.flow, faceDown: { ...empty.flow.faceDown, checks: ['指圧', '以前の記録にだけある観察'] } },
};
showForm(example);
bindStars(root, changed);
bindChips(root, changed);
bindNoteSuggestions(root);
root.addEventListener('input', changed);
