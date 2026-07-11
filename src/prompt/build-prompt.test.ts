import { describe, expect, it } from 'vitest';
import { fixtureRecord } from '../test-fixtures';
import { buildCatalogPrompt, buildMatomePrompt, buildRevisitPrompt, buildSinglePrompt } from './build-prompt';
import { serializeRecord, specSummary, tagCandidates } from './serialize';

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
    const tokyo = fixtureRecord();
    const osaka = fixtureRecord({
      id: 'o1', seriesNo: 2,
      basic: { ...fixtureRecord().basic, prefecture: '大阪府', area: '梅田' },
    });
    const p = buildCatalogPrompt([tokyo, osaka], '東京都');
    expect(p).toContain('対象訪問データ(1件)');
    expect(p).toContain('恵比寿・中目黒');
    expect(p).not.toContain('梅田');
    expect(p).toContain('店名・源氏名は伏せる');
  });
});

describe('buildMatomePrompt', () => {
  it('過去販売明記の規約要件とテーマを含む', () => {
    const p = buildMatomePrompt([fixtureRecord()], '寛容度★4以上だった3人');
    expect(p).toContain('過去に販売した体験談の内容が含まれます');
    expect(p).toContain('寛容度★4以上だった3人');
  });
});
