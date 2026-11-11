// Canvasベースのサムネイルジェネレーター。
// シリーズ統一デザイン(同一レイアウト・配色プリセット差し替え)でブランド認知を作る。

export interface ThumbnailInput {
  readonly area: string;          // 例: 恵比寿・中目黒
  readonly shopName: string;      // 名前公開型だけで使う
  readonly therapistName: string; // 名前公開型だけで使う
  readonly specLine: string;      // 例: 元メンエス経験者 / ギャル(年齢・体型は載せない)
  readonly hook: string;          // 例: 圧強KWKWテクでSKR不可避(概要型だけで使う)
}

/**
 * names: 無料部分で店名・セラピスト名を出し、有料部分で詳細レビューを売る型
 * summary: 無料部分では体験の概要だけを出し、有料部分で店名・セラピスト名と詳細を明かす型
 */
export type ThumbnailLayout = 'names' | 'summary';

export const LAYOUTS: readonly { readonly id: ThumbnailLayout; readonly name: string }[] = [
  { id: 'names', name: '名前公開' },
  { id: 'summary', name: '概要' },
];

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

// wakustのトップ画像は縦:横=2:3の横長。クリエイターガイドの「600✕900、1000✕1500」は縦✕横の表記で、
// 記事ページの実画像は1024×683、一覧の表示枠は232×158だった。
export const THUMB_W = 1500;
export const THUMB_H = 1000;

const MARGIN_X = 110;
const TEXT_W = THUMB_W - MARGIN_X * 2;
const TOP_MARGIN = 96;
const FRAME_OUTER = 34;
const FRAME_INNER = 46;
const GRAIN_SEED = 7;
const GRAIN_TILE = 250;
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
const GOTHIC = `'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif`;
const MINCHO = `'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif`;
// シリーズ名。投稿する画像には通し番号を載せない(番号はローカルの記録だけに残す)
const SERIES_NAME = 'メンズエステ体験談';

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
  maxWidth: number = TEXT_W,
): TextBlock {
  return fitLines(text, maxWidth, spec, (size) => {
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
  x: number = MARGIN_X,
): number {
  ctx.font = `${weight} ${block.size}px ${family}`;
  ctx.textBaseline = 'alphabetic';
  block.lines.forEach((line, i) => {
    ctx.fillText(line, x, top + block.size + i * block.lineHeight);
  });
  return top + block.lines.length * block.lineHeight;
}

export function drawThumbnail(
  canvas: HTMLCanvasElement, input: ThumbnailInput, palette: Palette, layout: ThumbnailLayout,
): void {
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D contextを取得できませんでした');

  // 同じcanvasへ再描画しても前回の描画状態を持ち越さない
  ctx.save();
  try {
    drawBackground(ctx, palette);
    drawFrame(ctx, palette);
    // 一覧カードはエリアをカテゴリーとして文字で出すため、概要型ではエリアを小さく扱う。
    // 名前公開型は地域・店名・セラピスト名を一続きで読ませるため、エリアを大きめにする
    const header = drawHeader(ctx, input.area, palette, layout === 'names' ? 66 : 54);
    if (layout === 'names') drawNamesBody(ctx, input, palette, header);
    else drawSummaryBody(ctx, input, palette, header);
  } finally {
    ctx.restore();
  }
}

function drawWithShadow(ctx: CanvasRenderingContext2D, draw: () => void): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowOffsetY = 6;
  ctx.shadowBlur = 18;
  draw();
  ctx.restore();
}

// 縦の配置規則: 位置は行ボックスではなく字面(ascent/descent)で測る。
// 下端の要素と短い線は、先頭行と二重線を上下反転した位置に置く。
// 本体の要素は BODY_GAP の等間隔で積み、二重線と下端の線の間で上下中央に置く。
const BODY_GAP = 40;
const ACCENT_RULE_W = 120;
const ACCENT_RULE_H = 3;

/** 字面の高さを持ち、上端を指定して描ける要素 */
interface VBlock {
  readonly height: number;
  readonly draw: (top: number) => void;
}

interface HeaderMetrics {
  /** 字面の上端。下端の要素はキャンバス下端から同じ距離に置く */
  readonly textTop: number;
  /** 字面の下端から二重線の上端までの距離 */
  readonly ruleGap: number;
  /** 二重線の下端 */
  readonly ruleBottom: number;
}

const EMPTY_BLOCK: VBlock = { height: 0, draw: () => undefined };

function ascentOf(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).actualBoundingBoxAscent;
}

