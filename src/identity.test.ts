import { describe, expect, it } from 'vitest';
import { blankFields, pageKey, shopUrlFromProfile, siteKey, suggestIdentity } from './identity';
import { fixtureRecord } from './test-fixtures';
import type { VisitRecord } from './types';

function record(seriesNo: number, basic: Partial<VisitRecord['basic']>): VisitRecord {
  const base = fixtureRecord();
  return { ...base, id: `id-${seriesNo}`, seriesNo, basic: { ...base.basic, ...basic } };
}

describe('URLの比較キー', () => {
  it('同じサイトは www の有無と大文字小文字を区別しない', () => {
    expect(siteKey('https://WWW.Example.com/cast/1')).toBe('example.com');
    expect(siteKey('http://example.com/')).toBe('example.com');
  });

  it('同じページは末尾スラッシュとハッシュを区別せず、クエリは区別する', () => {
    expect(pageKey('https://example.com/cast/1/#top')).toBe(pageKey('https://www.example.com/cast/1'));
    expect(pageKey('https://example.com/cast?id=1')).not.toBe(pageKey('https://example.com/cast?id=2'));
  });

  it('http(s)以外や不正なURLは比較しない', () => {
    expect(siteKey('javascript:alert(1)')).toBeNull();
    expect(pageKey('example.com/cast/1')).toBeNull();
  });

  it('店URLの候補はプロフィールURLのサイトのトップにする', () => {
    expect(shopUrlFromProfile('https://example.com/cast/1?x=1#a')).toBe('https://example.com/');
    expect(shopUrlFromProfile('not a url')).toBeNull();
  });
});

describe('過去記録からの補完候補', () => {
  const history = [
    record(1, { therapistProfileUrl: 'https://example.com/cast/1', shopUrl: 'https://example.com/top/' }),
    record(2, {
      therapistProfileUrl: 'https://example.com/cast/2', shopName: '天界のスパ 本店', shopUrl: '',
      therapistName: 'みお', therapistXUrl: '',
    }),
    record(3, { therapistProfileUrl: 'https://other.example/cast/9', shopName: '別の店', therapistName: 'りん' }),
  ];

  it('同じプロフィールURLの記録があれば全項目を候補にする', () => {
    expect(suggestIdentity(history, 'https://www.example.com/cast/1/')).toEqual({
      values: {
        shopName: '天界のスパ', shopUrl: 'https://example.com/top/',
        therapistName: 'えりか', therapistXUrl: 'https://x.com/example',
      },
      sameTherapistSeriesNo: 1,
    });
  });

  it('同じサイトの別セラピストなら、最新の記録から店の情報だけを候補にする', () => {
    expect(suggestIdentity(history, 'https://example.com/cast/77')).toEqual({
      values: { shopName: '天界のスパ 本店' },
      sameTherapistSeriesNo: null,
    });
  });

  it('編集中の記録自身は候補の元にしない', () => {
    expect(suggestIdentity(history, 'https://other.example/cast/9', 'id-3')).toEqual({
      values: {}, sameTherapistSeriesNo: null,
    });
  });

  it('初めてのサイトや不正なURLでは候補を出さない', () => {
    expect(suggestIdentity(history, 'https://new.example/cast/1').values).toEqual({});
    expect(suggestIdentity(history, 'https://').values).toEqual({});
  });
});

describe('空欄の判定', () => {
  it('空欄の項目だけを返す', () => {
    expect(blankFields({ shopName: '店', shopUrl: '', therapistName: ' ', therapistXUrl: 'https://x.com/a' }))
      .toEqual(['shopUrl', 'therapistName']);
  });
});
