import { VisitStore } from '../storage';
import { parseChecksFile } from '../checks/files';
import { localDate } from '../date';
import { ARTICLE_DIR, folderNameOf } from '../local-setup';
import { BOARD_WINDOW, takeParam } from '../links';
import { parsePostedUrlInput } from '../prompt/publication';
import { toast, tryCopyText } from '../ui/widgets';
import { downloadJson, pickFile } from '../ui/file-io';
import { errText } from '../guards';
import { openInputDialog } from '../ui/input-dialog';
import { ARTICLE_PARTS, VARIANT_DIRS } from '../prompt/article-files';
import { advanceDrafted, readArticlePart, scanArticles, type ArticleDraft } from './articles';
import { buildCards, buildTargets, type Card } from './cards';
import { ensureAccess, folderSupported, pickFolder, readText, savedFolder, writeText, type Folder } from './folder';
import {
  BoardStore, acknowledge, parseBoardState, removeBundle, setRecordStage, setArticleAngle, setScheduleUrl, upsertBundle,
  withChecks, BUNDLE_KINDS, ANGLES, STAGES, type BoardState, type BundleKind, type Stage,
} from './state';
import { KIND_FILTERS, boardHtml, bundleDialogHtml, filterHtml, type KindFilter } from './view';
import '../styles.css';
import './board.css';

const TARGETS_FILE = 'targets.json';
const CHECKS_FILE = 'checks.json';
const BACKUP_FILE = 'board-backup.json';

/** id で要素を引く。起動時に必ずある要素なので、なければ例外にする */
function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`#${id} が見つかりません`);
  return node as T;
}

const boardNode = byId('board');
const filterNode = byId('kind-filter');
const dialog = byId<HTMLDialogElement>('bundle-dialog');

const kv = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};
const visits = new VisitStore(kv);
const board = new BoardStore(kv);

/** 利用者の操作から呼ぶ処理を包み、失敗を画面に出す */
function guarded<A extends unknown[]>(action: (...args: A) => void | Promise<void>): (...args: A) => void {
  return (...args) => {
    void (async () => action(...args))().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast(errText(error));
    });
  };
}

const supported = folderSupported();

function currentFilter(): KindFilter {
  const kind = new URLSearchParams(location.search).get('kind') ?? 'all';
  return KIND_FILTERS.find((item) => item === kind) ?? 'all';
}

/** 原稿フォルダから読んだ記事。保存はせず、読み直すたびに作り直す */
let drafts: ReadonlyMap<string, ArticleDraft> = new Map();

function cards(): Card[] {
  return buildCards(visits.loadAll(), board.load(), new Date(), drafts);
}

function render(): void {
  try {
    const filter = currentFilter();
    filterNode.innerHTML = filterHtml(filter);
    boardNode.innerHTML = boardHtml(cards(), filter);
  } catch (error) {
    boardNode.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty', textContent: errText(error) }));
  }
}

function update(change: (state: BoardState) => BoardState): void {
  board.save(change(board.load()));
  render();
}

/** 投稿URLを尋ね、決定されたら save に渡す。誤りはダイアログに出して入力を残す */
function askPostedUrl(current: string | null, save: (url: string) => void): void {
  openInputDialog({
    title: '投稿URL',
    fields: [{ name: 'postedUrl', label: 'wakust投稿後の記事URL', type: 'url', value: current ?? '' }],
    onSubmit: (values) => {
      const url = parsePostedUrlInput(values['postedUrl'] ?? '');
      // ボードでは空欄で解除しない。外すときは段階を戻す
      if (url === null) throw new Error('wakust記事URLが必要です');
      save(url);
    },
  });
}

const UNPOST_CONFIRM = '投稿URLを外して戻しますか?';

function moveCard(card: Card, stage: Stage): void {
  if (card.stage === stage) return;
  if (card.source === 'record') {
    const record = visits.get(card.id);
    if (record === undefined) throw new Error('回答が見つかりません。画面を読み込み直してください');
    if (card.stage === 'posted' && stage !== 'posted') {
      if (!confirm(UNPOST_CONFIRM)) return;
      visits.save({ ...record, postedUrl: null, updatedAt: new Date().toISOString() });
      update((state) => setRecordStage(state, card.id, stage));
      return;
    }
    if (stage === 'posted') {
      askPostedUrl(null, (postedUrl) => {
        visits.save({ ...record, postedUrl, updatedAt: new Date().toISOString() });
        update((state) => setRecordStage(state, card.id, 'answered'));
      });
      return;
    }
    update((state) => setRecordStage(state, card.id, stage));
    return;
  }
  const bundle = board.load().bundles.find((item) => item.id === card.id);
  if (bundle === undefined) throw new Error('記事が見つかりません。画面を読み込み直してください');
  if (stage === 'posted') {
    askPostedUrl(bundle.postedUrl, (postedUrl) => update((state) => upsertBundle(state, { ...bundle, postedUrl })));
    return;
  }
  if (bundle.postedUrl !== null && !confirm(UNPOST_CONFIRM)) return;
  update((state) => upsertBundle(state, { ...bundle, stage, postedUrl: null }));
}

