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

export const THUMB_W = 1200;
export const THUMB_H = 675;

function fitFontSize(
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number,
  basePx: number, family: string, weight = 'bold',
): number {
  let size = basePx;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  } while (size > 18);
  return size;
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
  ctx.moveTo(THUMB_W * 0.62, 0);
  ctx.lineTo(THUMB_W, 0);
  ctx.lineTo(THUMB_W, THUMB_H * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // シリーズラベル(左上のピル)
  ctx.font = `bold 34px ${family}`;
  const label = ` ${input.seriesLabel} `;
  const lw = ctx.measureText(label).width + 40;
  ctx.fillStyle = palette.accent;
  roundRect(ctx, 60, 52, lw, 62, 31);
  ctx.fill();
  ctx.fillStyle = palette.bgFrom;
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 80, 85);

  // エリア(最大の要素)
  ctx.fillStyle = palette.text;
  const areaSize = fitFontSize(ctx, input.area, THUMB_W - 140, 120, family, '900');
  ctx.font = `900 ${areaSize}px ${family}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(input.area, 64, 270);

  // 固定帯「メンズエステ体験談」
  ctx.fillStyle = palette.text;
  ctx.globalAlpha = 0.92;
  ctx.font = `bold 58px ${family}`;
  ctx.fillText('メンズエステ体験談', 64, 356);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(64, 386);
  ctx.lineTo(64 + 560, 386);
  ctx.stroke();

  // スペック行
  const specSize = fitFontSize(ctx, input.specLine, THUMB_W - 140, 52, family);
  ctx.font = `bold ${specSize}px ${family}`;
  ctx.fillStyle = palette.text;
  ctx.fillText(input.specLine, 64, 470);

  // フック(アクセント色・下部)
  const hookSize = fitFontSize(ctx, input.hook, THUMB_W - 140, 64, family, '900');
  ctx.font = `900 ${hookSize}px ${family}`;
  ctx.fillStyle = palette.accent;
  ctx.fillText(input.hook, 64, 590);
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
