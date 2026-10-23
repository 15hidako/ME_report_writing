# 無料公開口コミの調査メモ

調査日：2026年10月23日（日本時間）

記事執筆に用いる質問票の選択肢を増やすため、[特別公開口コミ一覧](https://men-esthe.jp/list-allopen.php)の50ページから986件を取得した。うち166件は全文を個別に読み、短い要約と観察メモを保存した。986件すべてを同じ深さで精読したわけではない。

45の観察軸から候補語332件を作成した。意味照合により184件には直接の根拠を付け、残る148件は未検証の候補とした。根拠照合の対象は精読した記事のうち60件であり、出現率や採用の推奨度を示す数値ではない。

## 最初に読む資料

既存欄の優先35語と場面限定23語は全件採用され、先行29語と合わせた採用対象は87語となった。新しい質問群10群（33の任意小問）は全件却下され、新しい質問や保存項目は追加しない。最新の方針は[採用決定と候補の記録](../../07-questionnaire-next-options.md)と[58語の採用決定](planning/adoption58-decision.json)、今回の確認結果は[58語追加の検証記録](planning/adoption58-validation.json)を参照する。

利用検討の経緯は[記事執筆用質問票の拡充案](../../05-questionnaire-enrichment.md)と[332候補の評価表](planning/candidate-disposition.csv)に整理した。先行候補29語、却下した追加項目案、同義語の扱いを確認できる。元の調査の332語、意味照合済み184語、未照合148語は、今回の採用決定でも変更していない。

先行29語の表示と操作の履歴は[UI検討メモ](../../06-questionnaire-ui.md)と[配置データ](planning/ui-first-batch.json)を参照する。既存の画面を使った、保存しない確認用プロトタイプも作成した。追加58語は既存の評価メモ、段階別チェックとメモ、残念ポイントを使う。

| 採用決定と前回計画の資料 | 内容 |
|---|---|
| [adoption58-decision.json](planning/adoption58-decision.json) | 追加58語の全件採用、計87語の採用対象、新設質問群の全件却下という最新の決定 |
| [adoption58-validation.json](planning/adoption58-validation.json) | 追加58語を含む今回の実装の確認結果 |
| [next-adoption-ledger.json](planning/next-adoption-ledger.json) と [CSV版](planning/next-adoption-ledger.csv) | 先行29語の実装時点で全332語を再整理した前回計画。表示語、既存欄、根拠、意味の条件を保持 |
| [next-existing-review.json](planning/next-existing-review.json) | 既存欄へ収まる58語の検討と、再利用や意味限定の詳細。前回計画のスナップショット |
| [next-question-groups.json](planning/next-question-groups.json) | 全件却下した10群・33の任意小問の履歴。元の質問文、参照、根拠、保存と出力の検討を保持 |
| [next-review-validation.json](planning/next-review-validation.json) | 前回の計画資料の件数、参照、根拠状態と、当時アプリを変更していなかったことの確認結果 |

| 資料 | 内容 |
|---|---|
| [findings.md](findings.md) | 質問項目として分けたい論点、具体例、調査方法と限界 |
| [option-candidates.csv](option-candidates.csv) | 選択肢332件の一覧。分類、候補語、根拠記事ID、既存項目との対応 |
| [implementation-context.json](implementation-context.json) | 現在の質問票との対応、保存や記事生成への引き渡しに関する確認事項 |
| [quality-notes.json](quality-notes.json) | 金額の不一致、単位の疑い、未利用なのに付けられた星評価など8例 |
| [response-state-candidates.json](response-state-candidates.json) | 未確認、利用なし、覚えていない、該当なしなど、回答状態の区別 |

## 出典をたどる資料

| 資料 | 内容 |
|---|---|
| [article-index.csv](article-index.csv) | 986件のID、一覧ページ、個別リンク、地域、店舗名、本文量、語の検出結果 |
| [article-index.jsonl](article-index.jsonl) | 星評価や本文ハッシュを含む出典索引。1行1記事 |
| [deep-read/](deep-read/) | 166件の要約、観察、記憶や伝聞の留保 |
| [option-evidence-reviewed.json](option-evidence-reviewed.json) | 候補語184件の意味を照合した根拠と注意点 |
| [option-candidates.json](option-candidates.json) | 候補語の機械可読版。候補IDは出典照合用で、アプリの新しい保存値ではない |
| [theme-codebook.json](theme-codebook.json) | 45分類の定義と、本文中の語を探す正規表現 |
| [keyword-frequency.json](keyword-frequency.json) | 語の一致件数と該当記事ID。肯定・否定の判定や不満率ではない |
| [page-manifest.json](page-manifest.json) | 取得URL、取得時刻、各ページの件数、未取得ページ、抽出方法 |
| [validation.json](validation.json) | 件数、参照ID、ファイル形式などの最終検証結果 |
| [editorial/](editorial/) | 推敲時点の履歴。現在の引き継ぎ本文はこのREADMEとfindings.mdを参照 |

## 利用時の条件と検証履歴

採用した候補は、本人が実際に経験した評価理由や場面を記録するために使う。会話の量と好みへの合い方、施術の強さと快適さ、金額と説明の納得感は分けて扱う。分からない段階を推測せず、出来事、数値、台詞を候補語から補わない。

332件は元の候補の保管庫であり、今回採用した87語とは件数の意味が違う。重複に近い語も履歴として残している。前回計画の優先度は調査者による仮置きであり、統計的な頻度から決めたものではない。

先行29語は本体へ組み込み、既存の保存形式を使った保存と再編集、書出しと読込、記事素材への出力を確認した。[先行29語の組み込み検証](planning/integration-validation.json)は当時の結果であり、追加58語の確認結果は含まない。今回の確認は[58語追加の検証記録](planning/adoption58-validation.json)に分ける。実際の訪問メモでの入力時間と記事素材の具体性は引き続き評価が必要となる。
