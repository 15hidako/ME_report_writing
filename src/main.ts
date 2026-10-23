import type { VisitRecord } from './types';
import { VisitStore } from './storage';
import { renderForm, collectRecord, bindCourseFields, bindOptionFields, bindLocationFields } from './ui/form';
import { bindChips, bindStars, copyText, esc, toast } from './ui/widgets';
import { bindNoteSuggestions } from './ui/questionnaire-candidates';
import { buildCatalogPrompt, buildMatomePrompt, buildRevisitPrompt, buildSinglePrompt } from './prompt/build-prompt';
import { specSummary } from './prompt/serialize';
import { drawThumbnail, downloadCanvasPng, PALETTES } from './thumbnail';
import { localDate } from './date';
import { SUMMARY_MIN_THERAPISTS, countPublishedTherapists, isPublished } from './prompt/publication';
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
}

let currentTab: Tab = 'list';
let editingId: string | null = null;
let revisitOfId: string | null = null;
let formCache: Draft | null = null;
let store: VisitStore | undefined;

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function getStore(): VisitStore {
  if (store !== undefined) return store;
  store = new VisitStore({
    getItem: (key: string) => localStorage.getItem(key),
    setItem: (key: string, value: string) => localStorage.setItem(key, value),
  });
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

function copyGenerated(text: string): void {
  void copyText(text).catch((err: unknown) => toast(errText(err)));
}

function rawHasSavedData(): boolean {
  try {
    const parsed: unknown = JSON.parse(getStore().exportRawJson());
    return !(Array.isArray(parsed) && parsed.length === 0);
  } catch {
    return true;
  }
}

function downloadRaw(): void {
  let url: string | undefined;
  try {
    const blob = new Blob([getStore().exportRawJson()], { type: 'application/json' });
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `me-report-backup-${localDate()}.json`;
    a.click();
  } catch (err) {
    toast(errText(err));
  } finally {
    if (url !== undefined) URL.revokeObjectURL(url);
  }
}

function applyImport(text: string): void {
  try {
    getStore().validateImport(text);
    if (rawHasSavedData() && !confirm('保存済みの全レコードを置き換えますか?')) return;
  } catch (err) {
    toast(errText(err));
    return;
  }
  if (!confirmDiscardDraft()) return;
  try {
    getStore().importJson(text);
  } catch (err) {
    toast(errText(err));
    return;
  }
  clearContext();
  toast('インポートしました');
  render();
}

function pickImport(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file === undefined) return;
    void file.text().then(applyImport).catch((err: unknown) => toast(errText(err)));
  });
  input.click();
}

function restoreFromBackup(): void {
  let db: VisitStore;
  try {
    db = getStore();
    if (!db.hasBackup()) {
      toast('バックアップがありません');
      return;
    }
  } catch (err) {
    toast(errText(err));
    return;
  }
  if (!confirm('バックアップで現在の全レコードを置き換えますか?')) return;
  if (!confirmDiscardDraft()) return;
  try {
    db.restoreBackup();
  } catch (err) {
    toast(errText(err));
    return;
  }
  clearContext();
  toast('バックアップを復元しました');
  render();
}

function bindDataButtons(): void {
  document.getElementById('export')?.addEventListener('click', downloadRaw);
  document.getElementById('import')?.addEventListener('click', pickImport);
  document.getElementById('restore')?.addEventListener('click', restoreFromBackup);
}

function openContext(nextEdit: string | null, nextRevisit: string | null, replaceSameNew = false): void {
  const same = formCache !== null
    && formCache.editingId === nextEdit
    && formCache.revisitOfId === nextRevisit;
  if (same && !(replaceSameNew && formCache?.dirty === true)) {
    switchTab('form');
    return;
  }
  if (!confirmDiscardDraft()) return;
  clearContext();
  editingId = nextEdit;
  revisitOfId = nextRevisit;
  switchTab('form');
}