function descentOf(ctx: CanvasRenderingContext2D, text: string): number {
  return ctx.measureText(text).actualBoundingBoxDescent;
}

/** 折り返し済みのブロックを、1行目の字面の上端から最終行の字面の下端までの要素にする */
function textVBlock(
  ctx: CanvasRenderingContext2D, block: TextBlock, weight: string, fill: string, shadow = false,
): VBlock {
  const first = block.lines[0];
  const last = block.lines[block.lines.length - 1];
  if (first === undefined || last === undefined) return EMPTY_BLOCK;
  ctx.font = `${weight} ${block.size}px ${GOTHIC}`;
  const ascent = ascentOf(ctx, first);
  const height = ascent + (block.lines.length - 1) * block.lineHeight + descentOf(ctx, last);
  const paint = (top: number): void => {
    ctx.fillStyle = fill;
    drawBlock(ctx, block, GOTHIC, weight, top + ascent - block.size);
  };
  return {
    height,
    draw: (top) => (shadow ? drawWithShadow(ctx, () => paint(top)) : paint(top)),
  };
}

/** 要素を等間隔で積み、[from, to] の間で上下中央に置く */
function drawCentered(blocks: readonly VBlock[], from: number, to: number): void {
  const visible = blocks.filter((b) => b.height > 0);
  const total = visible.reduce((sum, b) => sum + b.height, 0) + BODY_GAP * Math.max(0, visible.length - 1);
  let y = from + Math.max(0, (to - from - total) / 2);
  for (const b of visible) {
    b.draw(y);
    y += b.height + BODY_GAP;
  }
}

/** 下端の要素を先頭行と上下対称の位置に描き、短い線の上端のy座標を返す */
function drawBottomAccent(
  ctx: CanvasRenderingContext2D, block: VBlock, header: HeaderMetrics, palette: Palette,
): number {
  const bottom = THUMB_H - header.textTop;
  if (block.height === 0) return bottom;
  const top = bottom - block.height;
  const ruleTop = top - header.ruleGap - ACCENT_RULE_H;
  ctx.fillStyle = withAlpha(palette.accent, 0.55);
  ctx.fillRect(MARGIN_X, ruleTop, ACCENT_RULE_W, ACCENT_RULE_H);
  block.draw(top);
  return ruleTop;
}

const HONORIFIC = 'さん';
// 名前公開型の下端に置く定型文。詳細は有料部分で読ませる
const NAMES_TEASER = 'どこまでできるかは本編で';

/** セラピスト名と敬称を分ける。敬称は名前より小さく描くため、入力に含まれていても切り離す */
export function splitHonorific(raw: string): { readonly name: string; readonly honorific: string } {
  const trimmed = raw.trim();
  const name = trimmed.endsWith(HONORIFIC) ? trimmed.slice(0, -HONORIFIC.length).trim() : trimmed;
  return { name, honorific: name === '' ? '' : HONORIFIC };
}

/** セラピスト名(大)と敬称(小)を同じベースラインに並べる要素 */
function therapistVBlock(ctx: CanvasRenderingContext2D, raw: string, palette: Palette): VBlock {
  const { name, honorific } = splitHonorific(raw);
  if (name === '') return EMPTY_BLOCK;
  const suffixRatio = 0.5;
  const gap = 10;
  const nameFont = (size: number): string => `900 ${size}px ${GOTHIC}`;
  const suffixFont = (size: number): string => `bold ${Math.round(size * suffixRatio)}px ${GOTHIC}`;
  const widthAt = (size: number): number => {
    ctx.font = nameFont(size);
    const nameW = ctx.measureText(name).width;
    ctx.font = suffixFont(size);
    return nameW + gap + ctx.measureText(honorific).width;
  };
  let size = 176;
  while (size > 80 && widthAt(size) > TEXT_W) size -= 4;
  ctx.font = nameFont(size);
  const ascent = ascentOf(ctx, name);
  return {
    height: ascent + descentOf(ctx, name),
    draw: (top) => drawWithShadow(ctx, () => {
      const baseline = top + ascent;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = palette.text;
      ctx.font = nameFont(size);
      ctx.fillText(name, MARGIN_X, baseline, TEXT_W);
      const nameW = ctx.measureText(name).width;
      ctx.font = suffixFont(size);
      ctx.fillStyle = withAlpha(palette.text, 0.85);
      ctx.fillText(honorific, MARGIN_X + nameW + gap, baseline);
    }),
  };
}

