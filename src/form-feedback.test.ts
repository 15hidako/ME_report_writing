// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureRecord } from './test-fixtures';
import type { VisitRecord } from './types';

const KEY = 'me-report-writer/visits/v1';
const share = vi.fn<Navigator['share']>();

function button(text: string): HTMLButtonElement {
  const node = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === text);
  if (!node) throw new Error(`ボタンがありません: ${text}`);
  return node;
}

function field(name: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const node = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!node) throw new Error(`入力欄がありません: ${name}`);
  return node;
}

function set(name: string, value: string): void {
  const node = field(name);
  node.value = value;
  node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}

async function start(records: readonly VisitRecord[] = []): Promise<void> {
  window.localStorage.setItem(KEY, JSON.stringify(records));
  await import('./main');
  button('入力').click();
}

function completeRequired(): void {
  set('prefecture', '東京都');
  set('area', '新宿');
  set('bestMoment', '合成回答の入力確認');
}

function summary(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.form-errors:not([hidden])');
}

beforeEach(() => {
  vi.resetModules();
  share.mockReset().mockResolvedValue();
  vi.stubGlobal('navigator', { share, canShare: () => true });
  vi.stubGlobal('isSecureContext', true);
  window.localStorage.clear();
  document.body.innerHTML = '<nav><button data-tab="list">履歴</button><button data-tab="form">入力</button><button data-tab="thumb">サムネ</button></nav><main id="app"></main>';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.body.innerHTML = '';
});

