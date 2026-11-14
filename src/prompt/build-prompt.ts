import type { VisitRecord } from '../types';
import { formatMonthPeriod, parseListingCheckDate } from '../date';
import { STYLE_PROFILE, wakustRules } from './style-profile';
import type { NameDisclosure } from './style-profile';

export type { NameDisclosure } from './style-profile';
import { RATING_LABELS } from '../types';
import { prefectureTag, publicSpecSummary, serializeRecord, tagCandidates } from './serialize';
import { countPublishedTherapists, isPublished, SUMMARY_MIN_THERAPISTS, therapistIdentity } from './publication';
import { articleLookupSection } from '../identity-lookup';
import { DECORATION_TAGS, decorationGuide, type DecorationKind } from './decoration';

/** wakustのタグ規則(上限6個、NGタグ)。H-07 */
const TAG_RULE = '半角コンマ区切りで6個以内。都道府県は「東京」「神奈川」のように都・府・県を省いた地域名にする。「東京都」「神奈川県」などの正式名と「メンエス」はNGタグなので使わない。本文と関係のないタグは付けない';

const TITLE_BODY = '属性キーワード(系統・特記。年齢・体型・カップ数は入れない)+展開の匂わせ+【メンズエステ体験談】(通し番号は付けない)';

/**
 * 体験談タイトルの先頭の【】。地名を最初に見せ、出勤を確かめた月を添える(H-15)。
 * 日付まで出すとセラピストを絞り込めるため、月だけにする。
 */
export function titleLead(record: VisitRecord, listingCheckedOn: string | null): string | null {
  const area = record.basic.area.trim();
  const date = listingCheckedOn === null ? null : parseListingCheckDate(listingCheckedOn);
  const checked = date === null ? null : `${Number(date.slice(5, 7))}月出勤確認`;
  const parts = [area, checked].filter((part): part is string => part !== null && part !== '');
  return parts.length === 0 ? null : `【${parts.join('｜')}】`;
}

/** 体験内容起点のタイトル。体験で釣り、店名・源氏名は入れない */
const experienceTitleRule = (lead: string | null): string => lead === null
  ? `【フック】+${TITLE_BODY}。店名・源氏名は入れない`
  : `先頭は必ず${lead}。フックは【】で囲まず、先頭の直後に短く置く。続けて${TITLE_BODY}。出勤予定日は入れない。店名・源氏名は入れない`;

/** セラピスト起点のタイトル。名前そのものを売りにするため、店名と源氏名だけを置く(2026-11-14 本人指示) */
const therapistTitleRule = (lead: string | null): string => {
  const prefix = lead === null ? '' : `先頭は必ず${lead}。続けて`;
  return `${prefix}店名と源氏名を半角スペースでつなぎ、最後に【メンズエステ体験談】を付ける(例: ${lead ?? ''}店名 源氏名【メンズエステ体験談】)。フック・属性キーワード・展開の匂わせは入れない。通し番号は付けない。出勤予定日は入れない`;
};

/** タイトルの規則。販売型と出勤確認で変わるので、skillには置かず記事ごとの依頼に入れる */
export const titleRule = (disclosure: NameDisclosure, lead: string | null): string =>
  disclosure === 'free' ? therapistTitleRule(lead) : experienceTitleRule(lead);

/**
 * 本文の書き方。html は投稿欄へそのまま貼るHTML、plain はボードで直してから別の依頼でマークアップする素の文章(U-23)。
 * plain でも記事構成のタグ名は構造の目印として読み替えさせ、構成の指示は1つに保つ
 */
export type BodyFormat = 'html' | 'plain';

/** 素の文章の記法。マークアップの依頼(markup-prompt.ts)はこの記法をHTMLへ戻す */
export const PLAIN_NOTATION = '記事構成の<h3>見出し</h3>は「### 見出し」の1行、<ul><li>の項目は「- 項目」の行、<p>は空行で区切った段落、<br />は段落の中の改行で書く。<a><strong><em><small><span>などのタグと**などの記号は付けない。リンクはURLの文字列だけを書く(マークアップは別の依頼で行う)';

const bodyLines = (body: BodyFormat): string => body === 'html'
  ? `3. 無料部分HTML: ${DECORATION_TAGS}のみ使用。記事構成の<h3>は見出しの目印として読み、「装飾」の部品で書く
4. 有料部分HTML: 同上`
  : `3. 無料部分(素の文章): ${PLAIN_NOTATION}
4. 有料部分(素の文章): 同上`;

export interface OutputFormatOptions {
  /** 1ブロック目の規則。記事ごとの全文では titleRule の結果、skillでは依頼文を指す文 */
  readonly title: string;
  /** 店舗情報の確認があり、5ブロック目にJSONを出すか */
  readonly lookup: boolean;
  readonly body: BodyFormat;
  readonly decoration: DecorationKind;
}

