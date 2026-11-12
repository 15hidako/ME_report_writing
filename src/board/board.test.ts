// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { CheckResult } from '../checks/files';
import { MemoryStore, fixtureRecord } from '../test-fixtures';
import type { VisitRecord } from '../types';
import { buildCards, buildTargets } from './cards';
import {
  BoardStore, EMPTY_BOARD, acknowledge, parseBoardState, removeBundle, setRecordStage, setArticleAngle, setScheduleUrl,
  upsertBundle, withChecks, type BoardState, type BundleArticle,
} from './state';
import { boardHtml } from './view';

const NOW = new Date('2026-11-16T03:00:00.000Z');
const CHECKED = '2026-11-15T12:00:00.000Z';
const PROFILE = 'https://shop.example/cast/12';
const POSTED = 'https://wakust.com/user/article/1';

function record(seriesNo: number, overrides: Partial<VisitRecord> = {}, profileUrl = PROFILE): VisitRecord {
  const base = fixtureRecord();
  return {
    ...base, id: `id-${seriesNo}`, seriesNo,
    basic: { ...base.basic, therapistProfileUrl: profileUrl, shopName: '月のスパ', therapistName: 'あや' },
    ...overrides,
  };
}

function check(overrides: Partial<CheckResult> = {}): CheckResult {
  return { profileUrl: PROFILE, checkedAt: CHECKED, enrollment: 'present', attendance: 'listed', detail: '', ...overrides };
}

const bundle: BundleArticle = {
  id: 'bundle-1', kind: 'matome', title: '寛容度が高かった3人', recordIds: ['id-2', 'id-1'],
  stage: 'editing', postedUrl: null, createdAt: CHECKED,
};

function attention(state: BoardState, now = NOW) {
  return buildCards([record(1, { postedUrl: POSTED })], state, now)[0]!.tracking?.attention;
}

describe('カードの段階とタイプ', () => {
  it('回答は既定で回答済み、保存した段階があればそれを使う', () => {
    const state = setRecordStage(EMPTY_BOARD, 'id-2', 'editing');
    const cards = buildCards([record(1), record(2)], state, NOW);
    expect(cards.map((card) => [card.id, card.stage])).toEqual([['id-2', 'editing'], ['id-1', 'answered']]);
  });

  it('投稿URLのある回答は、保存した段階より投稿済みを優先する', () => {
    const state = setRecordStage(EMPTY_BOARD, 'id-1', 'prompted');
    expect(buildCards([record(1, { postedUrl: POSTED })], state, NOW)[0]).toMatchObject({ stage: 'posted', postedUrl: POSTED });
  });

  it('再訪・まとめ・カタログを見分け、まとめには対象の通し番号を出す', () => {
    const revisit = record(2, { revisitOf: 'id-1', sales: { points: 100, articleType: 'revisit' } });
    const cards = buildCards([record(1), revisit], upsertBundle(EMPTY_BOARD, bundle), NOW);
    expect(cards.map((card) => card.kind)).toEqual(['matome', 'revisit', 'single']);
    expect(cards[0]).toMatchObject({ source: 'bundle', stage: 'editing', detail: '#1 #2', tracking: null });
  });

  it('まとめ記事は投稿URLが付くと投稿済みになる', () => {
    const state = upsertBundle(EMPTY_BOARD, { ...bundle, postedUrl: POSTED });
    expect(buildCards([], state, NOW)[0]!.stage).toBe('posted');
  });

  it('既定の段階へ戻すと保存値を消す', () => {
    const state = setRecordStage(setRecordStage(EMPTY_BOARD, 'id-1', 'editing'), 'id-1', 'answered');
    expect(state.stages).toEqual({});
  });
});

describe('単体記事の販売型', () => {
  it('単体記事だけが販売型を持ち、既定は未選択', () => {
    const revisit = record(2, { revisitOf: 'id-1', sales: { points: 100, articleType: 'revisit' } });
    const state = setArticleAngle(upsertBundle(EMPTY_BOARD, bundle), 'id-1', 'therapist');
    const cards = buildCards([record(1), revisit, record(3)], state, NOW);
    expect(cards.map((card) => [card.id, card.angle])).toEqual([
      ['bundle-1', null], ['id-3', null], ['id-2', null], ['id-1', 'therapist'],
    ]);
  });

  it('切り替えと解除ができ、解除すると保存値を消す', () => {
    const therapist = setArticleAngle(EMPTY_BOARD, 'id-1', 'therapist');
    expect(setArticleAngle(therapist, 'id-1', 'experience').angles).toEqual({ 'id-1': 'experience' });
    expect(setArticleAngle(therapist, 'id-1', null).angles).toEqual({});
  });
});

