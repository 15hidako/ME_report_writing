# 導線の見直しとリファクタリングの作業計画

作成日：2026-11-12
基準コミット：`2cb52cc`(行番号はこの時点のもの。ずれていたら関数名で探す)
読み手：実装を担当するエージェント(Claude Opus 5.5 を想定)と、承認する本人

2026-11-12 に入力画面・記事ボード・週次確認へ続けて機能を足した結果、画面のつなぎ目と `src/main.ts` に歪みが出た。この文書は、いまある機能を保ったまま直す作業を、1つずつ独立して着手できる単位(WP)に分けたものである。

## 1. 全WPに共通する決まり

### 読む順

1. [AGENTS.md](../AGENTS.md) と [14-claude-requirements.md](14-claude-requirements.md)
2. この文書の「1. 全WPに共通する決まり」と、担当するWPの節
3. WPの「触るファイル」に挙げたソースと、対応するテスト

### 変えてはいけないもの

- **生成プロンプトの文面**。`src/prompt/` の出力は原要件(H-01〜H-15)を反映している。WPが明示しない限り1文字も変えない。`src/prompt/build-prompt.test.ts` と `serialize.test.ts` が通ることで確かめる。
- **保存形式**。次のキーと形式は既存データを読めるままにする。項目を足すときは、ない場合の既定値で読めるようにする(`parseBoardState` の `angles` が前例)。
  - localStorage：`me-report-writer/visits/v1`(とその `/backup`、`/backup/pending`、`/recovery`)、`me-report-writer/board/v1`
  - IndexedDB：`me-report-writer-board` の `handles`(スロット `handoff`、`articles`)
  - 受け渡しファイル：`targets.json`、`checks.json`、`board-backup.json`
  - 原稿フォルダ：`<通し番号4桁>-<回答ID>/standard|names/title.txt, tags.txt, free-part.html, paid-part.html`
  - `schema/visit-record.schema.json`
- **`src/checks/files.ts` と `src/checks/judge.ts` の自己完結**。`scripts/weekly-check.mjs` が Node から直接読むため、ほかの `.ts` から値を import しない。ここにある `isObject`・`isHttpUrl` の重複は残す。
- **テスト**。削除とコメントアウトはしない。画面の操作方法が変わって書き直す必要があるテストは、確かめている内容を保ったまま操作だけを置き換え、完了報告に書き直したテスト名を挙げる。
- **実データ**。実回答、原稿、訪問情報をリポジトリやテストに入れない。テストは `src/test-fixtures.ts` の `fixtureRecord` を使う。

### 進め方

- 1つのWPは1つのまとまった変更にする。WPをまたぐ変更や、ついでのリファクタリングはしない。
- 振る舞いを変えるWPは、先に失敗するテストを書いてから実装する。移動だけのWPは既存テストが通ることを確かめる。
- 各WPの最後に次を実行し、結果を報告する。

```bash
npm test
```

```bash
npm run build
```

- 画面を変えたWPは、`.claude/launch.json` の `me-report-writer`(5183番)で実画面を確かめる。入力画面は幅375pxと1280px、ボードは1280pxで見る。5183番の保存領域は本人の作業データ(`start.bat` の5173番)と別なので、確認用のデータを入れてよい。
- UIの方針：不要な補助ラベルや説明文を足さない。配置で意味が伝わるようにする。エラーは握りつぶさず、利用者に分かる文で出す。
- コミットとpushは、本人から依頼されたときだけ行う。
- `docs/` の変更は、WPが明示したものだけにする。

### 完了報告に書くこと

変えたファイル、追加・書き直したテスト、実行した確認と結果、確かめられなかったこと、本人の判断が要る点。

## 2. WPの一覧と順番

| WP | 内容 | 種別 | 前提 | 状態 |
|---|---|---|---|---|
| WP-0 | ボードの配線テストを足す | テスト | なし | 着手可 |
| WP-1 | プロンプトをコピーしたら「プロンプト出力」へ進める | 導線 | WP-0 | 着手可 |
| WP-2 | 原稿フォルダを選び直せるようにする | 導線 | WP-0 | 着手可 |
| WP-3 | 原稿の保存先の食い違いを知らせる | 導線 | WP-2 | 着手可 |
| WP-4 | 投稿URLの扱いを2画面でそろえる | 導線 | WP-0 | 着手可 |
| WP-5 | サムネの対象回答を選べるようにする | 導線 | なし | 着手可 |
| WP-6 | `src/main.ts` を分割する | リファクタ | WP-1、4、5 | 着手可 |
| WP-7 | 編集中の状態を一本化する | リファクタ | WP-6 | 着手可 |
| WP-8 | 重複した小物をまとめる | リファクタ | WP-6 | 着手可 |
| WP-9 | `prompt()` を画面内のダイアログにする | 導線 | WP-6、8 | 着手可 |
| WP-10 | ボードのツールバーと履歴カードの操作を整理する | 導線(UI) | WP-2、9 | 着手可 |
| WP-11 | まとめ記事のプロンプトをボードから作る(カタログは保留) | 導線 | WP-1、9 | 着手可(D-2 確定) |
| WP-12 | 呼び名をそろえる | リファクタ | WP-8 | 着手可 |
| WP-13 | テストでしか使わない公開関数を外す | リファクタ | なし | 着手可(D-3 承認) |
| WP-14 | 販売型と名前公開版をつなぐ | 導線 | WP-1、5、12 | 着手可(D-1 確定) |
| WP-15 | 起動経路とボードを文書と概念図に残し、ボードにも版の検知を入れる | 文書・導線 | WP-6 | 着手可(D-4 承認) |

上から順に進める。WP-1〜5は互いに独立しているが、いずれも `src/main.ts` か `src/board/main.ts` を触るため、同時に進めず1つずつ行う。

## 3. 本人の判断が要る点

