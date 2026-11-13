// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureRecord } from './test-fixtures';
import type { VisitRecord } from './types';

const STORAGE_KEY = 'me-report-writer/visits/v1';
const canShare = vi.fn<Navigator['canShare']>();
const share = vi.fn<Navigator['share']>();

function button(name: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
  if (!match) throw new Error(`ボタンがありません: ${name}`);
  return match;
}

function field(name: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const control = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
  if (!control) throw new Error(`入力欄がありません: ${name}`);
  return control;
}

function records(): VisitRecord[] {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]') as VisitRecord[];
}

async function start(initial: readonly VisitRecord[] = []): Promise<void> {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  await import('./main');
}

function fillNew(): void {
  button('入力').click();
  field('prefecture').value = '東京都';
  field('area').value = '新宿';
  field('bestMoment').value = '合成回答の動作確認';
}

function savedStatus(): string {
  return document.getElementById('save-share-status')?.textContent ?? '';
}

function chooseFile(file: File): void {
  let chooser: HTMLInputElement | undefined;
  const create = document.createElement.bind(document);
  const spy = vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    const node = create(tag, options);
    if (tag === 'input') chooser = node as HTMLInputElement;
    return node;
  });
  button('回答を追加読込').click();
  spy.mockRestore();
  if (!chooser) throw new Error('ファイル選択がありません');
  expect(chooser.accept).toContain('.json');
  expect(chooser.accept).toContain('.txt');
  Object.defineProperty(chooser, 'files', { configurable: true, value: [file] });
  chooser.dispatchEvent(new Event('change'));
}

async function pickFile(body: string, name = 'handoff.json'): Promise<void> {
  const file = new File([body], name);
  const reading = vi.spyOn(file, 'text');
  chooseFile(file);
  const result = reading.mock.results[0];
  if (result?.type !== 'return') throw new Error('ファイルを読めませんでした');
  await result.value;
}

beforeEach(() => {
  vi.resetModules();
  canShare.mockReset().mockReturnValue(true);
  share.mockReset().mockResolvedValue();
  vi.stubGlobal('navigator', { canShare, share });
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('confirm', vi.fn(() => true));
  window.localStorage.clear();
  document.body.innerHTML = '<nav><button data-tab="list">履歴</button><button data-tab="form">入力</button><button data-tab="thumb">サムネ</button></nav><main id="app"></main>';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.body.innerHTML = '';
});

