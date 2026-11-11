// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureRecord } from './test-fixtures';
import type { VisitRecord } from './types';

const STORAGE_KEY = 'me-report-writer/visits/v1';
const PROFILE = 'https://shop.example/cast/12';
const writeText = vi.fn<(text: string) => Promise<void>>();
const confirmMock = vi.fn<(message?: string) => boolean>();

function button(name: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === name);
  if (!match) throw new Error(`ボタンがありません: ${name}`);
  return match;
}

function act(name: string): HTMLButtonElement {
  const match = document.querySelector<HTMLButtonElement>(`.identity-lookup-dialog button[data-act="${name}"]`);
  if (!match) throw new Error(`操作がありません: ${name}`);
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

function record(seriesNo: number, basic: Partial<VisitRecord['basic']> = {}): VisitRecord {
  const base = fixtureRecord();
  return { ...base, id: `id-${seriesNo}`, seriesNo, basic: { ...base.basic, ...basic } };
}

function urlOnly(seriesNo: number): VisitRecord {
  return record(seriesNo, {
    shopName: '', shopUrl: '', therapistName: '', therapistXUrl: '', therapistProfileUrl: PROFILE,
  });
}

function enterProfileUrl(url: string): void {
  field('therapistProfileUrl').value = url;
  field('therapistProfileUrl').dispatchEvent(new Event('change', { bubbles: true }));
}

function status(): string {
  return document.getElementById('identity-status')?.textContent ?? '';
}

function answer(overrides: Record<string, unknown> = {}): string {
  return `\`\`\`json\n${JSON.stringify([{
    ref: 2, profileUrl: PROFILE, shopName: '月のスパ', shopUrl: 'https://shop.example/',
    therapistName: 'あや', therapistXUrl: null, ...overrides,
  }])}\n\`\`\``;
}

function paste(text: string): void {
  field('lookupResponse').value = text;
  act('review').click();
}

function alertText(): string {
  return document.querySelector('.identity-lookup-dialog [role="alert"]')?.textContent ?? '';
}

beforeEach(() => {
  vi.resetModules();
  writeText.mockReset().mockResolvedValue();
  confirmMock.mockReset().mockReturnValue(true);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  vi.stubGlobal('confirm', confirmMock);
  window.localStorage.clear();
  document.body.innerHTML = '<nav><button data-tab="list">履歴</button><button data-tab="form">入力</button><button data-tab="thumb">サムネ</button></nav><main id="app"></main>';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.body.innerHTML = '';
});

describe('入力画面のプロフィールURLからの補完', () => {
  it('初めてのサイトでは店URLだけを補完する', async () => {
    await start();
    button('入力').click();
    enterProfileUrl(PROFILE);
    expect(field('shopUrl').value).toBe('https://shop.example/');
    expect(field('shopName').value).toBe('');
    expect(status()).toBe('店URL を補完しました');
  });

  it('同じサイトの過去記録から店名を、同じページの過去記録から全項目を補完する', async () => {
    await start([fixtureRecord()]);
    button('入力').click();
    enterProfileUrl('https://example.com/profile/2');
    expect(field('shopName').value).toBe('天界のスパ');
    expect(field('therapistName').value).toBe('');
    expect(status()).toBe('店名・店URL を補完しました');

    enterProfileUrl('https://www.example.com/profile/1/');
    expect(field('therapistName').value).toBe('えりか');
    expect(field('therapistXUrl').value).toBe('https://x.com/example');
    expect(status()).toBe('#1 の記録から セラピスト名・X URL を補完しました');
  });

  it('手入力した値は上書きせず、補完した値はURLを直すと入れ替える', async () => {
    await start([fixtureRecord()]);
    button('入力').click();
    field('shopName').value = '自分で入れた店名';
    enterProfileUrl('https://example.com/profile/2');
    expect(field('shopName').value).toBe('自分で入れた店名');
    expect(field('shopUrl').value).toBe('https://example.com/');

    enterProfileUrl(PROFILE);
    expect(field('shopName').value).toBe('自分で入れた店名');
    expect(field('shopUrl').value).toBe('https://shop.example/');

    enterProfileUrl('');
    expect(field('shopUrl').value).toBe('');
    expect(status()).toBe('');
  });

  it('補完後に手で直した値は、URLを変えても保つ', async () => {
    await start();
    button('入力').click();
    enterProfileUrl(PROFILE);
    field('shopUrl').value = 'https://shop.example/ebisu/';
    enterProfileUrl('https://other.example/cast/1');
    expect(field('shopUrl').value).toBe('https://shop.example/ebisu/');
  });

  it('補完した値を未保存の入力として扱い、保存できる', async () => {
    await start();
    button('入力').click();
    field('prefecture').value = '東京都';
    field('area').value = '新宿';
    field('bestMoment').value = '合成回答の動作確認';
    enterProfileUrl(PROFILE);
    button('保存').click();
    expect(records()[0]?.basic).toMatchObject({ therapistProfileUrl: PROFILE, shopUrl: 'https://shop.example/', shopName: '' });
  });
});

describe('履歴画面の店舗情報の取得', () => {
  it('取得が必要な回答がなければボタンを出さない', async () => {
    await start([fixtureRecord()]);
    expect(document.getElementById('identity-lookup')).toBeNull();
  });

  it('プロンプトをコピーし、返答を確認してから空欄を保存する', async () => {
    await start([record(1), urlOnly(2)]);
    button('店舗情報を取得(1)').click();
    const dialog = document.querySelector<HTMLDialogElement>('dialog.identity-lookup-dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain(PROFILE);

    act('copy-prompt').click();
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).toContain(`[{"ref":2,"profileUrl":"${PROFILE}"}]`);

    paste(answer());
    expect(records()[1]?.basic.shopName).toBe('');
    expect(act('review').hidden).toBe(true);
    expect(dialog.textContent).toContain('月のスパ');
    expect(dialog.textContent).toContain('あや');

    act('apply').click();
    expect(document.querySelector('.identity-lookup-dialog')).toBeNull();
    expect(records()[0]).toEqual(record(1));
    expect(records()[1]?.basic).toMatchObject({
      shopName: '月のスパ', shopUrl: 'https://shop.example/', therapistName: 'あや', therapistXUrl: '',
      identityLookup: { sourceUrl: PROFILE, filled: ['shopName', 'shopUrl', 'therapistName'] },
    });
    expect(document.getElementById('identity-lookup')).toBeNull();
    expect(document.getElementById('app')?.textContent).toContain('月のスパ — あや');
  });

  it('読み取れない返答は理由を示し、貼り付けた文章を保つ', async () => {
    await start([urlOnly(2)]);
    button('店舗情報を取得(1)').click();
    paste('ページを開けませんでした');
    expect(alertText()).toContain('返答からJSONを読み取れません');
    expect(field('lookupResponse').value).toBe('ページを開けませんでした');
    expect(act('review').hidden).toBe(false);
    expect(records()[0]?.basic.shopName).toBe('');
  });

  it('採用しなかった理由を示し、保存できる項目がなければ保存の操作を出さない', async () => {
    await start([urlOnly(2)]);
    button('店舗情報を取得(1)').click();
    paste(answer({ shopName: null, shopUrl: null, therapistName: null }));
    expect(document.querySelector('.identity-lookup-dialog')?.textContent).toContain('#2: 取得できた項目がありません');
    expect(act('apply').hidden).toBe(true);

    act('back').click();
    expect(act('review').hidden).toBe(false);
    expect(field('lookupResponse').value).not.toBe('');
  });

  it('返答の値をHTMLとして解釈しない', async () => {
    await start([urlOnly(2)]);
    button('店舗情報を取得(1)').click();
    paste(answer({ shopName: '<img src=x onerror=alert(1)>' }));
    const dialog = document.querySelector('.identity-lookup-dialog')!;
    expect(dialog.querySelector('img')).toBeNull();
    expect(dialog.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('確認中に別の保存があった場合は保存せず、理由を示す', async () => {
    await start([urlOnly(2)]);
    button('店舗情報を取得(1)').click();
    paste(answer());
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([{ ...urlOnly(2), basic: { ...urlOnly(2).basic, area: '新宿' } }]));
    act('apply').click();
    expect(alertText()).toContain('回答が変更されています');
    expect(records()[0]?.basic.shopName).toBe('');
    expect(document.querySelector('.identity-lookup-dialog')).not.toBeNull();
  });

  it('入力中の内容の破棄を断った場合は保存しない', async () => {
    await start([urlOnly(2)]);
    button('入力').click();
    field('bestMoment').value = '入力中';
    field('bestMoment').dispatchEvent(new Event('input', { bubbles: true }));
    button('履歴').click();
    button('店舗情報を取得(1)').click();
    paste(answer());
    confirmMock.mockReturnValue(false);
    act('apply').click();
    expect(records()[0]?.basic.shopName).toBe('');
    expect(document.querySelector('.identity-lookup-dialog')).not.toBeNull();
  });

  it('キャンセルで閉じ、開いたボタンへフォーカスを戻す', async () => {
    await start([urlOnly(2)]);
    const opener = button('店舗情報を取得(1)');
    opener.focus();
    opener.click();
    act('cancel').click();
    expect(document.querySelector('.identity-lookup-dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('取得記録の引き継ぎ', () => {
  const lookup = { sourceUrl: PROFILE, checkedAt: '2026-11-11T03:00:00.000Z', filled: ['shopName'] as const };

  it('同じプロフィールURLのまま編集して保存しても取得記録を保つ', async () => {
    await start([record(2, { therapistProfileUrl: PROFILE, identityLookup: lookup })]);
    button('編集').click();
    field('therapistName').value = '直した名前';
    button('保存').click();
    expect(records()[0]?.basic.therapistName).toBe('直した名前');
    expect(records()[0]?.basic.identityLookup).toEqual(lookup);
  });

  it('プロフィールURLを変えて保存したら取得記録を外す', async () => {
    await start([record(2, { therapistProfileUrl: PROFILE, identityLookup: lookup })]);
    button('編集').click();
    field('therapistProfileUrl').value = 'https://shop.example/cast/13';
    button('保存').click();
    expect(records()[0]?.basic.therapistProfileUrl).toBe('https://shop.example/cast/13');
    expect(records()[0]?.basic.identityLookup).toBeUndefined();
  });
});
