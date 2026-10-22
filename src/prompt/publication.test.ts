import { describe, expect, it } from 'vitest';
import { fixtureRecord } from '../test-fixtures';
import { countPublishedTherapists } from './publication';

describe('countPublishedTherapists', () => {
  it('未投稿と再訪を6人分の投稿実績に含めない', () => {
    expect(countPublishedTherapists([
      fixtureRecord(),
      fixtureRecord({ id: 'p1', postedUrl: 'https://wakust.com/u/1/' }),
      fixtureRecord({ id: 'r2', revisitOf: 'p1', postedUrl: 'https://wakust.com/u/2/', sales: { points: 100, articleType: 'revisit' } }),
    ])).toBe(1);
  });

  it('同じ店と名前の表記違いを重複計上しない', () => {
    const first = fixtureRecord({ postedUrl: 'https://wakust.com/u/1/' });
    const second = fixtureRecord({ id: 'p2', postedUrl: 'https://wakust.com/u/2/', basic: { ...first.basic, shopName: ` ${first.basic.shopName} `, therapistName: ` ${first.basic.therapistName} ` } });
    expect(countPublishedTherapists([first, second])).toBe(1);
  });

  it('同じ投稿URLを別名の実績として数えず、未入力の店名や名前も除外する', () => {
    const first = fixtureRecord({ postedUrl: 'https://wakust.com/u/1/?source=a' });
    const duplicate = fixtureRecord({ id: 'p2', postedUrl: 'https://wakust.com/u/1/#part', basic: { ...first.basic, therapistName: 'another' } });
    const unnamed = fixtureRecord({ id: 'p3', postedUrl: 'https://wakust.com/u/3/', basic: { ...first.basic, therapistName: ' ' } });
    expect(countPublishedTherapists([first, duplicate, unnamed])).toBe(1);
  });

  it('投稿済みの異なる6人を数える', () => {
    const records = Array.from({ length: 6 }, (_, n) => fixtureRecord({ id: `p${n}`, postedUrl: `https://wakust.com/u/${n}/`, basic: { ...fixtureRecord().basic, therapistName: `person${n}` } }));
    expect(countPublishedTherapists(records)).toBe(6);
  });

  it.each(['https://example.com/article/1', 'https://wakust.com@evil.example/article/1', 'https://wakust.com/', 'javascript:alert(1)'])('ワクストの記事URLではない値(%s)を投稿実績に含めない', (postedUrl) => {
    expect(countPublishedTherapists([fixtureRecord({ postedUrl })])).toBe(0);
  });

  it('同じ記事のHTTPとHTTPS、www付きURLを重複計上しない', () => {
    const record = fixtureRecord({ postedUrl: 'http://www.wakust.com/u/1/' });
    const duplicate = fixtureRecord({ id: 'other', postedUrl: 'https://wakust.com/u/1/', basic: { ...record.basic, therapistName: 'other' } });
    expect(countPublishedTherapists([record, duplicate])).toBe(1);
  });
});