| ID | 問い | 既定の案 | 関係するWP |
|---|---|---|---|
| D-1 | ボードの「セラピスト起点/体験内容起点」は、入力画面の「プロンプト/名前公開版」と同じ選択か。同じなら、どちらがどちらに当たるか | **2026-11-12 確定(本人回答)**：同じ選択。セラピスト起点=名前公開版、体験内容起点=通常のプロンプト | WP-14 |
| D-2 | まとめ・カタログをボードから作れるようにしたあと、入力画面の「カタログ記事」「まとめ記事」ボタンを残すか | **2026-11-12 確定(本人回答)**：カタログ記事はあまり書く予定がないので保留(今の動きのまま触らない)。まとめ記事は残す | WP-11 |
| D-3 | `copyText` と `VisitStore.exportJson` を消し、テストを `tryCopyText` と `exportRawJson` に書き換えてよいか | **2026-11-12 承認** | WP-13 |
| D-4 | ボード・週次確認・`VITE_ARTICLE_DIR`・起動経路を `docs/` に書くか。書く場所はどこか | **2026-11-12 承認**。文書に加えて draw.io の概念図も残す。場所は WP-15 の案(本人が別の場所を指定したらそちら) | WP-15 |

## 4. 各WPの計画

### WP-0 ボードの配線テストを足す

**目的**：`src/board/main.ts` は段階の移動、投稿URL、記事の追加と削除、絞り込み、確認結果の読み込みを配線しているが、直接のテストがない。後続のWPがここを触る前に、いまの振る舞いを固定する。

**現状**：`src/board/board.test.ts` は `state.ts`・`cards.ts`・`view.ts` の純粋な部分だけを見ている。入力画面側は `src/ui-regression.test.ts` が `await import('./main')` で起動して操作している。

**変更内容**：`src/board/board-ui.test.ts` を新設する。`ui-regression.test.ts` と同じ型で書く。

- `// @vitest-environment happy-dom`。各テストの前に `board.html` の `<body>` と同じ要素を `document.body` に置き、localStorage に回答とボードの状態を入れてから `await import('./main')`。後始末で `vi.resetModules()` と localStorage のクリア。
- happy-dom には `showDirectoryPicker` がないので、フォルダを使わない経路がそのまま通る。フォルダを使う経路は `vi.mock('./folder')` で `folderSupported`・`savedFolder`・`pickFolder`・`ensureAccess`・`readText`・`writeText` を差し替える。
- `prompt`・`confirm` は `vi.stubGlobal` で差し替える。

**固定する振る舞い**(1件ずつテストにする)

1. 回答カードの段階を選択肢で「推敲中」に変えると、`me-report-writer/board/v1` の `stages` に入り、カードがその列へ移る。
2. 回答カードを「投稿済み」にすると投稿URLを尋ね、wakustのURLなら回答の `postedUrl` に保存される。wakust以外のURLでは保存されず、選択肢が元の段階に戻る。
3. 投稿済みの回答カードを別の段階へ動かすとエラーが出て、段階は変わらない(WP-4で変える。変えるときにこのテストを書き直す)。
4. 「+ 記事」でまとめを追加でき、タイトルが空なら追加されずダイアログが残る。「削除」で確認のあと消える。
5. 販売型のボタンを押すと `angles` に入り、同じボタンをもう一度押すと消える。
6. 絞り込みを押すと `?kind=` が変わり、該当しないカードが出ない。
7. `?card=<回答ID>` で開くと、URLから `card` と `kind` が外れ、該当カードに `revealed` が付く。存在しないIDではトーストが出る。
8. フォルダ非対応のとき「確認対象を書き出す」「確認結果を読み込む」が見え、「同期」「原稿」「フォルダ変更」が隠れる。
9. フォルダ対応(モック)のとき「同期」で `targets.json` と `board-backup.json` が書かれ、`checks.json` の内容が `checks` に入る。

**触るファイル**：`src/board/board-ui.test.ts`(新設)のみ。

**完了条件**：上の9件が通る。実装コードは変えていない。happy-dom の制約で書けなかった項目があれば、理由を報告に書く。

### WP-1 プロンプトをコピーしたら「プロンプト出力」へ進める

**目的**：ボードの段階 `prompted` を設定する処理がなく、手で選択肢を変えるしかない。原稿フォルダを読むと「回答済み」から「推敲中」へ飛ぶ(`src/board/articles.ts` の `advanceDrafted`)。入力画面で記事プロンプトをコピーした時点で進める。

**現状**：`src/main.ts` の `copyPrompt` → `copyArticlePrompt` → `copyGenerated`(78〜90行)。コピーの成否は `tryCopyText` が返す。入力画面とボードは同じ localStorage を使い、ボードは `storage` イベントで描き直す(`src/board/main.ts` 385行)。

**変更内容**

1. `src/board/state.ts` に純粋関数を足す。

   ```ts
   /** プロンプトを出した回答を「プロンプト出力」へ進める。すでに先の段階にある回答は変えない */
   export function markPrompted(state: BoardState, recordId: string): BoardState
   ```

   `state.stages[recordId]` が未設定(=回答済み)のときだけ `prompted` を入れる。それ以外は同じ `state` をそのまま返す。
2. `src/main.ts` の `copyGenerated` に、コピーできたあとに呼ぶ関数を渡せるようにする。`copyArticlePrompt` からは「投稿済みでない回答なら `BoardStore` を読み、`markPrompted` の結果が変わっていれば保存する」処理を渡す。
3. ボードの状態を読めない・保存できないときは、プロンプトのコピーは成功のままにし、トーストで理由を出す。

**維持する挙動**：コピーの文面、トーストの文、`claude://` を開く条件は変えない。店舗情報の取得用プロンプト、カタログ、まとめのコピーでは段階を変えない(まとめ・カタログはWP-11)。コピーに失敗したときは段階を変えない。

**触るファイル**：`src/board/state.ts`、`src/main.ts`、`src/board/board.test.ts`、`src/ui-regression.test.ts`

**テスト**