async function copyDraftPart(card: Card, button: HTMLElement): Promise<void> {
  const disclosure = (Object.keys(VARIANT_DIRS) as (keyof typeof VARIANT_DIRS)[]).find((item) => item === button.dataset['disclosure']);
  const part = ARTICLE_PARTS.find((item) => item.id === button.dataset['part']);
  if (card.draft === null || disclosure === undefined || part === undefined) return;
  const folder = await savedFolder('articles');
  if (folder === null) throw new Error('原稿フォルダが未設定です。「原稿」から選んでください');
  await ensureAccess(folder);
  const copied = await tryCopyText(await readArticlePart(folder, card.draft, disclosure, part.id), `${part.label}をコピーしました`);
  button.classList.toggle('copied', copied);
}

/** 原稿フォルダを読み、原稿がある回答を「推敲中」へ進める */
async function loadDrafts(folder: Folder): Promise<number> {
  drafts = await scanArticles(folder);
  const records = new Map(cards().map((card) => [card.id, card.stage]));
  const before = board.load();
  const after = advanceDrafted(before, drafts, (id) => records.get(id));
  if (after !== before) board.save(after);
  render();
  return drafts.size;
}

/** 選んだフォルダの絶対パスは取れないので、プロンプトの保存先とは末尾のフォルダ名で比べる */
function saveDirMismatch(folder: Folder): string | null {
  if (ARTICLE_DIR === null) return null;
  const expected = folderNameOf(ARTICLE_DIR);
  // Windows は大文字小文字を区別しない
  return expected === '' || expected.toLowerCase() === folder.name.toLowerCase()
    ? null
    : `原稿フォルダ「${folder.name}」は、プロンプトの保存先「${ARTICLE_DIR}」と名前が違います`;
}

/** ボタン操作で原稿を読む。自動の読み直し(refreshDrafts)では知らせを出さない */
async function showDrafts(folder: Folder): Promise<void> {
  await ensureAccess(folder);
  const count = await loadDrafts(folder);
  // トーストは重なって出るので、食い違いがあるときはそちらだけを知らせる
  toast(saveDirMismatch(folder) ?? `原稿 ${count}件(${folder.name})`);
}

async function openArticles(): Promise<void> {
  await showDrafts(await savedFolder('articles') ?? await pickFolder('articles'));
}

async function pickArticles(): Promise<void> {
  await showDrafts(await pickFolder('articles'));
}

let refreshing = false;

/** 許可が残っているときだけ黙って読み直す。許可を求めるのはボタン操作の中だけ */
async function refreshDrafts(): Promise<void> {
  // フォーカスの出入りが続いても読み直しを重ねない
  if (refreshing) return;
  refreshing = true;
  try {
    const folder = await savedFolder('articles');
    if (folder === null || await folder.queryPermission({ mode: 'readwrite' }) !== 'granted') return;
    await loadDrafts(folder);
  } finally {
    refreshing = false;
  }
}

function cardAction(card: Card, act: string): void {
  const tracking = card.tracking;
  if (act === 'remove') {
    if (confirm(`「${card.title}」をボードから削除しますか?`)) update((state) => removeBundle(state, card.id));
  } else if (act === 'ack' && tracking?.check != null) {
    const { profileKey, check } = tracking;
    update((state) => acknowledge(state, profileKey, check.checkedAt));
  } else if (act === 'schedule' && tracking !== null) {
    openInputDialog({
      title: `${tracking.site} の出勤表URL`,
      fields: [{ name: 'scheduleUrl', label: 'プロフィールと別ページの店だけ(空欄で解除)', type: 'url', value: tracking.scheduleUrl ?? '' }],
      onSubmit: (values) => {
        const input = (values['scheduleUrl'] ?? '').trim();
        // URLの検証は setScheduleUrl が行い、誤りはダイアログに出る
        update((state) => setScheduleUrl(state, tracking.site, input === '' ? null : input));
      },
    });
  }
}