describe('事後追跡', () => {
  it('投稿前の回答とプロフィールURLのない回答は追跡しない', () => {
    const cards = buildCards([record(1), record(2, { postedUrl: POSTED }, '')], EMPTY_BOARD, NOW);
    expect(cards.map((card) => card.tracking)).toEqual([null, null]);
  });

  it.each([
    ['確認結果がない', [], 'unchecked'],
    ['在籍して出勤あり', [check()], null],
    ['在籍なし', [check({ enrollment: 'absent', attendance: 'not_listed' })], 'absent'],
    ['出勤なし', [check({ attendance: 'not_listed' })], 'not_listed'],
    ['在籍を読めなかった', [check({ enrollment: 'unknown' })], 'review'],
    ['出勤を読めなかった', [check({ attendance: 'unknown' })], 'review'],
    ['確認が9日前', [check({ checkedAt: '2026-11-07T02:00:00.000Z' })], 'stale'],
  ] as const)('%s → %s', (_label, checks, expected) => {
    expect(attention(withChecks(EMPTY_BOARD, checks))).toBe(expected);
  });

  it('同じプロフィールの結果が複数あれば新しい方を使う', () => {
    const older = check({ checkedAt: '2026-11-14T12:00:00.000Z', enrollment: 'absent' });
    expect(attention(withChecks(EMPTY_BOARD, [check(), older]))).toBeNull();
  });

  it('確認済みにした結果は知らせず、次の確認結果でまた知らせる', () => {
    const absent = check({ enrollment: 'absent', attendance: 'not_listed' });
    const acknowledged = acknowledge(withChecks(EMPTY_BOARD, [absent]), 'shop.example/cast/12', CHECKED);
    expect(attention(acknowledged)).toBeNull();
    const next = withChecks(acknowledged, [{ ...absent, checkedAt: '2026-11-16T02:00:00.000Z' }]);
    expect(attention(next)).toBe('absent');
  });

  it('確認済みにしても、古くなった結果は知らせる', () => {
    const state = acknowledge(withChecks(EMPTY_BOARD, [check({ attendance: 'not_listed' })]), 'shop.example/cast/12', CHECKED);
    expect(attention(state, new Date('2026-11-30T00:00:00.000Z'))).toBe('stale');
  });
});

describe('確認対象の書き出し', () => {
  it('投稿済みの回答だけを、同じプロフィールは1件にまとめて出す', () => {
    const records = [
      record(1, { postedUrl: POSTED }),
      record(2, { postedUrl: 'https://wakust.com/user/article/2', revisitOf: 'id-1', sales: { points: 100, articleType: 'revisit' } }),
      record(3, {}, 'https://other.example/cast/1'),
      record(4, { postedUrl: 'https://wakust.com/user/article/4' }, 'https://www.shop.example/cast/20'),
    ];
    const state = setScheduleUrl(EMPTY_BOARD, 'shop.example', 'https://shop.example/schedule');
    expect(buildTargets(records, state, CHECKED)).toEqual({
      version: 1,
      generatedAt: CHECKED,
      targets: [
        { profileUrl: 'https://www.shop.example/cast/20', therapistName: 'あや', scheduleUrl: 'https://shop.example/schedule' },
        { profileUrl: PROFILE, therapistName: 'あや', scheduleUrl: 'https://shop.example/schedule' },
      ],
    });
  });

  it('出勤表URLはhttp(s)だけを受け付け、空で解除する', () => {
    expect(() => setScheduleUrl(EMPTY_BOARD, 'shop.example', 'javascript:alert(1)')).toThrow('http(s)');
    const set = setScheduleUrl(EMPTY_BOARD, 'shop.example', 'https://shop.example/schedule');
    expect(setScheduleUrl(set, 'shop.example', null).scheduleUrls).toEqual({});
  });
});

