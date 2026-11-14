// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import boardPage from '../../board.html?raw';
import { fixtureRecord } from '../test-fixtures';
import type { VisitRecord } from '../types';
import type { BoardState } from './state';
import type { ArticleDraft } from './articles';

const VISITS_KEY = 'me-report-writer/visits/v1';
const BOARD_KEY = 'me-report-writer/board/v1';
const WAKUST_URL = 'https://wakust.com/reports/1001';

const local = vi.hoisted(() => ({
  localDataAvailable: vi.fn(),
  fetchAnswerFiles: vi.fn(),
  fetchDrafts: vi.fn(),
  fetchArticlePart: vi.fn(),
  putArticlePart: vi.fn(),
  fetchCheckFile: vi.fn(),
  putCheckFile: vi.fn(),
  runWeeklyCheck: vi.fn(),
}));
vi.mock('./local-api', () => local);

/** board.html の <body> の中身。ページ側の変更がそのままテストに入る */
function pageBody(): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(boardPage)?.[1];
  if (body === undefined) throw new Error('board.html の <body> が読めません');
  return body.replace(/<script[\s\S]*?<\/script>/g, '');
}

function emptyBoard(overrides: Partial<BoardState> = {}): BoardState {
  return { version: 1, stages: {}, angles: {}, bundles: [], scheduleUrls: {}, checks: [], acknowledged: {}, ...overrides };
}

async function start(records: readonly VisitRecord[] = [], state?: BoardState): Promise<void> {
  window.localStorage.setItem(VISITS_KEY, JSON.stringify(records));
  if (state !== undefined) window.localStorage.setItem(BOARD_KEY, JSON.stringify(state));
  await import('./main');
}

const savedBoard = (): BoardState => JSON.parse(window.localStorage.getItem(BOARD_KEY)!) as BoardState;
const savedVisits = (): VisitRecord[] => JSON.parse(window.localStorage.getItem(VISITS_KEY)!) as VisitRecord[];

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`#${id} not found`);
  return node as T;
}

function card(id: string): HTMLElement {
  const node = [...document.querySelectorAll<HTMLElement>('.board-card')].find((item) => item.dataset['id'] === id);
  if (node === undefined) throw new Error(`card not found: ${id}`);
  return node;
}

const cardIds = (): string[] => [...document.querySelectorAll<HTMLElement>('.board-card')].map((item) => item.dataset['id']!);
const stageOf = (id: string): string | undefined => card(id).closest<HTMLElement>('.column')?.dataset['stage'];
const stageSelect = (id: string): HTMLSelectElement => card(id).querySelector<HTMLSelectElement>('select[data-act="stage"]')!;
/** 描き直したあとの選択肢。happy-dom の select.value は innerHTML で入れた selected と食い違うことがあるので、属性で見る */
const shownStage = (id: string): string | undefined => stageSelect(id).querySelector<HTMLOptionElement>('option[selected]')?.value;
const toasts =(): string[] => [...document.querySelectorAll('.toast')].map((item) => item.textContent ?? '');

function cardButton(id: string, name: string): HTMLButtonElement {
  const match = [...card(id).querySelectorAll('button')].find((item) => item.textContent?.trim() === name);
  if (match === undefined) throw new Error(`button not found: ${name}`);
  return match;
}

/** 開いている入力ダイアログに値を入れて「決定」を押す。null なら「キャンセル」を押す */
function answerInput(value: string | null): HTMLDialogElement {
  const dialog = document.querySelector<HTMLDialogElement>('dialog.input-dialog');
  if (dialog === null) throw new Error('input dialog not open');
  const press = (name: string): void => {
    const match = [...dialog.querySelectorAll('button')].find((item) => item.textContent?.trim() === name);
    if (match === undefined) throw new Error(`dialog button not found: ${name}`);
    match.click();
  };
  if (value === null) {
    press('キャンセル');
    return dialog;
  }
  dialog.querySelector('input')!.value = value;
  press('決定');
  return dialog;
}

/** ダイアログに出た誤りの文 */
const dialogError = (): string => document.querySelector('dialog.input-dialog [role="alert"]')?.textContent ?? '';

/** 失敗の表示は操作のあとの非同期処理で出るので、1拍待つ */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function moveTo(id: string, stage: string): Promise<void> {
  const select = stageSelect(id);
  select.value = stage;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
}

function fillBundleDialog(kind: string, title: string): HTMLFormElement {
  const form = byId<HTMLFormElement>('bundle-form');
  form.querySelector<HTMLSelectElement>('select[name="kind"]')!.value = kind;
  form.querySelector<HTMLInputElement>('input[name="title"]')!.value = title;
  return form;
}

async function submit(form: HTMLFormElement): Promise<void> {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await settle();
}

/** main.ts が window に付けたリスナ。モジュールを読み直しても残るので、テストごとに外す */
let windowListeners: [string, EventListenerOrEventListenerObject][] = [];

beforeEach(() => {
  vi.resetModules();
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (listener !== null) windowListeners.push([type, listener]);
    add(type, listener, options);
  });
  window.localStorage.clear();
  history.replaceState(null, '', '/board.html');
  document.body.innerHTML = pageBody();
  local.localDataAvailable.mockResolvedValue(true);
  local.fetchAnswerFiles.mockResolvedValue([]);
  local.fetchDrafts.mockResolvedValue(new Map());
  // このPCの .env.local に左右されないよう、保存先は未設定から始める
  vi.stubEnv('VITE_ARTICLE_DIR', '');
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [type, listener] of windowListeners) window.removeEventListener(type, listener);
  windowListeners = [];
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  document.body.innerHTML = '';
  window.localStorage.clear();
  history.replaceState(null, '', '/');
});

