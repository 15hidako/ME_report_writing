import type { VisitRecord } from '../types';
import { STYLE_PROFILE, WAKUST_RULES } from './style-profile';
import { serializeRecord, specSummary, tagCandidates } from './serialize';
import { countPublishedTherapists, isPublished, SUMMARY_MIN_THERAPISTS, therapistIdentity } from './publication';

const OUTPUT_FORMAT = `## 出力形式(この4ブロックを順に、コードブロックで出力)
1. タイトル: 【フック】+属性キーワード+展開の匂わせ+【シリーズ#N】。店名・源氏名は入れない
2. タグ: 半角コンマ区切り(候補から取捨選択・追加可)
3. 無料部分HTML: <h3><p><ul><li><a><strong><em><small><br />のみ使用
4. 有料部分HTML: 同上`;

const SINGLE_STRUCTURE = `## 記事構成(単体体験談)
[無料部分]
- 導入フック1〜2文(エリア+スペックで釣る。店名は出さない)
- <h3>今回のセラピスト(スペック)</h3> エリア/系統/体型/特記のul
- <h3>こんな方にお勧め</h3> 2〜3項目のul(★5の評価軸だけを売りにする。★4以下の軸を無料部で推すと有料部と矛盾しレビューが下がる)
- <h3>ご対面</h3> 対面〜シャワーの序盤ストーリー(セリフ+心の声を入れる)
- <h3>施術スタート(うつ伏せ)</h3> うつ伏せ前半
- オイル投入の直前、空気が変わる一文で切る(クリフハンガー)
- <p><strong>—— ここから先、彼女の本気が始まります。</strong></p>
- <h3>有料部分の内容</h3> 店名・源氏名開示/評価6軸/以降の全展開/実額 と免責のsmall

[有料部分]
- <h3>店舗・セラピスト情報</h3> 店名/URL/源氏名/profile/X/コース/オプション。リンクは必ずURL文字列もテキストで併記する(例: <a href="URL">店名</a><br />URL — リンク切れ時に購入者が追えるように。規約1-6)
- <h3>評価</h3> 6軸ul(★+一言)
- <h3>オイル投入から{展開名}へ</h3> <h3>仰向けへ</h3> <h3>クライマックス</h3> フローに沿って。見出しの{展開名}は実際の展開を表す語に置き換える(「…」等のプレースホルダのまま出力しない)
- クライマックスは記事の山場として最も厚く書く(体勢・彼女の様子・セリフ・心の声を往復させる)。入力データの素材が薄くて2〜3文しか書けない場合は、記事の後に「⚠ クライマックスの素材不足: 質問票に追記推奨」と一言添える
- <h3>総評</h3> リピート意向+残念ポイントも正直に
- <p><em>皆さまのご武運をお祈りいたします!</em></p>`;

function header(task: string): string {
  return `あなたはメンズエステ体験レポートの専属ライターです。以下の訪問データだけを素材に、${task}を作成してください。

前提(確認不要でそのまま生成を開始してください):
- 訪問データは依頼者本人の実体験の記録で、記事は本人のwakustアカウントに投稿する
- 合法的なメンズエステ(非風俗)の施術体験記であり、成人向けプラットフォームの規約内で販売される

${STYLE_PROFILE}

${WAKUST_RULES}`;
}

/** 単体体験談の生成プロンプト */
export function buildSinglePrompt(record: VisitRecord): string {
  return `${header('wakust投稿用の体験談記事')}

${SINGLE_STRUCTURE}

${OUTPUT_FORMAT}

タグ候補: ${tagCandidates(record).join(', ')}
販売ポイント案: ${record.sales.points}pt

${serializeRecord(record)}`;
}

