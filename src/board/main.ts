import { VisitStore } from '../storage';
import { parseChecksFile } from '../checks/files';
import { localDate } from '../date';
import { ARTICLE_DIR, openClaudeApp } from '../local-setup';
import { BOARD_WINDOW, bindPageSwitch, takeParam } from '../links';
import { isPublished, parsePostedUrlInput } from '../prompt/publication';
import { buildMatomePrompt } from '../prompt/build-prompt';
import { REVISIT_CYCLE, buildArticlePrompt } from '../prompt/article-prompt';
import { defaultListingCheckDate, needsLookup } from '../identity-lookup';
import type { VisitRecord } from '../types';
import { toast, tryCopyText } from '../ui/widgets';
import { downloadJson, pickFile } from '../ui/file-io';
import { errText } from '../guards';
import { openInputDialog } from '../ui/input-dialog';
import { openHandoffUpdate } from '../ui/handoff-import';
import { watchForUpdate } from '../update-watch';
import { ARTICLE_PARTS, VARIANT_DIRS } from '../prompt/article-files';
import { buildMarkupPrompt } from '../prompt/markup-prompt';
import { DISCLOSURE_LABELS, type NameDisclosure } from '../prompt/style-profile';
import { advanceDrafted, markupState, type ArticleDraft } from './articles';
import { openArticleEditor } from './article-editor';
import { scanAnswerFiles, type AnswerScan, type IncomingAnswer } from './answer-sync';
import { buildCards, buildTargets, type Card } from './cards';
import {
  fetchAnswerFiles, fetchArticlePart, fetchCheckFile, fetchDrafts, localDataAvailable, putArticlePart, putCheckFile, runWeeklyCheck,
} from './local-api';
import {
  BoardStore, acknowledge, markBundlePrompted, markPrompted, parseBoardState, removeBundle, setRecordStage, setArticleAngle,
  setScheduleUrl, upsertBundle, withChecks, BUNDLE_KINDS, ANGLES, STAGES, type BoardState, type BundleKind, type Stage,
} from './state';
import { KIND_FILTERS, boardHtml, bundleDialogHtml, filterHtml, type InboxView, type KindFilter } from './view';
import '../styles.css';
import './board.css';

/** id で要素を引く。起動時に必ずある要素なので、なければ例外にする */
function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`#${id} が見つかりません`);
  return node as T;
}

const boardNode = byId('board');
const filterNode = byId('kind-filter');
const dialog = byId<HTMLDialogElement>('bundle-dialog');
const articleDialog = byId<HTMLDialogElement>('article-dialog');
const syncButton = byId<HTMLButtonElement>('sync');

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

function currentFilter(): KindFilter {
  const kind = new URLSearchParams(location.search).get('kind') ?? 'all';
  return KIND_FILTERS.find((item) => item === kind) ?? 'all';
}

/** data/articles から読んだ原稿。保存はせず、読み直すたびに作り直す */
let drafts: ReadonlyMap<string, ArticleDraft> = new Map();
/** data/answers にあって、まだボードに取り込んでいない回答 */
let answers: AnswerScan = { incoming: [], errors: [] };
/** data/ に届かないときの理由。start.bat 以外で開いたときなど */
let localError: string | null = null;

function cards(): Card[] {
  return buildCards(visits.loadAll(), board.load(), new Date(), drafts);
}

function inboxView(): InboxView {
  const saved = new Set(visits.loadAll().map((record) => record.id));
  return {
    answers: answers.incoming.map(({ record }) => ({
      label: `${record.basic.shopName} — ${record.basic.therapistName}`,
      update: saved.has(record.id),
    })),
    errors: [...(localError === null ? [] : [localError]), ...answers.errors],
  };
}