function findCard(target: EventTarget | null): Card | undefined {
  const id = (target as HTMLElement | null)?.closest<HTMLElement>('.board-card')?.dataset['id'];
  return id === undefined ? undefined : cards().find((card) => card.id === id);
}

function pickJson(onText: (text: string) => void): void {
  pickFile('.json,application/json', guarded(async (file: File) => onText(await file.text())));
}

/** カードを見える位置に出し、段階の選択肢へフォーカスする */
function revealCard(id: string | undefined): HTMLElement | undefined {
  const node = [...boardNode.querySelectorAll<HTMLElement>('.board-card')].find((item) => item.dataset['id'] === id);
  node?.scrollIntoView({ block: 'center' });
  node?.querySelector<HTMLElement>('select')?.focus({ preventScroll: true });
  return node;
}

function targetsJson(): string {
  return JSON.stringify(buildTargets(visits.loadAll(), board.load(), new Date().toISOString()), null, 2);
}

function applyChecks(json: string | null): void {
  if (json === null) {
    toast('確認対象を書き出しました。確認結果はまだありません');
    return;
  }
  const { results } = parseChecksFile(json);
  update((state) => withChecks(state, results));
  const latest = results.reduce((max, result) => Math.max(max, Date.parse(result.checkedAt)), 0);
  toast(results.length === 0 ? '確認結果は0件です' : `${localDate(new Date(latest))} の確認結果を読み込みました`);
}

async function sync(): Promise<void> {
  let folder: Folder | null = await savedFolder();
  if (folder === null) folder = await pickFolder();
  await ensureAccess(folder);
  await writeText(folder, TARGETS_FILE, targetsJson());
  applyChecks(await readText(folder, CHECKS_FILE));
  await writeText(folder, BACKUP_FILE, board.exportRawJson());
}

function openBundleDialog(): void {
  dialog.innerHTML = bundleDialogHtml(visits.loadAll());
  dialog.showModal();
}

function submitBundle(form: HTMLFormElement): void {
  const data = new FormData(form);
  const kind = String(data.get('kind'));
  const title = String(data.get('title') ?? '').trim();
  if (!(BUNDLE_KINDS as readonly string[]).includes(kind) || title === '') throw new Error('種類とタイトルを入力してください');
  update((state) => upsertBundle(state, {
    id: crypto.randomUUID(),
    kind: kind as BundleKind,
    title,
    recordIds: data.getAll('recordIds').map(String),
    stage: 'answered',
    postedUrl: null,
    createdAt: new Date().toISOString(),
  }));
}

boardNode.addEventListener('change', guarded((event: Event) => {
  const select = event.target as HTMLSelectElement;
  if (select.dataset['act'] !== 'stage') return;
  const card = findCard(select);
  const stage = STAGES.find((item) => item === select.value);
  try {
    if (card !== undefined && stage !== undefined) moveCard(card, stage);
  } finally {
    // 取り消しや失敗のあと、選択肢を実際の段階へ戻す
    render();
  }
}));

boardNode.addEventListener('click', guarded((event: MouseEvent) => {
  const target = event.target as HTMLElement;
  const jump = target.closest<HTMLElement>('[data-jump]');
  if (jump !== null) {
    event.preventDefault();
    revealCard(jump.dataset['jump']);
    return;
  }
  const card = findCard(target);
  const angle = target.closest<HTMLElement>('button[data-angle]')?.dataset['angle'];
  if (angle !== undefined && card !== undefined) {
    const type = ANGLES.find((item) => item === angle);
    if (type === undefined) return;
    // 選択中をもう一度押すと未選択へ戻す
    update((state) => setArticleAngle(state, card.id, card.angle === type ? null : type));
    return;
  }
  const button = target.closest<HTMLElement>('button[data-act]');
  const act = button?.dataset['act'];
  if (act === 'copy-part' && button != null && card !== undefined) return copyDraftPart(card, button);
  if (act !== undefined && card !== undefined) cardAction(card, act);
}));