function submitForm(event: Event, draft: Draft): void {
  event.preventDefault();
  try {
    const db = getStore();
    const latest = draft.editingId === null ? undefined : db.get(draft.editingId);
    if (draft.editingId !== null && latest === undefined) {
      toast('編集中のレコードは削除されています');
      clearContext();
      switchTab('list');
      return;
    }
    const record = collectRecord(draft.node, {
      id: draft.id ?? crypto.randomUUID(),
      seriesNo: draft.seriesNo ?? db.nextSeriesNo(),
      createdAt: draft.createdAt ?? new Date().toISOString(),
      revisitOf: draft.revisitOf,
      postedUrl: latest?.postedUrl ?? null,
    });
    db.save(record);
    clearContext();
    toast(`#${record.seriesNo} を保存しました`);
    switchTab('list');
  } catch (err) {
    toast(errText(err));
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
  form.addEventListener('input', markDirty);
  form.addEventListener('submit', (event) => submitForm(event, draft));
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
  let canRestore = false;
  try {
    canRestore = getStore().hasBackup();
  } catch {
    canRestore = false;
  }
  const note = document.createElement('p');
  note.className = 'empty';
  note.textContent = message;
  const bar = document.createElement('div');
  bar.className = 'toolbar';
  bar.innerHTML = `<button id="export">保存(JSON)</button><button id="import">読込(JSON)</button>${
    canRestore ? '<button id="restore">バックアップ復元</button>' : ''
  }`;
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
  const rows = records.map((r) => `
    <div class="card" data-id="${esc(r.id)}">
      <div class="card-head">
        <strong>#${esc(String(r.seriesNo))}</strong> ${esc(r.basic.visitDate)} / ${esc(r.basic.area)}
        ${r.revisitOf !== null ? '<span class="badge">再訪</span>' : ''}
        ${isPublished(r) ? '<span class="badge posted">投稿済</span>' : ''}
      </div>
      <div class="card-body">${esc(r.basic.shopName)} — ${esc(r.basic.therapistName)}<br />
        <small>${esc(specSummary(r))}</small></div>
      <div class="card-actions">
        <button data-act="prompt">プロンプト</button>
        <button data-act="edit">編集</button>
        <button data-act="revisit">再訪入力</button>
        <button data-act="url">投稿URL</button>
        <button data-act="del" class="danger">削除</button>
      </div>
    </div>`).join('');

  let canRestore = false;
  try {
    canRestore = getStore().hasBackup();
  } catch {
    canRestore = false;
  }
  app.innerHTML = `
    <div class="toolbar">
      <button id="new-visit" class="primary">+ 新規入力</button>
      <button id="catalog">カタログ記事</button>
      <button id="matome">まとめ記事</button>
      <button id="export">保存(JSON)</button>
      <button id="import">読込(JSON)</button>
      ${canRestore ? '<button id="restore">バックアップ復元</button>' : ''}
    </div>
    ${records.length === 0 ? '<p class="empty">まだ訪問レコードがありません。「+ 新規入力」から始めてください。</p>' : rows}`;

  document.getElementById('new-visit')?.addEventListener('click', () => openContext(null, null, true));
  document.getElementById('catalog')?.addEventListener('click', () => {
    const pref = prompt('対象の都道府県(wakustカテゴリー)は?', records[0]?.basic.prefecture ?? '東京都');
    if (pref === null || pref.trim() === '') return;
    try {
      copyGenerated(buildCatalogPrompt(records, pref.trim()));
    } catch (err) {
      toast(errText(err));
    }
  });
  document.getElementById('matome')?.addEventListener('click', () => {
    try {
      openMatome(records);
    } catch (err) {
      toast(errText(err));
    }
  });
  bindDataButtons();
  app.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest('button[data-act]');
      if (btn === null) return;
      const id = card.getAttribute('data-id');
      if (id === null) return;
      try {
        const record = getStore().get(id);
        if (record === undefined) return;
        handleCardAction(btn.getAttribute('data-act') ?? '', record);
      } catch (err) {
        toast(errText(err));
      }
    });
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

function seriesTargets(records: VisitRecord[], raw: string): VisitRecord[] {
  const parts = raw.split(',').map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => part === '')) {
    throw new Error('通し番号をコンマ区切りで入力してください');
  }
  if (parts.some((part) => !/^-?\d+$/.test(part) || !Number.isSafeInteger(Number(part)))) {
    throw new Error('通し番号は整数で指定してください');
  }
  const wanted = new Set(parts.map((part) => Number(part)));
  const targets = records.filter((record) => wanted.has(record.seriesNo));
  const found = new Set(targets.map((record) => record.seriesNo));
  if ([...wanted].some((no) => !found.has(no))) throw new Error('存在しない通し番号があります');
  return targets;
}

