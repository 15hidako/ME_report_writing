import { element } from './dom';
import { errText } from '../guards';

export interface TextField {
  readonly name: string;
  readonly label: string;
  readonly type: 'date' | 'url' | 'text';
  readonly value?: string;
  readonly placeholder?: string;
}

export interface CheckOption {
  readonly value: string;
  readonly label: string;
}

/** 複数を選ぶ欄。選んだ値は InputValues.list で受け取る */
export interface ChecksField {
  readonly name: string;
  readonly label: string;
  readonly type: 'checks';
  readonly options: readonly CheckOption[];
}

export type InputField = TextField | ChecksField;

export interface InputValues {
  /** 文字の入力欄の値。欄がなければ空文字 */
  text(name: string): string;
  /** チェックした値。入力した順ではなく選択肢の順 */
  list(name: string): string[];
}

export interface InputDialogOptions {
  readonly title: string;
  readonly fields: readonly InputField[];
  /**
   * 「決定」で呼ぶ。Error を投げるとダイアログを閉じずに文を出す。
   * クリップボードへの書き込みは利用者の操作の直後でないと拒否されることがあるため、
   * Promise を挟まずにこの中で同期的に進める。
   */
  readonly onSubmit: (values: InputValues) => void;
}

function textField(field: TextField): { node: HTMLElement; focusable: HTMLInputElement } {
  const label = element('label', 'field');
  const input = element('input', '');
  input.type = field.type;
  input.name = field.name;
  input.value = field.value ?? '';
  if (field.placeholder !== undefined) input.placeholder = field.placeholder;
  if (field.type === 'url') input.inputMode = 'url';
  // 上限がないと Chrome は年を6桁まで受け付け、4桁入れても月へ移らない
  if (field.type === 'date') input.max = '9999-12-31';
  input.autocomplete = 'off';
  label.append(element('span', '', field.label), input);
  return { node: label, focusable: input };
}

function checksField(field: ChecksField): { node: HTMLElement; focusable: HTMLInputElement | null } {
  const set = element('fieldset', 'input-dialog-checks');
  set.append(element('legend', '', field.label));
  const boxes = field.options.map((option) => {
    const label = element('label', 'check');
    const box = element('input', '');
    box.type = 'checkbox';
    box.name = field.name;
    box.value = option.value;
    label.append(box, element('span', '', option.label));
    set.append(label);
    return box;
  });
  return { node: set, focusable: boxes[0] ?? null };
}

function valuesOf(form: HTMLFormElement): InputValues {
  const data = new FormData(form);
  return {
    text: (name) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    },
    list: (name) => data.getAll(name).filter((value): value is string => typeof value === 'string'),
  };
}

/** 値を入れてもらう画面内のダイアログ。取り消しでは何もしない */
export function openInputDialog(options: InputDialogOptions): void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = element('dialog', 'input-dialog');
  const titleId = `input-dialog-title-${Date.now()}`;
  dialog.setAttribute('aria-labelledby', titleId);
  const title = element('h2', 'input-dialog-title', options.title);
  title.id = titleId;

  const form = element('form', 'input-dialog-form');
  form.noValidate = true;
  const built = options.fields.map((field) => (field.type === 'checks' ? checksField(field) : textField(field)));
  form.append(...built.map((item) => item.node));

  const error = element('p', 'input-dialog-error');
  error.setAttribute('role', 'alert');
  const cancel = element('button', '', 'キャンセル');
  cancel.type = 'button';
  const submit = element('button', 'primary', '決定');
  submit.type = 'submit';
  const actions = element('div', 'input-dialog-actions');
  actions.append(cancel, submit);
  form.append(error, actions);

  cancel.addEventListener('click', () => dialog.close());
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.textContent = '';
    try {
      options.onSubmit(valuesOf(form));
    } catch (cause) {
      error.textContent = errText(cause);
      return;
    }
    dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (opener?.isConnected) opener.focus();
  });

  dialog.append(title, form);
  document.body.append(dialog);
  try {
    dialog.showModal();
  } catch (cause) {
    dialog.remove();
    throw cause;
  }
  built.find((item) => item.focusable !== null)?.focusable?.focus();
}
