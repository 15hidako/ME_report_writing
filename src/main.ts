import type { VisitRecord } from './types';
import { VisitStore } from './storage';
import { renderForm, collectRecord, bindCourseFields, bindOptionFields, bindLocationFields } from './ui/form';
import { bindChips, bindStars, toast, tryCopyText } from './ui/widgets';
import { bindNoteSuggestions } from './ui/questionnaire-candidates';
import { bindIdentityAutofill } from './ui/identity-autofill';
import { openIdentityLookup } from './ui/identity-lookup';
import { buildLookupPrompt, defaultListingCheckDate, lookupTargets, needsLookup, parseLookupResponse, planLookup } from './identity-lookup';
import { shareRecord, shareErrorMessage } from './share';
import { FormValidationError, validateVisitForm } from './form-validation';
import { bindFormFeedback, type FormFeedback } from './ui/form-feedback';
import { buildCatalogPrompt, buildMatomePrompt, buildRevisitPrompt, buildSinglePrompt } from './prompt/build-prompt';
import type { NameDisclosure } from './prompt/build-prompt';
import { SUMMARY_MIN_THERAPISTS, countPublishedTherapists, isPublished, parsePostedUrlInput } from './prompt/publication';
import { seriesTargets } from './prompt/series';
import { findOriginalRecord as findOriginalIn } from './revisit';
import { watchForUpdate } from './update-watch';
import { bindDataButtons as bindDataButtonsWith, canRestoreBackup, dataButtonsHtml } from './ui/data-buttons';
import { renderListTab as renderListTabInto } from './ui/list-tab';
import { renderThumbTab as renderThumbTabInto } from './ui/thumb-tab';
import { INPUT_WINDOW, boardLinkHtml, takeParam } from './links';
import { articleSaveSection } from './prompt/article-files';
import { ARTICLE_DIR, ARTICLE_DIR_ERROR, openClaudeApp } from './local-setup';
import { BoardStore, markPrompted } from './board/state';
import './styles.css';

const appNode = document.getElementById('app');
if (appNode === null) throw new Error('#app が見つかりません');
const app: HTMLElement = appNode;

type Tab = 'form' | 'list' | 'thumb';

interface Draft {
  node: HTMLElement;
  editingId: string | null;
  revisitOfId: string | null;
  dirty: boolean;
  id: string | null;
  seriesNo: number | null;
  createdAt: string | null;
  revisitOf: string | null;
  savedSnapshot: string | null;
  sharing: boolean;
}

let currentTab: Tab = 'list';
let editingId: string | null = null;
let revisitOfId: string | null = null;
let formCache: Draft | null = null;
let store: VisitStore | undefined;

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const kv = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};

function getStore(): VisitStore {
  if (store !== undefined) return store;
  store = new VisitStore(kv);
  return store;
}

function clearContext(): void {
  formCache?.node.remove();
  formCache = null;
  editingId = null;
  revisitOfId = null;
}

function confirmDiscardDraft(): boolean {
  if (formCache === null || !formCache.dirty) return true;
  return confirm('入力中の内容を破棄しますか?');
}

/** このPCの設定があるときは、コピーのあと Claude アプリを開いて貼り付けるだけにする */
function copyGenerated(text: string, done?: string, onCopied?: () => void): void {
  void tryCopyText(text, done)
    .then((copied) => {
      if (!copied) return;
      onCopied?.();
      if (ARTICLE_DIR !== null) openClaudeApp();
    })
    .catch((err: unknown) => toast(errText(err)));
}

/** 記事プロンプトを出した回答を、ボードの「プロンプト出力」へ進める。失敗してもコピーは成功のままにし、理由だけ知らせる */
function markPromptedOnBoard(record: VisitRecord): void {
  if (isPublished(record)) return;
  try {
    const board = new BoardStore(kv);
    const before = board.load();
    const after = markPrompted(before, record.id);
    if (after !== before) board.save(after);
  } catch (err) {
    toast(errText(err));
  }
}

