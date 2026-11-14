// 投稿用HTMLの装飾。wakustの下書きで本人が表示を確かめた部品だけを使う(2026-11-14、H-01追記)。
// 紺をサイトのトーンに合わせた主色にし、彼女のセリフとクライマックスだけピンクにする。

/** 投稿用HTMLで使うタグ。装飾はすべてインラインの style 属性で書く */
export const DECORATION_TAGS = '<p><div><ul><li><table><tbody><tr><th><td><a><em><small><span><br />';

const HEADING_BASE = 'margin: 32px 0 14px; font-size: 17px; font-weight: bold; color: #222222; line-height: 1.5;';
const BOX_LIST = '<ul style="margin: 8px 0; padding-left: 1.2em;"><li style="margin: 4px 0;">項目</li></ul>';
const TH = 'background-color: #eef3fb; border: 1px solid #cfdcef; padding: 8px 10px; text-align: left; font-weight: bold; color: #213a66;';
const TD = 'border: 1px solid #cfdcef; padding: 8px 10px;';

/** article は単体体験談・再訪記事、list はカタログ記事とまとめ記事 */
export type DecorationKind = 'article' | 'list';

interface DecorationPart {
  readonly name: string;
  /** カタログ記事とまとめ記事でも使う部品か */
  readonly list: boolean;
  readonly use: string;
  readonly html: string;
}

/** 部品の見本。文字の部分(見出し、項目など)は本文の言葉に置き換える */
export const DECORATION_PARTS: readonly DecorationPart[] = [
  {
    name: '見出し',
    list: true,
    use: '記事の見出し。体験談の本編の見出しには下の専用の部品を使う',
    html: `<p style="border-left: 5px solid #2b4a86; padding: 4px 0 4px 12px; ${HEADING_BASE}">見出し</p>`,
  },
  {
    name: '本編の見出し',
    list: false,
    use: '有料部分の本編(ご対面からクライマックスの手前まで)の見出し',
    html: `<p style="border-left: 5px solid #2b4a86; background-color: #eef3fb; padding: 8px 12px; ${HEADING_BASE}">見出し</p>`,
  },
  {
    name: 'クライマックスの見出し',
    list: false,
    use: 'クライマックスの見出しだけ',
    html: `<p style="border-left: 5px solid #c2255c; background-color: #fdf0f4; padding: 8px 12px; ${HEADING_BASE}">クライマックス</p>`,
  },
  {
    name: 'セラピストの表',
    list: false,
    use: '今回のセラピストの「項目: 値」の並び。1項目を1行にする',
    html: `<table style="border-collapse: collapse; width: 100%; font-size: 14px; margin: 0 0 8px;"><tbody><tr><th style="${TH} width: 28%;">項目</th><td style="${TD}">値</td></tr></tbody></table>`,
  },
  {
    name: '枠のボックス',
    list: false,
    use: 'こんな方にお勧めの箇条書き、総評の段落',
    html: `<div style="border: 2px solid #2b4a86; border-radius: 8px; padding: 4px 14px; margin: 0 0 8px; background-color: #f7f9fd;">${BOX_LIST}</div>`,
  },
  {
    name: '有料部分の内容のボックス',
    list: false,
    use: '有料部分の内容の見出し・箇条書き・免責をまとめて入れる。見出しはボックスの中に置き、外に出さない。直前に区切り線を置く',
    html: `<div style="background-color: #eef3fb; border-radius: 8px; padding: 14px; margin: 0 0 8px;"><p style="margin: 0 0 8px; font-size: 16px; font-weight: bold; color: #213a66;">有料部分の内容</p>${BOX_LIST}<p style="margin: 8px 0 0;"><small style="color: #868e96;">免責</small></p></div>`,
  },
  {
    name: '評価のカード',
    list: false,
    use: '評価6軸の箇条書き。ul と li は使わず、1軸を1つの div にする(wakustでは list-style が効かず行頭の点が残る)。★は黄、☆は灰にする。最後の軸は下線を付けない',
    html: '<div style="border: 1px solid #e9ecef; border-radius: 8px; padding: 4px 14px; margin: 0 0 8px;"><div style="padding: 8px 0; border-bottom: 1px solid #f1f3f5;">軸名:<span style="color: #f59f00;">★★★★</span><span style="color: #dee2e6;">☆</span><br />一言</div><div style="padding: 8px 0;">最後の軸名:<span style="color: #f59f00;">★★★★★</span><br />一言</div></div>',
  },
  {
    name: '彼女のセリフ',
    list: false,
    use: '「」で囲まれたセリフだけの段落。左の丸に「彼女」と入れる',
    html: '<div style="display: flex; align-items: flex-start; gap: 10px; margin: 14px 0;"><div style="flex: 0 0 40px; width: 40px; height: 40px; border-radius: 50%; background-color: #ffc9dc; color: #c2255c; font-size: 13px; font-weight: bold; text-align: center; line-height: 40px;">彼女</div><div style="flex: 1 1 auto; background-color: #fdf0f4; border-radius: 10px; padding: 10px 12px;">「セリフ」</div></div>',
  },
  {
    name: '心の声',
    list: false,
    use: '（）で囲まれた心の声だけの段落',
    html: '<p style="color: #868e96; font-size: 14px;">（心の声）</p>',
  },
  {
    name: '左線のボックス',
    list: false,
    use: '今回の進め方の段落',
    html: '<div style="border-left: 4px solid #adb5bd; background-color: #f8f9fa; padding: 12px 14px; margin: 0 0 8px; color: #444444;"><p style="margin: 0;">段落</p></div>',
  },
  {
    name: 'マーカー',
    list: true,
    use: '読みどころの一文。黄は要点、オレンジは結果と山場。1つの見出しの下で1か所まで',
    html: '<span style="background: linear-gradient(transparent 60%, #ffe066 60%);">要点</span> / <span style="background: linear-gradient(transparent 60%, #ffd8a8 60%);">結果</span>',
  },
  {
    name: 'リンク',
    list: true,
    use: 'すべてのリンク',
    html: '<a href="URL" style="color: #2b4a86; border-bottom: 1px dotted #2b4a86; text-decoration: none;">名前</a>',
  },
  {
    name: '補足の小さな字',
    list: true,
    use: '免責、出勤確認の行',
    html: '<small style="color: #868e96;">補足</small>',
  },
  {
    name: '空白行',
    list: true,
    use: '文章の段落と段落の間(見出し・箇条書き・ボックスなどの部品の前後には入れない)',
    html: '<p>&nbsp;</p>',
  },
  {
    name: '区切り線',
    list: true,
    use: '大きな話の切れ目と、締めの一文の前',
    html: '<div style="border-top: 1px dashed #2b4a86; height: 0; margin: 32px 0 20px;"></div>',
  },
  {
    name: '締めの一文',
    list: false,
    use: '記事の締め',
    html: '<p style="text-align: center;"><em style="color: #2b4a86; font-weight: bold; font-style: normal;">締めの一文</em></p>',
  },
];

