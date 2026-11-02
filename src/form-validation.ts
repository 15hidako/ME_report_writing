import { MAX_OPTIONS } from './options';
import { isHttpUrl } from './url';

export interface FormIssue {
  readonly field: string;
  readonly message: string;
}

export class FormValidationError extends Error {
  constructor(readonly issues: readonly FormIssue[]) {
    super(issues.map((issue) => issue.message).join('\n'));
    this.name = 'FormValidationError';
  }
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function control(form: HTMLFormElement, name: string): Control {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) {
    throw new Error('入力欄が見つかりません。入力内容を控えてから画面を開き直してください');
  }
  return field;
}

export function optionCountValue(value: string): number | undefined {
  if (value === '') return undefined;
  const count = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(count) || count > MAX_OPTIONS) {
    throw new FormValidationError([{ field: 'optionCount', message: 'オプションのタイプ数を選び直してください' }]);
  }
  return count;
}

export function feeValue(form: HTMLFormElement, name: string, label: string): number | null {
  const field = control(form, name);
  const raw = field.value.trim();
  const amount = raw === '' ? null : Number(raw);
  // 数値変換だけでは長い小数が整数へ丸められるため、入力文字列も確認する。
  if (field.validity.badInput || (amount !== null && (!/^\d+$/.test(raw) || !Number.isSafeInteger(amount)))) {
    throw new FormValidationError([{ field: name, message: `${label}は0以上の整数の金額を円で入力してください。不明なら空欄にできます。` }]);
  }
  return amount;
}

export function validateVisitForm(form: HTMLFormElement): FormIssue[] {
  const issues: FormIssue[] = [];
  const value = (name: string): string => control(form, name).value.trim();
  const add = (field: string, message: string): void => { issues.push({ field, message }); };
  for (const [name, label] of [['prefecture', '都道府県'], ['area', 'エリア']] as const) {
    if (value(name) === '') add(name, `${label}を選んでください（必須）`);
    else if (value(name) === 'other' && value(`${name}Other`) === '') add(`${name}Other`, `その他の${label}を入力してください（必須）`);
  }
  if (value('course') === 'other' && value('courseOther') === '') add('courseOther', 'その他のコース時間を入力してください');
  if (value('bestMoment') === '') add('bestMoment', '一番良かった瞬間を入力してください（必須）');

  for (const [name, label] of [['shopUrl', '店URL'], ['therapistProfileUrl', 'プロフィールURL'], ['therapistXUrl', 'X URL']] as const) {
    if (value(name) !== '' && !isHttpUrl(value(name))) {
      add(name, `${label}は http:// または https:// から始まるURLを入力してください。不明なら空欄にできます。`);
    }
  }
  for (const [name, label, max] of [['age', '年齢', 150], ['points', '販売ポイント案', Number.MAX_SAFE_INTEGER]] as const) {
    const raw = value(name);
    if (control(form, name).validity.badInput || (raw !== '' && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max))) {
      add(name, name === 'age' ? '年齢は0〜150の整数を入力してください。不明なら空欄にできます。' : `${label}は0以上の整数を入力してください。`);
    }
  }
  const date = value('visitDate');
  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (control(form, 'visitDate').validity.badInput || (date !== '' && (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date))) {
    add('visitDate', '訪問日を選び直してください。空欄の場合は今日の日付で保存します。');
  }

  let count: number | undefined;
  try {
    count = optionCountValue(value('optionCount'));
  } catch (error) {
    if (!(error instanceof FormValidationError)) throw error;
    issues.push(...error.issues);
  }
  const fees: [string, string][] = [['courseFee', 'コース代'], ['optionFee', 'オプション代'], ['nominationFee', '指名料']];
  for (let index = 0; index < (count ?? 0); index++) fees.push([`optionPrice_${index}`, `オプション${index + 1}の価格`]);
  for (const [name, label] of fees) {
    try {
      feeValue(form, name, label);
    } catch (error) {
      if (!(error instanceof FormValidationError)) throw error;
      issues.push(...error.issues);
    }
  }
  const fields = [...form.elements];
  return issues.sort((a, b) => fields.indexOf(control(form, a.field)) - fields.indexOf(control(form, b.field)));
}
