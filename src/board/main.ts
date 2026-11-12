import { VisitStore } from '../storage';
import { parseChecksFile } from '../checks/files';
import { localDate } from '../date';
import { BOARD_WINDOW, takeParam } from '../links';
import { isWakustArticleUrl } from '../prompt/publication';
import { toast } from '../ui/widgets';
import { buildCards, buildTargets, type Card } from './cards';
import { ensureAccess, folderSupported, pickFolder, readText, savedFolder, writeText, type Folder } from './folder';
import {
  BoardStore, acknowledge, parseBoardState, removeBundle, setRecordStage, setArticleAngle, setScheduleUrl, upsertBundle,
  withChecks, BUNDLE_KINDS, ANGLES, STAGES, type BoardState, type BundleKind, type Stage,
} from './state';
import { boardHtml, bundleDialogHtml, filterHtml, type KindFilter } from './view';
import '../styles.css';
import './board.css';

const TARGETS_FILE = 'targets.json';
const CHECKS_FILE = 'checks.json';
const BACKUP_FILE = 'board-backup.json';
const FILTERS: readonly string[] = ['all', 'single', 'revisit', 'matome', 'catalog'];

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`#${id} が見つかりません`);
  return node as T;
}

const boardNode = element('board');
const filterNode = element('kind-filter');
const dialog = element<HTMLDialogElement>('bundle-dialog');

const kv = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};
const visits = new VisitStore(kv);
const board = new BoardStore(kv);

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 利用者の操作から呼ぶ処理を包み、失敗を画面に出す */
function guarded<A extends unknown[]>(action: (...args: A) => void | Promise<void>): (...args: A) => void {
  return (...args) => {
    void (async () => action(...args))().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      toast(errText(error));
    });
  };
}

function currentFilter(): KindFilter {
  const kind = new URLSearchParams(location.search).get('kind') ?? 'all';
  return FILTERS.includes(kind) ? kind as KindFilter : 'all';
}

function cards(): Card[] {
  return buildCards(visits.loadAll(), board.load(), new Date());
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

function askPostedUrl(current: string | null): string | null {
  const input = prompt('wakust投稿後の記事URL', current ?? '');
  if (input === null) return null;
  const url = input.trim();
  if (!isWakustArticleUrl(url)) throw new Error('wakust記事URLが必要です');
  return url;
}

function moveCard(card: Card, stage: Stage): void {
  if (card.stage === stage) return;
  if (card.source === 'record') {
    const record = visits.get(card.id);
    if (record === undefined) throw new Error('回答が見つかりません。画面を読み込み直してください');
    if (card.stage === 'posted') throw new Error('投稿済みの回答は、入力画面の「投稿URL」を空にすると戻せます');
    if (stage === 'posted') {
      const postedUrl = askPostedUrl(null);
      if (postedUrl === null) return;
      visits.save({ ...record, postedUrl, updatedAt: new Date().toISOString() });
      update((state) => setRecordStage(state, card.id, 'answered'));
      return;
    }
    update((state) => setRecordStage(state, card.id, stage));
    return;
  }
  const bundle = board.load().bundles.find((item) => item.id === card.id);
  if (bundle === undefined) throw new Error('記事が見つかりません。画面を読み込み直してください');
  if (stage === 'posted') {
    const postedUrl = askPostedUrl(bundle.postedUrl);
    if (postedUrl !== null) update((state) => upsertBundle(state, { ...bundle, postedUrl }));
    return;
  }
  if (bundle.postedUrl !== null && !confirm('投稿URLを外して戻しますか?')) return;
  update((state) => upsertBundle(state, { ...bundle, stage, postedUrl: null }));
}

function cardAction(card: Card, act: string): void {
  const tracking = card.tracking;
  if (act === 'remove') {
    if (confirm(`「${card.title}」をボードから削除しますか?`)) update((state) => removeBundle(state, card.id));
  } else if (act === 'ack' && tracking?.check != null) {
    const { profileKey, check } = tracking;
    update((state) => acknowledge(state, profileKey, check.checkedAt));
  } else if (act === 'schedule' && tracking !== null) {
    const input = prompt(`${tracking.site} の出勤表URL(プロフィールと別ページの店だけ。空欄で解除)`, tracking.scheduleUrl ?? '');
    if (input === null) return;
    update((state) => setScheduleUrl(state, tracking.site, input.trim() === '' ? null : input.trim()));
  }
}

function findCard(target: EventTarget | null): Card | undefined {
  const id = (target as HTMLElement | null)?.closest<HTMLElement>('.board-card')?.dataset['id'];
  return id === undefined ? undefined : cards().find((card) => card.id === id);
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  try {
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pickJson(onText: (text: string) => void): void {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', guarded(async () => {
    const file = input.files?.[0];
    if (file !== undefined) onText(await file.text());
  }));
  input.click();
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
    const card = [...boardNode.querySelectorAll<HTMLElement>('.board-card')].find((node) => node.dataset['id'] === jump.dataset['jump']);
    card?.scrollIntoView({ block: 'center' });
    card?.querySelector<HTMLElement>('select')?.focus();
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
  const act = target.closest<HTMLElement>('button[data-act]')?.dataset['act'];
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

element('add-bundle').addEventListener('click', guarded(openBundleDialog));
element('export-board').addEventListener('click', guarded(() => download(`me-report-board-${localDate()}.json`, board.exportRawJson())));
element('import-board').addEventListener('click', guarded(() => pickJson((text) => {
  const next = parseBoardState(text);
  if (!confirm('ボードの内容を置き換えますか?')) return;
  // 保存内容が壊れて読めないときの復旧手段でもあるため、現在の内容を読まずに置き換える
  board.save(next);
  render();
})));

const syncButton = element('sync');
const exportTargets = element('export-targets');
const importChecks = element('import-checks');
const pickFolderButton = element('pick-folder');
const supported = folderSupported();
syncButton.hidden = !supported;
pickFolderButton.hidden = !supported;
exportTargets.hidden = supported;
importChecks.hidden = supported;
syncButton.addEventListener('click', guarded(sync));
pickFolderButton.addEventListener('click', guarded(async () => {
  const folder = await pickFolder();
  toast(`受け渡しフォルダ: ${folder.name}`);
}));
exportTargets.addEventListener('click', guarded(() => download(TARGETS_FILE, targetsJson())));
importChecks.addEventListener('click', guarded(() => pickJson(applyChecks)));

/** 入力画面から ?card=<回答ID> で開かれたら、そのカードを見える位置に出して目印を付ける */
function revealFromUrl(): void {
  const { value, rest } = takeParam(location.href, 'card');
  if (value === null) return;
  // 絞り込みで隠れないよう、すべて表示に戻す
  const { rest: unfiltered } = takeParam(rest, 'kind');
  history.replaceState(history.state, '', unfiltered);
  render();
  const node = [...boardNode.querySelectorAll<HTMLElement>('.board-card')].find((item) => item.dataset['id'] === value);
  if (node === undefined) {
    toast('指定された回答のカードが見つかりません');
    return;
  }
  node.scrollIntoView({ block: 'center' });
  node.querySelector<HTMLElement>('select')?.focus({ preventScroll: true });
  node.classList.add('revealed');
  node.addEventListener('animationend', () => node.classList.remove('revealed'), { once: true });
}

// 入力画面からのリンクがこのタブを使い回せるようにする
window.name = BOARD_WINDOW;
window.addEventListener('storage', render);
render();
revealFromUrl();
