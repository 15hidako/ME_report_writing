import { describe, expect, it } from 'vitest';
import { judgeTarget, pageText, type PageOutcome } from './judge';
import { parseChecksFile, parseTargetsFile, type CheckTarget } from './files';

const PROFILE = 'https://shop.example/cast/12';
const NOW = '2026-11-15T12:00:00.000Z';
const TODAY = '2026-11-15';
const target: CheckTarget = { profileUrl: PROFILE, therapistName: 'あや', scheduleUrl: null };

function page(html: string, overrides: Partial<Extract<PageOutcome, { ok: true }>> = {}): PageOutcome {
  return { ok: true, status: 200, finalUrl: PROFILE, html, ...overrides };
}

function judge(profile: PageOutcome, schedule: PageOutcome | null = null, t = target) {
  return judgeTarget(t, profile, schedule, NOW, TODAY);
}

describe('pageText', () => {
  it('scriptとタグを除き、実体参照と全角英数字を戻す', () => {
    expect(pageText('<p>あや&nbsp;&amp;&#12354;</p><script>var x = "みき";</script><b>１１／１６</b>'))
      .toBe('あや &あ 11/16');
  });
});

describe('在籍の判定', () => {
  it('プロフィールに源氏名があれば在籍', () => {
    expect(judge(page('<h1>あ や</h1>')).enrollment).toBe('present');
  });

  it.each([404, 410])('HTTP %i は在籍なしとし、出勤もなしにする', (status) => {
    expect(judge(page('', { status }))).toMatchObject({ enrollment: 'absent', attendance: 'not_listed' });
  });

  it('トップページへの転送は退店と断定せず要目視にする', () => {
    expect(judge(page('<h1>月のスパ</h1>', { finalUrl: 'https://shop.example/' })))
      .toMatchObject({ enrollment: 'unknown', detail: expect.stringContaining('退店の可能性') });
  });

  it.each([
    ['源氏名が見つからない', page('<h1>みき</h1>')],
    ['取得に失敗した', { ok: false, reason: 'タイムアウト' } as const],
    ['アクセスを拒否された', page('', { status: 403 })],
  ])('%s場合は不在と決めつけず要目視にする', (_label, profile) => {
    expect(judge(profile).enrollment).toBe('unknown');
  });

  it('源氏名が空の対象は判定しない', () => {
    expect(judge(page('<h1>あや</h1>'), null, { ...target, therapistName: ' ' }).enrollment).toBe('unknown');
  });
});

describe('出勤の判定(プロフィール内の出勤表)', () => {
  it('今後7日の日付に時間が載っていれば出勤あり', () => {
    const result = judge(page('<h1>あや</h1><td>11/15(日)</td><td>休み</td><td>11/17(火)</td><td>12:00〜20:00</td>'));
    expect(result).toMatchObject({ attendance: 'listed', detail: '出勤予定: 11/17' });
  });

  it('月日表記と全角も読む', () => {
    expect(judge(page('<h1>あや</h1>１１月２１日 １３時〜')).attendance).toBe('listed');
  });

  it('日付はあるが時間がなければ出勤なし', () => {
    expect(judge(page('<h1>あや</h1>11/15 - 11/16 休 11/17 未定')).attendance).toBe('not_listed');
  });

  it('次の日付の時間を前の日の出勤として数えない', () => {
    // 11/21は範囲内で休み、11/22は範囲外で出勤
    expect(judge(page('<h1>あや</h1>11/21 休み 11/22 12:00〜')).attendance).toBe('not_listed');
  });

  it('休みの日の後ろに続く営業時間の案内を出勤時間と読まない', () => {
    expect(judge(page('<h1>あや</h1>11/17(火) 定休日。受付時間は10:00〜18:00です')).attendance).toBe('not_listed');
  });

  it('出勤表がなければ要目視', () => {
    expect(judge(page('<h1>あや</h1>T160 B85')).attendance).toBe('unknown');
  });

  it('年をまたぐ7日間も読む', () => {
    const result = judgeTarget(target, page('<h1>あや</h1>1/2 18:00〜'), null, NOW, '2026-12-28');
    expect(result.attendance).toBe('listed');
  });
});

describe('出勤の判定(別ページの出勤表)', () => {
  const withSchedule: CheckTarget = { ...target, scheduleUrl: 'https://shop.example/schedule' };
  const profile = page('<h1>あや</h1>');

  it('出勤表の構造を特定できなければ名前の有無によらず要目視', () => {
    expect(judge(profile, page('<li>あや 12:00</li>'), withSchedule).attendance).toBe('unknown');
    expect(judge(profile, page('<li>みき 12:00</li>'), withSchedule).attendance).toBe('unknown');
  });

  it('出勤表を取得できなければ要目視', () => {
    expect(judge(profile, { ok: false, reason: 'タイムアウト' }, withSchedule))
      .toMatchObject({ enrollment: 'present', attendance: 'unknown', detail: '出勤表: タイムアウト' });
    expect(judge(profile, page('', { status: 500 }), withSchedule).attendance).toBe('unknown');
  });
});

describe('受け渡しファイルの検証', () => {
  it('確認対象と確認結果を読む', () => {
    const targets = { version: 1, generatedAt: NOW, targets: [target] };
    expect(parseTargetsFile(JSON.stringify(targets)).targets).toEqual([target]);
    const result = judge(page('<h1>あや</h1>'));
    expect(parseChecksFile(JSON.stringify({ version: 1, results: [result] })).results).toEqual([result]);
  });

  it.each([
    ['JSONでない', 'x', 'JSON形式'],
    ['版が違う', '{"version":2,"results":[]}', 'version 1'],
    ['URLがhttpでない', `{"version":1,"results":[{"profileUrl":"javascript:alert(1)","checkedAt":"${NOW}","enrollment":"present","attendance":"listed","detail":""}]}`, 'profileUrl'],
    ['判定値が未知', `{"version":1,"results":[{"profileUrl":"${PROFILE}","checkedAt":"${NOW}","enrollment":"maybe","attendance":"listed","detail":""}]}`, 'enrollment'],
  ])('%sファイルは理由を示して拒否する', (_label, json, message) => {
    expect(() => parseChecksFile(json)).toThrow(message);
  });
});


describe('構造未確認の別ページを断定しない', () => {
  it.each([
    '<p>あや 休み</p>',
    '<nav>あや</nav><section>11/15 みき 12:00〜20:00</section>',
    '<p>2025/11/15 あや 12:00〜20:00</p>',
    '<p>12/25 あや 12:00〜20:00</p>',
    '<p>11/15 あやか 12:00〜20:00</p>',
    '<p>出勤予定は未定</p>',
  ])('名前の一致や欠落だけでは出勤を決めない: %s', (html) => {
    expect(judge(page('<h1>あや</h1>'), page(html), { ...target, scheduleUrl: 'https://shop.example/schedule' }).attendance).toBe('unknown');
  });
});