/** 記事プロンプトに店舗情報の確認を入れたときは、返答の貼り先を知らせる */
function copyArticlePrompt(record: VisitRecord, disclosure: NameDisclosure, text: string): void {
  const full = ARTICLE_DIR === null ? text : `${text}\n\n${articleSaveSection(ARTICLE_DIR, record, disclosure)}`;
  copyGenerated(full, needsLookup(record)
    ? 'コピーしました。返答を「店舗情報を取得」に貼ると記録にも反映されます'
    : undefined, () => markPromptedOnBoard(record));
}

function bindDataButtons(): void {
  bindDataButtonsWith({ getStore, confirmDiscardDraft, clearContext, render });
}

function openLookup(targets: readonly VisitRecord[]): void {
  const db = getStore();
  let raw = '';
  openIdentityLookup({
    targets,
    copyPrompt: () => copyGenerated(buildLookupPrompt(targets)),
    plan: (response) => {
      raw = db.exportRawJson();
      return planLookup(db.loadAll(), parseLookupResponse(response), new Date().toISOString());
    },
    apply: (plan) => {
      if (!confirmDiscardDraft()) return false;
      db.saveMany(plan.updates.map((update) => update.record), raw);
      clearContext();
      toast(`${plan.updates.length}件の店舗情報を保存しました`);
      render();
      return true;
    },
  });
}

function openContext(nextEdit: string | null, nextRevisit: string | null, replaceSameNew = false): void {
  const same = formCache !== null
    && formCache.editingId === nextEdit
    && formCache.revisitOfId === nextRevisit;
  const latest = same && nextEdit !== null ? getStore().get(nextEdit) : undefined;
  const changed = latest !== undefined && formCache?.savedSnapshot !== editingSnapshot(latest);
  if (same && !changed && !(replaceSameNew && formCache?.dirty === true)) {
    switchTab('form');
    return;
  }
  if (!confirmDiscardDraft()) return;
  clearContext();
  editingId = nextEdit;
  revisitOfId = nextRevisit;
  switchTab('form');
}

function editingSnapshot(record: VisitRecord): string {
  return JSON.stringify({ ...record, updatedAt: '', postedUrl: null }, (_key, value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
  });
}

function submitForm(event: SubmitEvent, draft: Draft, feedback: FormFeedback): void {
  event.preventDefault();
  if (draft.sharing) return;
  try {
    const db = getStore();
    const latest = draft.editingId === null ? undefined : db.get(draft.editingId);
    if (draft.editingId !== null && latest === undefined) {
      toast('編集中のレコードは削除されています');
      clearContext();
      switchTab('list');
      return;
    }
    const shareRequested = event.submitter instanceof HTMLButtonElement && event.submitter.name === 'save-share';
    const reuseSaved = shareRequested && !draft.dirty && latest !== undefined;
    if (!reuseSaved && latest !== undefined && draft.savedSnapshot !== editingSnapshot(latest)) {
      throw new Error('別の画面で回答が変更されています。入力内容を控えてから、履歴の編集で開き直してください');
    }
    const collected = collectRecord(draft.node, {
      id: draft.id ?? crypto.randomUUID(),
      seriesNo: draft.seriesNo ?? db.nextSeriesNo(),
      createdAt: draft.createdAt ?? new Date().toISOString(),
      revisitOf: draft.revisitOf,
      postedUrl: latest?.postedUrl ?? null,
      identityLookup: latest?.basic.identityLookup,
    });
    const record = reuseSaved ? latest : collected;
    feedback.clear();
    if (!reuseSaved) {
      db.save(record);
      draft.savedSnapshot = editingSnapshot(record);
    }
    if (shareRequested) {
      draft.id = record.id;
      draft.seriesNo = record.seriesNo;
      draft.createdAt = record.createdAt;
      draft.editingId = record.id;
      draft.revisitOfId = null;
      draft.dirty = false;
      editingId = record.id;
      revisitOfId = null;
      const mode = draft.node.querySelector<HTMLElement>('.form-mode');
      if (mode !== null) mode.textContent = `編集中: #${record.seriesNo}`;
      if (draft.node.querySelector('a.to-board') === null) mode?.insertAdjacentHTML('afterend', boardLinkHtml(record.id));
      shareSavedRecord(record, draft);
      return;
    }
    clearContext();
    toast(`#${record.seriesNo} を保存しました`);
    switchTab('list');
  } catch (err) {
    if (err instanceof FormValidationError) feedback.show(err.issues);
    else feedback.showGeneral(errText(err));
  }
}

