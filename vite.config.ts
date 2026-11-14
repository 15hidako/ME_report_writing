import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { localDataPlugin } from './scripts/local-data.mjs';

// 公開のたびに変わる識別子。開いたままの画面が、新しい版の公開に気づくために使う
const buildId = process.env.GITHUB_SHA ?? String(Date.now());

// GitHub Pages(サブパス配信)対応のため相対ベースにする
export default defineConfig(({ command }) => ({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    'import.meta.env.VITE_PUBLIC_QUESTIONNAIRE': JSON.stringify(command === 'build' ? 'true' : 'false'),
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/data/**'] },
  },
  build: {
    rollupOptions: {
      input: { main: 'index.html' },
    },
  },
  plugins: [{
    name: 'public-questionnaire-entry',
    apply: 'build',
    transformIndexHtml(html) {
      return html
        .replace(/\s*<button data-tab="thumb">[^<]*<\/button>/, '')
        .replace(/\s*<a class="board-link"[^>]*>[^<]*<\/a>/, '');
    },
  }, {
    name: 'emit-version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId }) });
    },
  }, localDataPlugin(fileURLToPath(new URL('.', import.meta.url)))],
}));
