import { describe, expect, it } from 'vitest';
import { fixtureRecord } from '../test-fixtures';
import { buildCatalogPrompt, buildMatomePrompt, buildRevisitPrompt, buildSinglePrompt } from './build-prompt';
import { serializeRecord, specSummary, tagCandidates } from './serialize';

const publishedRecords = () => Array.from({ length: 6 }, (_, n) => fixtureRecord({
  id: `published-${n}`, seriesNo: n + 1, postedUrl: `https://wakust.com/u/${n}/`,
  basic: { ...fixtureRecord().basic, therapistName: `person-${n}` },
}));

describe('serializeRecord', () => {
  it('評価・フロー・臨場感素材を含む', () => {
    const text = serializeRecord(fixtureRecord());
    expect(text).toContain('★★★★☆ — 圧強めでしっかり効く');
    expect(text).toContain('「気持ちいいですか〜♡」');
    expect(text).toContain('(今は聞かないでくれ…)');
    expect(text).toContain('マーメイド体勢からのHJ');
    expect(text).toContain('残念ポイント');
  });

  it('withIdentity=false で店名・源氏名を含まない', () => {
    const text = serializeRecord(fixtureRecord(), { withIdentity: false });
    expect(text).not.toContain('天界のスパ');
    expect(text).not.toContain('えりか');
  });
});

describe('specSummary / tagCandidates', () => {
  it('チップからスペック行を組み立てる', () => {
    expect(specSummary(fixtureRecord())).toBe(
      'ギャル / 小柄 / Fカップ(盛ってる疑惑) / 元メンエス経験者 / 日焼け',
    );
  });

  it('タグ候補にエリア・都道府県・系統を含む', () => {
    const tags = tagCandidates(fixtureRecord());
    expect(tags).toContain('メンズエステ');
    expect(tags).toContain('恵比寿・中目黒');
    expect(tags).toContain('東京都');
    expect(tags).toContain('ギャル');
  });
});

describe('buildSinglePrompt', () => {
  it('会話の話題だけがある場合はセリフの引用を求めず、未記録の言葉を省く', () => {
    const record = fixtureRecord({ voice: { herLines: [], innerVoice: [], titleHook: '', repeatIntent: 'unsure', speechTopics: ['welcome'] } });
    const prompt = buildSinglePrompt(record);
    expect(prompt).toContain('会話の話題は発言の引用ではありません');
    expect(prompt).toContain('実際のセリフ欄が空なら引用は省いてください');
    expect(prompt).toContain('未入力のセリフ・内心は省く');
    expect(prompt).toContain('セリフ・心の声は記録がある場合だけ使い');
    expect(prompt).toContain('会話の話題（発言の引用ではない）: 出迎え・あいさつ');
    expect(prompt).toContain('彼女のセリフ: なし');
    expect(prompt).not.toContain('(セリフ+心の声を入れる)');
  });

  it('構造化オプションと旧形式の補足を両方残し、今回の入力を優先する', () => {
    const base = fixtureRecord();
    const record = fixtureRecord({ basic: { ...base.basic, optionSystem: '衣装以外の補足メモ', options: [{ type: 'costume', detail: '選べる衣装', price: 4000 }] } });
    const prompt = buildSinglePrompt(record);
    expect(prompt).toContain('衣装変更（選べる衣装）: 4,000円');
    expect(prompt).toContain('旧形式メモ（上の入力と食い違う場合は上を優先）: 衣装以外の補足メモ');
  });

  it('文体ルール・規約・構成・データを含む', () => {
    const p = buildSinglePrompt(fixtureRecord());
    expect(p).toContain('文体ルール');
    expect(p).toContain('wakust規約の遵守');
    expect(p).toContain('クリフハンガー');
    expect(p).toContain('訪問データ #1');
    expect(p).toContain('天界のスパ'); // 有料部で開示するため入力には含む
  });

  it('入力にない体験の創作を禁止する指示を含む', () => {
    expect(buildSinglePrompt(fixtureRecord())).toContain('創作・補完しない');
  });
});

