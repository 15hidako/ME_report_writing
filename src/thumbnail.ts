// Canvasベースのサムネイルジェネレーター。
// シリーズ統一デザイン(同一レイアウト・配色プリセット差し替え)でブランド認知を作る。

export interface ThumbnailInput {
  readonly area: string;       // 例: 恵比寿・中目黒
  readonly specLine: string;   // 例: 小柄Fカップ・元メンエス経験者ギャル
  readonly seriesLabel: string; // 例: 体験談 #7
  readonly hook: string;       // 例: 圧強KWKWテクでSKR不可避
}

export interface Palette {
  readonly name: string;
  readonly bgFrom: string;
  readonly bgTo: string;
  readonly accent: string;
  readonly text: string;
}

export const PALETTES: readonly Palette[] = [
  { name: 'ナイトネオン', bgFrom: '#12081f', bgTo: '#3b1060', accent: '#ff4d8d', text: '#ffffff' },
  { name: 'ディープブルー', bgFrom: '#071630', bgTo: '#0e3a68', accent: '#ffc93c', text: '#ffffff' },
  { name: 'ワインレッド', bgFrom: '#2a0710', bgTo: '#6e1030', accent: '#ffd7e0', text: '#ffffff' },
  { name: 'モノトーン', bgFrom: '#101010', bgTo: '#2e2e2e', accent: '#e8c66a', text: '#ffffff' },
];

// wakustのトップ画像サムネイルは縦横比2:3(クリエイターガイドの例: 600×900、1000×1500)。
export const THUMB_W = 1000;
export const THUMB_H = 1500;

