---
name: me-markup
description: 記事ボードの「マークアップを依頼」で出した依頼文(1行目が /me-markup)を受けて、本人が直した素の文章を、言葉を変えずにwakustの投稿欄へ貼るHTMLにする。依頼文がないときは使わない
---

<!-- src/prompt/skill-files.ts から生成。直接編集しない。規則の TS を直して `npx vitest run -u` で作り直す -->

# 素の文章をHTMLにする

wakustに投稿する記事の素の文章を、投稿欄のソースエディタへそのまま貼れるHTMLにマークアップしてください。
文章は本人が推敲を終えたものです。言葉は一切変えず、タグを付けることだけを行ってください。

## ファイル(Claude Code)
次の素の文章を読み、矢印の先のファイルへHTMLをUTF-8で保存する。既存のファイルは上書きする。素の文章のファイルは書き換えない。
(読む素の文章と矢印の先のファイルは、依頼文の「保存先」にある2組)

## 素の文章の記法
記事構成の<h3>見出し</h3>は「### 見出し」の1行、<ul><li>の項目は「- 項目」の行、<p>は空行で区切った段落、<br />は段落の中の改行で書く。<a><strong><em><small><span>などのタグと**などの記号は付けない。リンクはURLの文字列だけを書く(マークアップは別の依頼で行う)

## マークアップの規則
- 「### 」の行は見出しの部品、続けて並んだ「- 」の行は <ul><li>(評価6軸は評価のカードの div)、空行で区切った段落は <p>、段落の中の改行は <br /> にする。どの部品を使うかは見出しの言葉と「装飾」の使う場所で決め、当てはまらない見出しは「見出し」の部品にする
- 段落の中に「」のセリフだけの行があれば、その行を段落から出して彼女のセリフの部品にしてよい(行の区切りの位置は変えない)
- 装飾は style 属性とタグだけで付け、✓・◆・ラベルの語など本文にない文字を足さない。例外は、彼女のセリフの丸に入れる「彼女」だけ
- 今回のセラピストを表にするときは、各項目の最初の「:」「：」で項目と値に分け、その記号だけは書かなくてよい
- URLはリンクの部品にする。直前の行が店名・源氏名・プロフィールなどの名前なら、その名前をリンクの文字にし、URLの文字列も次の行にテキストで残す(例: <a href="URL">店名</a><br />URL)。名前の行がなければURLの文字列をそのままリンクの文字にする
- 有料部分の内容の説明に続く免責の一文は補足の小さな字、記事の締めの「皆さまのご武運をお祈りいたします！」は締めの一文の部品にする
- 強調は記事の読みどころになる短い一言にだけマーカーの部品で付ける。付けすぎない

## 装飾
- 使うタグは <p><div><ul><li><table><tbody><tr><th><td><a><em><small><span><br /> だけ。装飾はタグの style 属性に書く
- <h3> と <hr> は使わない(サイトのCSSで下線が付く、線が薄くなる)。見出しは下の部品の <p>、区切りは区切り線の <div> で書く
- <style> タグ、class 属性、rgba() は使わない(投稿時に削られる)。色は #rrggbb で書く
- letter-spacing は指定しない。文字の間隔は既定のままにする
- 見本にない色や部品を足さない。本文の段落は style なしの <p> にし、記事の大半を装飾しない
- 文中の強調はマーカーだけで付ける。サイトの文字が太いので、<strong> や font-weight の太字は文中に使わない(見出しなどの部品の太字はそのまま)

### 部品の見本(style はこのまま写す)
- 見出し(記事の見出し。体験談の本編の見出しには下の専用の部品を使う):
  <p style="border-left: 5px solid #2b4a86; padding: 4px 0 4px 12px; margin: 32px 0 14px; font-size: 17px; font-weight: bold; color: #222222; line-height: 1.5;">見出し</p>
- 本編の見出し(有料部分の本編(ご対面からクライマックスの手前まで)の見出し):
  <p style="border-left: 5px solid #2b4a86; background-color: #eef3fb; padding: 8px 12px; margin: 32px 0 14px; font-size: 17px; font-weight: bold; color: #222222; line-height: 1.5;">見出し</p>
- クライマックスの見出し(クライマックスの見出しだけ):
  <p style="border-left: 5px solid #c2255c; background-color: #fdf0f4; padding: 8px 12px; margin: 32px 0 14px; font-size: 17px; font-weight: bold; color: #222222; line-height: 1.5;">クライマックス</p>