describe('回答カードの段階', () => {
  it('選択肢で「推敲中」に変えると保存され、カードがその列へ移る', async () => {
    const record = fixtureRecord();
    await start([record]);
    expect(stageOf(record.id)).toBe('answered');
    await moveTo(record.id, 'editing');
    expect(savedBoard().stages).toEqual({ [record.id]: 'editing' });
    expect(stageOf(record.id)).toBe('editing');
    expect(shownStage(record.id)).toBe('editing');
  });

  it('「投稿済み」にすると投稿URLを尋ね、wakustのURLなら回答に保存する', async () => {
    const record = fixtureRecord();
    await start([record], emptyBoard({ stages: { [record.id]: 'editing' } }));
    await moveTo(record.id, 'posted');
    const dialog = answerInput(` ${WAKUST_URL} `);
    expect(dialog.open).toBe(false);
    expect(savedVisits()[0]?.postedUrl).toBe(WAKUST_URL);
    expect(savedBoard().stages).toEqual({});
    expect(stageOf(record.id)).toBe('posted');
  });

  it('wakust以外のURLでは保存せず、選択肢を元の段階へ戻して理由をダイアログに出す', async () => {
    const record = fixtureRecord();
    await start([record], emptyBoard({ stages: { [record.id]: 'editing' } }));
    await moveTo(record.id, 'posted');
    const dialog = answerInput('https://example.com/article');
    expect(savedVisits()[0]?.postedUrl).toBeNull();
    expect(savedBoard().stages).toEqual({ [record.id]: 'editing' });
    expect(stageOf(record.id)).toBe('editing');
    expect(shownStage(record.id)).toBe('editing');
    expect(dialog.open).toBe(true);
    expect(dialogError()).toBe('wakust記事URLが必要です');
  });

  it('投稿URLの入力を取り消すと何も変えない', async () => {
    const record = fixtureRecord();
    await start([record]);
    await moveTo(record.id, 'posted');
    answerInput(null);
    expect(savedVisits()[0]?.postedUrl).toBeNull();
    expect(shownStage(record.id)).toBe('answered');
    expect(toasts()).toEqual([]);
  });

  it('投稿済みの回答カードを別の段階へ動かすと、確認のうえ投稿URLを外して戻す', async () => {
    const record = fixtureRecord({ postedUrl: WAKUST_URL });
    await start([record]);
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    await moveTo(record.id, 'editing');
    expect(confirm).toHaveBeenCalledExactlyOnceWith('投稿URLを外して戻しますか?');
    expect(savedVisits()[0]?.postedUrl).toBeNull();
    expect(savedVisits()[0]?.updatedAt).not.toBe(record.updatedAt);
    expect(savedBoard().stages).toEqual({ [record.id]: 'editing' });
    expect(stageOf(record.id)).toBe('editing');
    expect(shownStage(record.id)).toBe('editing');
    expect(toasts()).toEqual([]);
  });

  it('投稿済みの回答カードを「回答済み」へ戻すと、段階を保存せずに投稿URLだけ外す', async () => {
    const record = fixtureRecord({ postedUrl: WAKUST_URL });
    await start([record]);
    vi.stubGlobal('confirm', vi.fn(() => true));
    await moveTo(record.id, 'answered');
    expect(savedVisits()[0]?.postedUrl).toBeNull();
    expect(savedBoard().stages).toEqual({});
    expect(stageOf(record.id)).toBe('answered');
  });

  it('投稿URLを外す確認を断ると、何も変えない', async () => {
    const record = fixtureRecord({ postedUrl: WAKUST_URL });
    await start([record]);
    const before = window.localStorage.getItem(VISITS_KEY);
    vi.stubGlobal('confirm', vi.fn(() => false));
    await moveTo(record.id, 'editing');
    expect(window.localStorage.getItem(VISITS_KEY)).toBe(before);
    expect(window.localStorage.getItem(BOARD_KEY)).toBeNull();
    expect(stageOf(record.id)).toBe('posted');
    expect(shownStage(record.id)).toBe('posted');
    expect(toasts()).toEqual([]);
  });

  it('投稿URLを空欄で決定すると、保存せずに理由を知らせる', async () => {
    const record = fixtureRecord();
    await start([record]);
    await moveTo(record.id, 'posted');
    answerInput('  ');
    expect(savedVisits()[0]?.postedUrl).toBeNull();
    expect(shownStage(record.id)).toBe('answered');
    expect(dialogError()).toBe('wakust記事URLが必要です');
  });
});

describe('まとめ・カタログの記事', () => {
  it('「+ 記事」でまとめを追加できる', async () => {
    const record = fixtureRecord({ postedUrl: WAKUST_URL });
    await start([record]);
    const dialog = byId<HTMLDialogElement>('bundle-dialog');
    byId('add-bundle').click();
    expect(dialog.open).toBe(true);
    const form = fillBundleDialog('matome', ' 恵比寿まとめ ');
    form.querySelector<HTMLInputElement>('input[name="recordIds"]')!.checked = true;
    await submit(form);
    expect(dialog.open).toBe(false);
    expect(savedBoard().bundles).toMatchObject([
      { kind: 'matome', title: '恵比寿まとめ', recordIds: [record.id], stage: 'answered', postedUrl: null },
    ]);
    const added = card(savedBoard().bundles[0]!.id);
    expect(added.dataset['kind']).toBe('matome');
    expect(added.querySelector('h3')?.textContent).toBe('恵比寿まとめ');
    expect(added.querySelector('.board-card-detail')?.textContent).toBe(`#${record.seriesNo}`);
  });

  it('種類が「まとめ」のときは未投稿の回答を選べず、「カタログ」に変えると選べる', async () => {
    const posted = fixtureRecord({ postedUrl: WAKUST_URL });
    const draft = fixtureRecord({ id: 'draft', seriesNo: 2 });
    await start([posted, draft]);
    byId('add-bundle').click();
    const box = (id: string): HTMLInputElement =>
      byId('bundle-form').querySelector<HTMLInputElement>(`input[name="recordIds"][value="${id}"]`)!;
    expect(box(posted.id).disabled).toBe(false);
    expect(box(draft.id).disabled).toBe(true);
    const kind = byId('bundle-form').querySelector<HTMLSelectElement>('select[name="kind"]')!;
    kind.value = 'catalog';
    kind.dispatchEvent(new Event('change', { bubbles: true }));
    expect(box(draft.id).disabled).toBe(false);
    box(draft.id).checked = true;
    kind.value = 'matome';
    kind.dispatchEvent(new Event('change', { bubbles: true }));
    expect(box(draft.id).disabled).toBe(true);
    expect(box(draft.id).checked).toBe(false);
  });

  it('タイトルが空なら追加せず、ダイアログを残す', async () => {
    await start([fixtureRecord()]);
    const dialog = byId<HTMLDialogElement>('bundle-dialog');
    byId('add-bundle').click();
    await submit(fillBundleDialog('matome', '   '));
    expect(dialog.open).toBe(true);
    expect(window.localStorage.getItem(BOARD_KEY)).toBeNull();
    expect(toasts()).toEqual(['種類とタイトルを入力してください']);
  });

  it('「やめる」でダイアログを閉じ、何も追加しない', async () => {
    await start([fixtureRecord()]);
    const dialog = byId<HTMLDialogElement>('bundle-dialog');
    byId('add-bundle').click();
    fillBundleDialog('catalog', '東京カタログ');
    dialog.querySelector<HTMLButtonElement>('[data-act="cancel"]')!.click();
    expect(dialog.open).toBe(false);
    expect(window.localStorage.getItem(BOARD_KEY)).toBeNull();
  });

  it('「削除」は確認のあとで消し、断ると残す', async () => {
    const bundle = {
      id: 'bundle-1', kind: 'matome', title: '恵比寿まとめ', recordIds: [], stage: 'answered', postedUrl: null,
      createdAt: '2026-07-02T10:00:00.000Z',
    } as const;
    await start([], emptyBoard({ bundles: [bundle] }));
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    cardButton(bundle.id, '削除').click();
    expect(confirm).toHaveBeenCalledWith('「恵比寿まとめ」をボードから削除しますか?');
    expect(cardIds()).toEqual([bundle.id]);
    confirm.mockReturnValue(true);
    cardButton(bundle.id, '削除').click();
    expect(savedBoard().bundles).toEqual([]);
    expect(cardIds()).toEqual([]);
  });
});