function shareSavedRecord(record: VisitRecord, draft: Draft): void {
  const status = draft.node.querySelector<HTMLElement>('#save-share-status');
  if (status === null) throw new Error('保存と共有の状態表示が見つかりません');
  const savedMessage = `#${record.seriesNo} は保存済みです。`;
  try {
    const result = shareRecord(record);
    draft.sharing = true;
    const buttons = [...draft.node.querySelectorAll<HTMLButtonElement>('button[type="submit"]')];
    for (const button of buttons) button.disabled = true;
    status.textContent = `${savedMessage}共有画面でSlackと宛先を選んでください。`;
    void result.then(() => {
      status.textContent = `${savedMessage}共有先に渡しました。投稿はSlackで確認してください。`;
    }).catch((error: unknown) => {
      status.textContent = `${savedMessage}${shareErrorMessage(error)}`;
    }).finally(() => {
      draft.sharing = false;
      for (const button of buttons) button.disabled = false;
    });
  } catch (error) {
    status.textContent = `${savedMessage}${shareErrorMessage(error)}`;
  }
}

function mountForm(): void {
  const db = getStore();
  const editing = editingId === null ? null : db.get(editingId) ?? null;
  if (editingId !== null && editing === null) {
    toast('編集中のレコードは削除されています');
    clearContext();
    currentTab = 'list';
    renderListTab();
    return;
  }
  const revisitOf = revisitOfId === null ? null : db.get(revisitOfId) ?? null;
  const node = document.createElement('div');
  node.innerHTML = renderForm(editing, revisitOf);
  const form = node.querySelector<HTMLFormElement>('#visit-form');
  if (form === null) throw new Error('#visit-form が見つかりません');
  const draft: Draft = {
    node,
    editingId,
    revisitOfId,
    dirty: false,
    id: editing?.id ?? null,
    seriesNo: editing?.seriesNo ?? null,
    createdAt: editing?.createdAt ?? null,
    revisitOf: editing?.revisitOf ?? revisitOf?.id ?? null,
    savedSnapshot: editing === null ? null : editingSnapshot(editing),
    sharing: false,
  };
  const markDirty = (): void => {
    draft.dirty = true;
  };
  bindLocationFields(form, markDirty);
  bindCourseFields(form, markDirty);
  bindOptionFields(form, markDirty);
  bindStars(form, markDirty);
  bindChips(form, markDirty);
  bindNoteSuggestions(form);
  bindIdentityAutofill(form, db.loadAll(), editing?.id ?? null);
  const feedback = bindFormFeedback(form, () => validateVisitForm(form));
  form.addEventListener('input', markDirty);
  form.addEventListener('submit', (event) => submitForm(event, draft, feedback));
  formCache = draft;
  app.replaceChildren(node);
}

function switchTab(tab: Tab): void {
  currentTab = tab;
  document.querySelectorAll('nav button').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
  render();
}

function renderRecovery(message: string): void {
  formCache?.node.remove();
  const note = document.createElement('p');
  note.className = 'empty';
  note.textContent = message;
  const bar = document.createElement('div');
  bar.className = 'toolbar';
  bar.innerHTML = dataButtonsHtml({ handoff: false, canRestore: canRestoreBackup(getStore) });
  app.replaceChildren(note, bar);
  bindDataButtons();
}

function render(): void {
  try {
    const reuse = currentTab === 'form'
      && formCache !== null
      && formCache.node.isConnected
      && formCache.editingId === editingId
      && formCache.revisitOfId === revisitOfId;
    if (reuse) return;
    formCache?.node.remove();
    if (currentTab === 'form') renderFormTab();
    else if (currentTab === 'list') renderListTab();
    else renderThumbTab();
  } catch (err) {
    renderRecovery(errText(err));
  }
}

