import { element } from './dom';
import { errText } from '../guards';

export interface InputField {
  readonly name: string;
  readonly label: string;
  readonly type: 'date' | 'url' | 'text';
  readonly value?: string;
  readonly placeholder?: string;
}

export interface InputDialogOptions {
  readonly title: string;
  readonly fields: readonly InputField[];
  /**
   * 「決定」で呼ぶ。Error を投げるとダイアログを閉じずに文を出す。
   * クリップボードへの書き込みは利用者の操作の直後でないと拒否されることがあるため、
   * Promise を挟まずにこの中で同期的に進める。
   */
  readonly onSubmit: (values: Readonly<Record<string, string>>) => void;
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
  const inputs = options.fields.map((field, index) => {
    const label = element('label', 'field');
    const input = element('input', '');
    input.type = field.type;
    input.name = field.name;
    input.value = field.value ?? '';
    if (field.placeholder !== undefined) input.placeholder = field.placeholder;
    if (field.type === 'url') input.inputMode = 'url';
    input.autocomplete = 'off';
    if (index === 0) input.autofocus = true;
    label.append(element('span', '', field.label), input);
    form.append(label);
    return input;
  });

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
    const values = Object.fromEntries(inputs.map((input) => [input.name, input.value]));
    try {
      options.onSubmit(values);
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
  inputs[0]?.focus();
}
