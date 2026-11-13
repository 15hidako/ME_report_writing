// 本人がボードで直した素の文章を、投稿欄のソースエディタへ貼るHTMLにする依頼。
// 文章は本人が決めたものなので、Claude にはタグを付けることだけを頼み、言葉は変えさせない(U-23)。

import { MARKUP_PAIRS, joinPath, partSpec, variantDir } from './article-files';
import { PLAIN_NOTATION, SPAN_STYLE_RULE } from './build-prompt';
import type { NameDisclosure } from './style-profile';

export function buildMarkupPrompt(baseDir: string, folderName: string, disclosure: NameDisclosure): string {
  const dir = variantDir(baseDir, folderName, disclosure);
  const files = MARKUP_PAIRS.map(({ text, html }) =>
    `- ${partSpec(text).label}: ${joinPath(dir, partSpec(text).file)} → ${joinPath(dir, partSpec(html).file)}`).join('\n');
  return `wakustに投稿する記事の素の文章を、投稿欄のソースエディタへそのまま貼れるHTMLにマークアップしてください。
文章は本人が推敲を終えたものです。言葉は一切変えず、タグを付けることだけを行ってください。

## ファイル(Claude Code)
次の素の文章を読み、矢印の先のファイルへHTMLをUTF-8で保存する。既存のファイルは上書きする。素の文章のファイルは書き換えない。
${files}

## 素の文章の記法
${PLAIN_NOTATION}

## マークアップの規則
- 使うタグは <h3><p><ul><li><a><strong><em><small><span style><br /> だけ
- 「### 」の行は <h3>、続けて並んだ「- 」の行は <ul><li>、空行で区切った段落は <p>、段落の中の改行は <br /> にする
- URLは <a href="URL"> にする。直前の行が店名・源氏名・プロフィールなどの名前なら、その名前をリンクの文字にし、URLの文字列も次の行にテキストで残す(例: <a href="URL">店名</a><br />URL)。名前の行がなければURLの文字列をそのままリンクの文字にする
- 有料部分の内容の説明に続く免責の一文は <small>、記事の締めの「皆さまのご武運をお祈りいたします!」は <em> にする
- 強調は記事の読みどころになる短い一言にだけ <strong> を付ける。付けすぎない
${SPAN_STYLE_RULE}

## 守ること
- 文字、語順、句読点、改行の位置を変えない。言葉を足さず、削らない。誤字や事実の誤りに気づいても直さず、保存のあとにチャットで指摘する
- 記法の記号(「### 」「- 」)はタグに置き換え、本文に残さない
- 保存したら、タグを除いた文字の並びが素の文章(記法の記号と空行を除く)と一致するか確かめ、結果を一言で報告する`;
}