boardNode.addEventListener('dragstart', (event) => {
  const id = (event.target as HTMLElement).closest<HTMLElement>('.board-card')?.dataset['id'];
  if (id === undefined || event.dataTransfer === null) return;
  event.dataTransfer.setData('text/plain', id);
  event.dataTransfer.effectAllowed = 'move';
});
boardNode.addEventListener('dragover', (event) => {
  const column = (event.target as HTMLElement).closest<HTMLElement>('.column');
  if (column === null) return;
  event.preventDefault();
  for (const node of boardNode.querySelectorAll('.column.drop')) if (node !== column) node.classList.remove('drop');
  column.classList.add('drop');
});
boardNode.addEventListener('dragend', () => {
  for (const node of boardNode.querySelectorAll('.column.drop')) node.classList.remove('drop');
});
boardNode.addEventListener('drop', guarded((event: DragEvent) => {
  event.preventDefault();
  const stage = STAGES.find((item) => item === (event.target as HTMLElement).closest<HTMLElement>('.column')?.dataset['stage']);
  const id = event.dataTransfer?.getData('text/plain');
  const card = cards().find((item) => item.id === id);
  try {
    if (card !== undefined && stage !== undefined) moveCard(card, stage);
  } finally {
    render();
  }
}));

filterNode.addEventListener('click', (event) => {
  const kind = (event.target as HTMLElement).closest<HTMLElement>('[data-filter]')?.dataset['filter'];
  if (kind === undefined) return;
  const url = new URL(location.href);
  if (kind === 'all') url.searchParams.delete('kind');
  else url.searchParams.set('kind', kind);
  history.replaceState(null, '', url);
  render();
});

dialog.addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('[data-act="cancel"]') !== null) dialog.close();
});
dialog.addEventListener('submit', (event) => {
  // 入力に不備があるときはダイアログを閉じず、内容を残す
  event.preventDefault();
  guarded(() => {
    submitBundle(event.target as HTMLFormElement);
    dialog.close();
  })();
});

byId('add-bundle').addEventListener('click', guarded(openBundleDialog));
byId('export-board').addEventListener('click', guarded(() => downloadJson(`me-report-board-${localDate()}.json`, board.exportRawJson())));
byId('import-board').addEventListener('click', guarded(() => pickJson((text) => {
  const next = parseBoardState(text);
  if (!confirm('ボードの内容を置き換えますか?')) return;
  // 保存内容が壊れて読めないときの復旧手段でもあるため、現在の内容を読まずに置き換える
  board.save(next);
  render();
})));

const articlesButton = byId('articles');
articlesButton.hidden = !supported;
articlesButton.addEventListener('click', guarded(openArticles));
const pickArticlesButton = byId('pick-articles');
pickArticlesButton.hidden = !supported;
pickArticlesButton.addEventListener('click', guarded(pickArticles));

const syncButton = byId('sync');
const exportTargets = byId('export-targets');
const importChecks = byId('import-checks');
const pickFolderButton = byId('pick-folder');
syncButton.hidden = !supported;
pickFolderButton.hidden = !supported;
exportTargets.hidden = supported;
importChecks.hidden = supported;
syncButton.addEventListener('click', guarded(sync));
pickFolderButton.addEventListener('click', guarded(async () => {
  const folder = await pickFolder();
  toast(`受け渡しフォルダ: ${folder.name}`);
}));
exportTargets.addEventListener('click', guarded(() => downloadJson(TARGETS_FILE, targetsJson())));
importChecks.addEventListener('click', guarded(() => pickJson(applyChecks)));

// フォルダとデータの操作は折りたたんでおく。選んだあとや外を押したときは閉じる
const toolMenu = byId<HTMLDetailsElement>('tool-menu');
toolMenu.addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('.tool-menu-body button') !== null) toolMenu.open = false;
});
document.addEventListener('click', (event) => {
  if (toolMenu.open && !toolMenu.contains(event.target as Node)) toolMenu.open = false;
});
toolMenu.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !toolMenu.open) return;
  toolMenu.open = false;
  toolMenu.querySelector('summary')?.focus();
});

/** 入力画面から ?card=<回答ID> で開かれたら、そのカードを見える位置に出して目印を付ける */
function revealFromUrl(): void {
  const { value, rest } = takeParam(location.href, 'card');
  if (value === null) return;
  // 絞り込みで隠れないよう、すべて表示に戻す
  const { rest: unfiltered } = takeParam(rest, 'kind');
  history.replaceState(history.state, '', unfiltered);
  render();
  const node = revealCard(value);
  if (node === undefined) {
    toast('指定された回答のカードが見つかりません');
    return;
  }
  node.classList.add('revealed');
  node.addEventListener('animationend', () => node.classList.remove('revealed'), { once: true });
}

// 入力画面からのリンクがこのタブを使い回せるようにする
window.name = BOARD_WINDOW;
window.addEventListener('storage', render);
render();
revealFromUrl();
if (supported) {
  const refresh = guarded(refreshDrafts);
  refresh();
  // Claude Code で書き出したあとボードへ戻ったときに反映する
  window.addEventListener('focus', refresh);
}
