// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRecordsJson } from './record-validation';
import { fixtureRecord } from './test-fixtures';

const STORAGE_KEY = 'me-report-writer/visits/v1';
const backupKey = `${STORAGE_KEY}/backup`;
const canShare = vi.fn<Navigator['canShare']>();
const share = vi.fn<Navigator['share']>();

function button(format: 'json' | 'txt'): HTMLButtonElement {
  const control = document.querySelector<HTMLButtonElement>(`[data-share-format="${format}"]`);
  if (control === null) throw new Error('共有ボタンが見つかりません');
  return control;
}

function status(): string {
  return document.querySelector('[data-share-status]')?.textContent ?? '';
}

function sharedFile(call = 0): File {
  const file = share.mock.calls[call]?.[0]?.files?.[0];
  if (file === undefined) throw new Error('共有ファイルがありません');
  return file;
}

beforeEach(async () => {
  vi.resetModules();
  canShare.mockReset().mockReturnValue(true);
  share.mockReset().mockResolvedValue();
  vi.stubGlobal('navigator', { canShare, share });
  vi.stubGlobal('isSecureContext', true);
  window.localStorage.clear();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([fixtureRecord()]));
  window.localStorage.setItem(backupKey, '既存バックアップ');
  document.body.innerHTML = '<nav><button data-tab="list">履歴</button><button data-tab="form">入力</button></nav><main id="app"></main>';
  await import('./main');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  window.localStorage.clear();
});

describe('Slack実機確認用のファイル共有', () => {
  it('クリック内で合成回答1件だけをJSON配列で直接共有し、保存済み回答とバックアップを保持する', async () => {
    const before = window.localStorage.getItem(STORAGE_KEY);
    const write = vi.spyOn(window.localStorage, 'setItem');
    button('json').click();
    expect(share).toHaveBeenCalledOnce();
    const file = sharedFile();
    expect(file.name).toBe('me-report-share-test.json');
    expect(file.type).toBe('application/json');
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(share).toHaveBeenCalledWith({ files: [file] });
    const records = parseRecordsJson(await file.text());
    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe('slack-share-test');
    expect(records[0]?.basic.shopName).toBe('共有テスト用の架空店舗');
    expect(await file.text()).not.toContain(fixtureRecord().id);
    expect(write).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(window.localStorage.getItem(backupKey)).toBe('既存バックアップ');
    await vi.waitFor(() => expect(status()).toContain('Slackで投稿を確認'));
    expect(status()).not.toContain('送信済み');
  });

  it('テキスト形式でも同じJSONをファイル1件として渡す', async () => {
    button('json').click();
    await vi.waitFor(() => expect(button('txt').disabled).toBe(false));
    button('txt').click();
    const json = sharedFile();
    const text = sharedFile(1);
    expect(text.name).toBe('me-report-share-test.txt');
    expect(text.type).toBe('text/plain');
    expect(await text.text()).toBe(await json.text());
  });

  it('JSONを共有できない場合はテキストを案内し、勝手に再共有しない', () => {
    canShare.mockReturnValue(false);
    button('json').click();
    expect(share).not.toHaveBeenCalled();
    expect(status()).toContain('テキストを試してください');
    canShare.mockReturnValue(true);
    button('txt').click();
    expect(share).toHaveBeenCalledOnce();
  });

  it('テキストも非対応なら理由を表示する', () => {
    canShare.mockReturnValue(false);
    button('txt').click();
    expect(share).not.toHaveBeenCalled();
    expect(status()).toContain('テキストファイルを共有できません');
  });

  it('HTTPSが必要な環境では共有を開始しない', () => {
    vi.stubGlobal('isSecureContext', false);
    button('json').click();
    expect(share).not.toHaveBeenCalled();
    expect(status()).toContain('HTTPS');
  });

  it.each(['share', 'canShare'] as const)('%sがないブラウザでは非対応を表示する', (method) => {
    vi.stubGlobal('navigator', { canShare, share, [method]: undefined });
    button('json').click();
    expect(share).not.toHaveBeenCalled();
    expect(status()).toContain('ファイル共有に対応していません');
  });

  it('キャンセル後に同じ合成回答を再共有できる', async () => {
    share.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    button('json').click();
    await vi.waitFor(() => expect(button('json').disabled).toBe(false));
    expect(status()).toContain('キャンセル');
    button('json').click();
    expect(share).toHaveBeenCalledTimes(2);
    expect(await sharedFile().text()).toBe(await sharedFile(1).text());
  });

  it('共有先での失敗を表示し、再操作できる', async () => {
    share.mockRejectedValueOnce(new DOMException('target failed', 'DataError'));
    button('json').click();
    await vi.waitFor(() => expect(button('json').disabled).toBe(false));
    expect(status()).toContain('共有できませんでした: target failed');
    button('txt').click();
    expect(share).toHaveBeenCalledTimes(2);
  });

  it.each(['canShare', 'share'] as const)('%sが同期的に失敗しても再操作できる', (method) => {
    const fail = (): never => { throw new Error('blocked'); };
    if (method === 'canShare') canShare.mockImplementationOnce(fail);
    else share.mockImplementationOnce(fail);
    button('json').click();
    expect(status()).toContain('blocked');
    expect(button('json').disabled).toBe(false);
    button('txt').click();
    expect(share).toHaveBeenCalledTimes(method === 'share' ? 2 : 1);
  });

  it('共有画面を開いている間は二重に呼び出さない', async () => {
    let resolve: (() => void) | undefined;
    share.mockReturnValueOnce(new Promise<void>((done) => { resolve = done; }));
    button('json').click();
    expect(button('json').disabled).toBe(true);
    expect(button('txt').disabled).toBe(true);
    button('json').click();
    button('txt').click();
    expect(share).toHaveBeenCalledOnce();
    resolve?.();
    await vi.waitFor(() => expect(button('txt').disabled).toBe(false));
  });
});
