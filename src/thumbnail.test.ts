import { describe, expect, it } from 'vitest';
import { fitLines, THUMB_H, THUMB_W, wrapText } from './thumbnail';
import type { BlockSpec } from './thumbnail';

// 1文字=10pxの固定幅で測る
const measure = (text: string): number => [...text].length * 10;
// 1文字の幅=文字サイズで測る
const measureAt = (size: number) => (text: string): number => [...text].length * size;

describe('サムネイルの寸法', () => {
  it('wakustのトップ画像と同じ縦横比2:3で出力する', () => {
    expect(THUMB_W * 3).toBe(THUMB_H * 2);
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

  it('高さの余地がないときは行を返さない', () => {
    expect(fitLines('渋谷', 200, { ...spec, maxHeight: -30 }, measureAt).lines).toEqual([]);
  });
});
