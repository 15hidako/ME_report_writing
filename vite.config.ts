import { defineConfig } from 'vite';

// 公開のたびに変わる識別子。開いたままの画面が、新しい版の公開に気づくために使う
const buildId = process.env.GITHUB_SHA ?? String(Date.now());

// GitHub Pages(サブパス配信)対応のため相対ベースにする
export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  build: {
    rollupOptions: {
      // 記事ボードはPC専用の別ページ。スマホの入力画面には読み込ませない
      input: { main: 'index.html', board: 'board.html' },
    },
  },
  plugins: [{
    name: 'emit-version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) });
    },
  }],
});