describe('ボードの保存', () => {
  it('保存した内容を読み戻す', () => {
    const store = new BoardStore(new MemoryStore());
    expect(store.load()).toEqual(EMPTY_BOARD);
    const state = withChecks(upsertBundle(setArticleAngle(setRecordStage(EMPTY_BOARD, 'id-1', 'prompted'), 'id-1', 'experience'), bundle), [check()]);
    store.save(state);
    expect(store.load()).toEqual(state);
    expect(parseBoardState(store.exportRawJson())).toEqual(state);
  });

  it('記事を更新・削除する', () => {
    const state = upsertBundle(upsertBundle(EMPTY_BOARD, bundle), { ...bundle, stage: 'prompted' });
    expect(state.bundles).toEqual([{ ...bundle, stage: 'prompted' }]);
    expect(removeBundle(state, bundle.id).bundles).toEqual([]);
  });

  it('販売型を持たない以前の保存内容も読める', () => {
    const { angles: _omitted, ...legacy } = EMPTY_BOARD;
    expect(parseBoardState(JSON.stringify(legacy))).toEqual(EMPTY_BOARD);
  });

  it.each([
    ['販売型が未知', JSON.stringify({ ...EMPTY_BOARD, angles: { a: 'store' } }), '販売型'],
    ['JSONでない', 'x', 'JSON形式'],
    ['版が違う', JSON.stringify({ ...EMPTY_BOARD, version: 2 }), 'version 1'],
    ['段階が未知', JSON.stringify({ ...EMPTY_BOARD, stages: { a: 'posted' } }), '段階'],
    ['投稿URLがwakustでない', JSON.stringify({ ...EMPTY_BOARD, bundles: [{ ...bundle, postedUrl: 'https://evil.example/a' }] }), '投稿URL'],
    ['記事のidが重複', JSON.stringify({ ...EMPTY_BOARD, bundles: [bundle, bundle] }), '重複'],
    ['出勤表URLがhttpでない', JSON.stringify({ ...EMPTY_BOARD, scheduleUrls: { a: 'javascript:alert(1)' } }), '出勤表URL'],
  ])('%sデータは理由を示して拒否する', (_label, json, message) => {
    expect(() => parseBoardState(json)).toThrow(message);
  });

  it('壊れた保存内容では空のボードで上書きせず、読み込みを止める', () => {
    const kv = new MemoryStore();
    kv.setItem('me-report-writer/board/v1', '{');
    expect(() => new BoardStore(kv).load()).toThrow('ボードの読み込みに失敗');
  });
});

describe('ボードの表示', () => {
  const records = [
    record(1, { postedUrl: POSTED, basic: { ...record(1).basic, shopName: '<b>月</b>' } }),
    record(2, {}, 'https://shop.example/cast/2'),
  ];
  const state = upsertBundle(withChecks(EMPTY_BOARD, [check({ enrollment: 'absent', attendance: 'not_listed', detail: 'プロフィールがHTTP 404' })]), bundle);
  const cards = buildCards(records, state, NOW);

  function mount(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
  }

  it('段階ごとの列にカードを並べ、要確認をまとめて出す', () => {
    const root = mount(boardHtml(cards, 'all'));
    const count = (stage: string): number => root.querySelectorAll(`.column[data-stage="${stage}"] .board-card`).length;
    expect([count('answered'), count('prompted'), count('editing'), count('posted')]).toEqual([1, 0, 1, 1]);
    expect(root.querySelector('.due')?.textContent).toContain('在籍なし');
    expect(root.querySelector('.column[data-stage="posted"] .track-detail')?.textContent).toBe('プロフィールがHTTP 404');
    expect(root.querySelector('.column[data-stage="posted"] [data-act="ack"]')).not.toBeNull();
  });

  it('記事タイプで絞り込む', () => {
    const root = mount(boardHtml(cards, 'matome'));
    expect([...root.querySelectorAll('.board-card')].map((node) => node.getAttribute('data-id'))).toEqual(['bundle-1']);
    expect(root.querySelector('.due')).toBeNull();
  });

  it('単体記事のカードだけに販売型の切り替えを出し、選択中を示す', () => {
    const root = mount(boardHtml(buildCards(records, setArticleAngle(state, 'id-2', 'experience'), NOW), 'all'));
    const pressed = (id: string): (string | null)[] => [...root.querySelectorAll(`.board-card[data-id="${id}"] [data-angle]`)]
      .map((node) => node.getAttribute('aria-pressed'));
    expect(pressed('id-2')).toEqual(['false', 'true']);
    expect(pressed('id-1')).toEqual(['false', 'false']);
    expect(pressed('bundle-1')).toEqual([]);
    expect(root.querySelector('.board-card[data-id="id-2"]')?.getAttribute('data-angle')).toBe('experience');
  });

  it('回答の文字列をHTMLとして解釈しない', () => {
    const root = mount(boardHtml(cards, 'all'));
    expect(root.querySelector('.board-card b')).toBeNull();
    expect(root.querySelector('.column[data-stage="posted"] h3')?.textContent).toContain('<b>月</b>');
  });
});
