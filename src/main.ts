import type { VisitRecord } from './types';
import { VisitStore } from './storage';
import { renderForm, collectRecord } from './ui/form';
import { bindChips, bindStars, copyText, esc, toast } from './ui/widgets';
import { buildCatalogPrompt, buildMatomePrompt, buildRevisitPrompt, buildSinglePrompt } from './prompt/build-prompt';
import { specSummary } from './prompt/serialize';
import { drawThumbnail, downloadCanvasPng, PALETTES } from './thumbnail';
import './styles.css';

const store = new VisitStore(window.localStorage);
const app = document.getElementById('app');
if (app === null) throw new Error('#app が見つかりません');

type Tab = 'form' | 'list' | 'thumb';
let currentTab: Tab = 'list';
let editingId: string | null = null;
let revisitOfId: string | null = null;

function switchTab(tab: Tab): void {
  currentTab = tab;
  document.querySelectorAll('nav button').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tab);
  });
  render();
}

function render(): void {
  if (app === null) return;
  if (currentTab === 'form') renderFormTab();
  else if (currentTab === 'list') renderListTab();
  else renderThumbTab();
}

// ---- 入力タブ ----

function renderFormTab(): void {
  const editing = editingId === null ? null : store.get(editingId) ?? null;
  const revisitOf = revisitOfId === null ? null : store.get(revisitOfId) ?? null;
  app!.innerHTML = renderForm(editing, revisitOf);
  bindStars(app!, () => {});
  bindChips(app!, () => {});

  const form = app!.querySelector<HTMLFormElement>('#visit-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    try {
      const record = collectRecord(app!, {
        id: editing?.id ?? crypto.randomUUID(),
        seriesNo: editing?.seriesNo ?? store.nextSeriesNo(),
        createdAt: editing?.createdAt ?? new Date().toISOString(),
        revisitOf: editing?.revisitOf ?? revisitOf?.id ?? null,
        postedUrl: editing?.postedUrl ?? null,
      });
      store.save(record);
      editingId = null;
      revisitOfId = null;
      toast(`#${record.seriesNo} を保存しました`);
      switchTab('list');
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err));
    }
  });
}

// ---- 履歴タブ ----

function renderListTab(): void {
  const records = [...store.loadAll()].sort((a, b) => b.seriesNo - a.seriesNo);
  const rows = records.map((r) => `
    <div class="card" data-id="${r.id}">
      <div class="card-head">
        <strong>#${r.seriesNo}</strong> ${esc(r.basic.visitDate)} / ${esc(r.basic.area)}
        ${r.revisitOf !== null ? '<span class="badge">再訪</span>' : ''}
        ${r.postedUrl !== null ? '<span class="badge posted">投稿済</span>' : ''}
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

  app!.innerHTML = `
    <div class="toolbar">
      <button id="new-visit" class="primary">+ 新規入力</button>
      <button id="catalog">カタログ記事</button>
      <button id="matome">まとめ記事</button>
      <button id="export">保存(JSON)</button>
      <button id="import">読込(JSON)</button>
    </div>
    ${records.length === 0 ? '<p class="empty">まだ訪問レコードがありません。「+ 新規入力」から始めてください。</p>' : rows}`;

  document.getElementById('new-visit')?.addEventListener('click', () => {
    editingId = null;
    revisitOfId = null;
    switchTab('form');
  });

  document.getElementById('catalog')?.addEventListener('click', () => {
    const pref = prompt('対象の都道府県(wakustカテゴリー)は?', records[0]?.basic.prefecture ?? '東京都');
    if (pref === null || pref.trim() === '') return;
    void copyText(buildCatalogPrompt(records, pref.trim()));
  });

  document.getElementById('matome')?.addEventListener('click', () => {
    if (records.length < 6) {
      toast(`まとめ記事は個別体験談6本到達後に解禁(規約1-7)。現在${records.length}本`);
      return;
    }
    const nums = prompt('対象の通し番号をコンマ区切りで(例: 1,3,5)');
    if (nums === null) return;
    const wanted = new Set(nums.split(',').map((n) => Number(n.trim())));
    const targets = records.filter((r) => wanted.has(r.seriesNo));
    if (targets.length === 0) { toast('対象がありません'); return; }
    const theme = prompt('まとめのテーマは?(例: 寛容度★4以上だった3人)') ?? '';
    if (theme.trim() === '') return;
    void copyText(buildMatomePrompt(targets, theme.trim()));
  });

  document.getElementById('export')?.addEventListener('click', () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `me-report-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('import')?.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json';
    inp.addEventListener('change', () => {
      const file = inp.files?.[0];
      if (file === undefined) return;
      void file.text().then((text) => {
        try {
          store.importJson(text);
          toast('インポートしました');
          render();
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err));
        }
      });
    });
    inp.click();
  });

  app!.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-act]');
      if (btn === null) return;
      const id = card.getAttribute('data-id');
      if (id === null) return;
      const record = store.get(id);
      if (record === undefined) return;
      handleCardAction(btn.getAttribute('data-act') ?? '', record);
    });
  });
}