function findOriginalRecord(start: VisitRecord): VisitRecord | 'missing' | 'cycle' {
  const seen = new Set<string>();
  let current = start;
  while (true) {
    if (seen.has(current.id)) return 'cycle';
    seen.add(current.id);
    if (current.revisitOf === null) return current;
    const next = getStore().get(current.revisitOf);
    if (next === undefined) return 'missing';
    current = next;
  }
}

function handleCardAction(act: string, record: VisitRecord): void {
  switch (act) {
    case 'prompt':
      copyPrompt(record);
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

function copyPrompt(record: VisitRecord): void {
  try {
    if (record.revisitOf !== null) {
      const first = findOriginalRecord(record);
      if (first === 'missing') {
        toast('初回レコードが見つかりません。単体として生成します');
        copyGenerated(buildSinglePrompt(record));
        return;
      }
      if (first === 'cycle') {
        toast('再訪の参照が循環しています');
        return;
      }
      copyGenerated(buildRevisitPrompt(record, first));
      return;
    }
    copyGenerated(buildSinglePrompt(record));
  } catch (err) {
    toast(errText(err));
  }
}

function savePostedUrl(record: VisitRecord): void {
  const url = prompt('wakust投稿後の記事URL(カタログ/まとめ/再訪から参照)', record.postedUrl ?? '');
  if (url === null) return;
  const postedUrl = url.trim() === '' ? null : url.trim();
  if (postedUrl !== null && !isPublished({ ...record, postedUrl })) {
    toast('wakust記事URLが必要です');
    return;
  }
  try {
    getStore().save({
      ...record,
      postedUrl,
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

function renderThumbTab(): void {
  const records = [...getStore().loadAll()].sort((a, b) => b.seriesNo - a.seriesNo);
  const latest = records[0];
  const paletteBtns = PALETTES
    .map((p, i) => `<button type="button" class="chip${i === 0 ? ' on' : ''}" data-palette="${i}">${p.name}</button>`)
    .join('');

  app.innerHTML = `
    <div class="thumb-form">
      <label class="field"><span>エリア</span><input id="t-area" value="${esc(latest?.basic.area ?? '')}" placeholder="恵比寿・中目黒" /></label>
      <label class="field"><span>スペック行</span><input id="t-spec" value="${esc(latest === undefined ? '' : specSummary(latest))}" placeholder="小柄Fカップ・元メンエス経験者ギャル" /></label>
      <label class="field"><span>シリーズラベル</span><input id="t-series" value="${esc(`体験談 #${latest?.seriesNo ?? 1}`)}" /></label>
      <label class="field"><span>フック</span><input id="t-hook" value="${esc(latest?.voice.titleHook ?? '')}" placeholder="圧強KWKWテクでSKR不可避" /></label>
      <div class="chips" id="palette-chips">${paletteBtns}</div>
      <div class="actions">
        <button id="t-draw" class="primary">プレビュー更新</button>
        <button id="t-download">PNG保存</button>
      </div>
    </div>
    <canvas id="thumb-canvas" class="thumb-preview"></canvas>`;

  const canvas = document.getElementById('thumb-canvas') as HTMLCanvasElement;
  let paletteIdx = 0;
  const redraw = (): void => {
    const get = (id: string): string => (document.getElementById(id) as HTMLInputElement).value.trim();
    drawThumbnail(canvas, {
      area: get('t-area') || 'エリア未入力',
      specLine: get('t-spec'),
      seriesLabel: get('t-series') || '体験談',
      hook: get('t-hook'),
    }, PALETTES[paletteIdx] ?? PALETTES[0]!);
  };
  document.getElementById('palette-chips')?.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest('button[data-palette]');
    if (chip === null) return;
    paletteIdx = Number(chip.getAttribute('data-palette'));
    document.querySelectorAll('#palette-chips .chip').forEach((c) => c.classList.remove('on'));
    chip.classList.add('on');
    redraw();
  });
  document.getElementById('t-draw')?.addEventListener('click', redraw);
  document.getElementById('t-download')?.addEventListener('click', () => {
    try {
      redraw();
      downloadCanvasPng(canvas, `thumb-${Date.now()}.png`);
    } catch (err) {
      toast(errText(err));
    }
  });
  redraw();
}

document.querySelectorAll('nav button').forEach((b) => {
  b.addEventListener('click', () => switchTab(b.getAttribute('data-tab') as Tab));
});
switchTab('list');
