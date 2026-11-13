import { describe, expect, it } from 'vitest';
import { fixtureRecord } from '../test-fixtures';
import { buildArticlePrompt } from './article-prompt';
import { buildMarkupPrompt } from './markup-prompt';

/** 「## 出力形式」から次の見出しまで */
const outputSection = (text: string): string => {
  const start = text.indexOf('## 出力形式');
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end === -1 ? undefined : end);
};

describe('記事プロンプトの本文の書き方', () => {
  const record = fixtureRecord({ id: 'rec-1', seriesNo: 5 });

  it('保存先があれば素の文章で書かせ、HTMLのタグも装飾の指示も出さない', () => {
    const { text } = buildArticlePrompt(record, [record], 'paid', '', 'C:\\repo\\data\\articles');
    const format = outputSection(text);
    expect(format).toContain('3. 無料部分(素の文章): 記事構成の<h3>見出し</h3>は「### 見出し」の1行');
    expect(format).toContain('4. 有料部分(素の文章): 同上');
    expect(format).not.toContain('<span style> は強調したい一言にだけ使う');
    expect(text).toContain('C:\\repo\\data\\articles\\0005-rec-1\\standard\\free-part.txt');
  });

  it('保存先がない公開版では、これまでどおり投稿欄へ貼るHTMLで書かせる', () => {
    const format = outputSection(buildArticlePrompt(record, [record], 'paid', '', null).text);
    expect(format).toContain('3. 無料部分HTML: <h3><p><ul><li><a><strong><em><small><span style><br />のみ使用');
    expect(format).toContain('<span style> は強調したい一言にだけ使う');
    expect(format).not.toContain('素の文章');
  });
});

describe('マークアップの依頼', () => {
  const prompt = buildMarkupPrompt('/repo/data/articles', '0005-rec-1', 'free');

  it('版のフォルダの素の文章を読ませ、同じフォルダのHTMLへ書かせる', () => {
    expect(prompt).toContain('- 無料部分: /repo/data/articles/0005-rec-1/names/free-part.txt → /repo/data/articles/0005-rec-1/names/free-part.html');
    expect(prompt).toContain('- 有料部分: /repo/data/articles/0005-rec-1/names/paid-part.txt → /repo/data/articles/0005-rec-1/names/paid-part.html');
    expect(prompt).toContain('素の文章のファイルは書き換えない');
  });

  it('言葉を変えさせず、使えるタグと装飾は記事プロンプトと同じに限る', () => {
    expect(prompt).toContain('言葉は一切変えず');
    expect(prompt).toContain('<h3><p><ul><li><a><strong><em><small><span style><br /> だけ');
    expect(prompt).toContain('<span style> は強調したい一言にだけ使う');
    expect(prompt).toContain('URLの文字列も次の行にテキストで残す');
  });
});
