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

export function samePage(currentHref: string | null, destinationHref: string): boolean {
  if (currentHref === null || !URL.canParse(currentHref)) return false;
  const current = new URL(currentHref);
  const destination = new URL(destinationHref);
  return current.origin === destination.origin && pagePath(current) === pagePath(destination);
}

function pagePath(url: URL): string {
  return url.pathname.replace(/\/index\.html$/, '/');
}

function hrefOf(target: WindowProxy): string | null {
  try {
    return target.location.href;
  } catch {
    // 別オリジンへ移ったタブは参照できないため、通常の移動に戻す。
    return null;
  }
}

type OpenWindow = (url: string, target: string) => WindowProxy | null;

/** 通常のtargetリンクは既存タブも再読込してしまうため、単純な画面切替だけはフォーカスで済ませる。 */
export function bindPageSwitch(root: Document, open: OpenWindow = (url, target) => window.open(url, target)): void {
  root.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-switch]') : null;
    if (link === null || link.target === '') return;
    const other = open('', link.target);
    if (other === null) return;
    event.preventDefault();
    if (samePage(hrefOf(other), link.href)) other.focus();
    else other.location.href = link.href;
  });
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
