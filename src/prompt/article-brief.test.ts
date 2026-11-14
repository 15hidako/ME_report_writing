import { describe, expect, it } from 'vitest';
import { fixtureRecord } from '../test-fixtures';
import type { VisitRecord } from '../types';
import { buildArticleBrief, buildArticlePrompt } from './article-prompt';
import { BRIEF_LABELS } from './brief-labels';
import { STYLE_PROFILE } from './style-profile';
import { buildMarkupBrief, buildMarkupPrompt } from './markup-prompt';
import { articleSkill, markupSkill } from './skill-files';

const DIR = 'C:\\repo\\data\\articles';
const base = fixtureRecord({ id: 'rec-1', seriesNo: 5 });
const first = fixtureRecord({ id: 'first', seriesNo: 1, postedUrl: 'https://wakust.com/u/1/' });
const revisit = fixtureRecord({ id: 'rec-2', seriesNo: 6, revisitOf: 'first' });
/** 店名が空でプロフィールURLがあると、店舗情報の確認が付く */
const lookup = fixtureRecord({ id: 'rec-3', seriesNo: 7, basic: { ...base.basic, shopName: '' } });
const records = [base, first, revisit, lookup];

/**
 * 全文プロンプトにあって、依頼文にも skill にも同じ文では入らない行。
 * skill は記事の種類や依頼文を指す書き方に変えているので、意味が同じことを個別に確かめる
 */
const REWORDED = [
  /^あなたはメンズエステ体験レポートの専属ライターです。/,
  /^## 出力形式\(この[45]ブロックを順に/,
  /^1\. タイトル: /,
  /^5\. 店舗情報JSON: /,
];

const cases: readonly { readonly name: string; readonly record: VisitRecord; readonly date: string }[] = [
  { name: '単体', record: base, date: '2026-11-10' },
  { name: '単体・出勤確認なし', record: base, date: '' },
  { name: '再訪', record: revisit, date: '2026-11-10' },
  { name: '店舗情報の確認あり', record: lookup, date: '2026-11-10' },
];

describe('buildArticleBrief', () => {
  const skill = articleSkill();

  for (const { name, record, date } of cases) {
    for (const disclosure of ['paid', 'free'] as const) {
      it(`${name}・${disclosure}: 全文プロンプトの行は、依頼文か skill のどちらかに同じ文で入る`, () => {
        const full = buildArticlePrompt(record, records, disclosure, date, DIR).text;
        const brief = buildArticleBrief(record, records, disclosure, date, DIR).text;
        const missing = full.split('\n')
          .filter((line) => line.trim() !== '')
          .filter((line) => !REWORDED.some((pattern) => pattern.test(line)))
          .filter((line) => !brief.includes(line) && !skill.includes(line));
        expect(missing).toEqual([]);
      });
    }
  }

  it('先頭で skill を呼び、規則の本文は入れない', () => {
    const { text } = buildArticleBrief(base, records, 'paid', '2026-11-10', DIR);
    expect(text.startsWith('/me-article\n')).toBe(true);
    expect(text).not.toContain(STYLE_PROFILE);
    expect(text).not.toContain('## 出力形式');
    expect(text.length).toBeLessThan(buildArticlePrompt(base, records, 'paid', '2026-11-10', DIR).text.length / 2);
  });

  it('販売型と保存先のフォルダを合わせて示す', () => {
    expect(buildArticleBrief(base, records, 'paid', '', DIR).text)
      .toContain(`## ${BRIEF_LABELS.disclosure}\n体験内容起点(保存先のフォルダは standard)`);
    const free = buildArticleBrief(base, records, 'free', '', DIR).text;
    expect(free).toContain(`## ${BRIEF_LABELS.disclosure}\nセラピスト起点(保存先のフォルダは names)`);
    expect(free).toContain(`## ${BRIEF_LABELS.save}\n- タイトル: ${DIR}\\0005-rec-1\\names\\title.txt`);
  });

  it('再訪では初回記事URLと初回の訪問データを入れ、販売ポイント案は入れない', () => {
    const { text, notice } = buildArticleBrief(revisit, records, 'paid', '', DIR);
    expect(notice).toBeNull();
    expect(text).toContain(`## ${BRIEF_LABELS.revisit}`);
    expect(text).toContain('初回記事URL: https://wakust.com/u/1/');
    expect(text).toContain('### 初回訪問データ(参照用・重複記述を避けるため)');
    expect(text).not.toContain('販売ポイント案');
  });

  it('再訪元がなければ単体として作り、知らせる', () => {
    const { text, notice } = buildArticleBrief(revisit, [revisit], 'paid', '', DIR);
    expect(notice).toBe('初回レコードが見つかりません。単体として生成します');
    expect(text).not.toContain(`## ${BRIEF_LABELS.revisit}`);
  });

  it('全文プロンプトと同じく、出勤確認日の誤りと再訪の循環は例外にする', () => {
    expect(() => buildArticleBrief(base, records, 'paid', '2026-02-30', DIR)).toThrow('出勤確認日');
    const loop = fixtureRecord({ id: 'loop', revisitOf: 'loop' });
    expect(() => buildArticleBrief(loop, [loop], 'paid', '', DIR)).toThrow('再訪の参照が循環しています');
  });
});

describe('buildMarkupBrief', () => {
  it('全文プロンプトの行は、依頼文か skill のどちらかに同じ文で入る', () => {
    const skill = markupSkill();
    for (const disclosure of ['paid', 'free'] as const) {
      const brief = buildMarkupBrief(DIR, '0005-rec-1', disclosure);
      const missing = buildMarkupPrompt(DIR, '0005-rec-1', disclosure).split('\n')
        .filter((line) => line.trim() !== '' && !brief.includes(line) && !skill.includes(line));
      expect(missing).toEqual([]);
    }
  });

  it('skill を呼び、ファイルの組だけを渡す', () => {
    expect(buildMarkupBrief(DIR, '0005-rec-1', 'free')).toBe(`/me-markup

## ${BRIEF_LABELS.save}
- 無料部分: ${DIR}\\0005-rec-1\\names\\free-part.txt → ${DIR}\\0005-rec-1\\names\\free-part.html
- 有料部分: ${DIR}\\0005-rec-1\\names\\paid-part.txt → ${DIR}\\0005-rec-1\\names\\paid-part.html`);
  });
});
