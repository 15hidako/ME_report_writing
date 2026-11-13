import type { VisitRecord } from './types';
import { parseVisitRecords } from './record-validation';
import { errText } from './guards';

export function shareRecord(record: VisitRecord): Promise<void> {
  const body = JSON.stringify(parseVisitRecords([record]), null, 2);
  const file = new File([body], `me-report-${record.seriesNo}.json`, { type: 'application/json' });
  if (!window.isSecureContext) throw new Error('共有にはHTTPSで開く必要があります。');
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    throw new Error('このブラウザはファイル共有に対応していません。スマホの対応ブラウザで試してください。');
  }
  const data: ShareData = { files: [file] };
  if (!navigator.canShare(data)) {
    throw new Error('この端末ではJSONファイルを共有できません。');
  }
  // 事前のawaitでユーザー操作の有効期間を失わないよう、クリック内で直接呼ぶ。
  return navigator.share(data);
}

export function shareErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return '共有がキャンセルされたか、共有先が見つかりませんでした。もう一度試せます。';
  }
  return `共有できませんでした: ${errText(error)}`;
}