- `markPrompted`：未設定→`prompted`、`prompted`・`editing` はそのまま、参照が同じこと。
- 入力画面：「プロンプト」を押してコピーが成功すると `me-report-writer/board/v1` の `stages` に `prompted` が入る。「名前公開版」でも同じ。投稿済みの回答では入らない。出勤確認日の入力を取り消したときは入らない。

**注意**：スマホ(公開版)でもボードの状態が保存されるようになる。スマホではボードを開かないので害はないが、報告に書く。`src/main.ts` が `board/state.ts` を読み込むことになる。ビルド後に `dist/assets` の入力画面側のJSが大きく増えていないことを確かめる。

**完了条件**：ボードを開いたまま入力画面でプロンプトをコピーすると、ボードのカードが「プロンプト出力」の列へ移る(実画面で確認)。

### WP-2 原稿フォルダを選び直せるようにする

**目的**：「フォルダ変更」は週次確認の受け渡しフォルダだけを変える(`src/board/main.ts` 357行)。原稿フォルダは最初に選んだあと変える手段がない(`openArticles` 141行)。

**変更内容**

1. `board.html` のツールバーに、原稿フォルダを選び直すボタンを足す(id は `pick-articles`)。既存の「フォルダ変更」(`pick-folder`)は受け渡しフォルダ用のまま残し、2つの対象が配置で分かるように「原稿」の隣と「同期」の隣に置く。見た目の本格的な整理はWP-10で行うので、ここでは位置だけ決める。
2. `pick-articles` を押すと `pickFolder('articles')` → `ensureAccess` → `loadDrafts` を行い、件数とフォルダ名をトーストに出す(`openArticles` と同じ文)。
3. フォルダ非対応のブラウザでは隠す(`articlesButton` と同じ扱い)。

**維持する挙動**：「原稿」ボタンの動き(未設定なら選ばせ、設定済みなら読み直す)。フォーカスが戻ったときの自動読み直し(`refreshDrafts`)。

**触るファイル**：`board.html`、`src/board/main.ts`、`src/board/board-ui.test.ts`

**テスト**：`./folder` をモックし、`pick-articles` で `pickFolder` が `'articles'` で呼ばれること、読み直したあとのカードに原稿の行が出ること、選択を取り消したとき(`AbortError`)にトーストが出ないこと。

**完了条件**：実画面(Chrome か Edge)で、原稿フォルダを別のフォルダに変えるとカードの原稿表示が入れ替わる。

### WP-3 原稿の保存先の食い違いを知らせる

**目的**：プロンプトに書く保存先は `.env.local` の `VITE_ARTICLE_DIR`(`src/local-setup.ts`)、ボードが読む場所はフォルダ選択で、同じかどうかを確かめていない。ずれると「書き出したのにボードに出ない」。

**制約**：ブラウザは選んだフォルダの絶対パスを取得できない。比べられるのはフォルダ名(末尾の1階層)だけである。

**変更内容**

