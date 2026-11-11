import { defineConfig } from 'vite';

// GitHub Pages(サブパス配信)対応のため相対ベースにする
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      // 記事ボードはPC専用の別ページ。スマホの入力画面には読み込ませない
      input: { main: 'index.html', board: 'board.html' },
    },
  },
});
