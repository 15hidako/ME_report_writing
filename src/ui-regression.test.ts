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

function setLocation(name: 'prefecture' | 'area', value: string): void {
  const presets = name === 'prefecture'
    ? ['東京都', '神奈川県']
    : ['武蔵小杉', '恵比寿', '中目黒', '新宿', '蒲田'];
  const select = field(name);
  select.value = presets.includes(value) || value === '' ? value : 'other';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  if (select.value === 'other') {
    const other = field(`${name}Other`);
    other.value = value;
    other.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function locationValue(name: 'prefecture' | 'area'): string {
  return field(name).value === 'other' ? field(`${name}Other`).value : field(name).value;
}

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
  it.each([
    ['prefecture', '神奈川県'],
    ['area', '新宿'],
  ] as const)('%sの選択だけでも破棄前に確認し、タブ移動後も保持する', async (name, value) => {
    await start([fixtureRecord()]);
    button('入力').click();
    const select = field(name);
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    button('履歴').click();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    button('編集').click();
    expect(confirm).toHaveBeenCalledOnce();
    button('入力').click();
    expect(field(name).value).toBe(value);
    expect(document.getElementById(`${name}-other-field`)?.hidden).toBe(true);
  });

  it.each(['optionCount', 'speechTopics'])('%sだけの変更もタブ移動で残し、破棄の前に確認する', async (target) => {
    await start([fixtureRecord()]);
    button('入力').click();
    if (target === 'optionCount') {
      field('optionCount').value = '2';
      field('optionCount').dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      button('出迎え・あいさつ').click();
    }
    button('履歴').click();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    button('編集').click();
    expect(confirm).toHaveBeenCalledOnce();
    button('入力').click();
    if (target === 'optionCount') {
      expect(field('optionCount').value).toBe('2');
      expect(document.querySelectorAll('fieldset[data-option-index]:not([hidden])')).toHaveLength(2);
    } else {
      expect(button('出迎え・あいさつ').getAttribute('aria-pressed')).toBe('true');
    }
  });

  it('種類別オプションと会話の話題を保存して再編集できる', async () => {
    await start([fixtureRecord()]);
    button('編集').click();
    field('optionCount').value = '1';
    field('optionCount').dispatchEvent(new Event('change', { bubbles: true }));
    field('optionType_0').value = 'costume';
    field('optionType_0').dispatchEvent(new Event('change', { bubbles: true }));
    field('optionDetail_0').value = '衣装の詳細';
    field('optionPrice_0').value = '0';
    button('出迎え・あいさつ').click();
    button('保存').click();
    const saved = JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1')!) as VisitRecord[];
    expect(saved[0]?.basic.options).toEqual([{ type: 'costume', detail: '衣装の詳細', price: 0 }]);
    expect(saved[0]?.voice.speechTopics).toEqual(['welcome']);
    button('編集').click();
    expect(field('optionCount').value).toBe('1');
    expect(field('optionType_0').value).toBe('costume');
    expect(field('optionDetail_0').value).toBe('衣装の詳細');
    expect(field('optionPrice_0').value).toBe('0');
    expect(button('出迎え・あいさつ').getAttribute('aria-pressed')).toBe('true');
  });

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
    setLocation('prefecture', '東京都');
    setLocation('area', '動作確認');
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
    setLocation('area', '変更したエリア');
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
    setLocation('area', '未保存の入力');
    button('ギャル').click();
    button('履歴').click();
    button('入力').click();
    expect(locationValue('area')).toBe('未保存の入力');
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
    setLocation('prefecture', '東京都');
    setLocation('area', '保存失敗を確認');
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
    expect(locationValue('area')).toBe('保存失敗を確認');
    expect(best.value).toBe('動作確認');
    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe(before);
    expect(document.body.textContent).toContain('保存に失敗');
  });

  it('販売ポイントの0を100に書き換えない', async () => {
    await start();
    button('入力').click();
    setLocation('prefecture', '東京都');
    setLocation('area', '動作確認');
    field('points').value = '0';
    document.querySelector<HTMLTextAreaElement>('textarea[name="bestMoment"]')!.value = '動作確認';
    button('保存').click();
    const saved = JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1') ?? '[]') as { sales: { points: number } }[];
    expect(saved[0]?.sales.points).toBe(0);
  });

  it('JSON読込を取り消すと保存データも未保存入力も残る', async () => {
    await start([fixtureRecord()]);
    button('入力').click();
    setLocation('area', '破棄しない入力');
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
    expect(locationValue('area')).toBe('破棄しない入力');
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
    setLocation('area', '切替前の入力');
    button('履歴').click();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    button('編集').click();
    expect(confirm).toHaveBeenCalled();
    button('入力').click();
    expect(locationValue('area')).toBe('切替前の入力');
  });

  it('編集中に履歴から登録した投稿URLを保存で巻き戻さない', async () => {
    await start([fixtureRecord()]);
    button('編集').click();
    setLocation('area', '更新したエリア');
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
    setLocation('area', '削除する下書き');
    button('履歴').click();
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    button('削除').click();
    button('入力').click();
    expect(locationValue('area')).toBe('');
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
    setLocation('area', 'まだ保存していない');
    button('履歴').click();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    button('+ 新規入力').click();
    expect(confirm).toHaveBeenCalledOnce();
    button('入力').click();
    expect(locationValue('area')).toBe('まだ保存していない');
    button('履歴').click();
    confirm.mockReturnValue(true);
    button('+ 新規入力').click();
    expect(locationValue('area')).toBe('');
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
    vi.stubGlobal('prompt', vi.fn(() => ''));
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    button('プロンプト').click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(copy.mock.calls[0]![0]).toContain('https://wakust.com/u/first/');
    expect(copy.mock.calls[0]![0]).not.toContain('https://wakust.com/u/second/');
  });

  it('生成時に出勤確認日を聞き、取得日を初期値にして記事の指示へ渡す', async () => {
    const base = fixtureRecord();
    const record = fixtureRecord({ basic: { ...base.basic, identityLookup: {
      // 取得日は利用者の現地日付で扱う。実行環境のタイムゾーンに依らないよう現地時刻から作る
      sourceUrl: base.basic.therapistProfileUrl, checkedAt: new Date(2026, 10, 11, 12, 0).toISOString(), filled: ['shopUrl'],
    } } });
    await start([record]);
    const ask = vi.fn((_message?: string, _initial?: string) => '2026-11-12');
    vi.stubGlobal('prompt', ask);
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    button('プロンプト').click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(ask.mock.calls[0]![1]).toBe('2026-11-11');
    expect(copy.mock.calls[0]![0]).toContain('<p>出勤確認: 2026年11月12日に店舗HPの出勤表で確認</p>');
  });

  it('出勤確認日の入力を取り消すと、プロンプトをコピーしない', async () => {
    await start([fixtureRecord()]);
    vi.stubGlobal('prompt', vi.fn(() => null));
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    button('プロンプト').click();
    await Promise.resolve();
    expect(copy).not.toHaveBeenCalled();
  });

  it('不正な出勤確認日は理由を表示し、プロンプトをコピーしない', async () => {
    await start([fixtureRecord()]);
    vi.stubGlobal('prompt', vi.fn(() => '2026/11/11'));
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    button('プロンプト').click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('出勤確認日はYYYY-MM-DD'));
    expect(copy).not.toHaveBeenCalled();
  });

  it('名前公開版のボタンは店名・源氏名を無料部分で出すプロンプトをコピーする', async () => {
    await start([fixtureRecord()]);
    vi.stubGlobal('prompt', vi.fn(() => ''));
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    button('名前公開版').click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(copy.mock.calls[0]![0]).toContain('店名・源氏名は無料部分とタイトルで開示する');
    expect(copy.mock.calls[0]![0]).not.toContain('有料部分でのみ開示');
  });

  describe('プロンプトのコピーとボードの段階', () => {
    const BOARD_KEY = 'me-report-writer/board/v1';
    const boardStages = (): unknown => {
      const raw = window.localStorage.getItem(BOARD_KEY);
      return raw === null ? null : (JSON.parse(raw) as { stages: unknown }).stages;
    };
    const boardWith = (stages: Record<string, string>): string =>
      JSON.stringify({ version: 1, stages, angles: {}, bundles: [], scheduleUrls: {}, checks: [], acknowledged: {} });

    it.each(['プロンプト', '名前公開版'])('「%s」をコピーできたら、回答を「プロンプト出力」へ進める', async (name) => {
      const record = fixtureRecord();
      await start([record]);
      vi.stubGlobal('prompt', vi.fn(() => ''));
      const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      button(name).click();
      await vi.waitFor(() => expect(boardStages()).toEqual({ [record.id]: 'prompted' }));
      expect(copy).toHaveBeenCalledOnce();
    });

    it('すでに先の段階にある回答は変えない', async () => {
      const record = fixtureRecord();
      const before = boardWith({ [record.id]: 'editing' });
      window.localStorage.setItem(BOARD_KEY, before);
      await start([record]);
      vi.stubGlobal('prompt', vi.fn(() => ''));
      const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      button('プロンプト').click();
      await vi.waitFor(() => expect(document.querySelector('.toast')?.textContent).toBe('コピーしました'));
      expect(copy).toHaveBeenCalledOnce();
      expect(window.localStorage.getItem(BOARD_KEY)).toBe(before);
    });

    it('投稿済みの回答では段階を入れない', async () => {
      await start([fixtureRecord({ postedUrl: 'https://wakust.com/u/first/' })]);
      vi.stubGlobal('prompt', vi.fn(() => ''));
      const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      button('プロンプト').click();
      await vi.waitFor(() => expect(document.querySelector('.toast')?.textContent).toBe('コピーしました'));
      expect(copy).toHaveBeenCalledOnce();
      expect(boardStages()).toBeNull();
    });

    it('出勤確認日の入力を取り消したときは段階を入れない', async () => {
      await start([fixtureRecord()]);
      vi.stubGlobal('prompt', vi.fn(() => null));
      vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      button('プロンプト').click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(boardStages()).toBeNull();
    });

    it('コピーに失敗したときは段階を入れない', async () => {
      await start([fixtureRecord()]);
      vi.stubGlobal('prompt', vi.fn(() => ''));
      vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
      button('プロンプト').click();
      await vi.waitFor(() => expect(document.querySelector('.toast')?.textContent).toBe('コピーに失敗しました'));
      expect(boardStages()).toBeNull();
    });

    it('ボードの状態を読めないときも、コピーは成功のまま理由を知らせる', async () => {
      window.localStorage.setItem(BOARD_KEY, '{');
      await start([fixtureRecord()]);
      vi.stubGlobal('prompt', vi.fn(() => ''));
      const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      button('プロンプト').click();
      await vi.waitFor(() => expect(document.querySelectorAll('.toast')).toHaveLength(2));
      const messages = [...document.querySelectorAll('.toast')].map((item) => item.textContent);
      expect(messages[0]).toBe('コピーしました');
      expect(messages[1]).toContain('ボードの読み込みに失敗しました');
      expect(copy).toHaveBeenCalledOnce();
      expect(window.localStorage.getItem(BOARD_KEY)).toBe('{');
    });
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

  it('再訪が参照する初回の削除を画面から試みても両方を残し、再訪用の生成を維持する', async () => {
    const first = fixtureRecord({ postedUrl: 'https://wakust.com/u/first/' });
    const revisit = fixtureRecord({ id: 'second-visit', seriesNo: 2, revisitOf: first.id, sales: { points: 100, articleType: 'revisit' } });
    await start([first, revisit]);
    const before = window.localStorage.getItem('me-report-writer/visits/v1');
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.stubGlobal('prompt', vi.fn(() => ''));
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    document.querySelector<HTMLButtonElement>(`[data-id="${first.id}"] [data-act="del"]`)!.click();

    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe(before);
    expect(document.body.textContent).toMatch(/再訪.*参照.*削除できません/);
    document.querySelector<HTMLButtonElement>(`[data-id="${revisit.id}"] [data-act="prompt"]`)!.click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(copy.mock.calls[0]![0]).toContain('https://wakust.com/u/first/');
    expect(copy.mock.calls[0]![0]).toContain('再訪');
  });

  it.each(['保存', '保存して共有'])('別画面の変更後は%sで古い内容を上書きせず、手元の入力を残す', async (action) => {
    const record = fixtureRecord();
    await start([record]);
    button('編集').click();
    field('shopName').value = '手元の入力';
    field('shopName').dispatchEvent(new Event('input', { bubbles: true }));
    const latest = { ...record, basic: { ...record.basic, shopName: '別画面で保存した内容' } };
    const latestJson = JSON.stringify([latest]);
    window.localStorage.setItem('me-report-writer/visits/v1', latestJson);
    const share = vi.fn();
    vi.stubGlobal('navigator', { share, canShare: vi.fn(() => true) });

    button(action).click();

    expect(window.localStorage.getItem('me-report-writer/visits/v1')).toBe(latestJson);
    expect(field('shopName').value).toBe('手元の入力');
    expect(document.body.textContent).toMatch(/別の画面.*変更/);
    expect(share).not.toHaveBeenCalled();
  });

  it('別画面でキーの並びと更新日時だけが変わっても編集を保存できる', async () => {
    const record = fixtureRecord();
    await start([record]);
    button('編集').click();
    field('shopName').value = '今回の修正';
    const latest = { ...record, basic: Object.fromEntries(Object.entries(record.basic).reverse()), updatedAt: '2026-07-02T10:00:00.000Z' };
    window.localStorage.setItem('me-report-writer/visits/v1', JSON.stringify([latest]));

    button('保存').click();

    const saved = JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1')!) as VisitRecord[];
    expect(saved[0]?.basic.shopName).toBe('今回の修正');
  });

  it('競合後の開き直しは未保存入力の破棄を確認し、承認後に最新内容を編集できる', async () => {
    const record = fixtureRecord();
    await start([record]);
    button('編集').click();
    field('shopName').value = '手元の入力';
    field('shopName').dispatchEvent(new Event('input', { bubbles: true }));
    const latest = { ...record, basic: { ...record.basic, shopName: '別画面の修正' } };
    window.localStorage.setItem('me-report-writer/visits/v1', JSON.stringify([latest]));
    button('保存').click();
    button('履歴').click();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);

    button('編集').click();
    expect(confirm).toHaveBeenCalledOnce();
    button('入力').click();
    expect(field('shopName').value).toBe('手元の入力');
    button('履歴').click();
    confirm.mockReturnValue(true);
    button('編集').click();
    expect(field('shopName').value).toBe('別画面の修正');
    field('therapistName').value = '開き直した後の追記';
    button('保存').click();

    const saved = JSON.parse(window.localStorage.getItem('me-report-writer/visits/v1')!) as VisitRecord[];
    expect(saved[0]?.basic).toMatchObject({ shopName: '別画面の修正', therapistName: '開き直した後の追記' });
    expect(document.querySelector('#visit-form')).toBeNull();
  });
});

