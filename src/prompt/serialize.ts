import type { Ratings, VisitRecord } from '../types';
import {
  BODY_LABELS, CUP_IMPRESSION_LABELS, FLOW_PHASES, GENRE_LABELS,
  RATING_LABELS, REPEAT_LABELS, SPEC_NOTE_LABELS,
} from '../types';
import { optionDescription } from '../options';
import { SPEECH_TOPIC_LABELS } from '../voice-patterns';

const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n);

function ratingsBlock(ratings: Ratings): string {
  return (Object.keys(RATING_LABELS) as (keyof Ratings)[])
    .map((k) => {
      const r = ratings[k];
      const note = r.note.trim() === '' ? '' : ` — ${r.note}`;
      return `- ${RATING_LABELS[k]}: ${stars(r.stars)}${note}`;
    })
    .join('\n');
}

function flowBlock(record: VisitRecord): string {
  const lines: string[] = [];
  for (const key of Object.keys(FLOW_PHASES) as (keyof typeof FLOW_PHASES)[]) {
    const phase = record.flow[key];
    const parts: string[] = [];
    if (phase.checks.length > 0) parts.push(phase.checks.join(' / '));
    if (phase.note.trim() !== '') parts.push(`メモ: ${phase.note}`);
    if (parts.length > 0) {
      lines.push(`- ${FLOW_PHASES[key].label}: ${parts.join(' | ')}`);
    }
  }
  return lines.join('\n');
}

export function specSummary(record: VisitRecord): string {
  const s = record.spec;
  const parts: string[] = [
    ...s.genre.map((g) => GENRE_LABELS[g]),
    ...s.body.map((b) => BODY_LABELS[b]),
  ];
  if (s.cup !== null) {
    const imp = s.cupImpression === null ? '' : `(${CUP_IMPRESSION_LABELS[s.cupImpression]})`;
    parts.push(`${s.cup}カップ${imp}`);
  }
  parts.push(...s.notes.map((n) => SPEC_NOTE_LABELS[n]));
  return parts.join(' / ');
}

export function tagCandidates(record: VisitRecord): string[] {
  const s = record.spec;
  return [
    'メンズエステ',
    record.basic.area,
    record.basic.prefecture,
    ...s.genre.map((g) => GENRE_LABELS[g]),
    ...s.notes.map((n) => SPEC_NOTE_LABELS[n]),
    ...s.freeTags,
  ].filter((t) => t.trim() !== '');
}

function optionsBlock(record: VisitRecord): string {
  const b = record.basic;
  if (b.options === undefined) return `- オプション体系: ${b.optionSystem} → 選択: ${b.optionChosen}`;
  const catalog = b.options.length === 0 ? 'なし' : `${b.options.length}種類\n${b.options
    .map((option, index) => `  - オプション${index + 1}: ${optionDescription(option)}`).join('\n')}`;
  const total = b.optionFee === null || b.optionFee === undefined ? '未確認' : `${b.optionFee.toLocaleString('ja-JP')}円`;
  return `- オプション体系（メニューと設定価格）: ${catalog}
${b.optionSystem.trim() === '' ? '' : `- オプション体系の旧形式メモ（上の入力と食い違う場合は上を優先）: ${b.optionSystem}\n`}- 今回選択したオプション: ${b.optionChosen || '未入力'}
- 今回のオプション代合計: ${total}`;
}

/** 訪問レコード → プロンプトに埋め込む入力データテキスト */
export function serializeRecord(record: VisitRecord, opts: { withIdentity: boolean } = { withIdentity: true }): string {
  const b = record.basic;
  const v = record.voice;
  const identity = opts.withIdentity
    ? `- 店名: ${b.shopName}
- 店URL: ${b.shopUrl}
- セラピスト: ${b.therapistName}
- profile: ${b.therapistProfileUrl}
- X: ${b.therapistXUrl}`
    : '- (店名・源氏名は伏せる)';

  const age = b.age === null ? '不明' : `${b.age}歳${b.ageIsEstimate ? '(推定)' : ''}`;
  const herLines = v.herLines.filter((l) => l.trim() !== '').map((l) => `「${l}」`).join(' / ');
  const inner = v.innerVoice.filter((l) => l.trim() !== '').map((l) => `(${l})`).join(' / ');
  const topics = v.speechTopics?.length
    ? `- 会話の話題（発言の引用ではない）: ${v.speechTopics.map((topic) => SPEECH_TOPIC_LABELS[topic]).join(' / ')}\n`
    : '';

  return `### 訪問データ #${record.seriesNo}
[基本情報]
- 訪問日: ${b.visitDate}
- エリア: ${b.prefecture} ${b.area}
${identity}
- 年齢: ${age}
- コース: ${b.course}
${optionsBlock(record)}
- 部屋タイプ: ${{ mansion: 'マンション型', room: 'ルーム型', other: 'その他' }[b.roomType]}

[スペック]
${specSummary(record)}

[評価6軸]
${ratingsBlock(record.ratings)}

[施術フロー]
観察候補は入力・保存上の並びです。旧記録の押下順は不明で、施術の実際の順序や時刻を示すものではありません。
${flowBlock(record)}
- 一番良かった瞬間: ${record.flow.bestMoment}
${record.flow.downside.trim() !== '' ? `- 残念ポイント: ${record.flow.downside}` : ''}

[臨場感素材]
${topics}- 彼女のセリフ: ${herLines || 'なし'}
- 心の声: ${inner || 'なし'}
- タイトル用フック: ${v.titleHook || 'なし'}
- リピート意向: ${REPEAT_LABELS[v.repeatIntent]}`;
}
