import { describe, expect, it } from 'vitest';
import { fixtureRecord } from '../test-fixtures';
import { buildArticlePrompt } from './article-prompt';
import { buildMarkupPrompt } from './markup-prompt';
import { decorationGuide } from './decoration';
import { PLAIN_READING } from './build-prompt';
import { articleSkill } from './skill-files';

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
    expect(format).not.toContain('## 装飾');
    expect(text).toContain('C:\\repo\\data\\articles\\0005-rec-1\\standard\\free-part.txt');
  });

  it('素の文章では、文体ルールと記事構成に出てくるタグも読み替えさせる', () => {
    const format = outputSection(buildArticlePrompt(record, [record], 'paid', '', 'C:\\repo\\data\\articles').text);
    expect(format).toContain(PLAIN_READING);
    expect(outputSection(buildArticlePrompt(record, [record], 'paid', '', null).text)).not.toContain(PLAIN_READING);
    expect(articleSkill()).toContain(PLAIN_READING);
  });

  it('保存先がない公開版では、これまでどおり投稿欄へ貼るHTMLで書かせる', () => {
    const format = outputSection(buildArticlePrompt(record, [record], 'paid', '', null).text);
    expect(format).toContain('3. 無料部分HTML: <p><div><ul><li><table><tbody><tr><th><td><a><em><small><span><br />のみ使用');
    expect(format).not.toContain('素の文章');
    expect(buildArticlePrompt(record, [record], 'paid', '', null).text).toContain('## 装飾');
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
    expect(prompt).toContain(decorationGuide());
    expect(prompt).toContain('URLの文字列も次の行にテキストで残す');
  });

  it('装飾のために本文にない文字を足させない', () => {
    expect(prompt).toContain('本文にない文字を足さない');
    expect(prompt).toContain('表にしたときに省いた「:」「：」、セリフの丸の「彼女」を除く');
    expect(prompt).toContain('例外は、彼女のセリフの丸に入れる「彼女」だけ');
  });
});

describe('締めの一文の定型', () => {
  it('記事プロンプトとマークアップの依頼で、締めの「！」を全角にする', () => {
    const record = fixtureRecord({ id: 'rec-1', seriesNo: 5 });
    const prompts = [
      buildArticlePrompt(record, [record], 'paid', '', 'C:\repo\data\articles').text,
      buildMarkupPrompt('C:\repo\data\articles', '0005-rec-1', 'paid'),
    ];
    for (const text of prompts) {
      expect(text).toContain('皆さまのご武運をお祈りいたします！');
      expect(text).not.toContain('お祈りいたします!');
    }
  });
});
