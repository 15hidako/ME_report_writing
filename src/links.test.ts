import { describe, expect, it } from 'vitest';
import { boardCardHref, editHref, takeParam } from './links';

describe('入力画面とボードの行き来', () => {
  it('回答IDをURLに入れるときはエスケープする', () => {
    expect(editHref('a b&c')).toBe('./?edit=a%20b%26c');
    expect(boardCardHref('a b&c')).toBe('./board.html?card=a%20b%26c');
  });

  it('一度だけ使う引数を取り出し、ほかの引数とハッシュは残す', () => {
    expect(takeParam('https://x.example/app/?kind=single&card=id-1#top', 'card')).toEqual({
      value: 'id-1', rest: 'https://x.example/app/?kind=single#top',
    });
    expect(takeParam('https://x.example/app/', 'edit')).toEqual({ value: null, rest: 'https://x.example/app/' });
  });

  it('空の値は無いものとして扱う', () => {
    expect(takeParam('https://x.example/?edit=', 'edit')).toEqual({ value: null, rest: 'https://x.example/' });
  });
});