function render(): void {
  try {
    const filter = currentFilter();
    filterNode.innerHTML = filterHtml(filter);
    boardNode.innerHTML = boardHtml(cards(), filter, inboxView());
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
      const url = parsePostedUrlInput(values.text('postedUrl'));
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

const disclosureOf = (value: string | undefined): NameDisclosure | undefined =>
  (Object.keys(VARIANT_DIRS) as NameDisclosure[]).find((item) => item === value);

async function copyDraftPart(card: Card, button: HTMLElement): Promise<void> {
  const disclosure = disclosureOf(button.dataset['disclosure']);
  const part = ARTICLE_PARTS.find((item) => item.id === button.dataset['part']);
  if (card.draft === null || disclosure === undefined || part === undefined) return;
  const { text } = await fetchArticlePart(card.draft, disclosure, part.id);
  const copied = await tryCopyText(text, `${part.label}をコピーしました`);
  button.classList.toggle('copied', copied);
}

/** マークアップの依頼をコピーして Claude を開く。Claude Code が素の文章を読み、HTMLを書き出す */
async function requestMarkup(draft: ArticleDraft, disclosure: NameDisclosure): Promise<void> {
  if (ARTICLE_DIR === null) throw new Error('start.bat で開いたボードから使ってください');
  const copied = await tryCopyText(
    buildMarkupPrompt(ARTICLE_DIR, draft.folderName, disclosure), 'マークアップの依頼をコピーしました。Claude に貼ってください');
  if (copied) openClaudeApp();
}

/** 開いている原稿の画面。data/ を読み直したら、HTMLの状態の表示を合わせる */
let editor: { refresh: () => void } | null = null;
let openingEditor = false;

async function openEditor(card: Card, disclosure: NameDisclosure): Promise<void> {
  const draft = card.draft;
  const variant = draft?.variants.find((item) => item.disclosure === disclosure);
  if (draft === null || variant === undefined || articleDialog.open || openingEditor) return;
  openingEditor = true;
  try {
    const latest = () => drafts.get(draft.recordId)?.variants.find((item) => item.disclosure === disclosure) ?? variant;
    editor = await openArticleEditor(articleDialog, {
      heading: `${card.title} · ${DISCLOSURE_LABELS[disclosure]}`,
      exists: (part) => latest().parts.includes(part),
      fetchPart: (part) => fetchArticlePart(draft, disclosure, part),
      savePart: (part, text, base) => putArticlePart(draft, disclosure, part, text, base),
      markup: () => markupState(latest()),
      requestMarkup: () => requestMarkup(draft, disclosure),
      onSaved: refresh,
    });
    articleDialog.addEventListener('close', () => { editor = null; }, { once: true });
  } finally {
    openingEditor = false;
  }
}

/** 出勤確認日を尋ねて記事プロンプトをコピーする。Claude Code は原稿を data/articles へ書き出す */
function copyArticlePrompt(card: Card, disclosure: NameDisclosure): void {
  const record = visits.get(card.id);
  if (record === undefined) throw new Error('回答が見つかりません。画面を読み込み直してください');
  openInputDialog({
    title: '出勤確認日',
    fields: [{ name: 'listingCheckedOn', label: '店舗HPの出勤表で確かめた日(空欄なら記事に書かない)', type: 'date', value: defaultListingCheckDate(record) }],
    onSubmit: (values) => {
      let prompt;
      try {
        prompt = buildArticlePrompt(record, visits.loadAll(), disclosure, values.text('listingCheckedOn'), ARTICLE_DIR);
      } catch (error) {
        // 日付の誤りはダイアログに残して直せるようにし、再訪の循環はトーストで知らせる
        if (error instanceof Error && error.message === REVISIT_CYCLE) {
          toast(error.message);
          return;
        }
        throw error;
      }
      if (prompt.notice !== null) toast(prompt.notice);
      const done = needsLookup(record) ? 'コピーしました。返答を入力画面の「店舗情報を取得」に貼ると記録にも反映されます' : undefined;
      void tryCopyText(prompt.text, done).then((copied) => {
        if (!copied) return;
        if (!isPublished(record)) update((state) => markPrompted(state, record.id));
        if (ARTICLE_DIR !== null) openClaudeApp();
      }).catch((error: unknown) => toast(errText(error)));
    },
  });
}

/** まとめのテーマはカードのタイトル。コピーできたら「プロンプト出力」へ進める */
async function copyMatomePrompt(card: Card): Promise<void> {
  const bundle = board.load().bundles.find((item) => item.id === card.id);
  if (bundle === undefined) throw new Error('記事が見つかりません。画面を読み込み直してください');
  const records = visits.loadAll();
  const targets = bundle.recordIds.map((id) => records.find((record) => record.id === id));
  if (targets.some((record) => record === undefined)) {
    throw new Error('対象の回答が見つかりません。削除されたか、別の端末の回答です');
  }
  // コピーの許可を保つため、プロンプトを作ってすぐコピーする
  const copied = await tryCopyText(buildMatomePrompt(targets as VisitRecord[], bundle.title, records));
  if (!copied) return;
  update((state) => markBundlePrompted(state, bundle.id));
  if (ARTICLE_DIR !== null) openClaudeApp();
}

/** 原稿がある回答を「推敲中」へ進める */
function advanceWithDrafts(): void {
  const stages = new Map(cards().map((card) => [card.id, card.stage]));
  const before = board.load();
  const after = advanceDrafted(before, drafts, (id) => stages.get(id));
  if (after !== before) board.save(after);
}

let refreshing = false;
// 保存直後の依頼を捨てると古いHTMLの状態が残るため、進行中の読み直しのあとに一度まとめて実行する。
let refreshAgain = false;

/** data/ から読んだものと、それで動くボードの段階 */
function localSnapshot(): string {
  return JSON.stringify([[...drafts.values()], answers, localError, board.load().stages]);
}

/** data/ の原稿と回答を読み直す。起動時と、Claude などからボードへ戻ったときに呼ぶ */
async function refreshLocal(): Promise<void> {
  // 取り込み中は途中の状態を描かず、終わってから読み直す。
  if (importing) return;
  if (refreshing) {
    refreshAgain = true;
    return;
  }
  refreshing = true;
  const before = localSnapshot();
  try {
    if (await localDataAvailable()) {
      const [nextDrafts, files] = await Promise.all([fetchDrafts(), fetchAnswerFiles()]);
      localError = null;
      drafts = nextDrafts;
      answers = scanAnswerFiles(visits.loadAll(), files);
      advanceWithDrafts();
    } else {
      localError = 'data/ フォルダに届きません。start.bat で開いたボードから使ってください';
      drafts = new Map();
      answers = { incoming: [], errors: [] };
    }
  } catch (error) {
    localError = errText(error);
  } finally {
    refreshing = false;
  }
  // 変わっていなければ描き直さない。カードの目印や開いた選択肢を消さないため
  if (localSnapshot() !== before) {
    render();
    editor?.refresh();
  }
  if (refreshAgain) {
    refreshAgain = false;
    await refreshLocal();
  }
}

/**
 * 再訪元を先に入れないと参照を確かめられないので、再訪元が先に来るよう並べる。2回目・3回目と続く再訪にも対応する。
 * 再訪元が取り込み対象にないもの(ボードにある、またはどこにもない)は、そのまま取り込みで確かめる
 */
function revisitOrder(items: readonly IncomingAnswer[]): IncomingAnswer[] {
  const ids = new Set(items.map((item) => item.record.id));
  const placed = new Set<string>();
  const ordered: IncomingAnswer[] = [];
  let rest = [...items];
  while (rest.length > 0) {
    const ready = rest.filter(({ record }) =>
      record.revisitOf === null || !ids.has(record.revisitOf) || placed.has(record.revisitOf));
    // 参照が輪になっている残りは、取り込みで理由を知らせる
    const next = ready.length === 0 ? rest : ready;
    for (const item of next) placed.add(item.record.id);
    ordered.push(...next);
    rest = rest.filter((item) => !next.includes(item));
  }
  return ordered;
}

/** 更新の確認ダイアログを開き、閉じるまで待つ。更新したら true */
function confirmUpdate(json: string): Promise<boolean> {
  const plan = visits.prepareHandoffImport(json);
  if (plan.kind !== 'update') return Promise.resolve(false);
  return new Promise((resolve) => {
    let applied = false;
    openHandoffUpdate(plan, () => {
      visits.importHandoffJson(json, plan.snapshot);
      applied = true;
      return true;
    });
    const opened = document.querySelector<HTMLDialogElement>('.handoff-dialog');
    if (opened === null) resolve(false);
    else opened.addEventListener('close', () => resolve(applied), { once: true });
  });
}

let importing = false;

/**
 * 新しい回答はそのまま足し、既存の回答の更新は差分を見せて確かめる。
 * 通し番号はPCの管理用なので、重なればボード側の次の番号で足し、振り直したことを知らせる
 */
async function importAnswers(): Promise<void> {
  if (importing) return;
  importing = true;
  let added = 0;
  let updated = 0;
  const renumbered: string[] = [];
  const failed: string[] = [];
  try {
    for (const answer of revisitOrder(answers.incoming)) {
      // 1件が取り込めなくても残りは続け、理由をまとめて知らせる
      try {
        const plan = visits.prepareHandoffImport(answer.json);
        if (plan.kind === 'update') {
          if (await confirmUpdate(answer.json)) updated += 1;
          continue;
        }
        if (plan.kind !== 'add') continue;
        visits.importHandoffJson(answer.json, plan.snapshot);
        added += 1;
        if (plan.renumberedFrom !== null) renumbered.push(`${plan.record.basic.therapistName} は #${plan.record.seriesNo}`);
      } catch (error) {
        failed.push(`${answer.record.basic.therapistName}: ${errText(error)}`);
      }
    }
  } finally {
    importing = false;
    await refreshLocal();
  }
  const parts = [added > 0 ? `${added}件追加` : '', updated > 0 ? `${updated}件更新` : ''].filter((part) => part !== '');
  toast(parts.length === 0 ? '取り込んだ回答はありません' : `回答を${parts.join('・')}しました${
    renumbered.length === 0 ? '' : `(番号が重なったため ${renumbered.join('、')})`}`);
  if (failed.length > 0) toast(`取り込めなかった回答: ${failed.join(' / ')}`);
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
        const input = values.text('scheduleUrl').trim();
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
    toast('確認結果がまだありません');
    return;
  }
  const { results } = parseChecksFile(json);
  update((state) => withChecks(state, results));
  const latest = results.reduce((max, result) => Math.max(max, Date.parse(result.checkedAt)), 0);
  toast(results.length === 0 ? '確認結果は0件です' : `${localDate(new Date(latest))} の確認結果を読み込みました`);
}

let checking = false;

/** 確認対象を書き出して週次確認を実行し、結果を取り込む。最後にボードの控えを残す */
async function sync(): Promise<void> {
  if (checking) return;
  checking = true;
  syncButton.disabled = true;
  syncButton.textContent = '確認中…';
  try {
    await putCheckFile('targets.json', targetsJson());
    await runWeeklyCheck();
    applyChecks(await fetchCheckFile('checks.json'));
    await putCheckFile('board-backup.json', board.exportRawJson());
  } finally {
    checking = false;
    syncButton.disabled = false;
    syncButton.textContent = '週次確認';
  }
}

function openBundleDialog(): void {
  dialog.innerHTML = bundleDialogHtml(visits.loadAll());
  dialog.showModal();
}

/** まとめの対象は投稿済みの回答だけ。カタログでは未投稿も選べる */
function syncBundleChoices(form: HTMLFormElement): void {
  const matome = form.querySelector<HTMLSelectElement>('select[name="kind"]')?.value === 'matome';
  for (const box of form.querySelectorAll<HTMLInputElement>('input[name="recordIds"]')) {
    const locked = matome && box.dataset['published'] !== 'true';
    box.disabled = locked;
    if (locked) box.checked = false;
  }
}

function submitBundle(form: HTMLFormElement): void {
  const data = new FormData(form);
  const kind = String(data.get('kind'));
  const title = String(data.get('title') ?? '').trim();
  if (!(BUNDLE_KINDS as readonly string[]).includes(kind) || title === '') throw new Error('種類とタイトルを入力してください');
  const recordIds = data.getAll('recordIds').map(String);
  if (kind === 'matome') {
    // ダイアログを開いたあとに別の画面で投稿URLが外れた場合に備え、保存の直前にも確かめる
    const records = visits.loadAll();
    const unpublished = recordIds.some((id) => !records.some((record) => record.id === id && isPublished(record)));
    if (unpublished) throw new Error('まとめ記事の対象には投稿済みの記事を選んでください');
  }
  update((state) => upsertBundle(state, {
    id: crypto.randomUUID(),
    kind: kind as BundleKind,
    title,
    recordIds,
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
  if (act === 'import-answers') return importAnswers();
  if (button == null || card === undefined) return;
  if (act === 'copy-part') return copyDraftPart(card, button);
  if (act === 'read' || act === 'markup') {
    const disclosure = disclosureOf(button.dataset['disclosure']);
    if (disclosure === undefined || card.draft === null) return;
    return act === 'read' ? openEditor(card, disclosure) : requestMarkup(card.draft, disclosure);
  }
  if (act === 'matome-prompt') return copyMatomePrompt(card);
  if (act === 'prompt') {
    const disclosure = disclosureOf(button.dataset['disclosure']);
    if (disclosure !== undefined) copyArticlePrompt(card, disclosure);
    return;
  }
  if (act !== undefined) cardAction(card, act);
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
dialog.addEventListener('change', (event) => {
  const target = event.target as HTMLElement;
  if (target instanceof HTMLSelectElement && target.name === 'kind' && target.form !== null) syncBundleChoices(target.form);
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
syncButton.addEventListener('click', guarded(sync));

// データの操作は折りたたんでおく。選んだあとや外を押したときは閉じる
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
bindPageSwitch(document);
window.addEventListener('storage', render);
const refresh = guarded(refreshLocal);
render();
revealFromUrl();
refresh();
// Claude Code で原稿を書き出したり、Slack の回答を data/answers へ保存したりしてからボードへ戻ったときに反映する
window.addEventListener('focus', refresh);

/** 記事の追加や値の入力のダイアログが開いているか。ボードの未保存の入力はここにしかない */
function editing(): boolean {
  return dialog.open || articleDialog.open || document.querySelector('dialog.input-dialog, dialog.handoff-dialog') !== null;
}

// 開いたままのボードも新しい版に気づけるようにする。開発サーバーとテストには version.json がないため、公開ビルドだけで確認する
if (!import.meta.env.DEV) {
  watchForUpdate({
    isBusy: editing,
    confirmLeave: () => !editing() || confirm('入力中の内容を破棄しますか?'),
    onLeave: () => undefined,
    onError: (error) => toast(errText(error)),
  });
}
