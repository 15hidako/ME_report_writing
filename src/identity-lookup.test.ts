import { describe, expect, it } from 'vitest';
import { buildLookupPrompt, lookupTargets, needsLookup, parseLookupResponse, planLookup } from './identity-lookup';
import { VisitStore } from './storage';
import { fixtureRecord } from './test-fixtures';
import type { VisitRecord } from './types';

const NOW = '2026-11-11T03:00:00.000Z';
const PROFILE = 'https://shop.example/cast/12';

function record(seriesNo: number, basic: Partial<VisitRecord['basic']> = {}): VisitRecord {
  const base = fixtureRecord();
  return { ...base, id: `id-${seriesNo}`, seriesNo, basic: { ...base.basic, ...basic } };
}

function urlOnly(seriesNo: number, profileUrl = PROFILE): VisitRecord {
  return record(seriesNo, {
    shopName: '', shopUrl: '', therapistName: '', therapistXUrl: '', therapistProfileUrl: profileUrl,
  });
}

function answer(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify([{
    ref: 2, profileUrl: PROFILE, shopName: '月のスパ', shopUrl: 'https://shop.example/',
    therapistName: 'あや', therapistXUrl: 'https://x.com/aya_example', ...overrides,
  }]);
}

describe('取得対象の判定', () => {
  it('プロフィールURLがあり、店名かセラピスト名が空欄なら対象にする', () => {
    expect(needsLookup(urlOnly(2))).toBe(true);
    expect(needsLookup(record(1, { therapistName: '' }))).toBe(true);
  });

  it('プロフィールURLがなければ対象にしない', () => {
    expect(needsLookup(record(1, { therapistProfileUrl: '', shopName: '' }))).toBe(false);
  });

  it('XのURLだけが空欄の記録は、同じURLで取得済みなら対象から外す', () => {
    const noX = record(1, { therapistXUrl: '' });
    expect(needsLookup(noX)).toBe(true);
    const checked = record(1, {
      therapistXUrl: '',
      identityLookup: { sourceUrl: noX.basic.therapistProfileUrl, checkedAt: NOW, filled: [] },
    });
    expect(needsLookup(checked)).toBe(false);
    expect(needsLookup(record(1, {
      therapistXUrl: '', therapistProfileUrl: 'https://example.com/profile/2',
      identityLookup: { sourceUrl: 'https://example.com/profile/1', checkedAt: NOW, filled: [] },
    }))).toBe(true);
  });

  it('対象を通し番号の昇順で返す', () => {
    expect(lookupTargets([urlOnly(5), record(1), urlOnly(2)]).map((item) => item.seriesNo)).toEqual([2, 5]);
  });
});

describe('取得用プロンプト', () => {
  it('公開URLと通し番号だけを渡し、訪問内容を含めない', () => {
    const target = { ...urlOnly(2), flow: { ...fixtureRecord().flow, bestMoment: '秘密の訪問メモ' } };
    const prompt = buildLookupPrompt([target]);
    expect(prompt).toContain(`[{"ref":2,"profileUrl":"${PROFILE}"}]`);
    expect(prompt).toContain('null');
    expect(prompt).not.toContain('秘密の訪問メモ');
    expect(prompt).not.toContain(target.id);
    expect(prompt).not.toContain(target.basic.area);
  });

  it('対象がなければ作らない', () => {
    expect(() => buildLookupPrompt([])).toThrow('取得が必要な回答はありません');
  });
});

