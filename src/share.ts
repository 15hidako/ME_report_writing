import type { VisitRecord } from './types';
import { parseVisitRecords } from './record-validation';

export function shareFile(file: File): Promise<void> {
  if (!window.isSecureContext) throw new Error('共有にはHTTPSで開く必要があります。');
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    throw new Error('このブラウザはファイル共有に対応していません。スマホの対応ブラウザで試してください。');
  }
  const data: ShareData = { files: [file] };
  if (!navigator.canShare(data)) {
    throw new Error(file.type === 'application/json'
      ? 'この端末ではJSONファイルを共有できません。'
      : 'この端末ではテキストファイルを共有できません。');
  }
  // 事前のawaitでユーザー操作の有効期間を失わないよう、クリック内で直接呼ぶ。
  return navigator.share(data);
}

export function shareRecord(record: VisitRecord): Promise<void> {
  const body = JSON.stringify(parseVisitRecords([record]), null, 2);
  return shareFile(new File([body], `me-report-${record.seriesNo}.json`, { type: 'application/json' }));
}

export function shareErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return '共有がキャンセルされたか、共有先が見つかりませんでした。もう一度試せます。';
  }
  return `共有できませんでした: ${error instanceof Error ? error.message : String(error)}`;
}