const MARGIN_X = 72;
const TEXT_W = THUMB_W - MARGIN_X * 2;
const BOTTOM_MARGIN = 110;
// 折り返し候補: 区切り文字の直後と、英数字の並び(SKR、#7等)の直前。英数字の途中と直後(Eカップ等)では切らない
const BREAK_AFTER = /(?<=[・、。\s])|(?<![A-Za-z0-9#])(?=[A-Za-z0-9#])/u;

export type MeasureText = (text: string) => number;

interface Wrapped {
  readonly lines: string[];
  /** 折り返し候補以外の位置(語の途中)で分割したか */
  readonly brokeWord: boolean;
}

function wrapTokens(text: string, maxWidth: number, measure: MeasureText): Wrapped {
  const lines: string[] = [];
  let line = '';
  let brokeWord = false;
  const push = (): void => {
    const trimmed = line.trim();
    if (trimmed !== '') lines.push(trimmed);
    line = '';
  };
  for (const token of text.split(BREAK_AFTER)) {
    if (measure((line + token).trimEnd()) <= maxWidth) {
      line += token;
      continue;
    }
    push();
    for (const ch of token) {
      if (line !== '' && measure(line + ch) > maxWidth) {
        brokeWord = true;
        push();
      }
      line += ch;
    }
  }
  push();
  return { lines, brokeWord };
}

/** 区切り文字(・、。空白)の直後と英数字の並びの直前を優先して折り返す。収まらない語は文字単位で分割する。 */
export function wrapText(text: string, maxWidth: number, measure: MeasureText): string[] {
  return wrapTokens(text, maxWidth, measure).lines;
}

export interface TextBlock {
  readonly lines: readonly string[];
  readonly size: number;
  readonly lineHeight: number;
}

export interface BlockSpec {
  readonly basePx: number;
  readonly minPx: number;
  readonly maxLines: number;
  readonly maxHeight?: number;
  readonly lineRatio: number;
}

const ELLIPSIS = '…';

/** 末尾を「…」に置き換えて幅に収める。 */
function ellipsize(line: string, maxWidth: number, measure: MeasureText): string {
  const chars = [...line];
  while (chars.length > 0 && measure(chars.join('') + ELLIPSIS) > maxWidth) chars.pop();
  return chars.join('') + ELLIPSIS;
}

/**
 * 行数と高さの上限に収まる最大の文字サイズを選ぶ。
 * 語の途中で切らずに収まるサイズを優先し、なければ語の分割を許す。
 * 最小サイズでも収まらない場合は、収まる行数で打ち切って末尾を「…」にする。上限を超えるブロックは返さない。
 */
export function fitLines(
  text: string, maxWidth: number, spec: BlockSpec, measureAt: (size: number) => MeasureText,
): TextBlock {
  const layout = (size: number): TextBlock & { readonly brokeWord: boolean } => ({
    ...wrapTokens(text, maxWidth, measureAt(size)),
    size,
    lineHeight: Math.round(size * spec.lineRatio),
  });
  const toBlock = ({ lines, size, lineHeight }: TextBlock): TextBlock => ({ lines, size, lineHeight });
  const lineLimit = (lineHeight: number): number => Math.max(0, Math.min(
    spec.maxLines,
    spec.maxHeight === undefined ? spec.maxLines : Math.floor(spec.maxHeight / lineHeight),
  ));

  let fallback: TextBlock | undefined;
  for (let size = spec.basePx; size > spec.minPx; size -= 4) {
    const block = layout(size);
    if (block.lines.length > lineLimit(block.lineHeight)) continue;
    if (!block.brokeWord) return toBlock(block);
    fallback ??= toBlock(block);
  }
  if (fallback !== undefined) return fallback;

  const smallest = layout(spec.minPx);
  const limit = lineLimit(smallest.lineHeight);
  if (smallest.lines.length <= limit) return toBlock(smallest);
  const kept = smallest.lines.slice(0, limit);
  const last = kept.pop();
  const lines = last === undefined ? [] : [...kept, ellipsize(last, maxWidth, measureAt(spec.minPx))];
  return { lines, size: smallest.size, lineHeight: smallest.lineHeight };
}

function fitBlock(
  ctx: CanvasRenderingContext2D, text: string, family: string, weight: string, spec: BlockSpec,
): TextBlock {
  return fitLines(text, TEXT_W, spec, (size) => {
    const font = `${weight} ${size}px ${family}`;
    return (t) => {
      ctx.font = font;
      return ctx.measureText(t).width;
    };
  });
}

/** topから下へ描画し、最終行の下端のy座標を返す。 */
function drawBlock(
  ctx: CanvasRenderingContext2D, block: TextBlock, family: string, weight: string, top: number,
): number {
  ctx.font = `${weight} ${block.size}px ${family}`;
  ctx.textBaseline = 'alphabetic';
  block.lines.forEach((line, i) => {
    ctx.fillText(line, MARGIN_X, top + block.size + i * block.lineHeight);
  });
  return top + block.lines.length * block.lineHeight;
}

export function drawThumbnail(
  canvas: HTMLCanvasElement, input: ThumbnailInput, palette: Palette,
): void {
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D contextを取得できませんでした');

  const family = `'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif`;

  // 背景: 斜めグラデーション + 対角のアクセント帯
  const grad = ctx.createLinearGradient(0, 0, THUMB_W, THUMB_H);
  grad.addColorStop(0, palette.bgFrom);
  grad.addColorStop(1, palette.bgTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = palette.accent;
  ctx.beginPath();
  ctx.moveTo(THUMB_W * 0.4, 0);
  ctx.lineTo(THUMB_W, 0);
  ctx.lineTo(THUMB_W, THUMB_H * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // シリーズラベル(左上のピル)
  ctx.font = `bold 42px ${family}`;
  const label = ` ${input.seriesLabel} `;
  const lw = Math.min(ctx.measureText(label).width + 48, TEXT_W);
  ctx.fillStyle = palette.accent;
  roundRect(ctx, MARGIN_X, 84, lw, 78, 39);
  ctx.fill();
  ctx.fillStyle = palette.bgFrom;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, MARGIN_X + 24, 125, TEXT_W - 48);

  // エリア(最大の要素)
  ctx.fillStyle = palette.text;
  const area = fitBlock(ctx, input.area, family, '900', {
    basePx: 176, minPx: 72, maxLines: 2, lineRatio: 1.16,
  });
  let y = drawBlock(ctx, area, family, '900', 236);

  // 固定帯「メンズエステ体験談」
  y += 96;
  ctx.globalAlpha = 0.92;
  ctx.font = `bold 78px ${family}`;
  ctx.fillText('メンズエステ体験談', MARGIN_X, y);
  ctx.globalAlpha = 1;
  y += 40;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X, y);
  ctx.lineTo(MARGIN_X + 520, y);
  ctx.stroke();

  // スペック行
  y += 56;
  if (input.specLine !== '') {
    const spec = fitBlock(ctx, input.specLine, family, 'bold', {
      basePx: 62, minPx: 34, maxLines: 3, lineRatio: 1.36,
    });
    ctx.fillStyle = palette.text;
    y = drawBlock(ctx, spec, family, 'bold', y);
  }

  // フック(アクセント色・下端揃え)。上の要素と重ならない高さに収める
  if (input.hook !== '') {
    const available = THUMB_H - BOTTOM_MARGIN - (y + 64);
    const hook = fitBlock(ctx, input.hook, family, '900', {
      basePx: 92, minPx: 40, maxLines: 3, maxHeight: available, lineRatio: 1.26,
    });
    ctx.fillStyle = palette.accent;
    drawBlock(ctx, hook, family, '900', THUMB_H - BOTTOM_MARGIN - hook.lines.length * hook.lineHeight);
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}
