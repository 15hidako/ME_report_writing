// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import boardPage from '../../board.html?raw';
import { fixtureRecord } from '../test-fixtures';
import type { VisitRecord } from '../types';
import type { BoardState } from './state';
import type { ArticleDraft } from './articles';

const VISITS_KEY = 'me-report-writer/visits/v1';
const BOARD_KEY = 'me-report-writer/board/v1';
const WAKUST_URL = 'https://wakust.com/reports/latest';

const local = vi.hoisted(() => ({
  localDataAvailable: vi.fn(),
  fetchAnswerFiles: vi.fn(),
  fetchDrafts: vi.fn(),
  fetchArticlePart: vi.fn(),
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
    variants: [{ disclosure: 'paid', parts: ['title', 'freePart'], updatedAt: Date.UTC(2026, 10, 12) }],
  }]]);
  const draftNames = (id: string): string[] =>
    [...card(id).querySelectorAll('.draft-name')].map((item) => item.textContent ?? '');

  it('開いたときに原稿を読み、カードに出して「推敲中」へ進める', async () => {
    const record = fixtureRecord();
    local.fetchDrafts.mockResolvedValue(draftFor(record));
    await start([record]);
    await vi.waitFor(() => expect(draftNames(record.id)).toEqual(['通常版']));
    expect(card(record.id).querySelectorAll('[data-act="copy-part"]')).toHaveLength(2);
    expect(stageOf(record.id)).toBe('editing');
    expect(savedBoard().stages).toEqual({ [record.id]: 'editing' });
  });

  it('ボードへ戻ったときに読み直し、新しく書き出された原稿を出す', async () => {
    const record = fixtureRecord();
    await start([record]);
    await vi.waitFor(() => expect(local.fetchDrafts).toHaveBeenCalledTimes(1));
    expect(card(record.id).querySelector('.draft')).toBeNull();
    local.fetchDrafts.mockResolvedValue(draftFor(record));
    window.dispatchEvent(new Event('focus'));
    await vi.waitFor(() => expect(draftNames(record.id)).toEqual(['通常版']));
  });

  it('部分のボタンでその原稿ファイルの中身をコピーする', async () => {
    const record = fixtureRecord();
    local.fetchDrafts.mockResolvedValue(draftFor(record));
    local.fetchArticlePart.mockResolvedValue('<p>本文</p>');
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await start([record]);
    await vi.waitFor(() => expect(draftNames(record.id)).toEqual(['通常版']));
    cardButton(record.id, '無料').click();
    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith('<p>本文</p>'));
    expect(local.fetchArticlePart).toHaveBeenCalledWith(expect.objectContaining({ recordId: record.id }), 'paid', 'freePart');
    expect(toasts()).toEqual(['無料部分をコピーしました']);
  });

  it('data/ に届かないときは理由をボードに出す', async () => {
    local.localDataAvailable.mockResolvedValue(false);
    await start([fixtureRecord()]);
    await vi.waitFor(() => expect(document.querySelector('.inbox-error')?.textContent).toContain('start.bat'));
    expect(local.fetchDrafts).not.toHaveBeenCalled();
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
  it('出勤確認日を尋ねてコピーし、「プロンプト出力」へ進める', async () => {
    const record = fixtureRecord();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await start([record]);
    cardButton(record.id, 'プロンプト').click();
    answerInput('2026-11-13');
    await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(copy.mock.calls[0]![0]).toContain('出勤確認: 2026年11月13日に店舗HPの出勤表で確認');
    await vi.waitFor(() => expect(stageOf(record.id)).toBe('prompted'));
  });

  it('販売型に合う側を主ボタンにし、名前公開版も出せる', async () => {
    const record = fixtureRecord();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await start([record], emptyBoard({ angles: { [record.id]: 'therapist' } }));
    expect(cardButton(record.id, '名前公開版').classList.contains('primary')).toBe(true);
    expect(cardButton(record.id, 'プロンプト').classList.contains('primary')).toBe(false);
    cardButton(record.id, '名前公開版').click();
    answerInput('');
    await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(copy.mock.calls[0]![0]).toContain('タイトルに店名と源氏名を入れる');
  });

  it('出勤確認日を取り消すと、コピーも段階の変更もしない', async () => {
    const record = fixtureRecord();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await start([record]);
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
    local.runWeeklyCheck.mockResolvedValue('確認 1件');
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
    expect(local.fetchCheckFile).toHaveBeenCalledWith('checks.json');
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
