import type { HandoffImportPlan } from '../handoff-import';
import { optionDescription } from '../options';
import { BODY_LABELS, CUP_IMPRESSION_LABELS, FLOW_PHASES, GENRE_LABELS, RATING_LABELS, REPEAT_LABELS, SPEC_NOTE_LABELS } from '../types';
import type { IdentityLookup, VisitOption } from '../types';
import { IDENTITY_LABELS } from './identity-autofill';
import { SPEECH_TOPIC_LABELS } from '../voice-patterns';
import { element } from './dom';

const labels: Record<string, string> = {
  revisitOf: '再訪元',
  'basic.visitDate': '訪問日', 'basic.timeSlot': '時間帯', 'basic.prefecture': '都道府県',
  'basic.area': 'エリア', 'basic.shopName': '店名', 'basic.shopUrl': '店URL',
  'basic.therapistName': 'セラピスト名', 'basic.therapistProfileUrl': 'プロフィールURL',
  'basic.therapistXUrl': 'X URL', 'basic.identityLookup': '店舗情報の取得記録',
  'basic.identityLookup.sourceUrl': '店舗情報の取得元URL', 'basic.identityLookup.checkedAt': '店舗情報の取得日時',
  'basic.identityLookup.filled': '取得で補完した項目', 'basic.age': '年齢', 'basic.ageIsEstimate': '年齢は推定',
  'basic.course': 'コース時間', 'basic.courseFee': 'コース代', 'basic.optionSystem': 'オプションの自由記述',
  'basic.options': 'オプション', 'basic.optionChosen': '選択したオプション',
  'basic.optionFee': 'オプション代合計', 'basic.nominationFee': '指名料',
  'basic.roomType': '部屋タイプ', 'basic.bookingMethod': '予約方法', 'basic.evidenceSaved': '予約スクショの保存',
  'spec.genre': '系統', 'spec.body': '体型', 'spec.cup': 'カップ', 'spec.cupImpression': 'カップの印象',
  'spec.notes': '特記', 'spec.freeTags': '自由タグ', 'flow.bestMoment': '一番良かった瞬間',
  'flow.downside': '残念ポイント', 'voice.speechTopics': '会話の話題', 'voice.herLines': '彼女のセリフ',
  'voice.innerVoice': '心の声・ツッコミ', 'voice.titleHook': 'タイトル用フック',
  'voice.repeatIntent': 'リピート意向', 'sales.points': '販売ポイント案', 'sales.articleType': '記事タイプ',
};
for (const [key, label] of Object.entries(RATING_LABELS)) {
  labels[`ratings.${key}.stars`] = `${label}の評価`;
  labels[`ratings.${key}.note`] = `${label}の評価理由`;
}
for (const [key, phase] of Object.entries(FLOW_PHASES)) {
  labels[`flow.${key}.checks`] = `${phase.label}の内容`;
  labels[`flow.${key}.note`] = `${phase.label}のメモ`;
}

const valueLabels: Record<string, Readonly<Record<string, string>>> = {
  'basic.timeSlot': { morning: '午前', afternoon: '午後', evening: '夕方', night: '夜' },
  'basic.roomType': { mansion: 'マンション型', room: 'ルーム型', other: 'その他' },
  'basic.bookingMethod': { x_dm: 'X DM', line: 'LINE', phone: '電話', web: 'Web' },
  'spec.genre': GENRE_LABELS, 'spec.body': BODY_LABELS, 'spec.notes': SPEC_NOTE_LABELS,
  'spec.cupImpression': CUP_IMPRESSION_LABELS, 'voice.speechTopics': SPEECH_TOPIC_LABELS,
  'voice.repeatIntent': REPEAT_LABELS, 'sales.articleType': { single: '初回', revisit: '再訪' },
  'basic.identityLookup.filled': IDENTITY_LABELS,
};

function displayValue(path: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '未入力';
  if (typeof value === 'boolean') return value ? 'はい' : 'いいえ';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'なし';
    if (path === 'basic.options') return (value as VisitOption[]).map(optionDescription).join('\n');
    return value.map((item: unknown) => displayValue(path, item)).join('\n');
  }
  if (typeof value === 'string') return valueLabels[path]?.[value] ?? value;
  if (path === 'basic.identityLookup' && typeof value === 'object') {
    const { sourceUrl, checkedAt } = value as Partial<IdentityLookup>;
    return [sourceUrl, checkedAt].filter((item) => item !== undefined).join('\n');
  }
  return String(value);
}

export function openHandoffUpdate(
  plan: Extract<HandoffImportPlan, { kind: 'update' }>,
  onConfirm: () => boolean,
): void {
  if (document.querySelector('.handoff-dialog')) return;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = element('dialog', 'handoff-dialog');
  dialog.setAttribute('aria-labelledby', 'handoff-dialog-title');
  const title = element('h2', 'handoff-dialog-title', `#${plan.previous.seriesNo} の回答を更新`);
  title.id = 'handoff-dialog-title';
  title.tabIndex = -1;
  title.setAttribute('autofocus', '');
  const changes = element('div', 'handoff-changes');
  for (const change of plan.changes) {
    const item = element('section', 'handoff-change');
    item.append(element('h3', 'handoff-change-title', labels[change.path] ?? '変更項目'));
    const values = element('div', 'handoff-values');
    for (const [heading, value] of [['更新前', change.before], ['更新後', change.after]] as const) {
      const side = element('div', 'handoff-value');
      side.append(element('div', 'handoff-value-label', heading), element('div', 'handoff-value-text', displayValue(change.path, value)));
      values.append(side);
    }
    item.append(values);
    changes.append(item);
  }
  const actions = element('div', 'handoff-dialog-actions');
  const cancel = element('button', '', 'キャンセル');
  cancel.type = 'button';
  const confirm = element('button', 'primary', '更新する');
  confirm.type = 'button';
  const error = element('p', 'handoff-dialog-error');
  error.setAttribute('role', 'alert');
  cancel.addEventListener('click', () => dialog.close());
  confirm.addEventListener('click', () => {
    error.textContent = '';
    try {
      if (onConfirm()) dialog.close();
    } catch (cause) {
      error.textContent = cause instanceof Error ? cause.message : '更新できませんでした';
    }
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (opener?.isConnected) opener.focus();
  });
  actions.append(cancel, confirm);
  dialog.append(title, changes, error, actions);
  document.body.append(dialog);
  try {
    dialog.showModal();
  } catch (cause) {
    dialog.remove();
    throw cause;
  }
  dialog.scrollTop = 0;
  title.focus({ preventScroll: true });
}