describe('返答の読み取り', () => {
  it('コードブロックと前後の文章があってもJSONを取り出す', () => {
    const parsed = parseLookupResponse(`取得しました。\n\`\`\`json\n${answer()}\n\`\`\`\n以上です。`);
    expect(parsed).toEqual([{
      ref: 2, profileUrl: PROFILE, shopName: '月のスパ', shopUrl: 'https://shop.example/',
      therapistName: 'あや', therapistXUrl: 'https://x.com/aya_example',
    }]);
  });

  it('記事の返答に含まれる複数のコードブロックから、店舗情報のJSONを取り出す', () => {
    const fence = '```';
    const article = [
      `${fence}\n【恵比寿】タイトル\n${fence}`, `${fence}\n恵比寿,癒し系\n${fence}`,
      `${fence}html\n<h3>今回のセラピスト</h3><p>[無料部分]</p>\n${fence}`, `${fence}json\n{"note":"x"}\n${fence}`,
      `${fence}json\n${answer()}\n${fence}`,
    ].join('\n\n');
    expect(parseLookupResponse(article)).toEqual(parseLookupResponse(answer()));
  });

  it('欠けた項目と空文字は null として扱う', () => {
    const parsed = parseLookupResponse(JSON.stringify([{ ref: 2, profileUrl: PROFILE, shopName: ' ', therapistName: 'あや' }]));
    expect(parsed[0]).toMatchObject({ shopName: null, shopUrl: null, therapistName: 'あや', therapistXUrl: null });
  });

  it.each([
    ['JSONでない', 'ページを開けませんでした', '返答からJSONを読み取れません'],
    ['配列でない', '{"ref":2}', '返答は配列形式'],
    ['refがない', '[{"profileUrl":"https://shop.example/cast/12"}]', '1件目のrefが'],
    ['項目が文字列でない', `[{"ref":2,"profileUrl":"${PROFILE}","shopName":{"a":1}}]`, '1件目のshopNameが'],
    ['件数が多すぎる', JSON.stringify(Array.from({ length: 51 }, (_, ref) => ({ ref: ref + 1, profileUrl: PROFILE }))), '50件以下'],
  ])('%sときは理由を示して拒否する', (_name, text, message) => {
    expect(() => parseLookupResponse(text)).toThrow(message);
  });

  it('大きすぎる返答を拒否する', () => {
    expect(() => parseLookupResponse('['.padEnd(70_000, ' '))).toThrow('返答が大きすぎます');
  });
});

describe('補完の計画', () => {
  it('空欄を埋め、取得元と取得日と補完した項目を記録する', () => {
    const plan = planLookup([record(1), urlOnly(2)], parseLookupResponse(answer()), NOW);
    expect(plan.notes).toEqual([]);
    expect(plan.updates).toHaveLength(1);
    const update = plan.updates[0]!;
    expect(update.record.basic).toMatchObject({
      shopName: '月のスパ', shopUrl: 'https://shop.example/', therapistName: 'あや',
      therapistXUrl: 'https://x.com/aya_example',
      identityLookup: {
        sourceUrl: PROFILE, checkedAt: NOW,
        filled: ['shopName', 'shopUrl', 'therapistName', 'therapistXUrl'],
      },
    });
    expect(update.record.updatedAt).toBe(NOW);
    expect(update.changes).toEqual([
      { path: 'basic.shopName', before: '', after: '月のスパ' },
      { path: 'basic.shopUrl', before: '', after: 'https://shop.example/' },
      { path: 'basic.therapistName', before: '', after: 'あや' },
      { path: 'basic.therapistXUrl', before: '', after: 'https://x.com/aya_example' },
    ]);
  });

  it('手入力済みの値は上書きしない', () => {
    const typed = { ...urlOnly(2), basic: { ...urlOnly(2).basic, shopName: '自分で入れた店名' } };
    const update = planLookup([typed], parseLookupResponse(answer()), NOW).updates[0]!;
    expect(update.record.basic.shopName).toBe('自分で入れた店名');
    expect(update.record.basic.identityLookup?.filled).toEqual(['shopUrl', 'therapistName', 'therapistXUrl']);
  });

  it('同じサイトの過去記録の店名を、返答の表記より優先する', () => {
    const known = record(1, { shopName: '月のスパ 恵比寿', shopUrl: 'https://shop.example/ebisu/', therapistProfileUrl: 'https://shop.example/cast/3' });
    const update = planLookup([known, urlOnly(2)], parseLookupResponse(answer()), NOW).updates[0]!;
    expect(update.record.basic.shopName).toBe('月のスパ 恵比寿');
    expect(update.record.basic.shopUrl).toBe('https://shop.example/ebisu/');
    expect(update.record.basic.therapistName).toBe('あや');
  });

  it('店URLが別サイトなら採用せず、プロフィールURLのサイトのトップを使う', () => {
    const plan = planLookup([urlOnly(2)], parseLookupResponse(answer({ shopUrl: 'https://evil.example/' })), NOW);
    expect(plan.updates[0]!.record.basic.shopUrl).toBe('https://shop.example/');
    expect(plan.notes).toEqual(['#2: 店URLがプロフィールURLと別のサイトのため採用しませんでした']);
  });

  it('返答に店URLがなければ、プロフィールURLのサイトのトップを使う', () => {
    const plan = planLookup([urlOnly(2)], parseLookupResponse(answer({ shopUrl: null })), NOW);
    expect(plan.updates[0]!.record.basic.shopUrl).toBe('https://shop.example/');
    expect(plan.notes).toEqual([]);
  });

  it('X以外のURLや長すぎる名前は採用しない', () => {
    const plan = planLookup([urlOnly(2)], parseLookupResponse(answer({
      therapistXUrl: 'https://x.com.evil.example/aya', therapistName: 'あ'.repeat(81), shopName: '月の\nスパ',
    })), NOW);
    const basic = plan.updates[0]!.record.basic;
    expect(basic.therapistXUrl).toBe('');
    expect(basic.therapistName).toBe('');
    expect(basic.shopName).toBe('');
    expect(plan.notes).toEqual([
      '#2: 店名の形式が不正なため採用しませんでした',
      '#2: セラピスト名の形式が不正なため採用しませんでした',
      '#2: X URLがXのアカウントURLではないため採用しませんでした',
    ]);
  });

  it('全項目が取得できなかった回答は変更しない', () => {
    const plan = planLookup([urlOnly(2)], parseLookupResponse(answer({
      shopName: null, shopUrl: null, therapistName: null, therapistXUrl: null,
    })), NOW);
    expect(plan.updates).toEqual([]);
    expect(plan.notes).toEqual(['#2: 取得できた項目がありません']);
  });

  it('該当しない通し番号、URLの不一致、重複した返答は採用しない', () => {
    const plan = planLookup([urlOnly(2), urlOnly(3, 'https://shop.example/cast/13')], [
      ...parseLookupResponse(answer({ ref: 9 })),
      ...parseLookupResponse(answer({ ref: 3 })),
      ...parseLookupResponse(answer()),
      ...parseLookupResponse(answer({ therapistName: '別人' })),
    ], NOW);
    expect(plan.updates.map((update) => update.record.seriesNo)).toEqual([2]);
    expect(plan.updates[0]!.record.basic.therapistName).toBe('あや');
    expect(plan.notes).toEqual([
      '#9: 該当する回答がありません',
      '#3: プロフィールURLが一致しないため採用しませんでした',
      '#2: 返答が重複しているため、最初の1件だけを使いました',
    ]);
  });

  it('取得が不要な回答への返答は採用しない', () => {
    const plan = planLookup([record(2, { therapistProfileUrl: PROFILE })], parseLookupResponse(answer()), NOW);
    expect(plan.updates).toEqual([]);
    expect(plan.notes).toEqual(['#2: 取得が不要な回答のため変更しません']);
  });

  it('Xだけ見つからなかった場合も取得済みとして記録し、次回の対象から外す', () => {
    const before = record(2, { therapistProfileUrl: PROFILE, therapistXUrl: '' });
    const plan = planLookup([before], parseLookupResponse(answer({ therapistXUrl: null })), NOW);
    const after = plan.updates[0]!.record;
    expect(after.basic.identityLookup).toEqual({ sourceUrl: PROFILE, checkedAt: NOW, filled: [] });
    expect(plan.updates[0]!.changes).toEqual([]);
    expect(needsLookup(after)).toBe(false);
  });
});