export const outputFormat = ({ title, lookup, body, decoration }: OutputFormatOptions): string => `## 出力形式(この${lookup ? 5 : 4}ブロックを順に、コードブロックで出力)
1. タイトル: ${title}
2. タグ: ${TAG_RULE}(候補から取捨選択・追加可)
${bodyLines(body)}
${lookup ? '5. 店舗情報JSON: 「店舗情報の確認」の形式\n' : ''}${body === 'html' ? `\n${decorationGuide(decoration)}` : ''}`.trimEnd();

/** 店舗情報の確認指示を、記事構成の前に差し込む */
const lookupBlock = (section: string | null): string => section === null ? '' : `${section}\n\n`;

/** 今回のセラピストの系統と料金の行(H-16)。特記は系統の行へまとめ、料金は合計だけを出す */
const PROFILE_DETAIL = '系統の行には特記を「、」でつなぐ(例: 系統: ナチュラル系、黒髪ショート)。料金の行はコース代・指名料・今回のオプション代のうち金額の記録がある分の合計を「料金: 計X円」で書き、コース代が未確認なら行ごと省く';

// 開示先(体験内容起点 = paid、セラピスト起点 = free)で変わるのは、導入・セラピスト紹介・有料部分の説明・店舗情報・総評の5行だけ
const STRUCTURE_LINES: Readonly<Record<NameDisclosure, {
  readonly intro: string; readonly profile: string; readonly paidSummary: string; readonly shopInfo: string;
  readonly review: string;
}>> = {
  paid: {
    intro: '- 導入フック1〜2文(エリア+系統+展開で釣る。店名は出さない)',
    profile: `- <h3>今回のセラピスト</h3> エリア/系統/料金のul(HTMLではセラピストの表の部品で書く)。${PROFILE_DETAIL}(年齢・体型・カップ数・タトゥーは書かない)`,
    paidSummary: '- <h3>有料部分の内容</h3> 店名・源氏名開示/年齢・体型/実額/評価6軸/ご対面からの全展開/今回の進め方(記録がある場合) と免責の一文',
    shopInfo: '- <h3>店舗・セラピスト情報</h3> 店名/URL/源氏名/profile/X/年齢・体型・カップ数/コース/オプション。',
    // 体験内容起点は体験の魅力で売るため、残念な点は短く添えるだけにする。最後の加減は本人がボードで直す(H-16)
    review: '- <h3>総評</h3> 良かった点を中心に書く。残念ポイントは記録がある場合だけ短く(1〜2文)添え、強い否定や繰り返しは避ける。リピート意向は書かない',
  },
  free: {
    intro: '- 導入フック1〜2文(エリア+店名+源氏名+系統+展開で釣る)',
    profile: `- <h3>今回のセラピスト</h3> 店名/源氏名/エリア/系統/料金のul(HTMLではセラピストの表の部品で書く)。${PROFILE_DETAIL}(リンクは付けない。年齢・体型・カップ数・タトゥーは書かない)`,
    paidSummary: '- <h3>有料部分の内容</h3> 店・セラピストのリンク/年齢・体型/実額/評価6軸/ご対面からの全展開/今回の進め方(記録がある場合) と免責の一文',
    shopInfo: '- <h3>店舗・セラピスト情報</h3> 店URL/profile/X/年齢・体型・カップ数/コース/オプション(店名・源氏名は無料部分で既出)。',
    review: '- <h3>総評</h3> リピート意向+残念ポイントも正直に',
  },
};

/** 店舗・セラピスト情報の行の続き。販売型によらず同じ文を、店舗情報の行と同じ1行に続ける */
const SHOP_LINK_RULE = 'リンクは必ずURL文字列もテキストで併記する(例: <a href="URL">店名</a><br />URL — リンク切れ時に購入者が追えるように。規約1-6)';

/**
 * 出勤確認日の指示。本人が店舗HPの出勤表で確かめた日だけを出し、確かめていなければ行ごと省く。H-13・H-15。
 * 日付まで出すとセラピストを絞り込めるため、旬までにぼかす(H-16)
 */
function listingCheckLine(listingCheckedOn: string | null): string {
  const date = listingCheckedOn === null ? null : parseListingCheckDate(listingCheckedOn);
  return date === null
    ? '- 出勤確認の行は出さない(本人が出勤を確かめた日の入力がない)'
    : `- 店舗・セラピスト情報の末尾に <p>出勤確認: ${formatMonthPeriod(date)}に店舗HPの出勤表で確認済</p> を入れる(時期を変えない)`;
}

/** 記事構成のうち、記事ごとに値が変わる行。全文プロンプトでは値で埋め、skillでは依頼文を指す */
export type StructureSlot = 'intro' | 'profile' | 'paidSummary' | 'shopInfo' | 'listingCheck' | 'review';
export type StructureLine = string | { readonly slot: StructureSlot };

