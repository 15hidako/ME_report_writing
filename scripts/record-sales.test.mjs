import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  INBOX_FILE, STORE_FILE, isCalendarDate, mergePurchases, parseInbox, parsePurchaseMail, parseStore, recordInbox, reportDate, searchSince, summarize,
} from './record-sales.mjs';

/** 実際の通知メールと同じ並び。名前・タイトル・番号は架空 */
function mailBody({ at = '2026-11-27 01:12:44', title = '架空の体験談', url = 'https://wakust.com/sample/1000001/', price = '1,000円', points = '1000pt' } = {}) {
  return [
    '架空 さん', '', '出品した以下のサービスが購入されました。', '----------------------------------',
    `受付日時：${at}`, `記事タイトル：${title}`, '記事URL：', url, '', `サービス価格：${price}`, '', `獲得ポイント：${points}`, '',
    'https://wakust.com/mypage/',
  ].join('\n');
}

function purchase(overrides = {}) {
  return {
    messageId: 'm1', receivedAt: '2026-11-27T01:12:44+09:00', articleId: '1000001',
    articleUrl: 'https://wakust.com/sample/1000001/', title: '架空の体験談', price: 1000, points: 1000, ...overrides,
  };
}

describe('購入通知メールの読み取り', () => {
  it('受付日時を日本時間として、記事・価格・ポイントを取り出す', () => {
    expect(parsePurchaseMail({ messageId: 'm1', body: mailBody() })).toEqual({ ok: true, purchase: purchase() });
  });

  it('URLが記事URLと同じ行にあっても読む', () => {
    const body = mailBody().replace('記事URL：\n', '記事URL：');
    expect(parsePurchaseMail({ messageId: 'm1', body })).toEqual({ ok: true, purchase: purchase() });
  });

  it('半角コロンやCRLFでも読む', () => {
    const body = mailBody().replaceAll('：', ':').replaceAll('\n', '\r\n');
    expect(parsePurchaseMail({ messageId: 'm1', body })).toEqual({ ok: true, purchase: purchase() });
  });

  it('100円の後からセット割も金額どおりに読む', () => {
    const result = parsePurchaseMail({ messageId: 'm1', body: mailBody({ price: '100円', points: '100pt' }) });
    expect(result).toMatchObject({ ok: true, purchase: { price: 100, points: 100 } });
  });

  it.each([
    ['受付日時がない', mailBody().replace(/受付日時.*\n/, ''), '受付日時'],
    ['受付日時が日付として正しくない', mailBody({ at: '2026-02-30 10:00:00' }), '受付日時'],
    ['記事URLがwakustの記事でない', mailBody({ url: 'https://example.com/sample/1/' }), '記事URL'],
    ['価格が読めない', mailBody({ price: '未定' }), 'サービス価格'],
    ['ポイントがない', mailBody().replace(/獲得ポイント.*\n/, ''), '獲得ポイント'],
  ])('%sときは記録せず理由を返す', (_name, body, reason) => {
    const result = parsePurchaseMail({ messageId: 'm1', body });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(reason);
  });
});

describe('記録への追加', () => {
  it('メッセージIDで重複を除き、受付日時の順に並べる', () => {
    const existing = [purchase({ messageId: 'm2', receivedAt: '2026-11-27T05:00:00+09:00' })];
    const incoming = [
      purchase({ messageId: 'm2', title: '別の内容' }),
      purchase({ messageId: 'm1' }),
      purchase({ messageId: 'm1', title: '同じIDの2通目' }),
    ];
    const { purchases, added } = mergePurchases(existing, incoming);
    expect(purchases.map((item) => item.messageId)).toEqual(['m1', 'm2']);
    expect(purchases[1]).toEqual(existing[0]);
    expect(added).toEqual([purchase({ messageId: 'm1' })]);
  });

  it('元の配列を変えない', () => {
    const existing = Object.freeze([purchase({ messageId: 'm2' })]);
    expect(() => mergePurchases(existing, [purchase()])).not.toThrow();
  });
});

describe('検索の開始日', () => {
  it('記録がなければ全期間を読む', () => {
    expect(searchSince([])).toBeNull();
  });

  it('最後の受付日の3日前から読む', () => {
    const purchases = [purchase({ receivedAt: '2026-11-02T00:30:00+09:00' }), purchase({ receivedAt: '2026-10-20T10:00:00+09:00' })];
    expect(searchSince(purchases)).toBe('2026/10/30');
  });
});

describe('報告する日', () => {
  it.each([
    ['23:59に始まればその日', '2026-11-27T14:59:00Z', '2026-11-27'],
    ['日付をまたいで00:04に始まっても前の日', '2026-11-27T15:04:00Z', '2026-11-27'],
    ['朝に起動して遅れて動いたらその日', '2026-11-28T00:00:00Z', '2026-11-28'],
  ])('%s', (_name, now, expected) => {
    expect(reportDate(new Date(now))).toBe(expected);
  });
});

