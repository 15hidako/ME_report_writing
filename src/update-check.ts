// 公開中の版と、いま開いている版を比べる。
// ホーム画面のPWAは開き直しても再読み込みされないため、アプリ側で新しい版に気づく必要がある。

declare const __BUILD_ID__: string;

/** いま開いている版。vite.config.ts がビルドのたびに埋め込む */
export const BUILD_ID: string = __BUILD_ID__;

export function parseBuildId(value: unknown): string {
  const id = typeof value === 'object' && value !== null ? (value as { buildId?: unknown }).buildId : undefined;
  if (typeof id !== 'string' || id === '') throw new Error('version.json の形式が不正です');
  return id;
}

/**
 * 公開中の版を取得する。オフラインや取得失敗は「確認できなかった」として null を返す。
 * 入力の途中で通信が切れるのは普通に起きるので、利用者には知らせない。
 */
export async function fetchLatestBuildId(fetcher: typeof fetch = fetch): Promise<string | null> {
  let response: Response;
  try {
    response = await fetcher(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return parseBuildId(await response.json());
}

/** 新しい版を読み込むURL。クエリを変えて、キャッシュに残った古い index.html を避ける */
export function updateUrl(href: string, buildId: string): string {
  const url = new URL(href);
  url.searchParams.set('v', buildId);
  url.hash = '';
  return url.href;
}
