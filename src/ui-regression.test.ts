// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureRecord } from './test-fixtures';
import type { VisitRecord } from './types';

const button = (name: string): HTMLButtonElement => {
  const match = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === name);
  if (!match) throw new Error(`button not found: ${name}`);
  return match;
};

const field = (name: string): HTMLInputElement | HTMLSelectElement => {
  const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(`input[name="${name}"], select[name="${name}"]`);
  if (!control) throw new Error(`field not found: ${name}`);
  return control;
};

async function start(records: unknown[] = []): Promise<void> {
  window.localStorage.setItem('me-report-writer/visits/v1', JSON.stringify(records));
  await import('./main');
}

beforeEach(() => {
  vi.resetModules();
  window.localStorage.clear();
  document.body.innerHTML = '<nav><button data-tab="list">履歴</button><button data-tab="form">入力</button><button data-tab="thumb">サムネ</button></nav><main id="app"></main>';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  window.localStorage.clear();
});

describe('起動からの画面操作', () => {
  it('観察の選択順だけが変わっても未保存確認し、タブ切替で順番を保つ', async () => {
    const source = fixtureRecord({ flow: { ...fixtureRecord().flow, faceDown: { checks: ['指圧', '圧弱め'], note: '' } } });
    await start([source]);
    button('編集').click();
    button('指圧').click();
    button('指圧').click();
    button('履歴').click();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    button('+ 新規入力').click();
    expect(confirm).toHaveBeenCalledOnce();
    button('入力').click();
    expect([...document.querySelectorAll('[data-chips="flow_faceDown"] .selection-order li')]
      .map((item) => item.textContent)).toEqual(['圧弱め', '指圧']);
    button('保存').click();
    const saved = JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1')!) as VisitRecord[];
    expect(saved[0]!.flow.faceDown.checks).toEqual(['圧弱め', '指圧']);
  });

  it('その他のコース時間と料金選択をタブ移動で保持する', async () => {
    await start();
    button('入力').click();
    field('course').value = 'other';
    field('course').dispatchEvent(new Event('change', { bubbles: true }));
    field('courseOther').value = '150分の特別コース';
    field('courseOther').dispatchEvent(new Event('input', { bubbles: true }));
    field('courseFee').value = '30000';
    field('courseFee').dispatchEvent(new Event('change', { bubbles: true }));
    button('履歴').click();
    button('入力').click();
    expect(field('course').value).toBe('other');
    expect(field('courseOther').value).toBe('150分の特別コース');
    expect(field('courseOther').closest('[hidden]')).toBeNull();
    expect(field('courseFee').value).toBe('30000');
  });

  it.each([['course', '120分'], ['courseFee', '30000']])('%sの選択変更を破棄する前に確認する', async (name, value) => {
    await start([fixtureRecord()]);
    button('入力').click();
    field(name).value = value;
    field(name).dispatchEvent(new Event('change', { bubbles: true }));
    button('履歴').click();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    button('編集').click();
    expect(confirm).toHaveBeenCalledOnce();
    button('入力').click();
    expect(field(name).value).toBe(value);
  });

  it('費用の内訳を保存し、再編集で0円も含めて保持する', async () => {
    await start();
    button('入力').click();
    field('prefecture').value = '東京都';
    field('area').value = '動作確認';
    field('course').value = '90分';
    field('optionChosen').value = '追加コース';
    field('courseFee').value = '15000';
    field('optionFee').value = '0';
    field('nominationFee').value = '1000';
    document.querySelector<HTMLTextAreaElement>('textarea[name="bestMoment"]')!.value = '今回の記録';
    button('保存').click();
    const saved = JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1') ?? '[]') as VisitRecord[];
    expect(saved[0]?.basic).toMatchObject({
      course: '90分', optionChosen: '追加コース',
      courseFee: 15000, optionFee: 0, nominationFee: 1000,
    });
    button('編集').click();
    expect(field('courseFee').value).toBe('15000');
    expect(field('optionFee').value).toBe('0');
    expect(field('nominationFee').value).toBe('1000');
  });

  it('旧記録の費用は推測せず空欄で開き、元の自由記述と指名料を残す', async () => {
    const record = fixtureRecord();
    await start([record]);
    button('編集').click();
    expect(field('courseFee').value).toBe('');
    expect(field('optionFee').value).toBe('');
    expect(field('course').value).toBe('other');
    expect(field('courseOther').value).toBe(record.basic.course);
    expect(field('optionChosen').value).toBe(record.basic.optionChosen);
    expect(field('nominationFee').value).toBe(String(record.basic.nominationFee));
    button('保存').click();
    const saved = JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1') ?? '[]') as VisitRecord[];
    expect(saved[0]?.basic).toMatchObject({
      visitDate: record.basic.visitDate,
      course: record.basic.course,
      optionSystem: record.basic.optionSystem,
      optionChosen: record.basic.optionChosen,
      nominationFee: record.basic.nominationFee,
      courseFee: null, optionFee: null,
    });
  });

  it.each([null, 0])('JSONにある費用%sを別項目の編集で失わない', async (amount) => {
    const base = fixtureRecord();
    const record = { ...base, basic: { ...base.basic, courseFee: amount, optionFee: amount, nominationFee: amount } };
    await start([record]);
    button('編集').click();
    const expectedInput = amount === null ? '' : String(amount);
    expect(field('courseFee').value).toBe(expectedInput);
    expect(field('optionFee').value).toBe(expectedInput);
    expect(field('nominationFee').value).toBe(expectedInput);
    field('area').value = '変更したエリア';
    button('保存').click();
    const saved = JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1') ?? '[]') as VisitRecord[];
    expect(saved[0]?.basic).toMatchObject({ courseFee: amount, optionFee: amount, nominationFee: amount });
  });

  it('登録済みの金額を空欄に戻すと未確認として保存する', async () => {
    const base = fixtureRecord();
    await start([{ ...base, basic: { ...base.basic, courseFee: 15000, optionFee: 3000 } }]);
    button('編集').click();
    field('courseFee').value = '';
    field('optionFee').value = '';
    field('nominationFee').value = '';
    button('保存').click();
    const saved = JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1') ?? '[]') as VisitRecord[];
    expect(saved[0]?.basic).toMatchObject({ courseFee: null, optionFee: null, nominationFee: null });
  });

  it('不正な金額を拒否して保存済みデータと入力を残す', async () => {
    await start([fixtureRecord()]);
    const before = window.localStorage.getItem('me-report-writer/visits/v1');
    button('編集').click();
    field('optionFee').value = '-1';
    document.querySelector<HTMLFormElement>('#visit-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe(before);
    expect(field('optionFee').value).toBe('-1');
    expect(document.body.textContent).toMatch(/不正|金額/);
  });

  it.each(['1.0000000000000001', '9007199254740991.1'])('小数%sを丸めて金額として保存しない', async (raw) => {
    await start([fixtureRecord()]);
    const before = window.localStorage.getItem('me-report-writer/visits/v1');
    button('編集').click();
    field('optionFee').value = raw;
    document.querySelector<HTMLFormElement>('#visit-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe(before);
    expect(field('optionFee').value).toBe(raw);
    expect(document.body.textContent).toMatch(/金額/);
  });

  it('再訪入力では前回の支払額を今回の金額として引き継がない', async () => {
    const base = fixtureRecord();
    await start([{ ...base, basic: { ...base.basic, courseFee: 15000, optionFee: 3000 } }]);
    button('再訪入力').click();
    expect(field('courseFee').value).toBe('');
    expect(field('optionFee').value).toBe('');
    expect(field('nominationFee').value).toBe('');
  });

  it('入力画面を開き直しても選択が一度ずつ反映される', async () => {
    await start();
    button('入力').click();
    button('履歴').click();
    button('入力').click();
    button('ギャル').click();
    expect(button('ギャル').classList.contains('on')).toBe(true);
    button('ギャル').click();
    expect(button('ギャル').classList.contains('on')).toBe(false);
  });

  it('未完成の入力とチップをタブ移動で失わない', async () => {
    await start();
    button('入力').click();
    field('area').value = '未保存の入力';
    field('area').dispatchEvent(new Event('input', { bubbles: true }));
    button('ギャル').click();
    button('履歴').click();
    button('入力').click();
    expect(field('area').value).toBe('未保存の入力');
    expect(button('ギャル').classList.contains('on')).toBe(true);
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe('[]');
  });

  it('読込データのIDをHTMLとして解釈しない', async () => {
    await start([fixtureRecord({ id: '"><span id="injected-marker">marker</span><div data-id="' })]);
    expect(document.getElementById('injected-marker')).toBeNull();
    expect(document.querySelector('.card')?.getAttribute('data-id')).toContain('<span');
  });

  it('破損データでも生データの保存とJSON読込の操作を残す', async () => {
    window.localStorage.setItem('me-report-writer/visits/v1', '{broken');
    await expect(import('./main')).resolves.toBeDefined();
    expect(document.getElementById('export')).not.toBeNull();
    expect(document.getElementById('import')).not.toBeNull();
    const download = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:raw-backup');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    button('保存(JSON)').click();
    expect(download).toHaveBeenCalledOnce();
    const rawBlob = download.mock.calls[0]![0] as Blob;
    await expect(rawBlob.text()).resolves.toBe('{broken');
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe('{broken');
  });

  it('保存が失敗しても入力内容と保存済みデータが残る', async () => {
    await start([fixtureRecord()]);
    const before = window.localStorage.getItem('me-report-writer/visits/v1');
    button('入力').click();
    field('prefecture').value = '東京都';
    field('area').value = '保存失敗を確認';
    const best = document.querySelector<HTMLTextAreaElement>('textarea[name="bestMoment"]')!;
    best.value = '動作確認';
    const originalStorage = window.localStorage;
    const failingStorage = new Proxy(originalStorage, {
      get(target, key) {
        if (key === 'setItem') return () => { throw new Error('quota'); };
        const value: unknown = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue(failingStorage);
    button('保存').click();
    expect(field('area').value).toBe('保存失敗を確認');
    expect(best.value).toBe('動作確認');
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe(before);
    expect(document.body.textContent).toContain('保存に失敗');
  });

  it('販売ポイントの0を100に書き換えない', async () => {
    await start();
    button('入力').click();
    field('prefecture').value = '東京都';
    field('area').value = '動作確認';
    field('points').value = '0';
    document.querySelector<HTMLTextAreaElement>('textarea[name="bestMoment"]')!.value = '動作確認';
    button('保存').click();
    const saved = JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1') ?? '[]') as { sales: { points: number } }[];
    expect(saved[0]?.sales.points).toBe(0);
  });

  it('JSON読込を取り消すと保存データも未保存入力も残る', async () => {
    await start([fixtureRecord()]);
    button('入力').click();
    field('area').value = '破棄しない入力';
    field('area').dispatchEvent(new Event('input', { bubbles: true }));
    button('履歴').click();
    const before = window.localStorage.getItem('me-report-writer/visits/v1');
    let chooser: HTMLInputElement | undefined;
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const element = create(tag, options);
      if (tag === 'input') chooser = element as HTMLInputElement;
      return element;
    });
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    button('読込(JSON)').click();
    expect(chooser).toBeDefined();
    Object.defineProperty(chooser!, 'files', { configurable: true, value: [new File(['[]'], 'test.json')] });
    chooser!.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe(before);
    button('入力').click();
    expect(field('area').value).toBe('破棄しない入力');
  });

  it('ファイルの読取失敗を成功扱いせずデータを保持する', async () => {
    await start([fixtureRecord()]);
    const before = window.localStorage.getItem('me-report-writer/visits/v1');
    let chooser: HTMLInputElement | undefined;
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const element = create(tag, options);
      if (tag === 'input') chooser = element as HTMLInputElement;
      return element;
    });
    const file = new File(['[]'], 'test.json');
    vi.spyOn(file, 'text').mockRejectedValue(new Error('ファイル読取失敗'));
    button('読込(JSON)').click();
    Object.defineProperty(chooser!, 'files', { configurable: true, value: [file] });
    chooser!.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(document.body.textContent).toMatch(/失敗|読み込めません/));
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe(before);
    expect(document.body.textContent).not.toContain('インポートしました');
  });

  it('別の記録への切替を取り消すと元の未保存入力を保持する', async () => {
    await start([fixtureRecord()]);
    button('入力').click();
    field('area').value = '切替前の入力';
    field('area').dispatchEvent(new Event('input', { bubbles: true }));
    button('履歴').click();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    button('編集').click();
    expect(confirm).toHaveBeenCalled();
    button('入力').click();
    expect(field('area').value).toBe('切替前の入力');
  });

  it('編集中に履歴から登録した投稿URLを保存で巻き戻さない', async () => {
    await start([fixtureRecord()]);
    button('編集').click();
    field('area').value = '更新したエリア';
    field('area').dispatchEvent(new Event('input', { bubbles: true }));
    button('履歴').click();
    const prompt = vi.fn(() => 'https://wakust.com/reports/latest');
    vi.stubGlobal('prompt', prompt);
    button('投稿URL').click();
    button('入力').click();
    button('保存').click();
    const saved = JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1') ?? '[]') as { postedUrl: string; basic: { area: string } }[];
    expect(saved[0]?.postedUrl).toBe('https://wakust.com/reports/latest');
    expect(saved[0]?.basic.area).toBe('更新したエリア');
  });

  it('編集中の記録を削除した後に古い入力から復活させない', async () => {
    await start([fixtureRecord()]);
    button('編集').click();
    field('area').value = '削除する下書き';
    field('area').dispatchEvent(new Event('input', { bubbles: true }));
    button('履歴').click();
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    button('削除').click();
    button('入力').click();
    expect(field('area').value).toBe('');
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe('[]');
  });

  it('ブラウザが保存領域へのアクセスを拒否しても起動エラーを画面に示す', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('access denied'); });
    await expect(import('./main')).resolves.toBeDefined();
    expect(document.getElementById('export')).not.toBeNull();
    expect(document.getElementById('import')).not.toBeNull();
    expect(document.body.textContent).toMatch(/失敗|読み込めません/);
  });

  it('新規入力の開始を取り消すと下書きを残し、承認したときだけ空にする', async () => {
    await start();
    button('入力').click();
    field('area').value = 'まだ保存していない';
    field('area').dispatchEvent(new Event('input', { bubbles: true }));
    button('履歴').click();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    button('+ 新規入力').click();
    expect(confirm).toHaveBeenCalledOnce();
    button('入力').click();
    expect(field('area').value).toBe('まだ保存していない');
    button('履歴').click();
    confirm.mockReturnValue(true);
    button('+ 新規入力').click();
    expect(field('area').value).toBe('');
  });

  it('通常の履歴から復元でき、取消時は現データを変えない', async () => {
    const backup = fixtureRecord({ id: 'backup-record' });
    window.localStorage.setItem('me-report-writer/visits/v1/backup', JSON.stringify([backup]));
    await start([fixtureRecord({ id: 'current-record' })]);
    const before = window.localStorage.getItem('me-report-writer/visits/v1');
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    button('バックアップ復元').click();
    expect(confirm).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe(before);
    confirm.mockReturnValue(true);
    button('バックアップ復元').click();
    expect(JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1') ?? '[]')).toEqual([backup]);
  });

  it('nullの破損データもJSON読込の置換確認なしで上書きしない', async () => {
    window.localStorage.setItem('me-report-writer/visits/v1', 'null');
    await import('./main');
    let chooser: HTMLInputElement | undefined;
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
      const element = create(tag, options);
      if (tag === 'input') chooser = element as HTMLInputElement;
      return element;
    });
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    button('読込(JSON)').click();
    Object.defineProperty(chooser!, 'files', { configurable: true, value: [new File(['[]'], 'test.json')] });
    chooser!.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe('null');
  });

  it('投稿URLに別サイトを指定したら理由を示し、保存済みURLを保つ', async () => {
    await start([fixtureRecord({ postedUrl: 'https://wakust.com/u/original/' })]);
    const before = window.localStorage.getItem('me-report-writer/visits/v1');
    vi.stubGlobal('prompt', vi.fn(() => 'https://example.com/article'));
    button('投稿URL').click();
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe(before);
    expect(document.body.textContent).toMatch(/wakust.*URL|URL.*wakust/);
  });

  it('再訪の記録から次の再訪を作っても初回記事を参照する', async () => {
    const first = fixtureRecord({ postedUrl: 'https://wakust.com/u/first/' });
    const revisit = fixtureRecord({
      id: 'second-visit', seriesNo: 2, revisitOf: first.id,
      postedUrl: 'https://wakust.com/u/second/', sales: { points: 100, articleType: 'revisit' },
    });
    await start([first, revisit]);
    button('再訪入力').click();
    document.querySelector<HTMLTextAreaElement>('textarea[name="bestMoment"]')!.value = '今回の記録';
    button('保存').click();
    const saved = JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1') ?? '[]') as { seriesNo: number; revisitOf: string }[];
    expect(saved.find((record) => record.seriesNo === 3)?.revisitOf).toBe(first.id);
  });

  it('過去の再訪参照が連鎖していてもプロンプトには初回URLを渡す', async () => {
    const first = fixtureRecord({ postedUrl: 'https://wakust.com/u/first/' });
    const revisit = fixtureRecord({
      id: 'second-visit', seriesNo: 2, revisitOf: first.id,
      postedUrl: 'https://wakust.com/u/second/', sales: { points: 100, articleType: 'revisit' },
    });
    const third = { ...revisit, id: 'third-visit', seriesNo: 3, revisitOf: revisit.id, postedUrl: null };
    await start([first, revisit, third]);
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    button('プロンプト').click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(copy.mock.calls[0]![0]).toContain('https://wakust.com/u/first/');
    expect(copy.mock.calls[0]![0]).not.toContain('https://wakust.com/u/second/');
  });

  it('再訪参照の循環を通知し、新しい記録を作らない', async () => {
    const first = fixtureRecord({ revisitOf: 'cycle', sales: { points: 100, articleType: 'revisit' } });
    const second = { ...first, id: 'cycle', seriesNo: 2, revisitOf: first.id };
    await start([first, second]);
    const before = window.localStorage.getItem('me-report-writer/visits/v1');
    button('再訪入力').click();
    expect(document.querySelector('#visit-form')).toBeNull();
    expect(document.body.textContent).toMatch(/循環|ループ/);
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe(before);
  });
});
