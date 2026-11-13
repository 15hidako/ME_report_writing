import type { VisitRecord } from '../types';
import { esc, toast } from './widgets';
import { publicSpecSummary } from '../prompt/serialize';
import { drawThumbnail, downloadCanvasPng, LAYOUTS, PALETTES } from '../thumbnail';
import type { ThumbnailLayout } from '../thumbnail';
import { errText } from '../guards';

/**
 * サムネタブを描く。records は新しい順。
 * initialId の回答を選んだ状態で開き、指定がない・見つからないときは最新の回答を入れる。
 */
export function renderThumbTab(
  app: HTMLElement,
  records: readonly VisitRecord[],
  initialId: string | null,
  /** 販売型に対応するレイアウト。販売型が未選択なら null で、今のレイアウトを保つ */
  layoutFor: (recordId: string) => ThumbnailLayout | null = () => null,
): void {
  const initial = records.find((record) => record.id === initialId) ?? records[0];
  const recordOptions = records.map((record) => `<option value="${esc(record.id)}"${record === initial ? ' selected' : ''}>#${
    esc(String(record.seriesNo))} ${esc(record.basic.shopName)} — ${esc(record.basic.therapistName)}</option>`).join('');
  const paletteBtns = PALETTES
    .map((p, i) => `<button type="button" class="chip${i === 0 ? ' on' : ''}" data-palette="${i}">${p.name}</button>`)
    .join('');
  const layoutBtns = LAYOUTS
    .map((l, i) => `<button type="button" class="chip${i === 0 ? ' on' : ''}" data-layout="${l.id}">${l.name}</button>`)
    .join('');

  app.innerHTML = `
    <div class="thumb-form">
      ${records.length === 0 ? '' : `<label class="field"><select id="t-record" aria-label="サムネにする回答">${recordOptions}</select></label>`}
      <div class="chips" id="layout-chips">${layoutBtns}</div>
      <label class="field"><span>エリア</span><input id="t-area" placeholder="恵比寿・中目黒" /></label>
      <label class="field" data-for="names"><span>店名</span><input id="t-shop" /></label>
      <label class="field" data-for="names"><span>セラピスト名</span><input id="t-therapist" /></label>
      <label class="field"><span>スペック行</span><input id="t-spec" placeholder="元メンエス経験者ギャル" /></label>
      <label class="field" data-for="summary"><span>フック</span><input id="t-hook" placeholder="圧強KWKWテクで/SKR不可避" /></label>
      <div class="chips" id="palette-chips">${paletteBtns}</div>
      <div class="actions">
        <button id="t-draw" class="primary">プレビュー更新</button>
        <button id="t-download">PNG保存</button>
      </div>
    </div>
    <canvas id="thumb-canvas" class="thumb-preview"></canvas>`;

  const canvas = document.getElementById('thumb-canvas') as HTMLCanvasElement;
  const input = (id: string): HTMLInputElement => document.getElementById(id) as HTMLInputElement;
  /** 入力欄を回答の値で入れ直す。レイアウトと配色の選択は変えない */
  const fill = (record: VisitRecord | undefined): void => {
    input('t-area').value = record?.basic.area ?? '';
    input('t-shop').value = record?.basic.shopName ?? '';
    input('t-therapist').value = record?.basic.therapistName ?? '';
    input('t-spec').value = record === undefined ? '' : publicSpecSummary(record);
    input('t-hook').value = record?.voice.titleHook ?? '';
  };
  fill(initial);
  let paletteIdx = 0;
  let layout: ThumbnailLayout = LAYOUTS[0]!.id;
  const showFields = (): void => {
    document.querySelectorAll<HTMLElement>('.thumb-form [data-for]').forEach((el) => {
      el.hidden = el.dataset['for'] !== layout;
    });
  };
  const selectLayout = (next: ThumbnailLayout): void => {
    layout = next;
    document.querySelectorAll<HTMLElement>('#layout-chips .chip').forEach((c) => c.classList.toggle('on', c.dataset['layout'] === next));
    showFields();
  };
  /** 選んだ回答に販売型があれば、対応するレイアウトへ切り替える。手で切り替えられるまま残す */
  const followAngle = (record: VisitRecord | undefined): void => {
    const next = record === undefined ? null : layoutFor(record.id);
    if (next !== null) selectLayout(next);
  };
  const redraw = (): void => {
    const get = (id: string): string => input(id).value.trim();
    drawThumbnail(canvas, {
      area: get('t-area') || 'エリア未入力',
      shopName: get('t-shop'),
      therapistName: get('t-therapist'),
      specLine: get('t-spec'),
      hook: get('t-hook'),
    }, PALETTES[paletteIdx] ?? PALETTES[0]!, layout);
  };
  document.getElementById('layout-chips')?.addEventListener('click', (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>('button[data-layout]');
    const next = LAYOUTS.find((l) => l.id === chip?.dataset['layout']);
    if (chip === null || next === undefined) return;
    selectLayout(next.id);
    redraw();
  });
  showFields();
  followAngle(initial);
  document.getElementById('t-record')?.addEventListener('change', (event) => {
    const id = (event.target as HTMLSelectElement).value;
    const record = records.find((item) => item.id === id);
    fill(record);
    followAngle(record);
    redraw();
  });
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