describe('まとめ記事のプロンプト', () => {
  /** まとめの解禁に要る、別々のセラピストの投稿済み単体記事 */
  const publishedSix = (): VisitRecord[] => [1, 2, 3, 4, 5, 6].map((no) => {
    const base = fixtureRecord();
    return fixtureRecord({
      id: `posted-${no}`,
      seriesNo: no,
      postedUrl: `https://wakust.com/reports/${no}`,
      basic: { ...base.basic, therapistName: `セラピスト${no}` },
    });
  });
  const matome = (recordIds: readonly string[], stage: 'answered' | 'editing' = 'answered') => ({
    id: 'matome-1', kind: 'matome', title: '寛容度★4以上だった3人', recordIds, stage, postedUrl: null,
    createdAt: '2026-07-02T10:00:00.000Z',
  } as const);

  it('対象の回答とタイトルでプロンプトを作ってコピーし、「プロンプト出力」へ進める', async () => {
    const records = publishedSix();
    await start(records, emptyBoard({ bundles: [matome(['posted-1', 'posted-3'])] }));
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    cardButton('matome-1', 'プロンプト').click();
    await vi.waitFor(() => expect(savedBoard().bundles[0]?.stage).toBe('prompted'));
    const text = copy.mock.calls[0]![0];
    expect(text).toContain('テーマ「寛容度★4以上だった3人」のまとめ記事');
    expect(text).toContain('### 対象訪問データ(2件)');
    expect(text).toContain('https://wakust.com/reports/1');
    expect(text).toContain('https://wakust.com/reports/3');
    expect(text).not.toContain('https://wakust.com/reports/2');
    expect(stageOf('matome-1')).toBe('prompted');
  });

  it('先の段階にある記事は、コピーしても段階を変えない', async () => {
    await start(publishedSix(), emptyBoard({ bundles: [matome(['posted-1'], 'editing')] }));
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    cardButton('matome-1', 'プロンプト').click();
    await vi.waitFor(() => expect(toasts()).toEqual(['コピーしました']));
    expect(savedBoard().bundles[0]?.stage).toBe('editing');
  });

  it('解禁人数に届かないときは理由を知らせ、コピーも段階の変更もしない', async () => {
    const records = publishedSix().slice(0, 5);
    const before = JSON.stringify(emptyBoard({ bundles: [matome(['posted-1'])] }));
    await start(records, JSON.parse(before) as BoardState);
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    cardButton('matome-1', 'プロンプト').click();
    await vi.waitFor(() => expect(toasts()).toEqual(['まとめ記事は異なる6人の個別体験談を投稿した後に生成できます']));
    expect(copy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(BOARD_KEY)).toBe(before);
  });

  it('対象の回答が消えていれば理由を知らせ、段階を変えない', async () => {
    await start(publishedSix(), emptyBoard({ bundles: [matome(['posted-1', 'gone'])] }));
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    cardButton('matome-1', 'プロンプト').click();
    await vi.waitFor(() => expect(toasts()).toEqual(['対象の回答が見つかりません。削除されたか、別の端末の回答です']));
    expect(copy).not.toHaveBeenCalled();
    expect(savedBoard().bundles[0]?.stage).toBe('answered');
  });

  it('コピーに失敗したときは段階を変えない', async () => {
    await start(publishedSix(), emptyBoard({ bundles: [matome(['posted-1'])] }));
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    cardButton('matome-1', 'プロンプト').click();
    await vi.waitFor(() => expect(toasts()).toEqual(['コピーに失敗しました']));
    expect(savedBoard().bundles[0]?.stage).toBe('answered');
  });

  it('カタログのカードには「プロンプト」を出さない', async () => {
    const catalog = { ...matome([]), id: 'catalog-1', kind: 'catalog', title: '東京カタログ' } as const;
    await start([], emptyBoard({ bundles: [catalog] }));
    expect(() => cardButton('catalog-1', 'プロンプト')).toThrow('button not found');
    expect(cardButton('catalog-1', '削除')).toBeDefined();
  });
});