function renderFormTab(): void {
  if (formCache !== null && (formCache.editingId !== editingId || formCache.revisitOfId !== revisitOfId) && formCache.dirty) {
    editingId = formCache.editingId;
    revisitOfId = formCache.revisitOfId;
  }
  if (formCache !== null && formCache.editingId === editingId && formCache.revisitOfId === revisitOfId) {
    app.replaceChildren(formCache.node);
    return;
  }
  mountForm();
}

function renderListTab(): void {
  const records = [...getStore().loadAll()].sort((a, b) => b.seriesNo - a.seriesNo);
  const pendingLookups = lookupTargets(records);
  renderListTabInto(app, {
    records,
    pendingLookups: pendingLookups.length,
    canRestore: canRestoreBackup(getStore),
  }, {
    onNew: () => openContext(null, null, true),
    onLookup: () => {
      try {
        openLookup(pendingLookups);
      } catch (err) {
        toast(errText(err));
      }
    },
    onCatalog: () => {
      const pref = prompt('対象の都道府県(wakustカテゴリー)は?', records[0]?.basic.prefecture ?? '東京都');
      if (pref === null || pref.trim() === '') return;
      try {
        copyGenerated(buildCatalogPrompt(records, pref.trim()));
      } catch (err) {
        toast(errText(err));
      }
    },
    onMatome: () => {
      try {
        openMatome(records);
      } catch (err) {
        toast(errText(err));
      }
    },
    onCardAction: (act, id) => {
      try {
        const record = getStore().get(id);
        if (record === undefined) return;
        handleCardAction(act, record);
      } catch (err) {
        toast(errText(err));
      }
    },
    bindData: bindDataButtons,
  });
}

function openMatome(records: VisitRecord[]): void {
  const published = countPublishedTherapists(records);
  if (published < SUMMARY_MIN_THERAPISTS) {
    toast(`まとめ記事は投稿済み${SUMMARY_MIN_THERAPISTS}人到達後に解禁(規約1-7)。現在${published}人`);
    return;
  }
  const nums = prompt('対象の通し番号をコンマ区切りで(例: 1,3,5)');
  if (nums === null) return;
  const targets = seriesTargets(records, nums);
  const theme = prompt('まとめのテーマは?(例: 寛容度★4以上だった3人)') ?? '';
  if (theme.trim() === '') return;
  copyGenerated(buildMatomePrompt(targets, theme.trim(), records));
}

function findOriginalRecord(start: VisitRecord): VisitRecord | 'missing' | 'cycle' {
  return findOriginalIn(start, (id) => getStore().get(id));
}

function handleCardAction(act: string, record: VisitRecord): void {
  switch (act) {
    case 'prompt':
      copyPrompt(record, 'paid');
      break;
    case 'prompt-names':
      copyPrompt(record, 'free');
      break;
    case 'edit':
      openContext(record.id, null);
      break;
    case 'revisit':
    {
      const first = findOriginalRecord(record);
      if (first === 'cycle') {
        toast('再訪の参照が循環しています');
        break;
      }
      if (first === 'missing') {
        toast('初回レコードが見つかりません');
        break;
      }
      openContext(null, first.id);
      break;
    }
    case 'url':
      savePostedUrl(record);
      break;
    case 'del':
      deleteRecord(record);
      break;
    default:
      break;
  }
}

function copyPrompt(record: VisitRecord, disclosure: NameDisclosure): void {
  const listingCheckedOn = prompt(
    '出勤確認日(店舗HPの出勤表で出勤を確かめた日。YYYY-MM-DD。空欄なら記事に書かない)',
    defaultListingCheckDate(record),
  );
  if (listingCheckedOn === null) return;
  try {
    if (record.revisitOf !== null) {
      const first = findOriginalRecord(record);
      if (first === 'missing') {
        toast('初回レコードが見つかりません。単体として生成します');
        copyArticlePrompt(record, disclosure, buildSinglePrompt(record, disclosure, listingCheckedOn));
        return;
      }
      if (first === 'cycle') {
        toast('再訪の参照が循環しています');
        return;
      }
      copyArticlePrompt(record, disclosure, buildRevisitPrompt(record, first, disclosure, listingCheckedOn));
      return;
    }
    copyArticlePrompt(record, disclosure, buildSinglePrompt(record, disclosure, listingCheckedOn));
  } catch (err) {
    toast(errText(err));
  }
}

