// このPCだけの設定。.env.local(gitignore済み)に VITE_ARTICLE_DIR を書いたときだけ有効になる。
// GitHub Pages の公開版には値が入らないため、スマホの入力画面は従来どおりコピーだけを行う。

const raw: unknown = import.meta.env['VITE_ARTICLE_DIR'];

function parseDir(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const dir = value.trim();
  if (!/^(?:[A-Za-z]:[\\/]|\/)/.test(dir)) {
    throw new Error(`VITE_ARTICLE_DIR は絶対パスで指定してください: ${dir}`);
  }
  return dir;
}

function load(): { dir: string | null; error: string | null } {
  try {
    return { dir: parseDir(raw), error: null };
  } catch (error) {
    // 設定の誤りで入力画面ごと止めない。起動時に画面へ知らせ、従来のコピーだけで動かす
    return { dir: null, error: error instanceof Error ? error.message : String(error) };
  }
}

const setup = load();
/** Claude Code に原稿を保存させるフォルダ。未設定・設定誤りなら null */
export const ARTICLE_DIR: string | null = setup.dir;
export const ARTICLE_DIR_ERROR: string | null = setup.error;

/** コピーのあとに Claude デスクトップアプリを前面に出す */
export function openClaudeApp(): void {
  Object.assign(document.createElement('a'), { href: 'claude://' }).click();
}
