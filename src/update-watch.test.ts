// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const check = vi.hoisted(() => ({ latest: vi.fn<() => Promise<string | null>>() }));
vi.mock('./update-check', () => ({
  BUILD_ID: 'current',
  fetchLatestBuildId: check.latest,
  updateUrl: (href: string, id: string) => `${href}?v=${id}`,
}));

const { RELOADED_FOR_KEY, watchForUpdate } = await import('./update-watch');

const replace = vi.fn();

function options(busy: boolean, confirmLeave = true) {
  return {
    isBusy: vi.fn(() => busy),
    confirmLeave: vi.fn(() => confirmLeave),
    onLeave: vi.fn(),
    onError: vi.fn(),
  };
}

beforeEach(() => {
  document.body.innerHTML = '<header></header>';
  sessionStorage.clear();
  replace.mockReset();
  vi.stubGlobal('location', { href: 'https://example.github.io/app/board.html', replace });
});

afterEach(() => {
  vi.unstubAllGlobals();
  check.latest.mockReset();
  document.body.innerHTML = '';
});

describe('新しい版の検知', () => {
  it('同じ版なら何もしない', async () => {
    check.latest.mockResolvedValue('current');
    const opts = options(false);
    watchForUpdate(opts);
    await vi.waitFor(() => expect(check.latest).toHaveBeenCalled());
    await Promise.resolve();
    expect(replace).not.toHaveBeenCalled();
    expect(document.getElementById('update-app')).toBeNull();
  });

  it('入力の途中でなければ、知らせたうえで読み込み直す', async () => {
    check.latest.mockResolvedValue('next');
    const opts = options(false);
    watchForUpdate(opts);
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('https://example.github.io/app/board.html?v=next'));
    expect(opts.onLeave).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(RELOADED_FOR_KEY)).toBe('next');
  });

  it('入力の途中なら読み込み直さず、ボタンを出す。押して破棄を了承したら読み込み直す', async () => {
    check.latest.mockResolvedValue('next');
    const opts = options(true, false);
    watchForUpdate(opts);
    await vi.waitFor(() => expect(document.getElementById('update-app')).not.toBeNull());
    expect(replace).not.toHaveBeenCalled();
    document.getElementById('update-app')!.click();
    expect(opts.confirmLeave).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
    opts.confirmLeave.mockReturnValue(true);
    document.getElementById('update-app')!.click();
    expect(replace).toHaveBeenCalledOnce();
  });

  it('同じ版へ読み込み直しても古いままなら、繰り返さずボタンに任せる', async () => {
    check.latest.mockResolvedValue('next');
    sessionStorage.setItem(RELOADED_FOR_KEY, 'next');
    watchForUpdate(options(false));
    await vi.waitFor(() => expect(document.getElementById('update-app')).not.toBeNull());
    expect(replace).not.toHaveBeenCalled();
  });

  it('確認に失敗したら理由を渡す', async () => {
    check.latest.mockRejectedValue(new Error('version.json の形式が不正です'));
    const opts = options(false);
    watchForUpdate(opts);
    await vi.waitFor(() => expect(opts.onError).toHaveBeenCalledWith(new Error('version.json の形式が不正です')));
  });
});