function savePostedUrl(record: VisitRecord): void {
  const url = prompt('wakust投稿後の記事URL(カタログ/まとめ/再訪から参照)', record.postedUrl ?? '');
  if (url === null) return;
  try {
    getStore().save({
      ...record,
      postedUrl: parsePostedUrlInput(url),
      updatedAt: new Date().toISOString(),
    });
    render();
  } catch (err) {
    toast(errText(err));
  }
}

function deleteRecord(record: VisitRecord): void {
  if (!confirm(`#${record.seriesNo} ${record.basic.therapistName} を削除しますか?`)) return;
  try {
    getStore().delete(record.id);
  } catch (err) {
    toast(errText(err));
    return;
  }
  if (formCache !== null && (formCache.editingId === record.id || formCache.id === record.id)) clearContext();
  render();
}

/** ?thumb= で指定された回答。サムネタブを次に描くときに1回だけ使う */
let pendingThumbId: string | null = null;

function renderThumbTab(): void {
  // 読み込みに失敗しても指定が残らないよう、先に取り出す
  const requestedId = pendingThumbId;
  pendingThumbId = null;
  const records = [...getStore().loadAll()].sort((a, b) => b.seriesNo - a.seriesNo);
  renderThumbTabInto(app, records, requestedId);
}

/** 破棄を確認済みのまま画面を離れるときは、ブラウザの確認を重ねない */
let leaveConfirmed = false;

/** ボードから ?edit=<回答ID> で開かれたら、その回答の編集画面を出す */
function openFromUrl(): void {
  const edit = takeParam(location.href, 'edit');
  const thumb = takeParam(edit.rest, 'thumb');
  const value = edit.value ?? thumb.value;
  if (value === null) {
    switchTab('list');
    return;
  }
  history.replaceState(history.state, '', thumb.rest);
  let found: boolean;
  try {
    found = getStore().get(value) !== undefined;
  } catch {
    // 保存領域を読めないときは、履歴画面の復旧表示が原因と対処を示す
    switchTab('list');
    return;
  }
  if (found && edit.value !== null) {
    openContext(value, null);
    return;
  }
  if (found) {
    pendingThumbId = value;
    switchTab('thumb');
    return;
  }
  switchTab('list');
  toast('指定された回答が見つかりません。削除されたか、別の端末の回答です');
}

// ボードからのリンクがこのタブを使い回せるようにする
window.name = INPUT_WINDOW;
// ボードからの移動などで、未保存の入力を黙って失わない
window.addEventListener('beforeunload', (event) => {
  if (!leaveConfirmed && formCache?.dirty === true) event.preventDefault();
});
// ボードなど別の画面での変更を履歴に反映する。入力タブとサムネタブは入力中の値を消さないよう描き直さない
window.addEventListener('storage', () => {
  if (currentTab === 'list') render();
});
document.querySelectorAll('nav button').forEach((b) => {
  b.addEventListener('click', () => switchTab(b.getAttribute('data-tab') as Tab));
});
openFromUrl();
// 開発サーバーとテストには version.json がないため、公開ビルドだけで確認する
if (!import.meta.env.DEV) {
  watchForUpdate({
    isBusy: () => formCache !== null && (formCache.dirty || formCache.sharing),
    confirmLeave: confirmDiscardDraft,
    onLeave: () => {
      leaveConfirmed = true;
    },
    onError: (err) => toast(errText(err)),
  });
}
if (ARTICLE_DIR_ERROR !== null) toast(ARTICLE_DIR_ERROR);