describe('buildRevisitPrompt', () => {
  it('初回参照とリンク要件を含む', () => {
    const first = fixtureRecord({ postedUrl: 'https://wakust.com/u/111/' });
    const revisit = fixtureRecord({ id: 'r2', seriesNo: 5, revisitOf: 'test-id-1' });
    const p = buildRevisitPrompt(revisit, first);
    expect(p).toContain('再訪レポート');
    expect(p).toContain('体験談#1');
    expect(p).toContain('https://wakust.com/u/111/');
    expect(p).toContain('初回訪問データ');
    expect(p).toContain('訪問データ #5');
  });

  it('初回が未投稿ならプレースホルダを使う', () => {
    const p = buildRevisitPrompt(fixtureRecord({ id: 'r2', seriesNo: 2 }), fixtureRecord());
    expect(p).toContain('{投稿後に差し替え}');
  });
});

describe('buildCatalogPrompt', () => {
  it('対象都道府県のレコードだけを含み、店名を伏せる指示がある', () => {
    const tokyo = fixtureRecord({ postedUrl: 'https://wakust.com/u/1/' });
    const osaka = fixtureRecord({
      id: 'o1', seriesNo: 2, postedUrl: 'https://wakust.com/u/2/',
      basic: { ...fixtureRecord().basic, prefecture: '大阪府', area: '梅田' },
    });
    const p = buildCatalogPrompt([tokyo, osaka], '東京都');
    expect(p).toContain('対象訪問データ(1件)');
    expect(p).toContain('恵比寿・中目黒');
    expect(p).not.toContain('梅田');
    expect(p).toContain('店名・源氏名は伏せる');
  });

  it('未投稿の記録をリンク候補に含めない', () => {
    const p = buildCatalogPrompt([
      fixtureRecord({ postedUrl: 'https://wakust.com/u/1/' }),
      fixtureRecord({ id: 'draft', seriesNo: 99 }),
    ], '東京都');
    expect(p).toContain('対象訪問データ(1件)');
    expect(p).not.toContain('{未投稿}');
    expect(p).not.toContain('#99');
  });

  it('対象地域に投稿済み記事がなければ生成を止める', () => {
    expect(() => buildCatalogPrompt([fixtureRecord()], '東京都')).toThrow(/投稿済み/);
  });
});

describe('buildMatomePrompt', () => {
  it('過去販売明記の規約要件とテーマを含む', () => {
    const records = publishedRecords();
    const p = buildMatomePrompt(records.slice(0, 3), '寛容度★4以上だった3人', records);
    expect(p).toContain('過去に販売した体験談の内容が含まれます');
    expect(p).toContain('寛容度★4以上だった3人');
  });

  it('選んだ記事のURLを生成素材に渡し、選ばなかった記事は渡さない', () => {
    const records = publishedRecords();
    const p = buildMatomePrompt(records.slice(0, 2), 'theme', records);
    expect(p).toContain('https://wakust.com/u/0/');
    expect(p).toContain('https://wakust.com/u/1/');
    expect(p).not.toContain('https://wakust.com/u/5/');
  });

  it('未投稿を含む6レコードだけでは解禁しない', () => {
    const records = publishedRecords();
    const drafts = records.map((r) => ({ ...r, postedUrl: null }));
    expect(() => buildMatomePrompt(drafts, 'theme')).toThrow(/6人/);
  });

  it('解禁済みでも未投稿の対象を渡すと生成を止める', () => {
    expect(() => buildMatomePrompt([fixtureRecord()], 'theme', publishedRecords())).toThrow(/投稿済み/);
  });

  it('同じ人の初回と再訪を別人として選ばせない', () => {
    const records = publishedRecords();
    const first = records[0]!;
    const revisit = { ...first, id: 'revisit', seriesNo: 7, revisitOf: first.id, postedUrl: 'https://wakust.com/u/7/', sales: { points: 100, articleType: 'revisit' as const } };
    expect(() => buildMatomePrompt([first, revisit], 'theme', [...records, revisit])).toThrow(/同じセラピスト/);
    expect(buildMatomePrompt([revisit], 'theme', [...records, revisit])).toContain(revisit.postedUrl);
  });
});
