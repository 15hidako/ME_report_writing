import type { VisitRecord } from '../types';
import type { Attendance, Enrollment } from '../checks/files';
import { localDate } from '../date';
import { INPUT_WINDOW, editHref, thumbHref } from '../links';
import { esc } from '../ui/widgets';
import { isPublished } from '../prompt/publication';
import type { Attention, Card } from './cards';
import { ANGLES, STAGES, disclosureOfAngle, type ArticleKind, type ArticleAngle, type Stage } from './state';
import { POST_PARTS, partSpec } from '../prompt/article-files';
import { hasSource, markupState, type DraftVariant } from './articles';
import { DISCLOSURE_LABELS, type NameDisclosure } from '../prompt/style-profile';

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

/** 絞り込みの並び。先頭は「すべて」 */
export const KIND_FILTERS: readonly KindFilter[] = ['all', 'single', 'revisit', 'matome', 'catalog'];

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

function stamp(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 投稿画面へ貼る順のコピーボタン。本文はHTMLができてから出し、
 * それまでは同じ場所に「マークアップ」を出す。直した文章がHTMLに入っていないときも同じ
 */
function draftPartButtons(variant: DraftVariant): string {
  const name = DISCLOSURE_LABELS[variant.disclosure];
  const state = markupState(variant);
  const copy = (id: (typeof POST_PARTS)[number]): string => `
    <button type="button" data-act="copy-part" data-disclosure="${variant.disclosure}" data-part="${id}"
      aria-label="${esc(name)}の${partSpec(id).label}をコピー">${partSpec(id).short}</button>`;
  const heads = POST_PARTS.filter((id) => (id === 'title' || id === 'tags') && variant.parts.includes(id)).map(copy).join('');
  if (state === 'ready') {
    return heads + POST_PARTS.filter((id) => (id === 'freeHtml' || id === 'paidHtml') && variant.parts.includes(id)).map(copy).join('');
  }
  if (!hasSource(variant)) return heads;
  const label = state === 'stale' ? `${esc(name)}の直した文章をマークアップし直す` : `${esc(name)}をマークアップする`;
  return `${heads}
    <button type="button" class="markup" data-act="markup" data-disclosure="${variant.disclosure}" aria-label="${label}">マークアップ</button>`;
}

function draftHtml(card: Card): string {
  if (card.draft === null) return '';
  // 販売型を選んでいれば、対応する側の原稿を先に並べる。もう一方も残す
  const preferred = card.angle === null ? null : disclosureOfAngle(card.angle);
  const variants = preferred === null
    ? card.draft.variants
    : [...card.draft.variants].sort((a, b) => Number(b.disclosure === preferred) - Number(a.disclosure === preferred));
  const rows = variants.map((variant) => {
    const name = DISCLOSURE_LABELS[variant.disclosure];
    return `
      <div class="draft-row" data-disclosure="${variant.disclosure}" data-markup="${markupState(variant)}">
        <span class="draft-name">${name}</span>
        <time datetime="${new Date(variant.updatedAt).toISOString()}">${stamp(variant.updatedAt)}</time>
        ${hasSource(variant)
          ? `<button type="button" class="draft-read" data-act="read" data-disclosure="${variant.disclosure}" aria-label="${esc(name)}を読む">読む</button>`
          : ''}
        <div class="draft-parts">${draftPartButtons(variant)}</div>
      </div>`;
  }).join('');
  return `<div class="draft">${rows}</div>`;
}

/**
 * 回答カードから記事プロンプトを出す(U-25)。単体記事は販売型を選ぶまで出さず、選んだ型のボタンだけを出す。
 * 販売型を選べない再訪は、両方の型を名前で並べる。原稿ができたあとは控えめにする
 */
function promptHtml(card: Card): string {
  if (card.source !== 'record' || card.stage === 'posted') return '';
  const button = (disclosure: NameDisclosure, label: string): string => `
    <button type="button" data-act="prompt" data-disclosure="${disclosure}"${
      card.kind === 'single' && card.draft === null ? ' class="primary"' : ''}>${label}</button>`;
  const buttons = card.kind !== 'single'
    ? ANGLES.map((angle) => button(disclosureOfAngle(angle), ANGLE_LABELS[angle])).join('')
    : card.angle === null ? '' : button(disclosureOfAngle(card.angle), 'プロンプト');
  return buttons === ''
    ? ''
    : `<div class="prompt-actions" data-count="${card.kind === 'single' ? 1 : ANGLES.length}" role="group" aria-label="${esc(card.title)} の記事プロンプト">${buttons}</div>`;
}

/** data/answers に届いて、まだボードにない回答 */
export interface InboxView {
  readonly answers: readonly { readonly label: string; readonly update: boolean }[];
  readonly errors: readonly string[];
}

function inboxHtml(inbox: InboxView | null): string {
  if (inbox === null || (inbox.answers.length === 0 && inbox.errors.length === 0)) return '';
  const answers = inbox.answers.length === 0 ? '' : `
    <h2 id="inbox-heading">新しい回答<span class="count">${inbox.answers.length}</span></h2>
    <ul>${inbox.answers.map((answer) => `
      <li>${answer.update ? '<strong>更新</strong>' : ''}${esc(answer.label)}</li>`).join('')}
    </ul>
    <button type="button" class="primary" data-act="import-answers">取り込む</button>`;
  const errors = inbox.errors.map((error) => `<p class="inbox-error" role="alert">${esc(error)}</p>`).join('');
  return `<section class="inbox"${inbox.answers.length === 0 ? '' : ' aria-labelledby="inbox-heading"'}>${answers}${errors}</section>`;
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
        ${card.source === 'record'
          ? `<a class="to-edit" href="${esc(editHref(card.id))}" target="${INPUT_WINDOW}" draggable="false">編集</a>
            <a class="to-thumb" href="${esc(thumbHref(card.id))}" target="${INPUT_WINDOW}" draggable="false">サムネ</a>`
          : ''}
        <select data-act="stage" aria-label="${esc(card.title)} の段階">${stageOptions}</select>
      </div>
      <h3>${card.postedUrl === null
        ? esc(card.title)
        : `<a href="${esc(card.postedUrl)}" target="_blank" rel="noopener noreferrer">${esc(card.title)}</a>`}</h3>
      ${card.detail === '' ? '' : `<p class="board-card-detail">${esc(card.detail)}</p>`}
      ${angleHtml(card)}
      ${promptHtml(card)}
      ${draftHtml(card)}
      ${trackingHtml(card)}
      ${card.source === 'bundle' ? `<div class="bundle-actions">${
        card.kind === 'matome' ? '<button type="button" data-act="matome-prompt">プロンプト</button>' : ''}
        <button type="button" class="danger" data-act="remove">削除</button></div>` : ''}
    </li>`;
}

export function boardHtml(cards: readonly Card[], filter: KindFilter, inbox: InboxView | null = null): string {
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
  return `${inboxHtml(inbox)}${dueHtml}<div class="columns">${columns}</div>`;
}

export function filterHtml(filter: KindFilter): string {
  return KIND_FILTERS.map((kind) => `
    <button type="button" class="chip${kind === filter ? ' on' : ''}" data-filter="${kind}" aria-pressed="${kind === filter}">${
      kind === 'all' ? 'すべて' : KIND_LABELS[kind]}</button>`).join('');
}

/**
 * 記事を追加するダイアログ。種類の初期値はまとめなので、未投稿の回答は選べない状態で出す。
 * 種類を変えたときの切り替えは board/main.ts の syncBundleChoices が行う
 */
export function bundleDialogHtml(records: readonly VisitRecord[]): string {
  const rows = [...records].sort((a, b) => b.seriesNo - a.seriesNo).map((record) => `
    <label class="check"><input type="checkbox" name="recordIds" value="${esc(record.id)}" data-published="${isPublished(record)}"${
      isPublished(record) ? '' : ' disabled'} />
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
