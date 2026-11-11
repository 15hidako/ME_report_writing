import type { LookupPlan } from '../identity-lookup';
import type { IdentityField, VisitRecord } from '../types';
import { IDENTITY_LABELS } from './identity-autofill';

export interface IdentityLookupDialogOptions {
  readonly targets: readonly VisitRecord[];
  readonly copyPrompt: () => void;
  /** 貼り付けた返答から更新案を作る。読み取れなければ Error を投げる */
  readonly plan: (response: string) => LookupPlan;
  /** 更新案を保存する。保存したら true、利用者が中止したら false */
  readonly apply: (plan: LookupPlan) => boolean;
}

type Step = 'paste' | 'review';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== '') node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionButton(act: string, text: string, primary = false): HTMLButtonElement {
  const button = element('button', primary ? 'primary' : '', text);
  button.type = 'button';
  button.dataset['act'] = act;
  return button;
}

function fieldLabel(path: string): string {
  const field = path.replace(/^basic\./, '');
  return Object.hasOwn(IDENTITY_LABELS, field) ? IDENTITY_LABELS[field as IdentityField] : path;
}

// 取得結果は外部ページ由来のため、すべて textContent で入れる。
function renderPlan(plan: LookupPlan): HTMLElement[] {
  const results = plan.updates.map((update) => {
    const item = element('section', 'lookup-result');
    item.append(element('h3', '', `#${update.record.seriesNo}`));
    if (update.changes.length === 0) {
      item.append(element('p', '', '追加できる項目なし'));
      return item;
    }
    const list = element('dl', '');
    for (const change of update.changes) {
      list.append(element('dt', '', fieldLabel(change.path)), element('dd', '', String(change.after)));
    }
    item.append(list);
    return item;
  });
  if (plan.notes.length === 0) return results;
  const notes = element('ul', 'lookup-notes');
  notes.append(...plan.notes.map((note) => element('li', '', note)));
  return [...results, notes];
}

export function openIdentityLookup(options: IdentityLookupDialogOptions): void {
  if (document.querySelector('.identity-lookup-dialog')) return;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = element('dialog', 'identity-lookup-dialog');
  dialog.setAttribute('aria-labelledby', 'identity-lookup-title');
  const title = element('h2', 'lookup-title', '店舗情報の取得');
  title.id = 'identity-lookup-title';
  title.tabIndex = -1;

  const targets = element('ol', 'lookup-targets');
  for (const record of options.targets) {
    const item = element('li', '');
    item.append(element('strong', '', `#${record.seriesNo}`), element('span', '', record.basic.therapistProfileUrl));
    targets.append(item);
  }
  const copy = actionButton('copy-prompt', '取得用プロンプトをコピー');
  const response = element('textarea', '');
  response.name = 'lookupResponse';
  response.rows = 6;
  response.placeholder = 'Claudeの返答を貼り付け';
  response.setAttribute('aria-label', 'Claudeの返答');
  response.spellcheck = false;
  const paste = element('div', 'lookup-step');
  paste.append(targets, copy, response);

  const review = element('div', 'lookup-step');
  const error = element('p', 'lookup-error');
  error.setAttribute('role', 'alert');

  const cancel = actionButton('cancel', 'キャンセル');
  const toReview = actionButton('review', '確認へ', true);
  const back = actionButton('back', '戻る');
  const apply = actionButton('apply', '保存', true);
  const actions = element('div', 'lookup-actions');
  actions.append(cancel, back, toReview, apply);

  let current: LookupPlan | null = null;
  const show = (step: Step): void => {
    paste.hidden = step !== 'paste';
    review.hidden = step !== 'review';
    cancel.hidden = step !== 'paste';
    toReview.hidden = step !== 'paste';
    back.hidden = step !== 'review';
    apply.hidden = step !== 'review' || current === null || current.updates.length === 0;
    dialog.scrollTop = 0;
    title.focus({ preventScroll: true });
  };
  const fail = (cause: unknown, fallback: string): void => {
    error.textContent = cause instanceof Error ? cause.message : fallback;
  };

  copy.addEventListener('click', () => options.copyPrompt());
  cancel.addEventListener('click', () => dialog.close());
  toReview.addEventListener('click', () => {
    error.textContent = '';
    try {
      const plan = options.plan(response.value);
      if (plan.updates.length === 0 && plan.notes.length === 0) throw new Error('返答に回答が含まれていません');
      current = plan;
      review.replaceChildren(...renderPlan(plan));
      show('review');
    } catch (cause) {
      fail(cause, '返答を読み取れませんでした');
    }
  });
  back.addEventListener('click', () => {
    error.textContent = '';
    show('paste');
  });
  apply.addEventListener('click', () => {
    if (current === null) return;
    error.textContent = '';
    try {
      if (options.apply(current)) dialog.close();
    } catch (cause) {
      fail(cause, '保存できませんでした');
    }
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (opener?.isConnected) opener.focus();
  });

  dialog.append(title, paste, review, error, actions);
  document.body.append(dialog);
  try {
    dialog.showModal();
  } catch (cause) {
    dialog.remove();
    throw cause;
  }
  show('paste');
}