function handleCardAction(act: string, record: VisitRecord): void {
  switch (act) {
    case 'prompt': {
      if (record.revisitOf !== null) {
        const first = store.get(record.revisitOf);
        if (first === undefined) {
          toast('初回レコードが見つかりません。単体として生成します');
          void copyText(buildSinglePrompt(record));
          return;
        }
        void copyText(buildRevisitPrompt(record, first));
      } else {
        void copyText(buildSinglePrompt(record));
      }
      break;
    }
    case 'edit':
      editingId = record.id;
      revisitOfId = null;
      switchTab('form');
      break;
    case 'revisit':
      editingId = null;
      revisitOfId = record.id;
      switchTab('form');
      break;
    case 'url': {
      const url = prompt('wakust投稿後の記事URL(カタログ/まとめ/再訪から参照)', record.postedUrl ?? '');
      if (url === null) return;
      store.save({ ...record, postedUrl: url.trim() === '' ? null : url.trim(), updatedAt: new Date().toISOString() });
      render();
      break;
    }
    case 'del':
      if (confirm(`#${record.seriesNo} ${record.basic.therapistName} を削除しますか?`)) {
        store.delete(record.id);
        render();
      }
      break;
    default:
      break;
  }
}

// ---- サムネタブ ----

function renderThumbTab(): void {
  const records = [...store.loadAll()].sort((a, b) => b.seriesNo - a.seriesNo);
  const latest = records[0];
  const paletteBtns = PALETTES
    .map((p, i) => `<button type="button" class="chip${i === 0 ? ' on' : ''}" data-palette="${i}">${p.name}</button>`)
    .join('');

  app!.innerHTML = `
    <div class="thumb-form">
      <label class="field"><span>エリア</span><input id="t-area" value="${esc(latest?.basic.area ?? '')}" placeholder="恵比寿・中目黒" /></label>
      <label class="field"><span>スペック行</span><input id="t-spec" value="${esc(latest === undefined ? '' : specSummary(latest))}" placeholder="小柄Fカップ・元メンエス経験者ギャル" /></label>
      <label class="field"><span>シリーズラベル</span><input id="t-series" value="体験談 #${latest?.seriesNo ?? 1}" /></label>
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

  document.getElementById('palette-chips')?.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('button[data-palette]');
    if (chip === null) return;
    paletteIdx = Number(chip.getAttribute('data-palette'));
    document.querySelectorAll('#palette-chips .chip').forEach((c) => c.classList.remove('on'));
    chip.classList.add('on');
    redraw();
  });
  document.getElementById('t-draw')?.addEventListener('click', redraw);
  document.getElementById('t-download')?.addEventListener('click', () => {
    redraw();
    downloadCanvasPng(canvas, `thumb-${Date.now()}.png`);
  });
  redraw();
}

// ---- 起動 ----

document.querySelectorAll('nav button').forEach((b) => {
  b.addEventListener('click', () => switchTab(b.getAttribute('data-tab') as Tab));
});
switchTab('list');