describe('販売型', () => {
  it('ボタンを押すと保存され、同じボタンをもう一度押すと消える', async () => {
    const record = fixtureRecord();
    await start([record]);
    cardButton(record.id, 'セラピスト起点').click();
    expect(savedBoard().angles).toEqual({ [record.id]: 'therapist' });
    expect(cardButton(record.id, 'セラピスト起点').getAttribute('aria-pressed')).toBe('true');
    expect(cardButton(record.id, '体験内容起点').getAttribute('aria-pressed')).toBe('false');
    cardButton(record.id, '体験内容起点').click();
    expect(savedBoard().angles).toEqual({ [record.id]: 'experience' });
    cardButton(record.id, '体験内容起点').click();
    expect(savedBoard().angles).toEqual({});
    expect(cardButton(record.id, '体験内容起点').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('出勤表URL', () => {
  it('入力ダイアログで店ごとに登録し、空欄で解除する', async () => {
    const record = fixtureRecord({ postedUrl: WAKUST_URL });
    await start([record]);
    cardButton(record.id, '出勤表URL').click();
    answerInput(' https://example.com/schedule ');
    expect(Object.values(savedBoard().scheduleUrls)).toEqual(['https://example.com/schedule']);
    cardButton(record.id, '出勤表URL✓').click();
    expect(document.querySelector<HTMLInputElement>('dialog.input-dialog input')!.value).toBe('https://example.com/schedule');
    answerInput('');
    expect(savedBoard().scheduleUrls).toEqual({});
  });

  it('http(s) でないURLは保存せず、ダイアログに理由を出す', async () => {
    const record = fixtureRecord({ postedUrl: WAKUST_URL });
    await start([record]);
    cardButton(record.id, '出勤表URL').click();
    const dialog = answerInput('javascript:alert(1)');
    expect(dialog.open).toBe(true);
    expect(dialogError()).toBe('出勤表のURLは http(s) で入力してください');
    expect(window.localStorage.getItem(BOARD_KEY)).toBeNull();
  });
});

describe('ツールバーの折りたたみ', () => {
  it('データの操作は閉じた中にあり、選ぶか外を押すと閉じる', async () => {
    await start([fixtureRecord()]);
    const menu = byId<HTMLDetailsElement>('tool-menu');
    expect(menu.open).toBe(false);
    expect(menu.contains(byId('export-board'))).toBe(true);
    menu.open = true;
    byId('board').click();
    expect(menu.open).toBe(false);
    menu.open = true;
    byId('import-board').click();
    expect(menu.open).toBe(false);
  });
});

describe('記事タイプの絞り込み', () => {
  const filterButton = (kind: string): HTMLButtonElement =>
    byId('kind-filter').querySelector<HTMLButtonElement>(`[data-filter="${kind}"]`)!;

  it('押すと ?kind= が変わり、該当しないカードを出さない', async () => {
    const single = fixtureRecord();
    const revisit = fixtureRecord({
      id: 'test-id-2', seriesNo: 2, revisitOf: single.id, sales: { points: 100, articleType: 'revisit' },
    });
    await start([single, revisit]);
    expect(cardIds()).toEqual([revisit.id, single.id]);
    filterButton('revisit').click();
    expect(location.search).toBe('?kind=revisit');
    expect(cardIds()).toEqual([revisit.id]);
    expect(filterButton('revisit').getAttribute('aria-pressed')).toBe('true');
    filterButton('matome').click();
    expect(location.search).toBe('?kind=matome');
    expect(cardIds()).toEqual([]);
    filterButton('all').click();
    expect(location.search).toBe('');
    expect(cardIds()).toEqual([revisit.id, single.id]);
  });

  it('?kind= を付けて開くと、その絞り込みで表示する', async () => {
    const single = fixtureRecord();
    const revisit = fixtureRecord({
      id: 'test-id-2', seriesNo: 2, revisitOf: single.id, sales: { points: 100, articleType: 'revisit' },
    });
    history.replaceState(null, '', '/board.html?kind=single');
    await start([single, revisit]);
    expect(cardIds()).toEqual([single.id]);
    expect(filterButton('single').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('入力画面からの ?card=', () => {
  it('URLから card と kind を外し、該当カードに目印を付ける', async () => {
    const record = fixtureRecord();
    history.replaceState(null, '', `/board.html?kind=matome&card=${encodeURIComponent(record.id)}&x=1`);
    await start([record]);
    expect(location.search).toBe('?x=1');
    expect(card(record.id).classList.contains('revealed')).toBe(true);
    expect(toasts()).toEqual([]);
    expect(window.name).toBe('me-board');
  });

  it('存在しないIDではトーストで知らせる', async () => {
    history.replaceState(null, '', '/board.html?card=missing');
    await start([fixtureRecord()]);
    expect(location.search).toBe('');
    expect(document.querySelector('.revealed')).toBeNull();
    expect(toasts()).toEqual(['指定された回答のカードが見つかりません']);
  });
});

describe('data/ の原稿', () => {
  const draftFor = (record: VisitRecord): Map<string, ArticleDraft> => new Map([[record.id, {
    recordId: record.id,
    folderName: `0001-${record.id}`,
    variants: [{
      disclosure: 'paid', parts: ['title', 'freeText', 'freeHtml'], updatedAt: Date.UTC(2026, 10, 12),
      times: { title: 1, freeText: 1, freeHtml: 2 },
    }],
  }]]);
  const draftNames = (id: string): string[] =>
    [...card(id).querySelectorAll('.draft-name')].map((item) => item.textContent ?? '');

  it('開いたときに原稿を読み、カードに出して「推敲中」へ進める', async () => {
    const record = fixtureRecord();
    local.fetchDrafts.mockResolvedValue(draftFor(record));
    await start([record]);
    await vi.waitFor(() => expect(draftNames(record.id)).toEqual(['体験内容起点']));
    expect(card(record.id).querySelectorAll('[data-act="copy-part"]')).toHaveLength(2);
    expect(stageOf(record.id)).toBe('editing');
    expect(savedBoard().stages).toEqual({ [record.id]: 'editing' });
  });

  it('原稿ができても、販売型のプロンプトのボタンを控えめにして残す', async () => {
    const record = fixtureRecord();
    local.fetchDrafts.mockResolvedValue(draftFor(record));
    await start([record], emptyBoard({ angles: { [record.id]: 'experience' } }));
    await vi.waitFor(() => expect(draftNames(record.id)).toEqual(['体験内容起点']));
    const prompts = [...card(record.id).querySelectorAll<HTMLButtonElement>('.prompt-actions button')];
    expect(prompts.map((item) => item.textContent?.trim())).toEqual(['プロンプト']);
    expect(prompts[0]!.classList.contains('primary')).toBe(false);
  });

  it('ボードへ戻ったときに読み直し、新しく書き出された原稿を出す', async () => {
    const record = fixtureRecord();
    await start([record]);
    await vi.waitFor(() => expect(local.fetchDrafts).toHaveBeenCalledTimes(1));
    expect(card(record.id).querySelector('.draft')).toBeNull();
    local.fetchDrafts.mockResolvedValue(draftFor(record));
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(draftNames(record.id)).toEqual(['体験内容起点']));
  });

  it('部分のボタンでその原稿ファイルの中身をコピーする', async () => {
    const record = fixtureRecord();
    local.fetchDrafts.mockResolvedValue(draftFor(record));
    local.fetchArticlePart.mockResolvedValue({ text: '<p>本文</p>', modifiedAt: 2 });
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await start([record]);
    await vi.waitFor(() => expect(draftNames(record.id)).toEqual(['体験内容起点']));
    cardButton(record.id, '無料').click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith('<p>本文</p>'));
    expect(local.fetchArticlePart).toHaveBeenCalledWith(expect.objectContaining({ recordId: record.id }), 'paid', 'freeHtml');
    expect(toasts()).toEqual(['無料部分のHTMLをコピーしました']);
  });

  it('data/ に届かないときは理由をボードに出す', async () => {
    local.localDataAvailable.mockResolvedValue(false);
    await start([fixtureRecord()]);
    await vi.waitFor(() => expect(document.querySelector('.inbox-error')?.textContent).toContain('start.bat'));
    expect(local.fetchDrafts).not.toHaveBeenCalled();
  });
});

describe('原稿を読む・直す', () => {
  const SOURCE_TIMES = { title: 10, tags: 10, freeText: 10, paidText: 10 };
  const FILES: Record<string, string> = {
    title: '【蒲田】タイトル',
    tags: '蒲田,黒髪',
    freeText: '導入の一文。\n二行目。\n\n### 今回のセラピスト\n\n- エリア: 蒲田\n- 系統: <b>ナチュラル</b>',
    paidText: '### 総評\n\nまた行きたい。',
  };
  const draftWith = (record: VisitRecord, times: Record<string, number> = SOURCE_TIMES): Map<string, ArticleDraft> =>
    new Map([[record.id, {
      recordId: record.id,
      folderName: `0001-${record.id}`,
      variants: [{ disclosure: 'paid', parts: Object.keys(times) as never, updatedAt: 10, times }],
    }]]);
  const editor = (): HTMLDialogElement => byId<HTMLDialogElement>('article-dialog');
  const editorButton = (name: string): HTMLButtonElement => {
    const match = [...editor().querySelectorAll('button')].find((item) => item.textContent?.trim() === name);
    if (match === undefined) throw new Error(`editor button not found: ${name}`);
    return match;
  };
  const type = (name: string, value: string): void => {
    const field = editor().querySelector<HTMLTextAreaElement | HTMLInputElement>(`[name="${name}"]`)!;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };

  async function openEditor(record: VisitRecord, times?: Record<string, number>): Promise<void> {
    local.fetchDrafts.mockResolvedValue(draftWith(record, times));
    local.fetchArticlePart.mockImplementation(async (_draft: unknown, _disclosure: unknown, part: string) =>
      ({ text: FILES[part] ?? '', modifiedAt: 10 }));
    await start([record]);
    await vi.waitFor(() => expect(card(record.id).querySelector('[data-act="read"]')).not.toBeNull());
    cardButton(record.id, '読む').click();
    await vi.waitFor(() => expect(editor().open).toBe(true));
  }

  it('素の文章を読み込み、見出し・箇条・段落に組んで見せる。文字はそのまま出す', async () => {
    const record = fixtureRecord();
    await openEditor(record);
    const body = editor().querySelector('.article-body')!;
    expect(body.querySelector('.article-title')?.textContent).toBe('【蒲田】タイトル');
    expect([...body.querySelectorAll('.article-tags li')].map((item) => item.textContent)).toEqual(['蒲田', '黒髪']);
    expect(body.querySelector('h3')?.textContent).toBe('今回のセラピスト');
    expect(body.querySelector('p')?.innerHTML).toBe('導入の一文。<br>二行目。');
    expect([...body.querySelectorAll('li')].map((item) => item.textContent)).toContain('系統: <b>ナチュラル</b>');
    expect(body.querySelector('b')).toBeNull();
    expect(local.fetchArticlePart.mock.calls.map((call) => call[2])).toEqual(['title', 'tags', 'freeText', 'paidText']);
  });

  it('直して保存すると、変えた部分だけを読んだときの更新時刻を添えて書き戻す', async () => {
    const record = fixtureRecord();
    local.putArticlePart.mockResolvedValue(20);
    await openEditor(record);
    editorButton('直す').click();
    type('paidText', '### 総評\n\nまた必ず行きたい。');
    expect(editorButton('保存').disabled).toBe(false);
    editorButton('保存').click();
    await vi.waitFor(() => expect(local.putArticlePart).toHaveBeenCalledOnce());
    expect(local.putArticlePart).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: record.id }), 'paid', 'paidText', '### 総評\n\nまた必ず行きたい。', 10);
    await vi.waitFor(() => expect(editorButton('保存').disabled).toBe(true));
    expect(toasts()).toContain('原稿を保存しました');
    // 保存のあと data/ を読み直し、HTMLの状態を合わせる
    await vi.waitFor(() => expect(local.fetchDrafts.mock.calls.length).toBeGreaterThan(1));
  });

  it('読み込み中に読むを連打しても、原稿を一度だけ開く', async () => {
    const record = fixtureRecord();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    local.fetchDrafts.mockResolvedValue(draftWith(record));
    local.fetchArticlePart.mockImplementation(async (_draft: unknown, _disclosure: unknown, part: string) => {
      await pending;
      return { text: FILES[part] ?? '', modifiedAt: 10 };
    });
    await start([record]);
    await vi.waitFor(() => expect(card(record.id).querySelector('[data-act="read"]')).not.toBeNull());
    cardButton(record.id, '読む').click();
    cardButton(record.id, '読む').click();
    expect(local.fetchArticlePart).toHaveBeenCalledTimes(4);
    release();
    await vi.waitFor(() => expect(editor().open).toBe(true));
    expect(toasts()).toEqual([]);
    local.putArticlePart.mockResolvedValue(20);
    editorButton('直す').click();
    type('freeText', '変更した導入。');
    editorButton('保存').click();
    await vi.waitFor(() => expect(local.putArticlePart).toHaveBeenCalledOnce());
  });

  it('保存中に追記した文章は未保存として残し、保存が終わるまで閉じない', async () => {
    let finish!: (time: number) => void;
    local.putArticlePart.mockImplementation(() => new Promise<number>((resolve) => { finish = resolve; }));
    await openEditor(fixtureRecord());
    editorButton('直す').click();
    type('freeText', '保存する文章。');
    editorButton('保存').click();
    await vi.waitFor(() => expect(local.putArticlePart).toHaveBeenCalledOnce());
    type('freeText', '保存中に追記した文章。');
    editor().querySelector<HTMLButtonElement>('[data-act="close"]')!.click();
    expect(editor().open).toBe(true);
    finish(20);
    await vi.waitFor(() => expect(editorButton('保存').disabled).toBe(false));
    expect(editor().querySelector('.article-status')?.textContent).toBe('保存していない変更があります');
    expect(editor().querySelector<HTMLTextAreaElement>('[name="freeText"]')!.value).toBe('保存中に追記した文章。');
  });

  it('本文の一部だけ保存できた場合もHTMLの状態を読み直し、残りの入力を保つ', async () => {
    const record = fixtureRecord();
    local.putArticlePart.mockResolvedValueOnce(20).mockRejectedValueOnce(new Error('書き込めませんでした'));
    await openEditor(record, { ...SOURCE_TIMES, freeHtml: 11, paidHtml: 11 });
    expect(cardButton(record.id, '無料')).toBeDefined();
    local.fetchDrafts.mockResolvedValue(draftWith(record, { ...SOURCE_TIMES, freeText: 20, freeHtml: 11, paidHtml: 11 }));
    editorButton('直す').click();
    type('freeText', '直した導入。');
    type('paidText', '直した総評。');
    editorButton('保存').click();
    await vi.waitFor(() => expect(toasts()).toContain('書き込めませんでした'));
    expect(local.putArticlePart.mock.calls.map((call) => call[2])).toEqual(['freeText', 'paidText']);
    expect(toasts()).not.toContain('原稿を保存しました');
    await vi.waitFor(() => expect(card(record.id).querySelector('[data-part="freeHtml"]')).toBeNull());
    expect(editorButton('保存').disabled).toBe(false);
    expect(editor().querySelector<HTMLTextAreaElement>('[name="paidText"]')!.value).toBe('直した総評。');
  });

  it('読み直しの途中で保存しても、完了後に最新のHTMLの状態を取得する', async () => {
    const record = fixtureRecord();
    local.putArticlePart.mockResolvedValue(20);
    await openEditor(record, { ...SOURCE_TIMES, freeHtml: 11, paidHtml: 11 });
    expect(cardButton(record.id, '無料').dataset['part']).toBe('freeHtml');
    let releaseScan!: (files: never[]) => void;
    local.fetchAnswerFiles.mockImplementationOnce(() => new Promise((resolve) => { releaseScan = resolve; }));
    const scans = local.fetchAnswerFiles.mock.calls.length;
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(local.fetchAnswerFiles).toHaveBeenCalledTimes(scans + 1));
    local.fetchDrafts.mockResolvedValue(draftWith(record, { ...SOURCE_TIMES, freeText: 20, freeHtml: 11, paidHtml: 11 }));
    editorButton('直す').click();
    type('freeText', '直した導入。');
    editorButton('保存').click();
    await vi.waitFor(() => expect(toasts()).toContain('原稿を保存しました'));
    releaseScan([]);
    await vi.waitFor(() => expect(card(record.id).querySelector('[data-part="freeHtml"]')).toBeNull());
    expect(local.fetchAnswerFiles).toHaveBeenCalledTimes(scans + 2);
  });

  it('未保存の変更と保存中の書き込みがあれば離脱を確認し、閉じたあとは解除する', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    let finish!: (time: number) => void;
    local.putArticlePart.mockImplementation(() => new Promise<number>((resolve) => { finish = resolve; }));
    const leave = (): boolean => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    await openEditor(fixtureRecord());
    expect(leave()).toBe(false);
    editorButton('直す').click();
    type('tags', '蒲田');
    expect(leave()).toBe(true);
    editorButton('保存').click();
    await vi.waitFor(() => expect(local.putArticlePart).toHaveBeenCalledOnce());
    type('tags', '蒲田,黒髪');
    expect(leave()).toBe(true);
    finish(20);
    await vi.waitFor(() => expect(editorButton('保存').disabled).toBe(false));
    editor().querySelector<HTMLButtonElement>('[data-act="close"]')!.click();
    expect(editor().open).toBe(false);
    await vi.waitFor(() => expect(leave()).toBe(false));
  });

  it('ファイルの改行が CRLF や末尾の改行でも、触っただけでは変更ありにならない', async () => {
    const record = fixtureRecord();
    local.fetchDrafts.mockResolvedValue(draftWith(record));
    local.fetchArticlePart.mockImplementation(async (_draft: unknown, _disclosure: unknown, part: string) =>
      ({ text: part === 'tags' ? '蒲田,黒髪\r\n' : `\n先頭の改行。\r\n二行目。\r\n`, modifiedAt: 10 }));
    await start([record]);
    await vi.waitFor(() => expect(card(record.id).querySelector('[data-act="read"]')).not.toBeNull());
    cardButton(record.id, '読む').click();
    await vi.waitFor(() => expect(editor().open).toBe(true));
    editorButton('直す').click();
    for (const field of editor().querySelectorAll<HTMLTextAreaElement | HTMLInputElement>('[name]')) {
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    expect(editor().querySelector<HTMLTextAreaElement>('[name="freeText"]')!.value).toBe('\n先頭の改行。\n二行目。\n');
    expect(editorButton('保存').disabled).toBe(true);
    expect(editor().querySelector('.article-status')?.textContent).toBe('マークアップ前');
  });

  it('読むに戻すと、保存前の直した文章で見せる', async () => {
    await openEditor(fixtureRecord());
    editorButton('直す').click();
    type('title', '新しいタイトル');
    editorButton('読む').click();
    expect(editor().querySelector('.article-title')?.textContent).toBe('新しいタイトル');
  });

  it('保存していない変更があれば、閉じる前に確かめる', async () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal('confirm', confirm);
    await openEditor(fixtureRecord());
    editorButton('直す').click();
    type('tags', '蒲田');
    editor().querySelector<HTMLButtonElement>('[data-act="close"]')!.click();
    expect(confirm).toHaveBeenCalledOnce();
    expect(editor().open).toBe(true);
    confirm.mockReturnValue(true);
    editor().querySelector<HTMLButtonElement>('[data-act="close"]')!.click();
    expect(editor().open).toBe(false);
  });

  it('タグ欄からの暗黙の送信で、未保存の原稿画面を閉じない', async () => {
    await openEditor(fixtureRecord());
    editorButton('直す').click();
    type('tags', '変更したタグ');
    const submitted = new Event('submit', { bubbles: true, cancelable: true });
    editor().querySelector('form')!.dispatchEvent(submitted);
    expect(submitted.defaultPrevented).toBe(true);
    expect(editor().open).toBe(true);
    expect(editorButton('保存').disabled).toBe(false);
  });

  it('「マークアップを依頼」は先に保存し、素の文章からHTMLを書かせる依頼をコピーする', async () => {
    vi.stubEnv('VITE_ARTICLE_DIR', 'C:\\repo\\data\\articles');
    const record = fixtureRecord();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    local.putArticlePart.mockResolvedValue(20);
    await openEditor(record);
    editorButton('直す').click();
    type('freeText', '直した導入。');
    editorButton('マークアップを依頼').click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(local.putArticlePart).toHaveBeenCalledOnce();
    const prompt = copy.mock.calls[0]![0];
    expect(prompt).toContain(`C:\\repo\\data\\articles\\0001-${record.id}\\standard\\free-part.txt → C:\\repo\\data\\articles\\0001-${record.id}\\standard\\free-part.html`);
    // 言葉を変えない規則は me-markup の skill にあり、依頼文はその skill を呼ぶ(docs/19)
    expect(prompt.startsWith('/me-markup\n')).toBe(true);
  });

  it('保存に失敗したら、直す前の文章でマークアップを頼まない', async () => {
    vi.stubEnv('VITE_ARTICLE_DIR', 'C:\\repo\\data\\articles');
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    local.putArticlePart.mockRejectedValue(new Error('開いたあとに原稿ファイルが書き換えられています。閉じて開き直してください'));
    await openEditor(fixtureRecord());
    editorButton('直す').click();
    type('freeText', '直した導入。');
    editorButton('マークアップを依頼').click();
    await vi.waitFor(() => expect(toasts()).toContain('開いたあとに原稿ファイルが書き換えられています。閉じて開き直してください'));
    expect(copy).not.toHaveBeenCalled();
  });

  it('カードの「マークアップ」でも依頼をコピーする。HTMLができたら本文のコピーに替わる', async () => {
    vi.stubEnv('VITE_ARTICLE_DIR', '/repo/data/articles');
    const record = fixtureRecord();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    local.fetchDrafts.mockResolvedValue(draftWith(record));
    await start([record]);
    await vi.waitFor(() => expect(card(record.id).querySelector('[data-act="markup"]')).not.toBeNull());
    cardButton(record.id, 'マークアップ').click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(copy.mock.calls[0]![0]).toContain(`/repo/data/articles/0001-${record.id}/standard/paid-part.html`);
    local.fetchDrafts.mockResolvedValue(draftWith(record, { ...SOURCE_TIMES, freeHtml: 11, paidHtml: 11 }));
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(card(record.id).querySelector('[data-act="markup"]')).toBeNull());
    expect(cardButton(record.id, '無料').dataset['part']).toBe('freeHtml');
  });
});

describe('data/ の回答', () => {
  const file = (records: readonly VisitRecord[], name = 'me-report-1.json', modifiedAt = 1) =>
    ({ name, modifiedAt, text: JSON.stringify(records) });
  const inboxLabels = (): string[] => [...document.querySelectorAll('.inbox li')].map((item) => item.textContent?.trim() ?? '');

  it('ボードにない回答を知らせ、「取り込む」で追加する', async () => {
    const record = fixtureRecord();
    local.fetchAnswerFiles.mockResolvedValue([file([record])]);
    await start([]);
    await vi.waitFor(() => expect(inboxLabels()).toEqual(['天界のスパ — えりか']));
    document.querySelector<HTMLButtonElement>('[data-act="import-answers"]')!.click();
    await vi.waitFor(() => expect(toasts()).toEqual(['回答を1件追加しました']));
    expect(savedVisits().map((item) => item.id)).toEqual([record.id]);
    expect(cardIds()).toEqual([record.id]);
    expect(document.querySelector('.inbox')).toBeNull();
  });

  it('通し番号が重なれば確かめずに次の番号で足し、振り直したことを知らせる', async () => {
    const saved = fixtureRecord({ seriesNo: 2 });
    const incoming = fixtureRecord({ id: 'from-phone', seriesNo: 2, basic: { ...saved.basic, therapistName: 'めぐ' } });
    local.fetchAnswerFiles.mockResolvedValue([file([incoming])]);
    const ask = vi.fn(() => true);
    vi.stubGlobal('confirm', ask);
    await start([saved]);
    await vi.waitFor(() => expect(inboxLabels()).toEqual(['天界のスパ — めぐ']));
    document.querySelector<HTMLButtonElement>('[data-act="import-answers"]')!.click();
    await vi.waitFor(() => expect(toasts()).toEqual(['回答を1件追加しました(番号が重なったため めぐ は #3)']));
    expect(ask).not.toHaveBeenCalled();
    expect(savedVisits().find((item) => item.id === 'from-phone')?.seriesNo).toBe(3);
  });

  it('3回目の再訪が2回目より先のファイルにあっても、初回から順に取り込む', async () => {
    const first = fixtureRecord({ id: 'visit-1', seriesNo: 1 });
    const second = fixtureRecord({ id: 'visit-2', seriesNo: 2, revisitOf: 'visit-1', sales: { points: 100, articleType: 'revisit' } });
    const third = fixtureRecord({ id: 'visit-3', seriesNo: 3, revisitOf: 'visit-2', sales: { points: 100, articleType: 'revisit' } });
    local.fetchAnswerFiles.mockResolvedValue([file([third], 'c.json', 1), file([second], 'b.json', 2), file([first], 'a.json', 3)]);
    await start([]);
    await vi.waitFor(() => expect(inboxLabels()).toHaveLength(3));
    document.querySelector<HTMLButtonElement>('[data-act="import-answers"]')!.click();
    await vi.waitFor(() => expect(toasts()).toEqual(['回答を3件追加しました']));
    expect(savedVisits().map((item) => item.id)).toEqual(['visit-1', 'visit-2', 'visit-3']);
  });

  it('取り込めない回答があっても残りは取り込み、理由を知らせる', async () => {
    const orphan = fixtureRecord({ id: 'orphan', revisitOf: 'missing-first', sales: { points: 100, articleType: 'revisit' } });
    const ok = fixtureRecord({ id: 'ok', seriesNo: 2 });
    local.fetchAnswerFiles.mockResolvedValue([file([orphan], 'a.json', 1), file([ok], 'b.json', 2)]);
    await start([]);
    await vi.waitFor(() => expect(inboxLabels()).toHaveLength(2));
    document.querySelector<HTMLButtonElement>('[data-act="import-answers"]')!.click();
    await vi.waitFor(() => expect(toasts()).toEqual([
      '回答を1件追加しました',
      expect.stringContaining('取り込めなかった回答: えりか: 再訪先の回答が見つかりません'),
    ]));
    expect(savedVisits().map((item) => item.id)).toEqual(['ok']);
  });

  it('ボードより新しい回答は差分を確かめてから更新し、通し番号はボード側を保つ', async () => {
    const saved = fixtureRecord({ seriesNo: 5 });
    const newer = fixtureRecord({
      seriesNo: 2, updatedAt: '2026-07-02T10:00:00.000Z', basic: { ...saved.basic, nominationFee: 2000 },
    });
    local.fetchAnswerFiles.mockResolvedValue([file([newer])]);
    await start([saved]);
    await vi.waitFor(() => expect(inboxLabels()).toEqual(['更新天界のスパ — えりか']));
    document.querySelector<HTMLButtonElement>('[data-act="import-answers"]')!.click();
    const dialog = await vi.waitFor(() => {
      const node = document.querySelector<HTMLDialogElement>('.handoff-dialog');
      if (node === null) throw new Error('dialog not open');
      return node;
    });
    expect(dialog.textContent).toContain('指名料');
    [...dialog.querySelectorAll('button')].find((button) => button.textContent === '更新する')!.click();
    await vi.waitFor(() => expect(toasts()).toEqual(['回答を1件更新しました']));
    expect(savedVisits()[0]).toMatchObject({ seriesNo: 5, basic: { nominationFee: 2000 } });
  });

  it('同じ回答が複数のファイルにあれば新しいほうを使い、ボードより古いものは知らせない', async () => {
    const saved = fixtureRecord({ updatedAt: '2026-07-03T10:00:00.000Z' });
    const older = fixtureRecord({ updatedAt: '2026-07-02T10:00:00.000Z', basic: { ...saved.basic, nominationFee: 3000 } });
    local.fetchAnswerFiles.mockResolvedValue([file([older], 'me-report-old.json', 1), file([saved], 'me-report-new.json', 2)]);
    await start([saved]);
    await vi.waitFor(() => expect(local.fetchAnswerFiles).toHaveBeenCalled());
    await settle();
    expect(document.querySelector('.inbox')).toBeNull();
  });

  it('読めないファイルは理由を出し、ほかの回答は取り込める', async () => {
    local.fetchAnswerFiles.mockResolvedValue([{ name: 'broken.json', modifiedAt: 1, text: '{' }, file([fixtureRecord()])]);
    await start([]);
    await vi.waitFor(() => expect(document.querySelector('.inbox-error')?.textContent).toContain('broken.json'));
    expect(inboxLabels()).toEqual(['天界のスパ — えりか']);
  });
});

describe('回答カードの記事プロンプト', () => {
  const promptButtons = (id: string): { label: string; disclosure: string; primary: boolean }[] =>
    [...card(id).querySelectorAll<HTMLButtonElement>('.prompt-actions button')].map((item) => ({
      label: item.textContent?.trim() ?? '', disclosure: item.dataset['disclosure'] ?? '', primary: item.classList.contains('primary'),
    }));

  it('出勤確認日を尋ねてコピーし、「プロンプト出力」へ進める', async () => {
    const record = fixtureRecord();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await start([record], emptyBoard({ angles: { [record.id]: 'experience' } }));
    cardButton(record.id, 'プロンプト').click();
    answerInput('2026-11-13');
    await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(copy.mock.calls[0]![0]).toContain('出勤確認: 2026年11月中旬に店舗HPの出勤表で確認済');
    await vi.waitFor(() => expect(stageOf(record.id)).toBe('prompted'));
  });

  it('start.bat で開いたボードでは、me-article の skill を呼ぶ短い依頼文をコピーする', async () => {
    vi.stubEnv('VITE_ARTICLE_DIR', 'C:\\repo\\data\\articles');
    const record = fixtureRecord();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await start([record], emptyBoard({ angles: { [record.id]: 'therapist' } }));
    cardButton(record.id, 'プロンプト').click();
    answerInput('2026-11-13');
    await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    const brief = copy.mock.calls[0]![0];
    expect(brief.startsWith('/me-article\n')).toBe(true);
    expect(brief).toContain('セラピスト起点(保存先のフォルダは names)');
    expect(brief).toContain(`C:\\repo\\data\\articles\\0001-${record.id}\\names\\free-part.txt`);
    expect(brief).toContain('出勤確認: 2026年11月中旬に店舗HPの出勤表で確認済');
    expect(brief).not.toContain('## 文体ルール');
    await vi.waitFor(() => expect(stageOf(record.id)).toBe('prompted'));
  });

  it('販売型を選ぶまでプロンプトのボタンを出さない', async () => {
    const record = fixtureRecord();
    await start([record]);
    expect(card(record.id).querySelector('.prompt-actions')).toBeNull();
  });

  it('販売型を選ぶと、その型のプロンプトのボタンを1つだけ出す', async () => {
    const record = fixtureRecord();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await start([record], emptyBoard({ angles: { [record.id]: 'therapist' } }));
    expect(promptButtons(record.id)).toEqual([{ label: 'プロンプト', disclosure: 'free', primary: true }]);
    cardButton(record.id, 'プロンプト').click();
    answerInput('');
    await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(copy.mock.calls[0]![0]).toContain('店名と源氏名を半角スペースでつなぎ');
  });

  it('販売型を切り替えると、プロンプトのボタンも切り替わる', async () => {
    const record = fixtureRecord();
    await start([record], emptyBoard({ angles: { [record.id]: 'therapist' } }));
    cardButton(record.id, '体験内容起点').click();
    expect(promptButtons(record.id)).toEqual([{ label: 'プロンプト', disclosure: 'paid', primary: true }]);
    cardButton(record.id, '体験内容起点').click();
    expect(card(record.id).querySelector('.prompt-actions')).toBeNull();
  });

  it('再訪のカードは販売型を選べないので、両方の型を名前で出す', async () => {
    const first = fixtureRecord({ postedUrl: WAKUST_URL });
    const revisit = fixtureRecord({ id: 'revisit', seriesNo: 2, revisitOf: first.id, sales: { points: 100, articleType: 'revisit' } });
    await start([first, revisit]);
    expect(promptButtons(revisit.id)).toEqual([
      { label: 'セラピスト起点', disclosure: 'free', primary: false },
      { label: '体験内容起点', disclosure: 'paid', primary: false },
    ]);
  });

  it('出勤確認日を取り消すと、コピーも段階の変更もしない', async () => {
    const record = fixtureRecord();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await start([record], emptyBoard({ angles: { [record.id]: 'experience' } }));
    cardButton(record.id, 'プロンプト').click();
    answerInput(null);
    await settle();
    expect(copy).not.toHaveBeenCalled();
    expect(stageOf(record.id)).toBe('answered');
  });

  it('投稿済みのカードには出さない', async () => {
    const record = fixtureRecord({ postedUrl: WAKUST_URL });
    await start([record]);
    expect(card(record.id).querySelector('.prompt-actions')).toBeNull();
  });
});

describe('週次確認', () => {
  it('確認対象を書き出して確認を実行し、結果を取り込んでから控えを残す', async () => {
    const record = fixtureRecord({ postedUrl: WAKUST_URL });
    const check = {
      profileUrl: record.basic.therapistProfileUrl, checkedAt: new Date().toISOString(),
      enrollment: 'present', attendance: 'listed', detail: '',
    };
    local.putCheckFile.mockResolvedValue(undefined);
    local.runWeeklyCheck.mockResolvedValue(JSON.stringify({ version: 1, results: [check] }));
    local.fetchCheckFile.mockResolvedValue(JSON.stringify({ version: 1, results: [check] }));
    await start([record]);
    byId('sync').click();
    await vi.waitFor(() => expect(local.putCheckFile).toHaveBeenCalledTimes(2));

    const [targetsCall, backupCall] = local.putCheckFile.mock.calls as [string, string][];
    expect(targetsCall?.[0]).toBe('targets.json');
    expect(JSON.parse(targetsCall![1])).toMatchObject({
      version: 1,
      targets: [{ profileUrl: record.basic.therapistProfileUrl, therapistName: record.basic.therapistName, scheduleUrl: null }],
    });
    expect(local.runWeeklyCheck).toHaveBeenCalledOnce();
    expect(local.runWeeklyCheck).toHaveBeenCalledWith(targetsCall![1]);
    expect(savedBoard().checks).toEqual([check]);
    // 控えは、確認結果を取り込んだあとの内容
    expect(backupCall).toEqual(['board-backup.json', window.localStorage.getItem(BOARD_KEY)]);
    expect(card(record.id).querySelector('.track')?.textContent).toContain('出勤あり');
    expect(toasts()).toEqual([expect.stringContaining('の確認結果を読み込みました')]);
    expect(byId<HTMLButtonElement>('sync').disabled).toBe(false);
  });

  it('確認が失敗したら理由を知らせ、ボタンを戻す', async () => {
    local.putCheckFile.mockResolvedValue(undefined);
    local.runWeeklyCheck.mockRejectedValue(new Error('targets.json を読めません'));
    await start([fixtureRecord({ postedUrl: WAKUST_URL })]);
    byId('sync').click();
    await vi.waitFor(() => expect(toasts()).toEqual(['targets.json を読めません']));
    expect(byId<HTMLButtonElement>('sync').disabled).toBe(false);
    expect(byId('sync').textContent).toBe('週次確認');
    expect(local.fetchCheckFile).not.toHaveBeenCalled();
  });
});


describe('投稿URL決定時の最新データ', () => {
  it.each(['edit', 'delete', 'url'])('回答の%sを巻き戻さない', async (change) => {
    const original = fixtureRecord();
    await start([original]);
    await moveTo(original.id, 'posted');
    const latest = { ...original, seriesNo: 9, flow: { ...original.flow, bestMoment: '別画面の訂正' }, postedUrl: change === 'url' ? 'https://wakust.com/reports/1002' : null };
    window.localStorage.setItem(VISITS_KEY, JSON.stringify(change === 'delete' ? [] : [latest]));
    answerInput(WAKUST_URL);
    if (change === 'edit') expect(savedVisits()[0]).toMatchObject({ seriesNo: 9, flow: latest.flow, postedUrl: WAKUST_URL });
    else {
      expect(savedVisits()).toEqual(change === 'delete' ? [] : [latest]);
      expect(dialogError()).toMatch(/見つかりません|変更/);
      expect(stageOf(original.id)).not.toBe('posted');
    }
  });
  it('削除済みのまとめを復活させない', async () => {
    const bundle = { id: 'bundle-test', kind: 'matome' as const, title: '合成まとめ', recordIds: [], stage: 'answered' as const, postedUrl: null, createdAt: '2026-11-13T00:00:00.000Z' };
    await start([], emptyBoard({ bundles: [bundle] }));
    await moveTo(bundle.id, 'posted');
    window.localStorage.setItem(BOARD_KEY, JSON.stringify(emptyBoard()));
    answerInput(WAKUST_URL);
    expect(savedBoard().bundles).toEqual([]);
    expect(dialogError()).toMatch(/見つかりません/);
  });
});


describe('古い回答ファイルの本文競合', () => {
  it('新着へ自動追加せず、ファイル名と手動読込経路を表示する', async () => {
    const original = fixtureRecord();
    const saved = { ...original, updatedAt: '2026-11-13T12:00:00.000Z', postedUrl: WAKUST_URL };
    const corrected = { ...original, flow: { ...original.flow, bestMoment: 'スマホの訂正' } };
    local.fetchAnswerFiles.mockResolvedValue([{ name: 'correction.json', modifiedAt: 1, text: JSON.stringify([corrected]) }]);
    await start([saved]);
    await vi.waitFor(() => expect(document.body.textContent).toMatch(/correction.json.*競合.*回答を追加読込/));
    expect(savedVisits()).toEqual([saved]);
  });
});


describe('まとめの投稿URL決定中の変更', () => {
  it.each(['edit', 'url'])('%sを巻き戻さない', async (change) => {
    const bundle = { id: 'bundle-test', kind: 'matome' as const, title: '合成まとめ', recordIds: [], stage: 'answered' as const, postedUrl: null, createdAt: '2026-11-13T00:00:00.000Z' };
    await start([], emptyBoard({ bundles: [bundle] }));
    await moveTo(bundle.id, 'posted');
    const latest = { ...bundle, title: '別画面の訂正', postedUrl: change === 'url' ? 'https://wakust.com/reports/1002' : null };
    window.localStorage.setItem(BOARD_KEY, JSON.stringify(emptyBoard({ bundles: [latest] })));
    answerInput(WAKUST_URL);
    expect(savedBoard().bundles[0]).toEqual(change === 'edit' ? { ...latest, postedUrl: WAKUST_URL } : latest);
    if (change === 'url') expect(dialogError()).toMatch(/変更/);
  });
});
