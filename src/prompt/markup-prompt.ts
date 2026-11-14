// 本人がボードで直した素の文章を、投稿欄のソースエディタへ貼るHTMLにする依頼。
// 文章は本人が決めたものなので、Claude にはタグを付けることだけを頼み、言葉は変えさせない(U-23)。

import { MARKUP_PAIRS, joinPath, partSpec, variantDir } from './article-files';
import { BRIEF_LABELS, MARKUP_SKILL_NAME } from './brief-labels';
import { PLAIN_NOTATION } from './build-prompt';
import { decorationGuide } from './decoration';
import type { NameDisclosure } from './style-profile';

/** マークアップの依頼の冒頭。何を頼むか */
export const MARKUP_TASK = `wakustに投稿する記事の素の文章を、投稿欄のソースエディタへそのまま貼れるHTMLにマークアップしてください。
文章は本人が推敲を終えたものです。言葉は一切変えず、タグを付けることだけを行ってください。`;

/** ファイルの読み書きの規則。この文はskillに置き、読むファイルと保存先は記事ごとの依頼に入れる */
export const MARKUP_FILE_RULE = '次の素の文章を読み、矢印の先のファイルへHTMLをUTF-8で保存する。既存のファイルは上書きする。素の文章のファイルは書き換えない。';

/** 素の文章のファイルと、HTMLの保存先の組。1組を1行にする */
export function markupFileLines(baseDir: string, folderName: string, disclosure: NameDisclosure): string {
  const dir = variantDir(baseDir, folderName, disclosure);
  return MARKUP_PAIRS.map(({ text, html }) =>
    `- ${partSpec(text).label}: ${joinPath(dir, partSpec(text).file)} → ${joinPath(dir, partSpec(html).file)}`).join('\n');
}

/** Claude Code に me-markup の skill でマークアップさせる依頼文。規則は skill に置き、ファイルの組だけを渡す(docs/19) */
export function buildMarkupBrief(baseDir: string, folderName: string, disclosure: NameDisclosure): string {
  return `/${MARKUP_SKILL_NAME}

## ${BRIEF_LABELS.save}
${markupFileLines(baseDir, folderName, disclosure)}`;
}

/**
 * マークアップの依頼の全文。ボードは buildMarkupBrief を使うのでここは呼ばない。
 * me-markup の skill と依頼文がこの全文の指示を欠かさず持つかを、テストで照らし合わせる基準として残す(docs/19 WP3)
 */
export function buildMarkupPrompt(baseDir: string, folderName: string, disclosure: NameDisclosure): string {
  return `${MARKUP_TASK}

## ファイル(Claude Code)
${MARKUP_FILE_RULE}
${markupFileLines(baseDir, folderName, disclosure)}

${MARKUP_RULES}`;
}

/** 記法・マークアップの規則・装飾・守ること。記事によらず同じ */
export const MARKUP_RULES = `## 素の文章の記法
${PLAIN_NOTATION}

## マークアップの規則
- 「### 」の行は見出しの部品、続けて並んだ「- 」の行は <ul><li>(評価6軸は評価のカードの div)、空行で区切った段落は <p> にする。段落の中で改行された行も、それぞれ1つの <p> にする(<br /> でつながない。行の区切りの位置は変えない)。どの部品を使うかは見出しの言葉と「装飾」の使う場所で決め、当てはまらない見出しは「見出し」の部品にする
- 段落の中に「」のセリフだけの行があれば、その行を段落から出して彼女のセリフの部品にしてよい(行の区切りの位置は変えない)
- 装飾は style 属性とタグだけで付け、✓・◆・ラベルの語など本文にない文字を足さない。例外は、彼女のセリフの丸に入れる「彼女」だけ
- 今回のセラピストを表にするときは、各項目の最初の「:」「：」で項目と値に分け、その記号だけは書かなくてよい
- URLはリンクの部品にする。直前の行が店名・源氏名・プロフィールなどの名前なら、その名前をリンクの文字にし、URLの文字列も次の行にテキストで残す(例: <a href="URL">店名</a><br />URL)。名前の行がなければURLの文字列をそのままリンクの文字にする
- 有料部分の内容の説明に続く免責の一文は補足の小さな字、記事の締めの「皆さまのご武運をお祈りいたします！」は締めの一文の部品にする
- 強調は記事の読みどころになる短い一言にだけマーカーの部品で付ける。付けすぎない

${decorationGuide()}

## 守ること
- 文字、語順、句読点、改行の位置を変えない。言葉を足さず、削らない。誤字や事実の誤りに気づいても直さず、保存のあとにチャットで指摘する
- 記法の記号(「### 」「- 」)はタグに置き換え、本文に残さない
- 保存したら、タグを除いた文字の並びが素の文章(記法の記号と空行、表にしたときに省いた「:」「：」、セリフの丸の「彼女」を除く)と一致するか確かめ、結果を一言で報告する`;
