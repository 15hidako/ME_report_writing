// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './ui/widgets';

const originalExec = Object.getOwnPropertyDescriptor(document, 'execCommand');
const fallback = vi.fn<(...args: unknown[]) => boolean>();

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  fallback.mockReset().mockReturnValue(false);
  Object.defineProperty(document, 'execCommand', { configurable: true, value: fallback });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalExec) Object.defineProperty(document, 'execCommand', originalExec);
  else Reflect.deleteProperty(document, 'execCommand');
  document.body.innerHTML = '';
});

describe('クリップボードの成否', () => {
  it('通常のコピーが成功したら代替処理を実行しない', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await copyText('動作確認');
    expect(fallback).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('コピーしました');
  });

  it('代替処理の成功を確認し、一時的なテキストエリアを残さない', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    fallback.mockReturnValue(true);
    await copyText('動作確認');
    expect(document.body.textContent).toContain('コピーしました(fallback)');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('代替処理がfalseなら成功通知を出さない', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    await expect(copyText('動作確認')).resolves.toBeUndefined();
    expect(document.body.textContent).toContain('コピーに失敗しました');
    expect(document.body.textContent).not.toContain('コピーしました');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('代替処理が例外でも未処理の拒否と一時要素を残さない', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    fallback.mockImplementation(() => { throw new Error('not supported'); });
    await expect(copyText('動作確認')).resolves.toBeUndefined();
    expect(document.body.textContent).toContain('コピーに失敗しました');
    expect(document.querySelector('textarea')).toBeNull();
  });
});