/** wakustで削られる、またはサイトのCSSに負ける書き方 */
const DECORATION_RULES = [
  `使うタグは ${DECORATION_TAGS} だけ。装飾はタグの style 属性に書く`,
  '<h3> と <hr> は使わない(サイトのCSSで下線が付く、線が薄くなる)。見出しは下の部品の <p>、区切りは区切り線の <div> で書く',
  '<style> タグ、class 属性、rgba() は使わない(投稿時に削られる)。色は #rrggbb で書く',
  'letter-spacing は指定しない。文字の間隔は既定のままにする',
  '見本にない色や部品を足さない。本文の段落は style なしの <p> にし、記事の大半を装飾しない',
  '文章の改行に <br /> を使わない(行間が詰まって読みにくい)。区切りたいところは <p> を分ける。<br /> を使うのはリンクの名前とURLの間と、評価のカードの中だけ',
  '1行ずつの <p> が続くと段落の切れ目が見えないので、文章の段落と段落の間には空白行の部品を1つ入れる',
  '文中の強調はマーカーだけで付ける。サイトの文字が太いので、<strong> や font-weight の太字は文中に使わない(見出しなどの部品の太字はそのまま)',
] as const;

/** 記事プロンプトとマークアップの依頼に入れる装飾の指示 */
export function decorationGuide(kind: DecorationKind = 'article'): string {
  const rules = DECORATION_RULES.map((rule) => `- ${rule}`).join('\n');
  const parts = DECORATION_PARTS.filter((part) => kind === 'article' || part.list).map((part) => `- ${part.name}(${part.use}):\n  ${part.html}`).join('\n');
  return `## 装飾
${rules}

### 部品の見本(style はこのまま写す)
${parts}`;
}
