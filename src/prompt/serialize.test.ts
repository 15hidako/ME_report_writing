import { describe, expect, it } from 'vitest';
import { fixtureRecord } from '../test-fixtures';
import { buildMatomePrompt, buildRevisitPrompt, buildSinglePrompt } from './build-prompt';
import { serializeRecord } from './serialize';

describe('serializeRecord の費用', () => {
  it.each([
    { name: '保存済みの金額', courseFee: 18000, nominationFee: 1000, course: '18,000円', nomination: '1,000円' },
    { name: '0円', courseFee: 0, nominationFee: 0, course: '0円', nomination: '0円' },
    { name: '未確認', courseFee: null, nominationFee: null, course: '未確認', nomination: '未確認' },
  ])('コース代と指名料を出力する: $name', ({ courseFee, nominationFee, course, nomination }) => {
    const base = fixtureRecord();
    const text = serializeRecord(fixtureRecord({ basic: { ...base.basic, courseFee, nominationFee } }));

    expect(text).toContain(`- コース代: ${course}`);
    expect(text).toContain(`- 指名料: ${nomination}`);
  });

  it('旧記録のコース自由記述を残し、未保存の金額は推測しない', () => {
    const text = serializeRecord(fixtureRecord());

    expect(text).toContain('- コース: 80分 18,000円');
    expect(text).toContain('- コース代: 未確認');
    expect(text).toContain('- 今回のオプション代合計: 未確認');
    expect(text).not.toContain('- コース代: 18,000円');
    expect(text).not.toContain('- 今回のオプション代合計: 6,000円');
  });

  describe.each(['旧形式', '構造化'] as const)('%sのオプション', (format) => {
    it.each([
      { name: '保存済みの金額', amount: 3000, expected: '3,000円' },
      { name: '0円', amount: 0, expected: '0円' },
      { name: '未確認', amount: null, expected: '未確認' },
      { name: '未保存', amount: undefined, expected: '未確認' },
    ])('今回のオプション代合計を出力する: $name', ({ amount, expected }) => {
      const base = fixtureRecord();
      const basic = {
        ...base.basic,
        ...(format === '構造化' ? { options: [{ type: 'costume', detail: '選べる衣装', price: 4000 }] } : {}),
        ...(amount === undefined ? {} : { optionFee: amount }),
      };
      const text = serializeRecord(fixtureRecord({ basic }));

      expect(text).toContain(`- 今回のオプション代合計: ${expected}`);
      if (format === '構造化') {
        expect(text).toContain('- オプション体系（メニューと設定価格）: 1種類');
        expect(text).toContain('衣装変更（選べる衣装）: 4,000円');
      } else {
        expect(text).toContain('- オプション体系: 3種類(4K・5K・6K) → 選択: 6K');
      }
    });
  });

  it('空のオプションメニューでも保存された今回の支払額を残す', () => {
    const base = fixtureRecord();
    const text = serializeRecord(fixtureRecord({ basic: { ...base.basic, options: [], optionFee: 3000 } }));

    expect(text).toContain('- オプション体系（メニューと設定価格）: なし');
    expect(text).toContain('- 今回のオプション代合計: 3,000円');
  });

  it('メニュー価格から支払額や割引額を計算しない', () => {
    const base = fixtureRecord();
    const text = serializeRecord(fixtureRecord({ basic: {
      ...base.basic,
      courseFee: 15000,
      nominationFee: 1000,
      optionFee: 3000,
      options: [
        { type: 'costume', detail: '', price: 4000 },
        { type: 'extension', detail: '', price: 6000 },
      ],
    } }));

    expect(text).toContain('- 今回のオプション代合計: 3,000円');
    expect(text).not.toContain('10,000円');
    expect(text).not.toContain('19,000円');
    expect(text).not.toContain('7,000円');
    expect(text).not.toContain('支払総額');
    expect(text).not.toContain('割引');
  });
});

describe('記事生成プロンプトの費用', () => {
  it('単体記事に保存された費用を渡す', () => {
    const base = fixtureRecord();
    const prompt = buildSinglePrompt(fixtureRecord({ basic: {
      ...base.basic, courseFee: 15000, nominationFee: 1000, optionFee: 3000,
    } }));

    expect(prompt).toContain('- コース代: 15,000円');
    expect(prompt).toContain('- 指名料: 1,000円');
    expect(prompt).toContain('- 今回のオプション代合計: 3,000円');
  });

  it('再訪記事では初回と今回の費用をそれぞれ渡す', () => {
    const base = fixtureRecord();
    const first = fixtureRecord({ basic: { ...base.basic, courseFee: 15000, nominationFee: 1000, optionFee: 3000 } });
    const revisit = fixtureRecord({ id: 'revisit', seriesNo: 2, revisitOf: first.id, basic: {
      ...base.basic, courseFee: 20000, nominationFee: 0, optionFee: 0, options: [],
    } });
    const prompt = buildRevisitPrompt(revisit, first);
    const [firstData, revisitData] = prompt.split('### 今回(再訪)の訪問データ');

    expect(firstData).toContain('- コース代: 15,000円');
    expect(firstData).toContain('- 指名料: 1,000円');
    expect(firstData).toContain('- 今回のオプション代合計: 3,000円');
    expect(revisitData).toContain('- コース代: 20,000円');
    expect(revisitData).toContain('- 指名料: 0円');
    expect(revisitData).toContain('- 今回のオプション代合計: 0円');
  });

  it('まとめ記事に選択した記録の費用を渡す', () => {
    const base = fixtureRecord();
    const records = Array.from({ length: 6 }, (_, index) => fixtureRecord({
      id: `published-${index}`, seriesNo: index + 1, postedUrl: `https://wakust.com/u/${index}/`,
      basic: { ...base.basic, therapistName: `person-${index}`, courseFee: 15000, nominationFee: 1000, optionFee: 3000 },
    }));
    const prompt = buildMatomePrompt(records.slice(0, 1), 'テーマ', records);

    expect(prompt).toContain('- コース代: 15,000円');
    expect(prompt).toContain('- 指名料: 1,000円');
    expect(prompt).toContain('- 今回のオプション代合計: 3,000円');
  });
});