describe('記事ボードとの行き来', () => {
  afterEach(() => {
    history.replaceState(null, '', '/');
  });

  it('URLで指定した回答の編集画面を開き、引数を消す', async () => {
    const record = fixtureRecord();
    history.replaceState(null, '', `/?edit=${encodeURIComponent(record.id)}&x=1`);
    await start([record]);
    expect(document.querySelector('.form-mode')?.textContent).toContain(`編集中: #${record.seriesNo}`);
    expect(location.search).toBe('?x=1');
    expect(window.name).toBe('me-input');
  });

  it('見つからない回答を指定されたら履歴を出して知らせる', async () => {
    history.replaceState(null, '', '/?edit=missing');
    await start([fixtureRecord()]);
    expect(document.querySelector('#visit-form')).toBeNull();
    expect(document.querySelector('.toast')?.textContent).toContain('見つかりません');
    expect(location.search).toBe('');
  });

  it('保存内容が壊れているときは「見つからない」と誤って知らせず、復旧表示に任せる', async () => {
    history.replaceState(null, '', '/?edit=any');
    window.localStorage.setItem('me-report-writer/visits/v1', '{');
    await import('./main');
    expect(document.querySelector('.toast')).toBeNull();
    expect(document.querySelector('#import')).not.toBeNull();
  });

  it('履歴の各回答と編集画面から、ボードの該当カードへ移れる', async () => {
    const record = fixtureRecord();
    await start([record]);
    const fromList = document.querySelector<HTMLAnchorElement>(`.card[data-id="${record.id}"] a.to-board`);
    expect(fromList?.getAttribute('href')).toBe(`./board.html?card=${encodeURIComponent(record.id)}`);
    expect(fromList?.target).toBe('me-board');
    button('編集').click();
    expect(document.querySelector<HTMLAnchorElement>('#visit-form a.to-board')?.getAttribute('href'))
      .toBe(`./board.html?card=${encodeURIComponent(record.id)}`);
  });

  it('新規入力にはボードへの移動を出さない', async () => {
    await start();
    button('入力').click();
    expect(document.querySelector('#visit-form a.to-board')).toBeNull();
  });

  it('未保存の入力があるときだけ、ページを離れる前に止める', async () => {
    // 前のテストで読み込んだ画面のリスナーも window に残るため、今回登録されたものだけを呼ぶ
    const add = vi.spyOn(window, 'addEventListener');
    await start([fixtureRecord()]);
    const handler = add.mock.calls.find(([type]) => type === 'beforeunload')?.[1] as ((event: Event) => void) | undefined;
    if (handler === undefined) throw new Error('beforeunload のリスナーが登録されていません');
    const leave = (): boolean => {
      const event = new Event('beforeunload', { cancelable: true });
      handler(event);
      return event.defaultPrevented;
    };
    button('編集').click();
    expect(leave()).toBe(false);
    setLocation('area', '未保存');
    expect(leave()).toBe(true);
  });
});