/** 名前公開型: セラピスト名(最大) > 地域・店名 > 人物像 > 定型文。詳細レビューは有料部分で読ませる */
function drawNamesBody(
  ctx: CanvasRenderingContext2D, input: ThumbnailInput, palette: Palette, header: HeaderMetrics,
): void {
  const teaser = fitBlock(ctx, NAMES_TEASER, GOTHIC, '900', {
    basePx: 72, minPx: 44, maxLines: 1, lineRatio: 1.28,
  });
  const bottomRule = drawBottomAccent(ctx, textVBlock(ctx, teaser, '900', palette.accent), header, palette);

  const shop = input.shopName === '' ? undefined : fitBlock(ctx, input.shopName, GOTHIC, '900', {
    basePx: 100, minPx: 56, maxLines: 1, lineRatio: 1.2,
  });
  const spec = input.specLine === '' ? undefined : fitBlock(ctx, input.specLine, GOTHIC, 'bold', {
    basePx: 54, minPx: 36, maxLines: 1, lineRatio: 1.3,
  });
  drawCentered([
    shop === undefined ? EMPTY_BLOCK : textVBlock(ctx, shop, '900', withAlpha(palette.text, 0.92)),
    therapistVBlock(ctx, input.therapistName, palette),
    spec === undefined ? EMPTY_BLOCK : textVBlock(ctx, spec, 'bold', withAlpha(palette.text, 0.8)),
  ], header.ruleBottom, bottomRule);
}

/** 概要型: フック(最大) > 人物像。店名とセラピスト名は有料部分で明かす */
function drawSummaryBody(
  ctx: CanvasRenderingContext2D, input: ThumbnailInput, palette: Palette, header: HeaderMetrics,
): void {
  const spec = input.specLine === '' ? undefined : fitBlock(ctx, input.specLine, GOTHIC, 'bold', {
    basePx: 66, minPx: 40, maxLines: 2, lineRatio: 1.32,
  });
  const bottomRule = drawBottomAccent(
    ctx, spec === undefined ? EMPTY_BLOCK : textVBlock(ctx, spec, 'bold', palette.accent), header, palette,
  );
  if (input.hook === '') return;
  // 上下に BODY_GAP 以上の余白を残せる高さに収める
  const hook = fitBlock(ctx, input.hook, GOTHIC, '900', {
    basePx: 150, minPx: 64, maxLines: 3, maxHeight: bottomRule - header.ruleBottom - BODY_GAP * 2, lineRatio: 1.18,
  });
  drawCentered([textVBlock(ctx, hook, '900', palette.text, true)], header.ruleBottom, bottomRule);
}

/** 先頭行: 明朝のシリーズ名 | エリア。下に二重線を引く */
function drawHeader(
  ctx: CanvasRenderingContext2D, area: string, palette: Palette, areaPx: number,
): HeaderMetrics {
  const baseline = TOP_MARGIN + 60;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = palette.accent;
  ctx.font = `700 60px ${MINCHO}`;
  ctx.letterSpacing = '6px';
  ctx.fillText(SERIES_NAME, MARGIN_X, baseline);
  const seriesW = ctx.measureText(SERIES_NAME).width;
  let textTop = baseline - ascentOf(ctx, SERIES_NAME);
  let textBottom = baseline + descentOf(ctx, SERIES_NAME);
  ctx.restore();

  const barX = MARGIN_X + seriesW + 36;
  const areaX = barX + 38;
  if (area !== '' && areaX < MARGIN_X + TEXT_W) {
    ctx.fillStyle = withAlpha(palette.accent, 0.6);
    ctx.fillRect(barX, baseline - 50, 3, 58);
    const block = fitBlock(ctx, area, GOTHIC, 'bold', {
      basePx: areaPx, minPx: 36, maxLines: 1, lineRatio: 1.2,
    }, MARGIN_X + TEXT_W - areaX);
    ctx.fillStyle = palette.text;
    drawBlock(ctx, block, GOTHIC, 'bold', baseline - block.size, areaX);
    const line = block.lines[0] ?? '';
    textTop = Math.min(textTop, baseline - ascentOf(ctx, line));
    textBottom = Math.max(textBottom, baseline + descentOf(ctx, line));
  }

  const ruleY = baseline + 34;
  ctx.fillStyle = withAlpha(palette.accent, 0.9);
  ctx.fillRect(MARGIN_X, ruleY, TEXT_W, 3);
  ctx.fillStyle = withAlpha(palette.accent, 0.45);
  ctx.fillRect(MARGIN_X, ruleY + 10, TEXT_W, 1.5);
  return { textTop, ruleGap: ruleY - textBottom, ruleBottom: ruleY + 11.5 };
}