1. `src/local-setup.ts` に、絶対パスから末尾のフォルダ名を取り出す純粋関数を足す(区切りは `\` と `/` の両方。末尾の区切りは無視)。
2. ボードで原稿フォルダを選んだとき・読み直したとき、`ARTICLE_DIR` が設定されていて、その末尾のフォルダ名と `folder.name` が違えば、トーストで「原稿フォルダ「X」は、プロンプトの保存先「<VITE_ARTICLE_DIR の値>」と名前が違います」と知らせる。読み込み自体は続ける。
3. `ARTICLE_DIR` が未設定(公開版)のときは何もしない。
4. フォーカスが戻るたびの自動読み直し(`refreshDrafts`)では、同じ警告を繰り返さない。警告はボタン操作のときだけ出す。

**触るファイル**：`src/local-setup.ts`、`src/board/main.ts`、テスト(`src/local-setup.test.ts` 新設、`src/board/board-ui.test.ts`)

**テスト**：フォルダ名の取り出し(`C:\a\b\`、`/a/b`、`C:/a/b`)。名前が違うとき警告が出て読み込みは行われること、同じとき出ないこと、未設定のとき出ないこと。`import.meta.env` の差し替えは `vi.stubEnv('VITE_ARTICLE_DIR', …)` と `vi.resetModules()` で行う。

**限界**(報告に書く)：同じ名前の別フォルダは見分けられない。

### WP-4 投稿URLの扱いを2画面でそろえる

**目的**：投稿URLの入口が入力画面(`savePostedUrl`、`src/main.ts` 632行)とボード(`askPostedUrl`・`moveCard`、`src/board/main.ts` 84〜117行)にあり、挙動が違う。

- 入力画面は空欄で解除できる。ボードは回答カードを投稿済みから戻せず、「入力画面の「投稿URL」を空にすると戻せます」とエラーを出す。まとめ・カタログのカードはボードで戻せる。
- 入力画面は `storage` イベントを聞いていないので、ボードで付けた投稿済みが履歴に出るのは次に描き直したときになる。

**変更内容**

1. `src/prompt/publication.ts` に入力の解釈を1つにまとめる。

   ```ts
   /** 投稿URLの入力を解釈する。空欄は null(解除)。wakustの記事URLでなければ Error */
   export function parsePostedUrlInput(input: string): string | null
   ```

   エラーの文は既存の「wakust記事URLが必要です」を使う。入力画面とボードの両方からこれを呼ぶ。
2. ボードで、投稿済みの回答カードを別の段階へ動かせるようにする。まとめ・カタログと同じく「投稿URLを外して戻しますか?」と確認し、了承されたら回答の `postedUrl` を `null` にして保存し、選んだ段階を `setRecordStage` で入れる。
3. 入力画面で `storage` イベントを聞き、履歴タブを表示しているときだけ描き直す。入力タブ・サムネタブを表示しているときは何もしない(入力中の値を消さない)。

**維持する挙動**：投稿済みの判定(`isPublished`)。ボードで回答を投稿済みにしたとき `stages` から消す処理。編集中の回答の投稿URLをボードで変えても、入力画面の保存で上書きされないこと(`submitForm` が保存時に最新の `postedUrl` を使っている。既存テストで確認)。

**触るファイル**：`src/prompt/publication.ts`、`src/main.ts`、`src/board/main.ts`、`src/prompt/publication.test.ts`、`src/board/board-ui.test.ts`、`src/ui-regression.test.ts`

**テスト**

- `parsePostedUrlInput`：空欄・空白だけ→`null`、wakustのURL→前後の空白を除いた文字列、それ以外→Error。
- ボード：投稿済みの回答カードを「推敲中」へ動かすと確認が出て、了承で `postedUrl` が `null`、`stages` が `editing` になる。断ると何も変わらない。WP-0の3番のテストをこの内容に書き直す。
- 入力画面：履歴タブを表示中に `storage` イベントが来ると「投稿済」の表示が変わる。入力タブを表示中は入力欄の値が残る。

**注意**：投稿URLを外すと、週次確認の対象とまとめ記事の解禁人数(`countPublishedTherapists`)から外れる。これは入力画面で空欄にしたときと同じ結果である。

### WP-5 サムネの対象回答を選べるようにする

**目的**：サムネタブは常に最新の回答1件から初期値を入れる(`renderThumbTab`、`src/main.ts` 664行)。ほかの回答のサムネを作るには手で打ち直すしかない。

**変更内容**

1. サムネタブの先頭に回答の選択欄(`<select id="t-record">`)を置く。選択肢は「#通し番号 店名 — セラピスト名」を新しい順に並べる。回答がないときは選択欄を出さない。
2. 回答を選び直すと、エリア・店名・セラピスト名・スペック行・フックをその回答の値で入れ直し、描き直す。レイアウトと配色の選択は保つ。
3. `?thumb=<回答ID>` で開くと、その回答を選んだ状態でサムネタブを出す。`openFromUrl` の `edit` と同じく、`takeParam` で読んだあとURLから外す。見つからないときは履歴タブを出し、既存の「指定された回答が見つかりません…」のトーストを使う。
4. `src/links.ts` に `thumbHref(recordId)` を足し、ボードの回答カードの「編集」の隣に「サムネ」のリンクを置く(`target` は `INPUT_WINDOW`)。

**維持する挙動**：何も指定せずにサムネタブを開いたときは、これまでどおり最新の回答が入る。描画(`src/thumbnail.ts`)は変えない。

**触るファイル**：`src/main.ts`、`src/links.ts`、`src/board/view.ts`、`src/board/board.css`(リンクの見た目が必要なら)、`src/links.test.ts`、`src/ui-regression.test.ts`、`src/board/board.test.ts`

**テスト**：選択欄で回答を変えると各入力欄の値が変わること。`?thumb=` で指定した回答が選ばれ、URLから `thumb` が消えること。`thumbHref` の形。ボードのカードにリンクが出ること(回答カードだけ)。

**注意**：入力途中の回答がある状態で `?thumb=` を開く場合、入力タブの内容は消さない(タブを切り替えるだけにする)。

### WP-6 `src/main.ts` を分割する

**目的**：817行に、履歴タブ、サムネタブ、データの入出力、更新の検知、URLからの起動、フォームの保存と共有が入っている。振る舞いを変えずに分ける。

**分け方**(`src/main.ts` はテストの入口なので残す)

| 移動先 | 移すもの | `main.ts` から渡すもの |
|---|---|---|
| `src/revisit.ts` | `findOriginalRecord` | 回答を引く関数 `(id) => VisitRecord \| undefined` |
| `src/prompt/series.ts` | `seriesTargets` | なし(純粋関数) |
| `src/date.ts` か `src/identity-lookup.ts` | `defaultListingCheckDate` | なし(純粋関数) |
| `src/update-watch.ts` | `applyUpdate`・`offerUpdate`・`checkForUpdate`・`watchForUpdate`・`RELOADED_FOR_KEY` | 「入力や共有の途中か」「破棄してよいか」を返す関数。離脱確認を重ねないための通知 |
| `src/ui/thumb-tab.ts` | `renderThumbTab` | 描画先の要素、回答の一覧、初期に選ぶ回答ID |
| `src/ui/data-buttons.ts` | `downloadRaw`・`applyImport`・`applyHandoffImport`・`pickImport`・`restoreFromBackup`・`bindDataButtons`・`rawHasSavedData` | ストア、`confirmDiscardDraft`、`clearContext`、`render` |
| `src/ui/list-tab.ts` | `renderListTab` のHTML組み立てと、ツールバー・カードのイベント配線 | 各操作のハンドラ |

`main.ts` に残すもの：起動処理、タブの切り替え、`render`・`renderRecovery`、フォームの生成と保存(`mountForm`・`submitForm`・`shareSavedRecord`・`openContext`・`editingSnapshot`)、プロンプトのコピー。

**手順**：表の上から1行ずつ移し、1行移すたびに `npm test` を通す。純粋関数(上の3行)には単体テストを足す。`hasBackup` を try/catch で包む処理が `renderRecovery` と `renderListTab` に重複しているので、1つの関数にする。ツールバーのHTML(保存・読込・バックアップ復元)も同じく1か所にする。

**維持する挙動**：すべて。ボタンの文言、要素のid、トーストの文、処理の順序を変えない。既存テストを書き換えずに通す。

**触るファイル**：`src/main.ts` と上の新設ファイル、新設のテスト(`src/revisit.test.ts`、`src/prompt/series.test.ts`)

**完了条件**：`main.ts` が400行前後になる。既存テストは無変更で通る。循環 import がない(`npm run build` が警告なしで通る)。

### WP-7 編集中の状態を一本化する

**目的**：モジュール変数の `editingId`・`revisitOfId`(「次に開く対象」)と、`Draft` の `editingId`・`revisitOfId`(「いま画面にある対象」)を、`render`・`renderFormTab`・`openContext` が突き合わせている(`src/main.ts` 232〜247行、406〜433行)。`submitForm` は共有のとき `draft` を8項目書き換える(287〜298行)。

**調べること(実装の前に)**：`formCache` があるとき、モジュール変数と `Draft` の値が食い違う経路が実際にあるかを確かめる。読んだ限りでは、`openContext` と `clearContext` が必ず先に `formCache` を消し、`submitForm` は両方を同時に書き換えるので、食い違わないように見える。そうであれば `renderFormTab` の前半(424〜427行)と `render` の比較は到達しない分岐である。食い違う経路が見つかったら、その経路をテストにしてから進める。

**変更内容**

1. 状態を次の形にする。

   ```ts
   interface FormContext { readonly editingId: string | null; readonly revisitOfId: string | null }
   interface Draft {
     readonly node: HTMLElement;
     context: FormContext;            // いま画面にある対象
     saved: { id: string; seriesNo: number; createdAt: string } | null; // 保存済みなら値を持つ
     readonly revisitOf: string | null; // 回答に保存する再訪元
     savedSnapshot: string | null;
     dirty: boolean;
     sharing: boolean;
   }
   let pending: FormContext = { editingId: null, revisitOfId: null }; // フォームがないときに次に開く対象
   let formCache: Draft | null = null;
   ```

2. 「保存して共有」で新規の回答が編集中に変わる処理を、`draft` を引数に取る1つの関数にまとめる(状態の更新と、「編集中: #N」の表示・ボードへのリンクの差し込み)。
3. 到達しないと確かめた分岐を消す。

**維持する挙動**(既存テストで守られているもの。書き換えずに通す)

- 入力途中でタブを移っても入力が残る。
- 同じ対象をもう一度開いたときは作り直さない。別の画面で回答が変わっていたら作り直す。
- 「+ 新規入力」は、入力途中なら破棄を確認する。
- 「保存して共有」のあと、同じフォームのまま編集中になり、もう一度押すと保存済みの回答を共有する。
- 編集中の回答が消されていたら履歴へ戻す。

**触るファイル**：`src/main.ts`(WP-6のあとの姿)、必要なら `src/ui-regression.test.ts` に不足している経路のテストを足す

**完了条件**：モジュール変数の `editingId`・`revisitOfId` がなくなる。既存テストが無変更で通る。実画面で、新規入力→途中でタブ移動→戻る→保存して共有→再共有、編集→別タブで同じ回答を変更→保存でエラー、の2つを確かめる。

### WP-8 重複した小物をまとめる

**目的**：同じ関数が複数のファイルにある。

**変更内容**

| まとめ先 | 対象 | 置き換える場所 |
|---|---|---|
| `src/guards.ts`(新設) | `isObject`、`errText` | `isObject`：`record-validation.ts`、`handoff-import.ts`、`identity-lookup.ts`、`board/state.ts`。`errText`：`main.ts`、`board/main.ts`、`local-setup.ts` と `share.ts` の同じ式 |
| `src/ui/dom.ts`(新設) | `element(tag, className, text?)` | `ui/handoff-import.ts`、`ui/identity-lookup.ts`(同一の実装) |
| `src/ui/file-io.ts`(新設) | JSONのダウンロード、ファイルを選んで文字列を受け取る処理 | 入力画面のデータ操作(WP-6の `ui/data-buttons.ts`)、`board/main.ts` の `download`・`pickJson` |
| `src/board/view.ts` | 記事タイプの絞り込みの一覧を定数にして export | `board/main.ts` の `FILTERS` と `filterHtml` の中の `kinds` |
| `src/board/main.ts` 内 | カードを見える位置へ出してフォーカスする処理 | 「要確認」からのジャンプ(264行付近)と `revealFromUrl`(372行付近) |

**残す重複**：`src/checks/files.ts` の `isObject`・`isHttpUrl`、`scripts/weekly-check.mjs` の `localDate`(Node から直接読むため)。`ui/identity-lookup.ts` の `fail` は既定の文を持つので別物として残す。`board/main.ts` の `element<T>(id)` は id で要素を引く別の関数なので、名前を `byId` に変えて区別する。

**維持する挙動**：エラーの文、ダウンロードのファイル名、受け付ける拡張子、1MBの上限(引き継ぎファイル)を変えない。

**完了条件**：`grep -rn "function isObject" src` が `guards.ts` と `checks/files.ts` の2件になる。既存テストが無変更で通る。

### WP-9 `prompt()` を画面内のダイアログにする

**目的**：値の入力にブラウザの `prompt()` を使っている。入力を誤ると最初からやり直しになり、日付や選択肢の入力補助も使えない。`confirm()` は対象にしない。

**対象**(まとめ記事の入力はWP-11で扱う。カタログ記事の都道府県の入力は保留で、`prompt()` のまま残す)

| 場所 | 入力 | 新しい入力欄 |
|---|---|---|
| `src/main.ts` `copyPrompt` | 出勤確認日 | `type="date"`。空欄可。初期値は現在と同じ |
| `src/main.ts` `savePostedUrl` | 投稿URL | `type="url"`。空欄で解除 |
| `src/board/main.ts` `askPostedUrl` | 投稿URL | 同上(ボードでは空欄不可) |
| `src/board/main.ts` `cardAction` の `schedule` | 出勤表URL | `type="url"`。空欄で解除 |

**変更内容**

1. `src/ui/input-dialog.ts` を新設する。`<dialog>` に見出し・入力欄・「キャンセル」「決定」を置き、結果を `Promise<Record<string, string> | null>` で返す(取り消しは `null`)。作りは `src/ui/identity-lookup.ts` に合わせる：`showModal`、閉じたら要素を消して開いた要素へフォーカスを戻す、エラーは `role="alert"` の段落に出す、値は `textContent` と `value` で入れる。
2. 検証関数を受け取り、Error が投げられたらダイアログを閉じずに文を出す。投稿URLは WP-4 の `parsePostedUrlInput`、出勤確認日は `src/date.ts` の `parseListingCheckDate`、出勤表URLは `isHttpUrl` を使う。
3. 4か所を置き換える。

**注意**

- **コピーの許可**：クリップボードへの書き込みは利用者の操作の直後でないと拒否されることがある。「決定」を押した処理の中で、ほかの `await` を挟まずにコピーまで進める。`claude://` を開く処理も同じ流れに置く。実画面(https か localhost)で、出勤確認日のダイアログを経てコピーできることを必ず確かめる。
- **テストの書き直し**：`src/ui-regression.test.ts` には `vi.stubGlobal('prompt', …)` で値を返しているテストがある(417、501、529、545、555、564、573、598行付近)。確かめている内容は保ち、「ダイアログに値を入れて決定を押す」操作に置き換える。書き直したテスト名を報告に挙げる。WP-0で足したボードのテストも同様に直す。
- 見た目は既存の `.identity-lookup-dialog`・`.board-dialog` に合わせ、新しい配色や説明文を足さない。

**触るファイル**：`src/ui/input-dialog.ts`(新設)、`src/main.ts`、`src/board/main.ts`、`src/styles.css`、テスト(`src/input-dialog.test.ts` 新設、上記の書き直し)

**完了条件**：`grep -rn "\bprompt(" src --include=*.ts` の結果が、テストと、まとめ記事(WP-11で置き換える)・カタログ記事(保留)の入力だけになる。幅375pxでダイアログがはみ出さない。キーボードだけで入力・決定・取り消しができる。

### WP-10 ボードのツールバーと履歴カードの操作を整理する

**目的**：ボードのツールバーにボタンが9〜10個横に並び、原稿・週次確認・バックアップの操作が同列になっている。入力画面の履歴カードも操作が7つある。

**担当**：UIの変更なので Claude Opus 5.5 が行う。

**ボードの変更内容**

- 3つのまとまりに分ける。
  - 記事：「+ 記事」「原稿」「原稿フォルダの変更」
  - 週次確認：「同期」「受け渡しフォルダの変更」(非対応ブラウザでは「確認対象を書き出す」「確認結果を読み込む」)
  - データ：「保存(JSON)」「読込(JSON)」
- よく使う「+ 記事」「原稿」「同期」は常に見せ、フォルダの変更とデータの操作は折りたたむ(`<details>` か `popover`。追加のライブラリは入れない)。
- 「同期」の動き(対象の書き出し、結果の読み込み、バックアップの書き出し)は変えない。
- 見出しや説明文で区別せず、間隔と並びでまとまりを見せる。

**入力画面の変更内容**

- 履歴カードの操作を、主操作(「プロンプト」「名前公開版」「編集」)と、それ以外(「再訪入力」「投稿URL」「削除」)に分け、後者を折りたたむ。ボードへのリンクは今の位置のまま。
- 履歴のツールバーも同じ考えで、「+ 新規入力」「店舗情報を取得」「カタログ記事」「まとめ記事」と、データ操作(「保存」「読込」「回答を追加読込」「バックアップ復元」)を分ける。

**WP-2 からの持ち越し**：2つの「フォルダ変更」を読み上げで区別できる名前にする。`#pick-articles` の HTML 側の `hidden` を外し、ほかのボタンと同じく JS だけで出し入れする。

**維持するもの**：ボタンの文言と要素のid(テストが文言とidで要素を探している)。折りたたんだ中の要素もDOMに残す。スマホでの押しやすさ(高さ44px以上)。キーボード操作と読み上げ(折りたたみの開閉が `aria-expanded` か `<details>` で伝わること)。

**触るファイル**：`board.html`、`src/board/board.css`、`src/board/main.ts`(表示の切り替えだけ)、`src/ui/list-tab.ts`(WP-6のあと)、`src/styles.css`

**確認**：ボードは1280pxと1024px、入力画面は375pxと1280pxで、表示崩れ・はみ出し・フォーカスの順を確かめ、スクリーンショットを報告に添える。既存テストが通ること(文言で探すテストが折りたたみの中の要素を見つけられること)。

### WP-11 まとめ記事のプロンプトをボードから作る

**状態**：着手可。2026-11-12 に本人が「カタログ記事はあまり書くつもりがないので保留、まとめ記事は残す」と答えた。

**目的**：まとめ記事は、入力画面では `prompt()` を重ねて通し番号とテーマを打ち、プロンプトを作る(`src/main.ts` `openMatome`)。ボードでは「+ 記事」で対象の回答を選んでカードを作るが、プロンプトは作れない。対象の選択が二度手間になっている。

**変更内容**

1. まとめのテーマはカードの `title` を使う。`BundleArticle` の形は変えない。
2. 「+ 記事」のダイアログで種類が「まとめ」のとき、対象は投稿済みの回答だけを選べるようにする(未投稿は選択不可で見せる)。種類が「カタログ」のときの入力欄は今のまま。
3. まとめのカードに「プロンプト」ボタンを足す。押すと `buildMatomePrompt(対象の回答, タイトル, 全回答)` を作ってコピーし、段階が「回答済み」なら「プロンプト出力」へ進める。生成時のエラー(解禁人数に届かない、未投稿が混じる、同じセラピストが重なる、対象の回答が消えている等)は既存の文のままトーストに出し、段階を変えない。
4. 入力画面の「まとめ記事」は残し、`prompt()` をWP-9のダイアログに置き換える。対象は通し番号の手入力をやめ、投稿済みの回答のチェックボックスにする。テーマは文字入力。これで `seriesTargets`(WP-6で `src/prompt/series.ts` へ移したもの)を使う場所がなくなれば、関数とそのテストを消してよい(消したことを報告に書く)。

**カタログ記事の扱い(保留)**：入力画面の「カタログ記事」ボタンと都道府県の `prompt()`、ボードのカタログカード(種類の選択肢、絞り込み、既存のカード)は、今の動きのまま触らない。ボードのカタログカードに「プロンプト」ボタンは足さない。機能を消すこともしない。

**変えないもの**：`buildMatomePrompt`・`buildCatalogPrompt` の文面と検証。まとめ記事の解禁条件(投稿済み6人。H-06)。

**今回やらないこと**：まとめの原稿をフォルダへ保存させ、ボードで読み戻すこと。必要なら別のWPとして決める。

**触るファイル**：`src/board/state.ts`、`src/board/view.ts`、`src/board/main.ts`、`src/board/cards.ts`、`src/main.ts`(または `src/ui/list-tab.ts`)、テスト

**テスト**：まとめカードの「プロンプト」で、対象の回答とタイトルが `buildMatomePrompt` に渡った文面がコピーされ、段階が進むこと。解禁人数に届かないときトーストが出て段階が変わらないこと。カタログカードに「プロンプト」ボタンが出ないこと。入力画面の「まとめ記事」には画面操作のテストがまだない(`src/ui-regression.test.ts` に該当なし)ので、ダイアログで対象を選んでコピーされるところまでを新しく足す。

### WP-12 呼び名をそろえる

**目的**：同じものに複数の呼び名があり、別のものに同じ語が使われている。

- `NameDisclosure` の値 `paid`/`free`(名前をどちらで明かすか)と、原稿の部品 `ARTICLE_PARTS` の id `paid`/`free`(有料部分/無料部分)が同じ語。ボードのボタンは `data-disclosure="paid" data-part="free"` のようになる。
- 名前の出し方の呼び名が、型では `paid`/`free`、フォルダでは `standard`/`names`、入力画面のボタンでは「プロンプト」「名前公開版」、ボードでは「原稿」「名前公開版」。

**変更内容**

1. `ARTICLE_PARTS` の id を `free`→`freePart`、`paid`→`paidPart` に変える。ファイル名(`free-part.html`、`paid-part.html`)は変えない。id はメモリとDOMの中だけで使われ、保存されない。
2. 名前の出し方の表示名を1つの定数にする(`src/prompt/style-profile.ts` に `DISCLOSURE_LABELS = { paid: '通常版', free: '名前公開版' }`)。ボードの `DRAFT_LABELS` をこれに置き換える。入力画面のボタン「プロンプト」「名前公開版」は文言を変えない。

**やらないこと**：`NameDisclosure` の値そのもの(`paid`/`free`)と、フォルダ名(`standard`/`names`)の変更。前者はプロンプトのテスト全体に、後者は書き出し済みの原稿に影響する。

**触るファイル**：`src/prompt/article-files.ts`、`src/prompt/style-profile.ts`、`src/board/view.ts`、`src/board/main.ts`、`src/board/articles.ts`、関係するテスト

**注意**：ボードの原稿の行の表示が「原稿」から「通常版」に変わる。文言の変更なので、報告で本人に知らせる。

### WP-13 テストでしか使わない公開関数を外す

**状態**：着手可。2026-11-12 に本人が承認した。

**対象**：`copyText`(`src/ui/widgets.ts` 115行。`src/clipboard.test.ts` だけが使う)、`VisitStore.exportJson`(`src/storage.ts` 70行。テスト5か所だけが使う)。

**変更内容**：テストを `tryCopyText`、`exportRawJson`(または `JSON.stringify(store.loadAll())`)に書き換えてから、2つの関数を消す。`copyText` のテストは「失敗しても例外を投げない」ことを見ているので、`tryCopyText` が `false` を返すことの確認に置き換える。

**注意**：テストは書き換えるだけで、確かめている内容を減らさない。書き換えたテスト名を報告に挙げる。

**完了条件**：`grep -rn "copyText\b\|exportJson()" src` が `tryCopyText` 以外を返さない。テストの件数が減っていない。

### WP-14 販売型と名前公開版をつなぐ

**状態**：着手可。2026-11-12 に本人が「セラピスト起点」と「名前公開版」は同じ選択だと答えた。

**対応**(この表を唯一の定義にする)

| 販売型(`ArticleAngle`) | 名前の出し方(`NameDisclosure`) | 入力画面のボタン | 原稿フォルダ | サムネのレイアウト |
|---|---|---|---|---|
| `therapist` セラピスト起点 | `free` 名前を無料部分で出す | 名前公開版 | `names` | `names` |
| `experience` 体験内容起点 | `paid` 名前を有料部分で出す | プロンプト | `standard` | `summary` |

**背景**：ボードの回答カードで「セラピスト起点/体験内容起点」を選べるが(`src/board/state.ts` の `angles`)、記録されるだけでどこにも使われていない。入力画面では「プロンプト」(名前は有料部分)と「名前公開版」(名前は無料部分)を選ぶ。サムネタブのレイアウト(`names`/`summary`)も、U-15 の2つの型に対応して作られている。H-11 と U-15 の経緯からは3か所とも同じ選択に見えるが、「セラピスト起点/体験内容起点」がどちらに当たるかは文書から読み取れなかった。

**変更内容**

1. 対応を1か所に定義する。`src/board/state.ts` に `disclosureOfAngle(angle: ArticleAngle): NameDisclosure` を足し、ほかの場所で対応を書かない。サムネのレイアウトとの対応は、`src/thumbnail.ts` の `LAYOUTS` の id を実物で確かめてから同じ場所に置く。
2. 入力画面の履歴カード：販売型を選んだ回答では、対応する側のボタン(「プロンプト」か「名前公開版」)を主ボタンの見た目にする。もう一方も押せるまま残す。販売型が未選択の回答は今のまま(どちらも通常の見た目)。販売型はボードの状態から読む。読めないときは未選択として扱い、履歴の表示を止めない。
3. ボードの回答カード：原稿の行(通常版/名前公開版)のうち、販売型に対応する側を先に並べる。もう一方の行も残す。
4. サムネタブ：回答を選んだとき(WP-5)、販売型が選ばれていれば対応するレイアウトを初期選択にする。手で切り替えられるまま残す。
5. ボードで販売型を変えたら、入力画面の履歴に反映する(WP-4 で足す `storage` イベントの描き直しで足りる)。

**変えないもの**：プロンプトの文面。販売型を選んでいなくても両方のプロンプトを作れること。販売型の保存形式(`angles`)。販売型を選べるのは単体記事だけという扱い(再訪は今のまま、ボタンの見た目を変えない)。

**やらないこと**：販売型を入力画面から選べるようにすること。選ぶ場所はボードだけのままにする。必要なら別に決める。

**触るファイル**：`src/board/state.ts`、`src/board/view.ts`、`src/main.ts`(または `src/ui/list-tab.ts`、`src/ui/thumb-tab.ts`)、`src/styles.css`、テスト

**テスト**：`disclosureOfAngle` の対応。販売型が `therapist` の回答で「名前公開版」が主ボタンになり、「プロンプト」も押せること。未選択の回答で見た目が変わらないこと。ボードの状態が壊れていても履歴が出ること。サムネタブで対応するレイアウトが初期選択になること。

**文書**：この判断を [15-requirements-history.md](15-requirements-history.md) の H-11 に追記する(「販売型のセラピスト起点は名前公開版、体験内容起点は既定の扱いと同じ選択。2026-11-12 本人回答」)。追記は実装と同じ変更に含め、本人の文書作成の決まりに従う。

### WP-15 起動経路とボードを文書と概念図に残し、ボードにも版の検知を入れる

**状態**：着手可。2026-11-12 に本人が文書化を承認し、draw.io の概念図も残すよう指示した。

**背景**

- PCでの起動は `start.bat`(5173番)、Claudeの確認用は `.claude/launch.json`(5183番)、スマホは GitHub Pages で、保存領域がそれぞれ別である。[11-remaining-tasks.md](11-remaining-tasks.md) は5173番を基準にしている。5183番が別なのは、確認用のデータを本人のデータと分けるためと読めるので、番号は変えない。
- `claude://` を開く動きと原稿の保存指示は、`.env.local` に `VITE_ARTICLE_DIR` を書いたローカル起動のときだけ有効になる。
- 記事ボード、週次確認(`scripts/weekly-check.mjs`)、`VITE_ARTICLE_DIR` の設定は `docs/` に書かれていない。
- 新しい版の検知(`watchForUpdate`)は入力画面だけにあり、ボードは開いたままだと古い版のままになる。

**変更内容**

1. (コード)WP-6で切り出した `src/update-watch.ts` をボードからも使う。ボードには未保存の入力がないので、「記事を追加」のダイアログが開いているときだけボタンを出し、それ以外は読み込み直す。
2. (文書)`docs/17-board-and-local-setup.md` を新設し、次を書く。実データ、実際のフォルダの場所、店やセラピストのURLは書かない。
   - 画面の役割：入力画面(スマホとPC)、記事ボード(PC専用)、サムネ
   - 1本の記事ができるまでの流れ：入力 → 保存・共有 → プロンプトのコピー → Claude で原稿を書き出す → ボードで原稿を確認・コピー → 本人が手動で投稿 → 投稿URLの登録 → 週次の在籍・出勤確認
   - 起動経路ごとの保存領域：`start.bat`(5173番、本人の作業データ)、`.claude/launch.json`(5183番、確認用)、GitHub Pages(スマホ)。経路をまたぐとデータは見えないこと、移すときは「保存して共有」と「回答を追加読込」を使うこと
   - `.env.local` の `VITE_ARTICLE_DIR` の書き方と、設定したときだけ変わる動き(`claude://` を開く、プロンプト末尾の保存指示)
   - 2つのフォルダ(受け渡しフォルダ、原稿フォルダ)の役割と、リポジトリの外に置くこと
   - 週次確認の実行方法(`node scripts/weekly-check.mjs <受け渡しフォルダ>`)と、ボードの「同期」との順番
   - 文書は本人の文書作成の決まり(`stop-ai-slop-jp` の適用と仕上げのリライト)に従う。
3. (概念図)`docs/diagrams/system-overview.drawio` を新設する。Claude のコネクタに draw.io はない(2026-11-12 に確認)。`.drawio` は XML なので、コネクタを使わずファイルを直接書く。外部サービスへは何も送らない。
   - 1枚目「全体像」：端末と保存領域を箱にする(スマホ/GitHub Pages、PC/localhost 5173)。その中に入力画面・記事ボード・localStorage(回答、ボードの状態)・IndexedDB(フォルダの記憶)を置く。外側に Slack(共有)、Claude アプリ、原稿フォルダ、受け渡しフォルダ、`weekly-check.mjs`、店舗サイト、wakust(手動投稿)を置き、矢印に受け渡すもの(回答JSON、プロンプト、原稿4ファイル、`targets.json`、`checks.json`、投稿URL)を書く。
   - 2枚目「記事の段階」：回答済み → プロンプト出力 → 推敲中 → 投稿済み の遷移と、それぞれを進める操作(プロンプトのコピー、原稿フォルダの読み込み、投稿URLの登録)を書く。
   - 自動で動く部分と本人が手で行う部分(投稿、共有先の選択、フォルダの許可)を線種か色で分ける。色だけに頼らず凡例を付ける。
   - 文書(`docs/17-…`)から図へリンクする。draw.io デスクトップか、エディタの draw.io 拡張で開けることを確かめる(XMLとして正しいことは最低限確かめる)。
4. WP-1〜14 で動きが変わった箇所は、変わったあとの姿で書く。WP-15 は最後に行う。

**触るファイル**：`src/board/main.ts`、`src/update-watch.ts`、テスト、`docs/17-board-and-local-setup.md`(新設)、`docs/diagrams/system-overview.drawio`(新設)

## 5. この計画に入れなかったもの

- カタログ記事の導線(ボードからのプロンプト生成、都道府県の入力のダイアログ化)。本人があまり書く予定がないため保留にした。今の機能は残す。

- `sales.articleType` は `revisitOf` から決まる値で、保存形式に重複して入っている。スキーマと既存データに関わるので、今回は触らない。
- 回答を消したあと、ボードの `stages`・`angles`・まとめの `recordIds` に消えた回答のIDが残る。表示には影響しない。掃除の処理は足していない。
- ボードは操作のたびに全回答を読み直して検証している。件数が少ない間は問題にならない。