describe('スマホ入力の必須表示と修正導線', () => {
  it('入力前から必須3項目を表示し、任意URLを必須にしない', async () => {
    await start();
    for (const name of ['prefecture', 'area', 'bestMoment']) {
      expect(field(name).required).toBe(true);
      expect(field(name).closest('label')?.textContent).toContain('必須');
    }
    expect(field('shopUrl').required).toBe(false);
    expect(document.querySelector<HTMLFormElement>('#visit-form')?.noValidate).toBe(true);
    expect(summary()).toBeNull();
  });

  it.each(['保存', '保存して共有'])('%sで不足をまとめて示し、保存も共有もしない', async (name) => {
    await start();
    button(name).click();
    expect(summary()?.textContent).toContain('3項目');
    expect(summary()?.textContent).toContain('都道府県');
    expect(summary()?.textContent).toContain('エリア');
    expect(summary()?.textContent).toContain('一番良かった瞬間');
    expect(document.activeElement).toBe(summary());
    expect(window.localStorage.getItem(KEY)).toBe('[]');
    expect(share).not.toHaveBeenCalled();
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('URLの不備を日本語で示し、折りたたまれた入力欄へ移動できる', async () => {
    const existing = fixtureRecord();
    await start([existing]);
    button('履歴').click();
    button('編集').click();
    set('shopUrl', '不明');
    const section = field('shopUrl').closest('details')!;
    section.open = false;
    const before = window.localStorage.getItem(KEY);
    button('保存して共有').click();
    expect(summary()?.textContent).toContain('店URL');
    expect(summary()?.textContent).toContain('空欄');
    expect(summary()?.textContent).not.toMatch(/shopUrl|must|constant/);
    expect(field('shopUrl').getAttribute('aria-invalid')).toBe('true');
    const description = field('shopUrl').getAttribute('aria-describedby');
    expect(description).toBeTruthy();
    expect(document.getElementById(description!)?.textContent).toContain('https://');
    summary()!.querySelector<HTMLButtonElement>('button')!.click();
    expect(section.open).toBe(true);
    expect(document.activeElement).toBe(field('shopUrl'));
    expect(field('shopUrl').value).toBe('不明');
    expect(window.localStorage.getItem(KEY)).toBe(before);
    expect(share).not.toHaveBeenCalled();
    set('shopUrl', '');
    expect(field('shopUrl').hasAttribute('aria-invalid')).toBe(false);
    expect(summary()).toBeNull();
    button('保存').click();
    expect(JSON.parse(window.localStorage.getItem(KEY)!) as VisitRecord[]).toMatchObject([{ basic: { shopUrl: '' } }]);
  });

  it('修正中はフォーカスを奪わず、解消した項目だけを一覧から除く', async () => {
    await start();
    button('保存').click();
    field('prefecture').focus();
    set('prefecture', '東京都');
    expect(document.activeElement).toBe(field('prefecture'));
    expect(summary()?.textContent).toContain('2項目');
    expect(field('prefecture').hasAttribute('aria-invalid')).toBe(false);
    expect(field('area').getAttribute('aria-invalid')).toBe('true');
    set('area', '新宿');
    set('bestMoment', '合成回答の記録');
    expect(summary()).toBeNull();
    button('保存').click();
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toHaveLength(1);
  });

  it('その他を選んだときだけ詳細の入力を求める', async () => {
    await start();
    completeRequired();
    set('prefecture', 'other');
    set('area', 'other');
    set('course', 'other');
    button('保存').click();
    expect(summary()?.textContent).toContain('3項目');
    for (const name of ['prefectureOther', 'areaOther', 'courseOther']) {
      expect(field(name).getAttribute('aria-invalid')).toBe('true');
    }
    set('prefecture', '東京都');
    set('area', '新宿');
    set('course', '');
    expect(summary()).toBeNull();
    button('保存').click();
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toHaveLength(1);
  });

  it('URL・年齢・金額・販売ポイントの不備をまとめて示す', async () => {
    await start();
    completeRequired();
    set('shopUrl', '不明');
    set('age', '151');
    set('optionFee', '1.5');
    set('points', '-1');
    button('保存').click();
    expect(summary()?.textContent).toContain('4項目');
    for (const name of ['shopUrl', 'age', 'optionFee', 'points']) {
      expect(field(name).getAttribute('aria-invalid')).toBe('true');
    }
    expect(summary()?.textContent).not.toMatch(/must|constant|basic\//);
    expect(window.localStorage.getItem(KEY)).toBe('[]');
  });

  it.each(['age', 'points'])('%sに指数表記や丸められる小数を入れても整数として保存しない', async (name) => {
    await start();
    completeRequired();
    for (const value of ['1e-999', '1.5e1', '1.0000000000000001']) {
      set(name, value);
      button('保存').click();
      expect(field(name).getAttribute('aria-invalid')).toBe('true');
      expect(window.localStorage.getItem(KEY)).toBe('[]');
    }
  });

  it('エラー表示後のタイプ数変更で、inputに続くchangeまで待って価格欄を検証する', async () => {
    await start();
    button('保存').click();
    const count = field('optionCount');
    count.value = '1';
    expect(() => count.dispatchEvent(new Event('input', { bubbles: true }))).not.toThrow();
    count.dispatchEvent(new Event('change', { bubbles: true }));
    expect(field('optionPrice_0')).toBeDefined();
    expect(summary()?.textContent).toContain('3項目');
    expect(summary()?.textContent).not.toContain('入力欄が見つかりません');
  });

  it('入力値と修正案内をタブ切替でも保持する', async () => {
    await start();
    completeRequired();
    set('shopUrl', '未確認');
    button('保存').click();
    button('履歴').click();
    button('入力').click();
    expect(field('shopUrl').value).toBe('未確認');
    expect(summary()?.textContent).toContain('店URL');
  });

  it('エラー内容が同じ間は、別項目の入力で案内を読み直させない', async () => {
    await start();
    button('保存').click();
    const heading = summary()?.querySelector('h2');
    set('shopName', '任意項目の合成入力');
    expect(summary()?.querySelector('h2')).toBe(heading);
    expect(summary()?.textContent).toContain('3項目');
  });

  it('保存領域のエラーも一時通知だけにせず、入力とともに残す', async () => {
    await start();
    completeRequired();
    const storage = window.localStorage;
    const failing = new Proxy(storage, {
      get(target, name) {
        if (name === 'setItem') return (): never => { throw new Error('quota'); };
        const value: unknown = Reflect.get(target, name);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(failing);
    button('保存').click();
    expect(summary()?.textContent).toContain('保存に失敗');
    expect(field('bestMoment').value).toBe('合成回答の入力確認');
    expect(document.querySelector('.toast')).toBeNull();
  });
});
