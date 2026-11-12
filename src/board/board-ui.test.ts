// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import boardPage from '../../board.html?raw';
import { fixtureRecord } from '../test-fixtures';
import type { VisitRecord } from '../types';
import type { BoardState } from './state';

const VISITS_KEY = 'me-report-writer/visits/v1';
const BOARD_KEY = 'me-report-writer/board/v1';
const WAKUST_URL = 'https://wakust.com/reports/latest';

const folder = vi.hoisted(() => ({
  folderSupported: vi.fn(() => false),
  savedFolder: vi.fn(),
  pickFolder: vi.fn(),
  ensureAccess: vi.fn(),
  readText: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock('./folder', () => folder);

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

interface FakeDir {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncGenerator<FakeDir>;
  getDirectoryHandle(name: string): Promise<FakeDir>;
  getFileHandle(name: string): Promise<{ getFile(): Promise<{ lastModified: number; text(): Promise<string> }> }>;
  queryPermission(): Promise<'granted'>;
}

function notFound(): never {
  throw new DOMException('not found', 'NotFoundError');
}

/** 原稿フォルダの代わり。scanArticles が使う範囲だけを持つ */
function fakeDir(name: string, children: readonly FakeDir[] = [], files: readonly string[] = []): FakeDir {
  return {
    kind: 'directory',
    name,
    async *values() { yield* children; },
    getDirectoryHandle: async (child) => children.find((item) => item.name === child) ?? notFound(),
    getFileHandle: async (file) => files.includes(file)
      ? { getFile: async () => ({ lastModified: Date.UTC(2026, 10, 12), text: async () => '' }) }
      : notFound(),
    queryPermission: async () => 'granted',
  };
}

/** 回答1件ぶんの通常版の原稿(タイトルと無料部分)が入った原稿フォルダ */
function articlesFolder(name: string, record: VisitRecord): FakeDir {
  const standard = fakeDir('standard', [], ['title.txt', 'free-part.html']);
  return fakeDir(name, [fakeDir(`${String(record.seriesNo).padStart(4, '0')}-${record.id}`, [standard])]);
}

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
  folder.folderSupported.mockReturnValue(false);
  folder.savedFolder.mockResolvedValue(null);
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
    const prompt = vi.fn(() => ` ${WAKUST_URL} `);
    vi.stubGlobal('prompt', prompt);
    await moveTo(record.id, 'posted');
    expect(prompt).toHaveBeenCalledOnce();
    expect(savedVisits()[0]?.postedUrl).toBe(WAKUST_URL);
    expect(savedBoard().stages).toEqual({});
    expect(stageOf(record.id)).toBe('posted');
  });

  it('wakust以外のURLでは保存せず、選択肢を元の段階へ戻す', async () => {
    const record = fixtureRecord();
    await start([record], emptyBoard({ stages: { [record.id]: 'editing' } }));
    vi.stubGlobal('prompt', vi.fn(() => 'https://example.com/article'));
    await moveTo(record.id, 'posted');
    expect(savedVisits()[0]?.postedUrl).toBeNull();
    expect(savedBoard().stages).toEqual({ [record.id]: 'editing' });
    expect(stageOf(record.id)).toBe('editing');
    expect(shownStage(record.id)).toBe('editing');
    expect(toasts()).toEqual(['wakust記事URLが必要です']);
  });

  it('投稿URLの入力を取り消すと何も変えない', async () => {
    const record = fixtureRecord();
    await start([record]);
    vi.stubGlobal('prompt', vi.fn(() => null));
    await moveTo(record.id, 'posted');
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
    vi.stubGlobal('prompt', vi.fn(() => '  '));
    await moveTo(record.id, 'posted');
    expect(savedVisits()[0]?.postedUrl).toBeNull();
    expect(shownStage(record.id)).toBe('answered');
    expect(toasts()).toEqual(['wakust記事URLが必要です']);
  });
});