- セラピストの表(今回のセラピストの「項目: 値」の並び。1項目を1行にする):
  <table style="border-collapse: collapse; width: 100%; font-size: 14px; margin: 0 0 8px;"><tbody><tr><th style="background-color: #eef3fb; border: 1px solid #cfdcef; padding: 8px 10px; text-align: left; font-weight: bold; color: #213a66; width: 28%;">項目</th><td style="border: 1px solid #cfdcef; padding: 8px 10px;">値</td></tr></tbody></table>
- 枠のボックス(こんな方にお勧めの箇条書き、総評の段落):
  <div style="border: 2px solid #2b4a86; border-radius: 8px; padding: 4px 14px; margin: 0 0 8px; background-color: #f7f9fd;"><ul style="margin: 8px 0; padding-left: 1.2em;"><li style="margin: 4px 0;">項目</li></ul></div>
- 有料部分の内容のボックス(有料部分の内容の見出し・箇条書き・免責をまとめて入れる。見出しはボックスの中に置き、外に出さない。直前に区切り線を置く):
  <div style="background-color: #eef3fb; border-radius: 8px; padding: 14px; margin: 0 0 8px;"><p style="margin: 0 0 8px; font-size: 16px; font-weight: bold; color: #213a66;">有料部分の内容</p><ul style="margin: 8px 0; padding-left: 1.2em;"><li style="margin: 4px 0;">項目</li></ul><p style="margin: 8px 0 0;"><small style="color: #868e96;">免責</small></p></div>
- 評価のカード(評価6軸の箇条書き。ul と li は使わず、1軸を1つの div にする(wakustでは list-style が効かず行頭の点が残る)。★は黄、☆は灰にする。最後の軸は下線を付けない):
  <div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 4px 14px; margin: 0 0 8px;"><div style="padding: 8px 0; border-bottom: 1px solid #f1f3f5;">軸名:<span style="color: #f59f00;">★★★★</span><span style="color: #dee2e6;">☆</span><br />一言</div><div style="padding: 8px 0;">最後の軸名:<span style="color: #f59f00;">★★★★★</span><br />一言</div></div>
- 彼女のセリフ(「」で囲まれたセリフだけの段落。左の丸に「彼女」と入れる):
  <div style="display: flex; align-items: flex-start; gap: 10px; margin: 14px 0;"><div style="flex: 0 0 40px; width: 40px; height: 40px; border-radius: 50%; background-color: #ffc9dc; color: #c2255c; font-size: 13px; font-weight: bold; text-align: center; line-height: 40px;">彼女</div><div style="flex: 1 1 auto; background-color: #fdf0f4; border-radius: 10px; padding: 10px 12px;">「セリフ」</div></div>
- 心の声(（）で囲まれた心の声だけの段落):
  <p style="color: #868e96; font-size: 14px;">（心の声）</p>
- 左線のボックス(今回の進め方の段落):
  <div style="border-left: 4px solid #adb5bd; background-color: #f8f9fa; padding: 12px 14px; margin: 0 0 8px; color: #444444;"><p style="margin: 0;">段落</p></div>
- マーカー(読みどころの一文。黄は要点、オレンジは結果と山場。1つの見出しの下で1か所まで):
  <span style="background: linear-gradient(transparent 60%, #ffe066 60%);">要点</span> / <span style="background: linear-gradient(transparent 60%, #ffd8a8 60%);">結果</span>
- リンク(すべてのリンク):
  <a href="URL" style="color: #2b4a86; border-bottom: 1px dotted #2b4a86; text-decoration: none;">名前</a>
- 補足の小さな字(免責、出勤確認の行):
  <small style="color: #868e96;">補足</small>
- 区切り線(大きな話の切れ目と、締めの一文の前):
  <div style="border-top: 1px dashed #2b4a86; height: 0; margin: 32px 0 20px;"></div>
- 締めの一文(記事の締め):
  <p style="text-align: center;"><em style="color: #2b4a86; font-weight: bold; font-style: normal;">締めの一文</em></p>

## 守ること
- 文字、語順、句読点、改行の位置を変えない。言葉を足さず、削らない。誤字や事実の誤りに気づいても直さず、保存のあとにチャットで指摘する
- 記法の記号(「### 」「- 」)はタグに置き換え、本文に残さない
- 保存したら、タグを除いた文字の並びが素の文章(記法の記号と空行、表にしたときに省いた「:」「：」、セリフの丸の「彼女」を除く)と一致するか確かめ、結果を一言で報告する