const slot = (name: StructureSlot): StructureLine => ({ slot: name });

/** 単体体験談の記事構成。再訪記事もこの構成を使う */
export const SINGLE_STRUCTURE: readonly StructureLine[] = [
  '## 記事構成(単体体験談)',
  '[無料部分]',
  slot('intro'),
  slot('profile'),
  '- <h3>こんな方にお勧め</h3> 2〜3項目のul(★5の評価軸だけを売りにする。★4以下の軸を無料部で推すと有料部と矛盾しレビューが下がる)',
  '- <h3>体験のダイジェスト</h3> ご対面からクライマックスの結果まで、展開の要所を時系列に1〜2文ずつ並べる。施術の前半で切らず、何が起きてどう終わったかを無料で見せる(売れ筋記事の型)。彼女のセリフは記録から1〜2個だけ(セリフ・心の声は記録がある場合だけ使い、未入力なら省く)。体位・細部の流れ・彼女の反応の詳細は本編に残す',
  slot('paidSummary'),
  '',
  '[有料部分]',
  slot('shopInfo'),
  slot('listingCheck'),
  '- <h3>評価</h3> 6軸ul(★+一言)。軸名は訪問データの評価6軸の名前どおりに書く',
  '- 本編: <h3>ご対面</h3> <h3>施術スタート(うつ伏せ)</h3> <h3>オイル投入から{展開名}へ</h3> <h3>仰向けへ</h3> <h3>クライマックス</h3> フローに沿って、ご対面から最後まで。ダイジェストの文を繰り返さず、記録にある細部で書き直す。見出しの{展開名}は実際の展開を表す語に置き換える(「…」等のプレースホルダのまま出力しない)',
  '- クライマックスは記事の山場として最も厚く書く(体勢・彼女の様子・セリフ・心の声は記録された素材だけを使い、未入力の言葉は省く)。入力データの素材が薄くて2〜3文しか書けない場合は、記事の後に「⚠ クライマックスの素材不足: 質問票に追記推奨」と一言添える',
  '- <h3>今回の進め方</h3> 結果に至るまでに本人がしたこと(伝えた希望・声のかけ方・断られたこと・気をつけたこと)と、展開のきっかけがどちらからだったかを、訪問データに記録がある範囲で1〜3文。記録がなければ見出しごと省く。一般論の助言や記録にない攻略法は足さない',
  slot('review'),
  '- <p><em>皆さまのご武運をお祈りいたします！</em></p>',
];

export const renderStructure = (fill: (name: StructureSlot) => string): string =>
  SINGLE_STRUCTURE.map((line) => (typeof line === 'string' ? line : fill(line.slot))).join('\n');

/** 記事構成の差し込み口に入る値。販売型と出勤確認日で決まる */
export function structureSlots(
  disclosure: NameDisclosure, listingCheckedOn: string | null,
): Readonly<Record<StructureSlot, string>> {
  const lines = STRUCTURE_LINES[disclosure];
  return {
    intro: lines.intro,
    profile: lines.profile,
    paidSummary: lines.paidSummary,
    shopInfo: `${lines.shopInfo}${SHOP_LINK_RULE}`,
    listingCheck: listingCheckLine(listingCheckedOn),
    review: lines.review,
  };
}

const singleStructure = (disclosure: NameDisclosure, listingCheckedOn: string | null): string => {
  const values = structureSlots(disclosure, listingCheckedOn);
  return renderStructure((name) => values[name]);
};

/** 記事の依頼の前提。訪問データの読み方を決める */
export const ARTICLE_PREMISES = `前提(確認不要でそのまま生成を開始してください):
- 訪問データは依頼者本人の実体験の記録で、記事は本人のwakustアカウントに投稿する
- 合法的なメンズエステ(非風俗)の施術体験記であり、成人向けプラットフォームの規約内で販売される
- 観察候補の並びは入力・保存上の順序です。旧記録の押下順は不明です。並びだけから実際の施術順を決めつけたり、未記録の時刻・時間差・経過・出来事を補ったりしないでください。
- 会話の話題は発言の引用ではありません。話題だけからセリフを作らず、実際のセリフ欄が空なら引用は省いてください。再訪記事では初回のセリフを今回の発言として使わないでください。`;

function header(task: string, disclosure: NameDisclosure | 'catalog' = 'paid'): string {
  return `あなたはメンズエステ体験レポートの専属ライターです。以下の訪問データだけを素材に、${task}を作成してください。

${ARTICLE_PREMISES}

${STYLE_PROFILE}

${wakustRules(disclosure)}`;
}