describe('保存して共有', () => {
  it('共有を呼ぶ時点で現在の回答が保存され、他の回答を添付しない', async () => {
    const other = fixtureRecord();
    await start([other]);
    fillNew();
    share.mockImplementation(() => {
      expect(records()).toHaveLength(2);
      expect(records()[1]?.flow.bestMoment).toBe('合成回答の動作確認');
      return Promise.resolve();
    });
    button('保存して共有').click();
    expect(share).toHaveBeenCalledOnce();
    const data = share.mock.calls[0]?.[0];
    expect(data?.files).toHaveLength(1);
    const payload = JSON.parse(await data!.files![0]!.text()) as VisitRecord[];
    expect(payload).toHaveLength(1);
    expect(payload[0]).toEqual(records()[1]);
    expect(payload[0]?.id).not.toBe(other.id);
    expect(canShare).toHaveBeenCalledWith(data);
    await vi.waitFor(() => expect(savedStatus()).toContain('投稿はSlackで確認'));
    expect(savedStatus()).not.toContain('送信済み');
  });

  it('入力が不正な場合は保存も共有も始めない', async () => {
    await start();
    button('入力').click();
    button('保存して共有').click();
    expect(records()).toEqual([]);
    expect(share).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('必須');
  });

  it('保存失敗時は共有せず、入力を保つ', async () => {
    await start();
    fillNew();
    const original = window.localStorage;
    const failing = new Proxy(original, {
      get(target, key) {
        if (key === 'setItem') return (): never => { throw new Error('quota'); };
        const value: unknown = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(failing);
    button('保存して共有').click();
    expect(share).not.toHaveBeenCalled();
    expect(field('bestMoment').value).toBe('合成回答の動作確認');
    expect(records()).toHaveLength(0);
    expect(document.body.textContent).toContain('保存に失敗');
  });

  it.each(['AbortError', 'DataError'])('%sの後も同じIDで再共有でき、回答を増やさない', async (name) => {
    await start();
    fillNew();
    share.mockRejectedValueOnce(new DOMException('share failed', name));
    button('保存して共有').click();
    const id = records()[0]?.id;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const backup = window.localStorage.getItem(`${STORAGE_KEY}/backup/pending`);
    await vi.waitFor(() => expect(button('保存して共有').disabled).toBe(false));
    expect(savedStatus()).toContain('保存済み');
    expect(field('bestMoment').value).toBe('合成回答の動作確認');
    button('保存して共有').click();
    expect(records()).toHaveLength(1);
    expect(records()[0]?.id).toBe(id);
    expect(share).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(raw);
    expect(window.localStorage.getItem(`${STORAGE_KEY}/backup/pending`)).toBe(backup);
    expect(await share.mock.calls[0]![0]!.files![0]!.text()).toBe(await share.mock.calls[1]![0]!.files![0]!.text());
  });

  it('共有の再試行前に編集した回答は、同じIDへ保存してから共有する', async () => {
    await start();
    fillNew();
    share.mockRejectedValueOnce(new DOMException('cancelled', 'AbortError'));
    button('保存して共有').click();
    const id = records()[0]?.id;
    await vi.waitFor(() => expect(button('保存して共有').disabled).toBe(false));
    field('bestMoment').value = '保存後の追記';
    field('bestMoment').dispatchEvent(new Event('input', { bubbles: true }));
    button('保存して共有').click();
    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({ id, flow: { bestMoment: '保存後の追記' } });
    const payload = JSON.parse(await share.mock.calls[1]![0]!.files![0]!.text()) as VisitRecord[];
    expect(payload[0]).toEqual(records()[0]);
  });

  it('未編集の再共有は最新の保存内容を渡し、その後の古いフォームからの上書きを止める', async () => {
    const record = fixtureRecord();
    await start([record]);
    button('編集').click();
    const latest = { ...record, basic: { ...record.basic, shopName: '別画面の修正' } };
    const latestJson = JSON.stringify([latest]);
    window.localStorage.setItem(STORAGE_KEY, latestJson);

    button('保存して共有').click();
    await vi.waitFor(() => expect(button('保存して共有').disabled).toBe(false));
    const payload = JSON.parse(await share.mock.calls[0]![0]!.files![0]!.text()) as VisitRecord[];
    expect(payload).toEqual([latest]);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(latestJson);
    field('shopName').value = '手元の入力';
    field('shopName').dispatchEvent(new Event('input', { bubbles: true }));
    button('保存').click();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(latestJson);
    expect(field('shopName').value).toBe('手元の入力');
    expect(document.body.textContent).toMatch(/別の画面.*変更/);
  });

  it('共有非対応でも保存済みの回答を残し、保存だけの操作を続けられる', async () => {
    await start();
    fillNew();
    canShare.mockReturnValue(false);
    button('保存して共有').click();
    expect(share).not.toHaveBeenCalled();
    expect(records()).toHaveLength(1);
    expect(savedStatus()).toContain('保存済み');
    expect(savedStatus()).toContain('共有できません');
    button('保存').click();
    expect(records()).toHaveLength(1);
    expect(document.getElementById('visit-form')).toBeNull();
  });

  it('共有中の連打は1回にまとめ、完了後の編集も保持する', async () => {
    await start();
    fillNew();
    let resolve: (() => void) | undefined;
    share.mockReturnValueOnce(new Promise<void>((done) => { resolve = done; }));
    button('保存して共有').click();
    button('保存して共有').click();
    button('保存').click();
    document.querySelector<HTMLFormElement>('#visit-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(share).toHaveBeenCalledOnce();
    expect(records()).toHaveLength(1);
    field('bestMoment').value = '共有中に追記';
    field('bestMoment').dispatchEvent(new Event('input', { bubbles: true }));
    resolve?.();
    await vi.waitFor(() => expect(button('保存').disabled).toBe(false));
    button('履歴').click();
    vi.mocked(confirm).mockReturnValue(false);
    button('+ 新規入力').click();
    expect(confirm).toHaveBeenCalledOnce();
    button('入力').click();
    expect(field('bestMoment').value).toBe('共有中に追記');
  });
});

describe('回答の追加読込', () => {
  it('大きすぎるファイルは内容を読み出す前に拒否する', async () => {
    await start([fixtureRecord()]);
    const file = new File(['合成'], 'oversize.json');
    Object.defineProperty(file, 'size', { value: 1024 * 1024 + 1 });
    const reading = vi.spyOn(file, 'text');
    chooseFile(file);
    expect(reading).not.toHaveBeenCalled();
    expect(records()).toEqual([fixtureRecord()]);
    expect(document.body.textContent).toContain('1MB以下');
  });

  it('新しい回答を追加し、同じファイルの再読込では何も変えない', async () => {
    await start([fixtureRecord()]);
    const added = fixtureRecord({ id: 'mobile-record', seriesNo: 2 });
    await pickFile(JSON.stringify([added]), 'handoff.txt');
    expect(records()).toHaveLength(2);
    const before = window.localStorage.getItem(STORAGE_KEY);
    const backup = window.localStorage.getItem(`${STORAGE_KEY}/backup/pending`);
    await pickFile(JSON.stringify([added]));
    await vi.waitFor(() => expect(document.body.textContent).toContain('同じ回答'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(window.localStorage.getItem(`${STORAGE_KEY}/backup/pending`)).toBe(backup);
  });

  it('通し番号の重複では新番号を確認し、キャンセルなら追加しない', async () => {
    await start([fixtureRecord()]);
    vi.mocked(confirm).mockReturnValue(false);
    const added = fixtureRecord({ id: 'mobile-record' });
    await pickFile(JSON.stringify([added]));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('#2'));
    expect(records()).toHaveLength(1);
    vi.mocked(confirm).mockReturnValue(true);
    await pickFile(JSON.stringify([added]));
    await vi.waitFor(() => expect(records()).toHaveLength(2));
    expect(records()[1]).toMatchObject({ id: 'mobile-record', seriesNo: 2 });
  });

  it('更新前に差分を表示し、確認後もPCの通し番号と投稿URLを保つ', async () => {
    const existing = fixtureRecord({ seriesNo: 8, postedUrl: 'https://wakust.com/u/104/' });
    await start([existing]);
    const changed = fixtureRecord({ flow: { ...existing.flow, bestMoment: '<img src=x onerror=alert(1)>' } });
    await pickFile(JSON.stringify([changed]));
    const dialog = document.querySelector<HTMLDialogElement>('.handoff-dialog');
    expect(dialog?.open).toBe(true);
    expect(document.activeElement).toBe(dialog?.querySelector('h2'));
    expect(dialog?.textContent).toContain('一番良かった瞬間');
    expect(dialog?.textContent).toContain(existing.flow.bestMoment);
    expect(dialog?.textContent).toContain(changed.flow.bestMoment);
    expect(dialog?.querySelector('img')).toBeNull();
    expect(records()[0]).toEqual(existing);
    button('更新する').click();
    expect(records()[0]).toMatchObject({ seriesNo: 8, postedUrl: existing.postedUrl, flow: { bestMoment: changed.flow.bestMoment } });
    await vi.waitFor(() => expect(document.querySelector('.handoff-dialog')).toBeNull());
    button('バックアップ復元').click();
    expect(records()[0]).toEqual(existing);
  });

  it('更新のキャンセルではデータと入力中の回答を保持する', async () => {
    const existing = fixtureRecord();
    await start([existing]);
    fillNew();
    field('bestMoment').dispatchEvent(new Event('input', { bubbles: true }));
    button('履歴').click();
    await pickFile(JSON.stringify([{ ...existing, basic: { ...existing.basic, area: '更新案' } }]));
    button('キャンセル').click();
    await vi.waitFor(() => expect(document.querySelector('.handoff-dialog')).toBeNull());
    expect(records()).toEqual([existing]);
    button('入力').click();
    expect(field('bestMoment').value).toBe('合成回答の動作確認');
  });

  it('確認中に保存内容が変わると上書きせず、ダイアログ内に理由を表示する', async () => {
    const existing = fixtureRecord();
    await start([existing]);
    await pickFile(JSON.stringify([{ ...existing, basic: { ...existing.basic, area: '更新案' } }]));
    const concurrent = { ...existing, postedUrl: 'https://wakust.com/u/105/' };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([concurrent]));
    button('更新する').click();
    expect(records()).toEqual([concurrent]);
    expect(document.querySelector('.handoff-dialog [role="alert"]')?.textContent).toContain('取り込み直して');
  });

  it.each(['not json', '[]', JSON.stringify([fixtureRecord({ revisitOf: 'missing', sales: { points: 100, articleType: 'revisit' } })])])('不正なファイル%sでは既存回答を変更しない', async (body) => {
    const existing = fixtureRecord();
    await start([existing]);
    await pickFile(body);
    expect(records()).toEqual([existing]);
    expect(document.querySelector('.handoff-dialog')).toBeNull();
    expect(document.body.textContent).not.toContain('追加しました');
  });
  it('再共有では補完済みの店舗情報を保ち、取得記録の差分を読める形で示す', async () => {
    const lookup = { sourceUrl: 'https://example.com/profile/1', checkedAt: '2026-11-11T03:00:00.000Z', filled: ['shopName'] as const };
    const resolved = fixtureRecord({ basic: { ...fixtureRecord().basic, identityLookup: lookup } });
    const { identityLookup: _dropped, ...phoneBasic } = resolved.basic;
    const blank = { ...phoneBasic, shopName: '', shopUrl: '', therapistName: '', therapistXUrl: '' };
    await start([resolved]);

    await pickFile(JSON.stringify([{ ...resolved, basic: { ...blank, area: '新宿' } }]));
    const kept = document.querySelector<HTMLDialogElement>('.handoff-dialog')!;
    expect(kept.textContent).toContain('エリア');
    expect(kept.textContent).not.toContain('店名');
    button('更新する').click();
    await vi.waitFor(() => expect(document.querySelector('.handoff-dialog')).toBeNull());
    expect(records()[0]?.basic).toMatchObject({ area: '新宿', shopName: resolved.basic.shopName, identityLookup: lookup });

    await pickFile(JSON.stringify([{ ...resolved, basic: { ...blank, area: '新宿', therapistProfileUrl: 'https://example.com/profile/2' } }]));
    const replaced = document.querySelector<HTMLDialogElement>('.handoff-dialog')!;
    expect(replaced.textContent).toContain('店舗情報の取得記録');
    expect(replaced.textContent).toContain(lookup.sourceUrl);
    expect(replaced.textContent).not.toContain('[object Object]');
    expect(replaced.textContent).not.toContain('変更項目');
  });
});


describe('投稿URLダイアログ中の外部変更', () => {
  it.each(['edit', 'delete', 'url'])('%sを巻き戻さず、競合時は入力を残す', async (change) => {
    const original = fixtureRecord();
    await start([original]);
    button('履歴').click();
    button('投稿URL').click();
    const latest = { ...original, seriesNo: 9, flow: { ...original.flow, bestMoment: '別画面の訂正' }, postedUrl: change === 'url' ? 'https://wakust.com/reports/1002' : null };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(change === 'delete' ? [] : [latest]));
    field('postedUrl').value = 'https://wakust.com/reports/1001';
    button('決定').click();
    if (change === 'edit') expect(records()[0]).toMatchObject({ seriesNo: 9, flow: latest.flow, postedUrl: 'https://wakust.com/reports/1001' });
    else {
      expect(records()).toEqual(change === 'delete' ? [] : [latest]);
      expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/見つかりません|変更/);
      expect(field('postedUrl').value).toBe('https://wakust.com/reports/1001');
    }
  });
});
