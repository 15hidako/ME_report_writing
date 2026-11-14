// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureRecord } from './test-fixtures';

const NAV = '<nav><button data-tab="list">履歴</button><button data-tab="form">入力</button><button data-tab="thumb">サムネ</button><a class="board-link" href="./board.html" target="me-board" data-switch>ボード</a></nav><main id="app"></main>';

const buttonNames = (root: ParentNode): string[] => [...root.querySelectorAll('button')].map((item) => item.textContent?.trim() ?? '');

async function start(publicBuild: boolean): Promise<void> {
  vi.stubEnv('VITE_PUBLIC_QUESTIONNAIRE', publicBuild ? 'true' : 'false');
  vi.stubEnv('VITE_ARTICLE_DIR', '');
  window.localStorage.setItem('me-report-writer/visits/v1', JSON.stringify([fixtureRecord()]));
  window.localStorage.setItem('me-report-writer/board/v1', JSON.stringify({
    version: 1, stages: {}, angles: { [fixtureRecord().id]: 'therapist' }, bundles: [], scheduleUrls: {}, checks: [], acknowledged: {},
  }));
  await import('./main');
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  document.body.innerHTML = NAV;
});

afterEach(() => {
  vi.unstubAllEnvs();
  document.body.innerHTML = '';
  window.localStorage.clear();
});

describe('公開ビルドの入口', () => {
  it('アンケートの回答に要る操作だけを残す', async () => {
    await start(true);
    const nav = document.querySelector('nav')!;
    expect(buttonNames(nav)).toEqual(['履歴', '入力']);
    expect(nav.querySelector('.board-link')).toBeNull();
    const app = document.getElementById('app')!;
    const names = buttonNames(app);
    expect(names).toEqual(expect.arrayContaining(['+ 新規入力', '編集', '再訪入力', '削除']));
    expect(names).not.toContain('カタログ記事');
    expect(names).not.toContain('まとめ記事');
    expect(names).not.toContain('プロンプト');
    expect(names).not.toContain('投稿URL');
    expect(app.querySelector('a.to-board')).toBeNull();
  });

  it('編集画面にボードへのリンクを出さない', async () => {
    await start(true);
    [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === '編集')!.click();
    expect(document.querySelector('#visit-form')).not.toBeNull();
    expect(document.querySelector('a.to-board')).toBeNull();
  });

  it('?thumb= で開かれても履歴を出す', async () => {
    history.replaceState(null, '', `/?thumb=${fixtureRecord().id}`);
    await start(true);
    expect(document.querySelector('#new-visit')).not.toBeNull();
    history.replaceState(null, '', '/');
  });

  it('PCのビルドは記事とボードの操作を残す', async () => {
    await start(false);
    expect(buttonNames(document.querySelector('nav')!)).toEqual(['履歴', '入力', 'サムネ']);
    expect(document.querySelector('nav .board-link')).not.toBeNull();
    const names = buttonNames(document.getElementById('app')!);
    expect(names).toEqual(expect.arrayContaining(['カタログ記事', 'まとめ記事', 'プロンプト', '投稿URL']));
    expect(document.querySelector('#app a.to-board')).not.toBeNull();
  });
});
