/** 入力画面とボードを別タブで並べて使う。リンクの target にこの名前を使い、開いているタブを使い回す */
export const INPUT_WINDOW = 'me-input';
export const BOARD_WINDOW = 'me-board';

export function editHref(recordId: string): string {
  return `./?edit=${encodeURIComponent(recordId)}`;
}

/** 入力画面のサムネタブを、指定した回答を選んだ状態で開く */
export function thumbHref(recordId: string): string {
  return `./?thumb=${encodeURIComponent(recordId)}`;
}

export function boardCardHref(recordId: string): string {
  return `./board.html?card=${encodeURIComponent(recordId)}`;
}

/** 入力画面に置く、ボードの該当カードへのリンク。ボードはPC専用なので、狭い画面では styles.css で隠す */
export function boardLinkHtml(recordId: string): string {
  return `<a class="to-board" href="${boardCardHref(recordId)}" target="${BOARD_WINDOW}">ボード</a>`;
}

export interface TakenParam {
  readonly value: string | null;
  /** 引数を除いたURL。読み込み直しで同じ操作を繰り返さないよう、履歴をこれに置き換える */
  readonly rest: string;
}

export function takeParam(href: string, name: string): TakenParam {
  const url = new URL(href);
  const value = url.searchParams.get(name);
  url.searchParams.delete(name);
  return { value: value === null || value === '' ? null : value, rest: url.href };
}