describe('ファイルの検証', () => {
  it('記録ファイルの形が違えば止める', () => {
    expect(() => parseStore('{"version":1,"purchases":[{"messageId":"m1"}]}')).toThrow(/purchases\[0\]/);
    expect(() => parseStore('{"version":2,"purchases":[]}')).toThrow(/version/);
    expect(() => parseStore('not json')).toThrow(/JSON/);
  });

  it.each([
    ['受付日時が日時でない', { receivedAt: 'garbage' }],
    ['受付日時が存在しない日', { receivedAt: '2026-02-30T10:00:00+09:00' }],
    ['金額が負', { price: -1 }],
    ['ポイントが数でない', { points: Number.NaN }],
    ['メッセージIDが空', { messageId: '' }],
  ])('%s記録は壊れているとして止める', (_name, overrides) => {
    const text = JSON.stringify({ version: 1, purchases: [{ ...purchase(), ...overrides }] });
    expect(() => parseStore(text)).toThrow(/purchases\[0\]/);
  });

  it('手で渡す日付は実在する日だけ受け付ける', () => {
    expect(isCalendarDate('2026-11-27')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026/11/27')).toBe(false);
  });

  it('正しい記録ファイルはそのまま読む', () => {
    expect(parseStore(JSON.stringify({ version: 1, purchases: [purchase()] }))).toEqual([purchase()]);
  });

  it('受け渡しファイルの形が違えば止める', () => {
    expect(() => parseInbox('{"version":1,"messages":[{"messageId":"m1"}]}')).toThrow(/messages\[0\]/);
    expect(parseInbox('{"version":1,"messages":[{"messageId":"m1","body":"x"}]}')).toEqual([{ messageId: 'm1', body: 'x' }]);
  });
});

describe('報告文', () => {
  it('その日の記事ごとの件数と金額、今月の累計、読めなかったメールを書く', () => {
    const purchases = [
      purchase({ messageId: 'a', receivedAt: '2026-11-01T10:00:00+09:00', articleId: '1', title: '記事A', price: 500 }),
      purchase({ messageId: 'b', receivedAt: '2026-11-27T10:00:00+09:00', articleId: '2', title: '記事B' }),
      purchase({ messageId: 'c', receivedAt: '2026-11-27T11:00:00+09:00', articleId: '2', title: '記事B' }),
      purchase({ messageId: 'd', receivedAt: '2026-10-31T23:00:00+09:00', articleId: '1', title: '記事A' }),
    ];
    const text = summarize({ purchases, added: [purchases[1], purchases[2], purchases[3]], rejected: [{ messageId: 'x', reason: '受付日時がない' }], date: '2026-11-27' });
    expect(text).toContain('2026-11-27の売上: 2件 / 2,000円');
    expect(text).toContain('記事B(2): 2件 / 2,000円');
    expect(text).toContain('2026-11の累計: 3件 / 2,500円');
    expect(text).toContain('2026-10-31 記事A(1): 1,000円');
    expect(text).toContain('x: 受付日時がない');
  });

  it('売上がなければそう書く', () => {
    expect(summarize({ purchases: [], added: [], rejected: [], date: '2026-11-27' })).toContain('2026-11-27の売上: なし');
  });
});

describe('受け渡しファイルからの記録', () => {
  let dir;
  beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'me-sales-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('読めたメールだけを記録し、2回目は重複させない', async () => {
    const inbox = { version: 1, messages: [{ messageId: 'm1', body: mailBody() }, { messageId: 'bad', body: '関係ないメール' }] };
    await writeFile(path.join(dir, INBOX_FILE), JSON.stringify(inbox), 'utf8');
    const first = await recordInbox(dir, '2026-11-27');
    expect(first.added).toHaveLength(1);
    expect(first.rejected.map((item) => item.messageId)).toEqual(['bad']);
    const second = await recordInbox(dir, '2026-11-27');
    expect(second.added).toHaveLength(0);
    const stored = JSON.parse(await readFile(path.join(dir, STORE_FILE), 'utf8'));
    expect(stored).toEqual({ version: 1, purchases: [purchase()] });
  });

  it('記録ファイルが壊れていれば上書きしない', async () => {
    await writeFile(path.join(dir, STORE_FILE), '{broken', 'utf8');
    await writeFile(path.join(dir, INBOX_FILE), JSON.stringify({ version: 1, messages: [] }), 'utf8');
    await expect(recordInbox(dir, '2026-11-27')).rejects.toThrow(/JSON/);
    expect(await readFile(path.join(dir, STORE_FILE), 'utf8')).toBe('{broken');
  });

  it('受け渡しファイルがなければ止める', async () => {
    await expect(recordInbox(dir, '2026-11-27')).rejects.toThrow(INBOX_FILE);
  });
});
