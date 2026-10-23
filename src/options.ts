import type { VisitOption } from './types';

export const OPTION_TYPE_LABELS: Readonly<Record<string, string>> = {
  costume: '衣装変更',
  powder: 'パウダー',
  wash: '洗体',
  extension: '時間延長',
  treatment: '施術追加',
  other: 'その他',
};

export const MAX_OPTIONS = 10;

export function optionTypeLabel(type: string): string {
  return Object.hasOwn(OPTION_TYPE_LABELS, type) ? OPTION_TYPE_LABELS[type]! : type || '種類未確認';
}

export function optionDescription(option: VisitOption): string {
  const type = optionTypeLabel(option.type);
  const detail = option.detail === '' ? '' : `（${option.detail}）`;
  const price = option.price === null ? '価格未確認' : `${option.price.toLocaleString('ja-JP')}円`;
  return `${type}${detail}: ${price}`;
}
