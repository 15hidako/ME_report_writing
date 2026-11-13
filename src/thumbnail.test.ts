import { describe, expect, it } from 'vitest';
import {
  fitLines, manualLineBreaks, mixHex, splitHonorific, THUMB_H, THUMB_W, withAlpha, wrapText,
} from './thumbnail';
import type { BlockSpec } from './thumbnail';

// 1文字=10pxの固定幅で測る
const measure = (text: string): number => [...text].length * 10;
// 1文字の幅=文字サイズで測る
const measureAt = (size: number) => (text: string): number => [...text].length * size;

describe('サムネイルの寸法', () => {
  it('wakustのトップ画像と同じ縦:横=2:3の横長で出力する', () => {
    expect(THUMB_H * 3).toBe(THUMB_W * 2);
    expect(THUMB_W).toBeGreaterThan(THUMB_H);
  });
});

describe('splitHonorific', () => {
  it('名前だけなら敬称「さん」を補う', () => {
    expect(splitHonorific('ともみ')).toEqual({ name: 'ともみ', honorific: 'さん' });
  });

  it('末尾の「さん」は名前から切り離し、二重にしない', () => {
    expect(splitHonorific('ともみさん')).toEqual({ name: 'ともみ', honorific: 'さん' });
  });

  it('前後の空白を除く', () => {
    expect(splitHonorific(' ともみ さん ')).toEqual({ name: 'ともみ', honorific: 'さん' });
  });

  it('空の名前には敬称を付けない', () => {
    expect(splitHonorific('')).toEqual({ name: '', honorific: '' });
  });
});

describe('配色の色計算', () => {
  it('#rrggbbに透明度を付ける', () => {
    expect(withAlpha('#ff4d8d', 0.5)).toBe('rgba(255, 77, 141, 0.5)');
  });

  it('2色を指定の比率で混ぜる', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(mixHex('#e8c66a', '#ffffff', 0)).toBe('rgb(232, 198, 106)');
  });

  it('#rrggbb以外の色指定は理由つきで拒否する', () => {
    expect(() => withAlpha('red', 1)).toThrow('#rrggbb');
  });
});

describe('wrapText', () => {
  it('幅に収まる文字列は1行のまま返す', () => {
    expect(wrapText('恵比寿', 100, measure)).toEqual(['恵比寿']);
  });

  it('区切り文字の直後で折り返す', () => {
    expect(wrapText('小柄Fカップ・元経験者ギャル', 80, measure)).toEqual(['小柄Fカップ・', '元経験者ギャル']);
  });

  it('区切りのない長い語は文字単位で分割し、文字を落とさない', () => {
    const lines = wrapText('あいうえおかきくけこさし', 50, measure);
    expect(lines).toEqual(['あいうえお', 'かきくけこ', 'さし']);
    expect(lines.join('')).toBe('あいうえおかきくけこさし');
  });

  it('英数字の並びの途中では折り返さない', () => {
    expect(wrapText('圧強KWKWテクでSKR不可避', 90, measure)).toEqual(['圧強KWKWテクで', 'SKR不可避']);
  });

  it('英字に続く語(Eカップ等)を英字の直後で切り離さない', () => {
    expect(wrapText('スレンダー・Eカップ', 70, measure)).toEqual(['スレンダー・', 'Eカップ']);
  });

  it('空白での折り返しでは行頭と行末の空白を残さない', () => {
    expect(wrapText('体験談 #12', 40, measure)).toEqual(['体験談', '#12']);
  });

  it('空文字列は行を作らない', () => {
    expect(wrapText('', 100, measure)).toEqual([]);
  });

  it('行数を変えずに各行の長さをそろえ、最後の行だけ短く残さない', () => {
    expect(wrapText('あいう・えおか・き', 80, measure)).toEqual(['あいう・', 'えおか・き']);
  });

  it('3行でも各行の長さをそろえる', () => {
    // 前から詰めると ['あいう・えお・', 'かきく・けこ・', 'さ'] になる
    expect(wrapText('あいう・えお・かきく・けこ・さ', 70, measure)).toEqual(['あいう・', 'えお・かきく・', 'けこ・さ']);
  });

  it('改行文字では必ず改行する', () => {
    expect(wrapText('圧強KWKW\nテクでSKR不可避', 1000, measure)).toEqual(['圧強KWKW', 'テクでSKR不可避']);
  });

  it('改行で分けた各段落の中でも折り返す', () => {
    expect(wrapText('あ\nいう・えお', 30, measure)).toEqual(['あ', 'いう・', 'えお']);
  });
});

describe('manualLineBreaks', () => {
  it('半角と全角のスラッシュを改行に置き換える', () => {
    expect(manualLineBreaks('圧強KWKWテクで/SKR不可避／確定')).toBe('圧強KWKWテクで\nSKR不可避\n確定');
  });

  it('区切りの前後の空白と空の行を除く', () => {
    expect(manualLineBreaks(' 圧強 / / 不可避 ')).toBe('圧強\n不可避');
  });

  it('スラッシュがなければそのまま返す', () => {
    expect(manualLineBreaks('圧強KWKWテク')).toBe('圧強KWKWテク');
  });
});

describe('fitLines', () => {
  const spec: BlockSpec = { basePx: 40, minPx: 20, maxLines: 2, lineRatio: 1.5 };

  it('基準サイズで収まる文字列は基準サイズのまま返す', () => {
    expect(fitLines('渋谷', 200, spec, measureAt)).toEqual({ lines: ['渋谷'], size: 40, lineHeight: 60 });
  });

  it('行数の上限に収まるまで文字サイズを下げる', () => {
    const block = fitLines('あいうえおかきくけこさしすせそ', 200, spec, measureAt);
    expect(block.lines.length).toBeLessThanOrEqual(2);
    expect(block.size).toBeLessThan(40);
    expect(block.lines.join('')).toBe('あいうえおかきくけこさしすせそ');
  });

  it('語の途中で切らずに収まるサイズを優先する', () => {
    const block = fitLines('あいうえお・かきくけこ', 200, spec, measureAt);
    expect(block.lines).toEqual(['あいうえお・', 'かきくけこ']);
  });

  it('最小サイズでも収まらない文字列は上限の行数で打ち切り、末尾を「…」にする', () => {
    const block = fitLines('あ'.repeat(100), 200, spec, measureAt);
    expect(block.lines).toHaveLength(2);
    expect(block.lines[1]?.endsWith('…')).toBe(true);
    expect(block.lines.every((line) => measureAt(block.size)(line) <= 200)).toBe(true);
  });

  it('高さの上限を超えるブロックを返さない', () => {
    const block = fitLines('あ'.repeat(100), 200, { ...spec, maxLines: 5, maxHeight: 70 }, measureAt);
    expect(block.lines.length * block.lineHeight).toBeLessThanOrEqual(70);
  });

  it('採用したサイズで各行の長さをそろえる', () => {
    expect(fitLines('あいう・えおか・き', 80, { ...spec, basePx: 10, minPx: 8 }, measureAt).lines)
      .toEqual(['あいう・', 'えおか・き']);
  });

  it('改行の数が行数の上限を超えるときは上限の行数で打ち切る', () => {
    const block = fitLines('あ\nい\nう', 200, spec, measureAt);
    expect(block.lines).toEqual(['あ', 'い…']);
  });

  it('高さの余地がないときは行を返さない', () => {
    expect(fitLines('渋谷', 200, { ...spec, maxHeight: -30 }, measureAt).lines).toEqual([]);
  });
});