describe('まとめ・カタログの記事', () => {
  it('「+ 記事」でまとめを追加できる', async () => {
    const record = fixtureRecord();
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

describe('フォルダの読み書きに対応していないブラウザ', () => {
  it('確認対象の書き出しと確認結果の読み込みを見せ、フォルダを使う操作を隠す', async () => {
    await start([fixtureRecord()]);
    expect(byId('export-targets').hidden).toBe(false);
    expect(byId('import-checks').hidden).toBe(false);
    expect(byId('sync').hidden).toBe(true);
    expect(byId('articles').hidden).toBe(true);
    expect(byId('pick-folder').hidden).toBe(true);
    expect(byId('pick-articles').hidden).toBe(true);
    expect(folder.savedFolder).not.toHaveBeenCalled();
  });
});

describe('フォルダの読み書きに対応しているブラウザ', () => {
  beforeEach(() => {
    folder.folderSupported.mockReturnValue(true);
  });

  it('同期とフォルダの操作を見せ、ファイルでの受け渡しを隠す', async () => {
    await start([fixtureRecord()]);
    expect(byId('sync').hidden).toBe(false);
    expect(byId('articles').hidden).toBe(false);
    expect(byId('pick-folder').hidden).toBe(false);
    expect(byId('pick-articles').hidden).toBe(false);
    expect(byId('export-targets').hidden).toBe(true);
    expect(byId('import-checks').hidden).toBe(true);
  });

  it('「同期」で確認対象とバックアップを書き出し、確認結果を取り込む', async () => {
    const record = fixtureRecord({ postedUrl: WAKUST_URL });
    const handoff = { name: 'handoff' };
    const check = {
      profileUrl: record.basic.therapistProfileUrl, checkedAt: new Date().toISOString(),
      enrollment: 'present', attendance: 'listed', detail: '',
    };
    folder.savedFolder.mockImplementation(async (slot?: string) => slot === 'articles' ? null : handoff);
    folder.ensureAccess.mockResolvedValue(undefined);
    folder.writeText.mockResolvedValue(undefined);
    folder.readText.mockResolvedValue(JSON.stringify({ version: 1, results: [check] }));
    await start([record]);
    byId('sync').click();
    await vi.waitFor(() => expect(folder.writeText).toHaveBeenCalledTimes(2));

    expect(folder.pickFolder).not.toHaveBeenCalled();
    expect(folder.ensureAccess).toHaveBeenCalledWith(handoff);
    expect(folder.readText).toHaveBeenCalledWith(handoff, 'checks.json');
    const [targetsCall, backupCall] = folder.writeText.mock.calls as [unknown, string, string][];
    expect(targetsCall?.slice(0, 2)).toEqual([handoff, 'targets.json']);
    expect(JSON.parse(targetsCall![2])).toMatchObject({
      version: 1,
      targets: [{ profileUrl: record.basic.therapistProfileUrl, therapistName: record.basic.therapistName, scheduleUrl: null }],
    });
    expect(savedBoard().checks).toEqual([check]);
    expect(backupCall?.slice(0, 2)).toEqual([handoff, 'board-backup.json']);
    // バックアップは、確認結果を取り込んだあとの内容
    expect(backupCall![2]).toBe(window.localStorage.getItem(BOARD_KEY));
    expect(card(record.id).querySelector('.track')?.textContent).toContain('出勤あり');
    expect(toasts()).toEqual([expect.stringContaining('の確認結果を読み込みました')]);
  });

  it('受け渡しフォルダが未設定なら選ばせ、確認結果がまだなければその旨を知らせる', async () => {
    const handoff = { name: 'handoff' };
    folder.pickFolder.mockResolvedValue(handoff);
    folder.ensureAccess.mockResolvedValue(undefined);
    folder.writeText.mockResolvedValue(undefined);
    folder.readText.mockResolvedValue(null);
    await start([fixtureRecord()]);
    byId('sync').click();
    await vi.waitFor(() => expect(folder.writeText).toHaveBeenCalledTimes(2));
    expect(folder.pickFolder).toHaveBeenCalledOnce();
    expect(toasts()).toEqual(['確認対象を書き出しました。確認結果はまだありません']);
    expect(window.localStorage.getItem(BOARD_KEY)).toBeNull();
  });

  describe('原稿フォルダ', () => {
    const draftNames = (id: string): string[] =>
      [...card(id).querySelectorAll('.draft-name')].map((item) => item.textContent ?? '');

    beforeEach(() => {
      folder.ensureAccess.mockResolvedValue(undefined);
    });

    it('選び直すと、選んだフォルダの原稿をカードに出す', async () => {
      const record = fixtureRecord();
      const before = articlesFolder('drafts-old', fixtureRecord({ id: 'other-id' }));
      const after = articlesFolder('drafts-new', record);
      folder.savedFolder.mockImplementation(async (slot?: string) => slot === 'articles' ? before : null);
      folder.pickFolder.mockResolvedValue(after);
      await start([record]);
      await vi.waitFor(() => expect(folder.savedFolder).toHaveBeenCalledWith('articles'));
      expect(card(record.id).querySelector('.draft')).toBeNull();

      byId('pick-articles').click();
      await vi.waitFor(() => expect(toasts()).toEqual(['原稿 1件(drafts-new)']));
      expect(folder.pickFolder).toHaveBeenCalledExactlyOnceWith('articles');
      expect(folder.ensureAccess).toHaveBeenCalledWith(after);
      expect(draftNames(record.id)).toEqual(['原稿']);
      expect(card(record.id).querySelectorAll('[data-act="copy-part"]')).toHaveLength(2);
      expect(stageOf(record.id)).toBe('editing');
    });

    it('選択を取り消したときは何も知らせず、表示を変えない', async () => {
      const record = fixtureRecord();
      folder.pickFolder.mockRejectedValue(new DOMException('aborted', 'AbortError'));
      await start([record]);
      byId('pick-articles').click();
      await vi.waitFor(() => expect(folder.pickFolder).toHaveBeenCalledExactlyOnceWith('articles'));
      await settle();
      expect(toasts()).toEqual([]);
      expect(card(record.id).querySelector('.draft')).toBeNull();
      expect(stageOf(record.id)).toBe('answered');
    });

    it('「原稿」は、設定済みならフォルダを選ばせずに読み直す', async () => {
      const record = fixtureRecord();
      const saved = articlesFolder('drafts', record);
      folder.savedFolder.mockImplementation(async (slot?: string) => slot === 'articles' ? saved : null);
      await start([record]);
      byId('articles').click();
      await vi.waitFor(() => expect(toasts()).toEqual(['原稿 1件(drafts)']));
      expect(folder.pickFolder).not.toHaveBeenCalled();
      expect(draftNames(record.id)).toEqual(['原稿']);
    });

    it('「原稿」は、未設定ならフォルダを選ばせる', async () => {
      const record = fixtureRecord();
      folder.pickFolder.mockResolvedValue(articlesFolder('drafts', record));
      await start([record]);
      byId('articles').click();
      await vi.waitFor(() => expect(toasts()).toEqual(['原稿 1件(drafts)']));
      expect(folder.pickFolder).toHaveBeenCalledExactlyOnceWith('articles');
    });
  });

  describe('プロンプトの保存先との食い違い', () => {
    const SAVE_DIR = 'C:\\work\\articles';
    const draftCount = (id: string): number => card(id).querySelectorAll('.draft-row').length;

    beforeEach(() => {
      folder.ensureAccess.mockResolvedValue(undefined);
    });

    it('選び直したフォルダの名前が保存先と違えば知らせ、読み込みは続ける', async () => {
      const record = fixtureRecord();
      vi.stubEnv('VITE_ARTICLE_DIR', SAVE_DIR);
      folder.pickFolder.mockResolvedValue(articlesFolder('drafts', record));
      await start([record]);
      byId('pick-articles').click();
      await vi.waitFor(() => expect(toasts()).toEqual([
        `原稿フォルダ「drafts」は、プロンプトの保存先「${SAVE_DIR}」と名前が違います`,
      ]));
      expect(draftCount(record.id)).toBe(1);
      expect(stageOf(record.id)).toBe('editing');
    });

    it('「原稿」で読み直したときも知らせる', async () => {
      const record = fixtureRecord();
      vi.stubEnv('VITE_ARTICLE_DIR', SAVE_DIR);
      const saved = articlesFolder('drafts', record);
      folder.savedFolder.mockImplementation(async (slot?: string) => slot === 'articles' ? saved : null);
      await start([record]);
      byId('articles').click();
      await vi.waitFor(() => expect(toasts()).toEqual([
        `原稿フォルダ「drafts」は、プロンプトの保存先「${SAVE_DIR}」と名前が違います`,
      ]));
      expect(draftCount(record.id)).toBe(1);
    });

    it.each([
      ['C:\\work\\articles'],
      ['C:\\work\\articles\\'],
      ['/home/me/Articles'],
    ])('保存先 %s と同じ名前のフォルダでは知らせない', async (dir) => {
      const record = fixtureRecord();
      vi.stubEnv('VITE_ARTICLE_DIR', dir);
      folder.pickFolder.mockResolvedValue(articlesFolder('articles', record));
      await start([record]);
      byId('pick-articles').click();
      await vi.waitFor(() => expect(toasts()).toEqual(['原稿 1件(articles)']));
    });

    it('フォーカスが戻ったときの自動読み直しでは知らせない', async () => {
      const record = fixtureRecord();
      vi.stubEnv('VITE_ARTICLE_DIR', SAVE_DIR);
      const saved = articlesFolder('drafts', record);
      folder.savedFolder.mockImplementation(async (slot?: string) => slot === 'articles' ? saved : null);
      await start([record]);
      await vi.waitFor(() => expect(draftCount(record.id)).toBe(1));
      window.dispatchEvent(new Event('focus'));
      await vi.waitFor(() => expect(folder.savedFolder).toHaveBeenCalledTimes(2));
      await settle();
      expect(toasts()).toEqual([]);
      expect(draftCount(record.id)).toBe(1);
    });
  });
});