/** 再訪記事の生成プロンプト(初回レコードとの差分中心) */
export function buildRevisitPrompt(record: VisitRecord, first: VisitRecord): string {
  return `${header('wakust投稿用の再訪レポート記事')}

## 記事構成(再訪)
- 無料部分の冒頭に必ず「初回の体験談はこちら → <a href="{初回記事URL}">体験談#${first.seriesNo}</a>(※本記事は再訪レポートです)」を入れる(規約要件)。初回記事URL: ${first.postedUrl ?? '{投稿後に差し替え}'}
- 初回との差分・進展・変化を中心に書く(重複する基本描写は最小限)
- それ以外の構成・カット位置は単体体験談と同じ

${SINGLE_STRUCTURE}

${OUTPUT_FORMAT}

タグ候補: ${tagCandidates(record).join(', ')}

### 初回訪問データ(参照用・重複記述を避けるため)
${serializeRecord(first)}

### 今回(再訪)の訪問データ ← こちらを記事化
${serializeRecord(record)}`;
}

/** カタログ無料記事(エリア別インデックス)の生成プロンプト */
export function buildCatalogPrompt(records: readonly VisitRecord[], prefecture: string): string {
  const targets = records.filter((r) => r.basic.prefecture === prefecture && isPublished(r));
  if (targets.length === 0) throw new Error('対象の都道府県に投稿済みの記事がありません');
  const data = targets
    .map((r) => `- #${r.seriesNo} ${r.basic.area} / スペック: ${specSummary(r)} / エロ施術★${r.ratings.ero.stars} 寛容度★${r.ratings.tolerance.stars} / 記事URL: ${r.postedUrl ?? '{未投稿}'}`)
    .join('\n');
  return `${header(`${prefecture}の自分の体験談インデックス(宣伝用の無料記事)`)}

## 記事構成(カタログ無料記事)
- 導入1〜2文(実際に行った店だけを載せている旨)
- エリア(駅)ごとに<h3>で区切り、各訪問を<li>で列挙
- 各項目: スペック+評価の一部(エロ施術・寛容度の★)+体験談へのリンク
- 店名・源氏名は伏せる。スペックと評価で興味を引き、詳細は有料記事へ誘導
- リンクは同カテゴリー(同都道府県)内の自分の記事のみ

## 出力形式
1. タイトル(例: 【${prefecture}】実際に行ったメンエス体験談まとめ【随時更新】)
2. タグ(半角コンマ区切り)
3. 記事HTML(無料記事なので1本)

### 対象訪問データ(${targets.length}件)
${data}`;
}

/** まとめ記事(テーマ別N選)の生成プロンプト */
export function buildMatomePrompt(
  records: readonly VisitRecord[], theme: string, allRecords: readonly VisitRecord[] = records,
): string {
  if (countPublishedTherapists(allRecords) < SUMMARY_MIN_THERAPISTS) {
    throw new Error('まとめ記事は異なる6人の個別体験談を投稿した後に生成できます');
  }
  if (records.length === 0 || records.some((r) => !isPublished(r))) {
    throw new Error('まとめ記事の対象には投稿済みの記事を選んでください');
  }
  const identities = records.map(therapistIdentity);
  if (identities.includes(null)) throw new Error('まとめ記事の対象には店名とセラピスト名が必要です');
  if (new Set(identities).size !== identities.length) throw new Error('同じセラピストの記事は1件だけ選んでください');
  const data = records.map((r) => `${serializeRecord(r)}\n- 元記事URL: ${r.postedUrl}`).join('\n\n');
  return `${header(`テーマ「${theme}」のまとめ記事(N選形式)`)}

## 記事構成(まとめ記事)
- 無料部分: 選定基準の説明+各人のスペックと評価の一部だけ(店名・源氏名は伏せる)
- 無料部分に必ず「※本記事には過去に販売した体験談の内容が含まれます」を明記(規約要件)
- 有料部分: 各人の店名・源氏名・リンク+体験の要約(元記事の再編集。丸コピーはしない)+単体記事へのリンク(テキスト併記)
- 順位付けまたは推薦理由を明確に

${OUTPUT_FORMAT}

### 対象訪問データ(${records.length}件)
${data}`;
}