/** 縦グラデーション + 上からのスポット光 + 周辺減光 + 粒子 */
function drawBackground(ctx: CanvasRenderingContext2D, palette: Palette): void {
  const base = ctx.createLinearGradient(0, 0, 0, THUMB_H);
  base.addColorStop(0, palette.bgTo);
  base.addColorStop(1, palette.bgFrom);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  const spotX = THUMB_W * 0.8;
  const spot = ctx.createRadialGradient(spotX, -80, 0, spotX, -80, THUMB_W * 0.9);
  spot.addColorStop(0, withAlpha(palette.accent, 0.2));
  spot.addColorStop(1, withAlpha(palette.accent, 0));
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  const cx = THUMB_W / 2;
  const cy = THUMB_H / 2;
  const vignette = ctx.createRadialGradient(cx, cy, THUMB_H * 0.45, cx, cy, THUMB_W * 0.75);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  const pattern = grainPattern(ctx);
  if (pattern === null) return;
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  ctx.restore();
}

/** 二重の細線と四隅の菱形。線だけ金属調にし、文字には使わない */
function drawFrame(ctx: CanvasRenderingContext2D, palette: Palette): void {
  const metal = ctx.createLinearGradient(0, 0, THUMB_W, THUMB_H);
  metal.addColorStop(0, mixHex(palette.accent, '#ffffff', 0.5));
  metal.addColorStop(0.35, palette.accent);
  metal.addColorStop(0.5, mixHex(palette.accent, '#000000', 0.3));
  metal.addColorStop(0.7, mixHex(palette.accent, '#ffffff', 0.25));
  metal.addColorStop(1, palette.accent);

  ctx.save();
  ctx.strokeStyle = metal;
  ctx.lineWidth = 3;
  ctx.strokeRect(FRAME_OUTER, FRAME_OUTER, THUMB_W - FRAME_OUTER * 2, THUMB_H - FRAME_OUTER * 2);
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(FRAME_INNER, FRAME_INNER, THUMB_W - FRAME_INNER * 2, THUMB_H - FRAME_INNER * 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = metal;
  const corners: readonly (readonly [number, number])[] = [
    [FRAME_OUTER, FRAME_OUTER], [THUMB_W - FRAME_OUTER, FRAME_OUTER],
    [FRAME_OUTER, THUMB_H - FRAME_OUTER], [THUMB_W - FRAME_OUTER, THUMB_H - FRAME_OUTER],
  ];
  for (const [x, y] of corners) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();
  }
  ctx.restore();
}

/** シード固定の粒子。毎回同じ画像になるよう乱数を固定する */
function grainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = document.createElement('canvas');
  tile.width = GRAIN_TILE;
  tile.height = GRAIN_TILE;
  const tctx = tile.getContext('2d');
  if (tctx === null) return null;
  const img = tctx.createImageData(GRAIN_TILE, GRAIN_TILE);
  const rnd = mulberry32(GRAIN_SEED);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 256);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  return ctx.createPattern(tile, 'repeat');
}

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseHex(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (m === null) throw new Error(`配色の色指定が #rrggbb 形式ではありません: ${hex}`);
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mixHex(from: string, to: string, t: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  const ch = (i: 0 | 1 | 2): number => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}