describe('補完結果の保存', () => {
  function store(initial: readonly VisitRecord[]): { db: VisitStore; data: Map<string, string> } {
    const data = new Map<string, string>();
    const db = new VisitStore({ getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } });
    for (const item of initial) db.save(item);
    return { db, data };
  }

  it('複数の回答をまとめて保存し、他の回答と通し番号を保つ', () => {
    const { db } = store([record(1), urlOnly(2)]);
    const raw = db.exportRawJson();
    const plan = planLookup(db.loadAll(), parseLookupResponse(answer()), NOW);
    db.saveMany(plan.updates.map((update) => update.record), raw);
    const saved = db.loadAll();
    expect(saved.map((item) => item.seriesNo)).toEqual([1, 2]);
    expect(saved[0]).toEqual(record(1));
    expect(saved[1]!.basic.shopName).toBe('月のスパ');
    expect(db.hasBackup()).toBe(true);
  });

  it('確認中に保存内容が変わっていたら保存しない', () => {
    const { db } = store([urlOnly(2)]);
    const raw = db.exportRawJson();
    const plan = planLookup(db.loadAll(), parseLookupResponse(answer()), NOW);
    db.save({ ...urlOnly(2), basic: { ...urlOnly(2).basic, area: '新宿' } });
    expect(() => db.saveMany(plan.updates.map((update) => update.record), raw)).toThrow('回答が変更されています');
    expect(db.loadAll()[0]!.basic.shopName).toBe('');
  });

  it('保存済みにない回答は保存しない', () => {
    const { db } = store([urlOnly(2)]);
    expect(() => db.saveMany([record(7)], db.exportRawJson())).toThrow('保存済みの回答が見つかりません');
  });
});