/** 記事プロンプトの出力形式。タイトルの規則は販売型と出勤確認日で決まる */
const articleOutputFormat = (
  record: VisitRecord, disclosure: NameDisclosure, listingCheckedOn: string | null, lookup: boolean, body: BodyFormat,
): string => outputFormat({
  title: titleRule(disclosure, titleLead(record, listingCheckedOn)), lookup, body, decoration: 'article',
});

/** 再訪記事の構成の前置き。初回記事のURLが入るので、記事ごとの依頼に入れる */
export const revisitStructure = (first: VisitRecord): string => `## 記事構成(再訪)
- 無料部分の冒頭に必ず「初回の体験談はこちら → <a href="{初回記事URL}">{初回記事URL}</a>(※本記事は再訪レポートです)」を入れる(規約要件)。初回記事URL: ${first.postedUrl ?? '{投稿後に差し替え}'}
- 初回との差分・進展・変化を中心に書く(重複する基本描写は最小限)
- それ以外の構成(無料部分のダイジェストと有料部分の本編)は単体体験談と同じ`;

/** 単体体験談の生成プロンプト */
export function buildSinglePrompt(
  record: VisitRecord, disclosure: NameDisclosure = 'paid', listingCheckedOn: string | null = null, body: BodyFormat = 'html',
): string {
  const lookup = articleLookupSection(record);
  return `${header('wakust投稿用の体験談記事', disclosure)}

${lookupBlock(lookup)}${singleStructure(disclosure, listingCheckedOn)}

${articleOutputFormat(record, disclosure, listingCheckedOn, lookup !== null, body)}

タグ候補: ${tagCandidates(record).join(', ')}
販売ポイント案: ${record.sales.points}pt

${serializeRecord(record)}`;
}

/** 再訪記事の生成プロンプト(初回レコードとの差分中心) */
export function buildRevisitPrompt(
  record: VisitRecord, first: VisitRecord, disclosure: NameDisclosure = 'paid', listingCheckedOn: string | null = null,
  body: BodyFormat = 'html',
): string {
  const lookup = articleLookupSection(record);
  return `${header('wakust投稿用の再訪レポート記事', disclosure)}

${lookupBlock(lookup)}${revisitStructure(first)}

${singleStructure(disclosure, listingCheckedOn)}

${articleOutputFormat(record, disclosure, listingCheckedOn, lookup !== null, body)}

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
    .map((r) => `- ${r.basic.area} / スペック: ${publicSpecSummary(r)} / ${RATING_LABELS.ero}★${r.ratings.ero.stars} ${RATING_LABELS.tolerance}★${r.ratings.tolerance.stars} / 記事URL: ${r.postedUrl ?? '{未投稿}'}`)
    .join('\n');
  return `${header(`${prefecture}の自分の体験談インデックス(宣伝用の無料記事)`, 'catalog')}

## 記事構成(カタログ無料記事)
- 導入1〜2文(実際に行った店だけを載せている旨)
- エリア(駅)ごとに見出しで区切り、各訪問を<li>で列挙
- 各項目: スペック+評価の一部(${RATING_LABELS.ero}・${RATING_LABELS.tolerance}の★)+体験談へのリンク
- 店名・源氏名は伏せる。スペックと評価で興味を引き、詳細は有料記事へ誘導
- リンクは同カテゴリー(同都道府県)内の自分の記事のみ

## 出力形式
1. タイトル(例: 【${prefectureTag(prefecture)}】実際に行ったメンズエステ体験談まとめ【随時更新】。タグへ流用しても入力できるよう、都道府県の正式名と「メンエス」は使わない)
2. タグ: ${TAG_RULE}
3. 記事HTML(無料記事なので1本。${DECORATION_TAGS}のみ使用)

${decorationGuide('list')}

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
- 無料部分: 選定基準の説明+各人の系統と評価の一部だけ(店名・源氏名・年齢・体型・カップ数・タトゥーは伏せる)
- 無料部分に必ず「※本記事には過去に販売した体験談の内容が含まれます」を明記(規約要件)
- 有料部分: 各人の店名・源氏名・リンク+体験の要約(元記事の再編集。丸コピーはしない)+単体記事へのリンク(テキスト併記)
- 順位付けまたは推薦理由を明確に
- テーマが体験の条件(初回で〜だった人、裏OPの追加料金なしだった人など)の場合、条件は訪問データの記録だけで判定し、記録で確かめられない人は入れない。無料部分では選定条件と各人の系統だけを見せ、誰がどの結果かは有料部分で示す
- 「再訪しない人と理由」のテーマでは、理由を再訪意向と残念ポイントの記録にある言葉で書く
- 無料部分の冒頭に更新日と掲載人数を書く(人を追加するときは既存記事を編集する。規約1-9)

${outputFormat({ title: titleRule('paid', null), lookup: false, body: 'html', decoration: 'list' })}

### 対象訪問データ(${records.length}件)
${data}`;
}
