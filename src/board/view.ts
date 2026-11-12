import type { VisitRecord } from '../types';
import type { Attendance, Enrollment } from '../checks/files';
import { localDate } from '../date';
import { esc } from '../ui/widgets';
import type { Attention, Card } from './cards';
import { ANGLES, STAGES, type ArticleKind, type ArticleAngle, type Stage } from './state';

export const STAGE_LABELS: Readonly<Record<Stage, string>> = {
  answered: '回答済み', prompted: 'プロンプト出力', editing: '推敲中', posted: '投稿済み',
};
export const KIND_LABELS: Readonly<Record<ArticleKind, string>> = {
  single: '単体', revisit: '再訪', matome: 'まとめ', catalog: 'カタログ',
};
export const ANGLE_LABELS: Readonly<Record<ArticleAngle, string>> = {
  therapist: 'セラピスト起点', experience: '体験内容起点',
};
export const ATTENTION_LABELS: Readonly<Record<Attention, string>> = {
  absent: '在籍なし', not_listed: '出勤なし', review: '要目視', stale: '確認が古い', unchecked: '未確認',
};
const ENROLLMENT_LABELS: Readonly<Record<Enrollment, string>> = {
  present: '在籍', absent: '在籍なし', unknown: '在籍不明',
};
const ATTENDANCE_LABELS: Readonly<Record<Attendance, string>> = {
  listed: '出勤あり', not_listed: '出勤なし', unknown: '出勤不明',
};

export type KindFilter = ArticleKind | 'all';

function trackingHtml(card: Card): string {
  const tracking = card.tracking;
  if (tracking === null) return '';
  const check = tracking.check;
  const status = check === null ? '' : `
    <span class="track-state" data-state="${esc(check.enrollment)}">${ENROLLMENT_LABELS[check.enrollment]}</span>
    ${check.enrollment === 'absent' ? '' : `<span class="track-state" data-state="${esc(check.attendance)}">${ATTENDANCE_LABELS[check.attendance]}</span>`}
    <time datetime="${esc(check.checkedAt)}">${esc(localDate(new Date(check.checkedAt)))}</time>`;
  const acknowledgeable = tracking.attention === 'absent' || tracking.attention === 'not_listed' || tracking.attention === 'review';
  return `
    <div class="track"${tracking.attention === null ? '' : ` data-attention="${esc(tracking.attention)}"`}>
      ${tracking.attention === null ? '' : `<strong class="track-attention">${ATTENTION_LABELS[tracking.attention]}</strong>`}
      ${status}
      ${check === null || check.detail === '' ? '' : `<p class="track-detail">${esc(check.detail)}</p>`}
      <div class="track-actions">
        <a href="${esc(tracking.profileUrl)}" target="_blank" rel="noopener noreferrer">プロフィール</a>
        <button type="button" data-act="schedule">${tracking.scheduleUrl === null ? '出勤表URL' : '出勤表URL✓'}</button>
        ${acknowledgeable ? '<button type="button" data-act="ack">確認済みにする</button>' : ''}
      </div>
    </div>`;
}

function angleHtml(card: Card): string {
  if (card.kind !== 'single') return '';
  const buttons = ANGLES.map((type) => `
    <button type="button" data-angle="${type}" aria-pressed="${type === card.angle}">${ANGLE_LABELS[type]}</button>`).join('');
  return `<div class="angle" role="group" aria-label="${esc(card.title)} の販売型">${buttons}</div>`;
}

function cardHtml(card: Card): string {
  const stageOptions = STAGES
    .map((stage) => `<option value="${stage}"${stage === card.stage ? ' selected' : ''}>${STAGE_LABELS[stage]}</option>`)
    .join('');
  return `
    <li class="board-card" draggable="true" data-id="${esc(card.id)}" data-source="${card.source}" data-kind="${card.kind}"${
      card.angle === null ? '' : ` data-angle="${card.angle}"`}>
      <div class="board-card-head">
        <span class="kind" data-kind="${card.kind}">${KIND_LABELS[card.kind]}</span>
        <select data-act="stage" aria-label="${esc(card.title)} の段階">${stageOptions}</select>
      </div>
      <h3>${card.postedUrl === null
        ? esc(card.title)
        : `<a href="${esc(card.postedUrl)}" target="_blank" rel="noopener noreferrer">${esc(card.title)}</a>`}</h3>
      ${card.detail === '' ? '' : `<p class="board-card-detail">${esc(card.detail)}</p>`}
      ${angleHtml(card)}
      ${trackingHtml(card)}
      ${card.source === 'bundle' ? '<button type="button" class="danger" data-act="remove">削除</button>' : ''}
    </li>`;
}

export function boardHtml(cards: readonly Card[], filter: KindFilter): string {
  const visible = cards.filter((card) => filter === 'all' || card.kind === filter);
  const due = visible.filter((card) => card.tracking !== null && card.tracking.attention !== null);
  const columns = STAGES.map((stage) => {
    const items = visible.filter((card) => card.stage === stage);
    return `
      <section class="column" data-stage="${stage}" aria-labelledby="column-${stage}">
        <h2 id="column-${stage}">${STAGE_LABELS[stage]}<span class="count">${items.length}</span></h2>
        <ul class="column-cards">${items.map(cardHtml).join('')}</ul>
      </section>`;
  }).join('');
  const dueHtml = due.length === 0 ? '' : `
    <section class="due" aria-labelledby="due-heading">
      <h2 id="due-heading">要確認<span class="count">${due.length}</span></h2>
      <ul>${due.map((card) => `
        <li><a href="#" data-jump="${esc(card.id)}" data-attention="${esc(card.tracking!.attention!)}">
          <strong>${ATTENTION_LABELS[card.tracking!.attention!]}</strong>${esc(card.title)}</a></li>`).join('')}
      </ul>
    </section>`;
  return `${dueHtml}<div class="columns">${columns}</div>`;
}

export function filterHtml(filter: KindFilter): string {
  const kinds: readonly KindFilter[] = ['all', 'single', 'revisit', 'matome', 'catalog'];
  return kinds.map((kind) => `
    <button type="button" class="chip${kind === filter ? ' on' : ''}" data-filter="${kind}" aria-pressed="${kind === filter}">${
      kind === 'all' ? 'すべて' : KIND_LABELS[kind]}</button>`).join('');
}

export function bundleDialogHtml(records: readonly VisitRecord[]): string {
  const rows = [...records].sort((a, b) => b.seriesNo - a.seriesNo).map((record) => `
    <label class="check"><input type="checkbox" name="recordIds" value="${esc(record.id)}" />
      #${esc(String(record.seriesNo))} ${esc(record.basic.shopName)} — ${esc(record.basic.therapistName)}</label>`).join('');
  return `
    <form method="dialog" id="bundle-form">
      <h2>記事を追加</h2>
      <label class="field"><span>種類</span>
        <select name="kind"><option value="matome">${KIND_LABELS.matome}</option><option value="catalog">${KIND_LABELS.catalog}</option></select>
      </label>
      <label class="field"><span>タイトル</span><input name="title" required maxlength="120" /></label>
      <fieldset class="bundle-records"><legend>対象の回答</legend>${rows}</fieldset>
      <div class="dialog-actions">
        <button type="button" data-act="cancel">やめる</button>
        <button type="submit" class="primary">追加</button>
      </div>
    </form>`;
}
