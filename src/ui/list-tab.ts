import type { VisitRecord } from '../types';
import { esc } from './widgets';
import { specSummary } from '../prompt/serialize';
import { isPublished } from '../prompt/publication';
import { boardLinkHtml } from '../links';
import { dataButtonsHtml } from './data-buttons';
import { DISCLOSURE_LABELS, type NameDisclosure } from '../prompt/style-profile';

export interface ListTabHandlers {
  readonly onNew: () => void;
  readonly onLookup: () => void;
  readonly onCatalog: () => void;
  readonly onMatome: () => void;
  readonly onCardAction: (act: string, recordId: string) => void;
  /** 描いたあとにデータ操作のボタンを配線する */
  readonly bindData: () => void;
}

export interface ListTabView {
  /** 新しい順 */
  readonly records: readonly VisitRecord[];
  /** ボードで販売型を選んだ単体記事の、対応する名前の出し方。未選択の回答は含まない */
  readonly preferred: ReadonlyMap<string, NameDisclosure>;
  readonly pendingLookups: number;
  readonly canRestore: boolean;
}

const PROMPT_ACTS: Readonly<Record<NameDisclosure, string>> = { free: 'prompt-names', paid: 'prompt' };

/**
 * 記事プロンプトのボタン(U-25)。単体記事はボードで販売型を選ぶまで出さず、選んだ型のボタンだけを出す。
 * 販売型を選べない再訪は、両方の型を名前で並べる
 */
function promptButtonsHtml(r: VisitRecord, preferred: NameDisclosure | undefined): string {
  if (r.revisitOf !== null) {
    return (['free', 'paid'] as const)
      .map((disclosure) => `<button data-act="${PROMPT_ACTS[disclosure]}">${DISCLOSURE_LABELS[disclosure]}</button>`).join('');
  }
  return preferred === undefined ? '' : `<button data-act="${PROMPT_ACTS[preferred]}" class="primary">プロンプト</button>`;
}

function cardHtml(r: VisitRecord, preferred: NameDisclosure | undefined): string {
  return `
    <div class="card" data-id="${esc(r.id)}">
      <div class="card-head">
        <strong>#${esc(String(r.seriesNo))}</strong> ${esc(r.basic.visitDate)} / ${esc(r.basic.area)}
        ${r.revisitOf !== null ? '<span class="badge">再訪</span>' : ''}
        ${isPublished(r) ? '<span class="badge posted">投稿済</span>' : ''}
      </div>
      <div class="card-body">${esc(r.basic.shopName)} — ${esc(r.basic.therapistName)}<br />
        <small>${esc(specSummary(r))}</small></div>
      <div class="card-actions">
        ${promptButtonsHtml(r, preferred)}
        <button data-act="edit">編集</button>
        <details class="more-actions">
          <summary aria-label="その他の操作">⋯</summary>
          <div class="more-actions-body">
            <button data-act="revisit">再訪入力</button>
            <button data-act="url">投稿URL</button>
            <button data-act="del" class="danger">削除</button>
          </div>
        </details>
        ${boardLinkHtml(r.id)}
      </div>
    </div>`;
}

export function renderListTab(app: HTMLElement, view: ListTabView, handlers: ListTabHandlers): void {
  const { records, preferred, pendingLookups, canRestore } = view;
  app.innerHTML = `
    <div class="toolbar">
      <button id="new-visit" class="primary">+ 新規入力</button>
      ${pendingLookups === 0 ? '' : `<button id="identity-lookup">店舗情報を取得(${pendingLookups})</button>`}
      <button id="catalog">カタログ記事</button>
      <button id="matome">まとめ記事</button>
      <details class="more-actions data-actions">
        <summary>データ</summary>
        <div class="more-actions-body">
          ${dataButtonsHtml({ handoff: true, canRestore })}
        </div>
      </details>
    </div>
    ${records.length === 0 ? '<p class="empty">まだ訪問レコードがありません。「+ 新規入力」から始めてください。</p>' : records.map((record) => cardHtml(record, preferred.get(record.id))).join('')}`;

  document.getElementById('new-visit')?.addEventListener('click', handlers.onNew);
  document.getElementById('identity-lookup')?.addEventListener('click', handlers.onLookup);
  document.getElementById('catalog')?.addEventListener('click', handlers.onCatalog);
  document.getElementById('matome')?.addEventListener('click', handlers.onMatome);
  handlers.bindData();
  app.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest('button[data-act]');
      if (btn === null) return;
      const id = card.getAttribute('data-id');
      if (id === null) return;
      handlers.onCardAction(btn.getAttribute('data-act') ?? '', id);
    });
  });
}
