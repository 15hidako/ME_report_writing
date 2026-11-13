// 取得したページから在籍と出勤を判定する純粋関数。
// scripts/weekly-check.mjs が Node から直接読み込むため、値のimportと型以外のTS構文を使わない。
import type { Attendance, CheckResult, CheckTarget, Enrollment } from './files';

export type PageOutcome =
  | { readonly ok: true; readonly status: number; readonly finalUrl: string; readonly html: string }
  | { readonly ok: false; readonly reason: string };

/** 出勤として数える範囲。確認日を含めて何日先までを見るか */
export const ATTENDANCE_WINDOW_DAYS = 7;

const ENTITIES: Readonly<Record<string, string>> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** HTMLから表示される文字だけを取り出し、全角英数字を半角にそろえる */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]{1,6});/gi, (_all, hex: string) => codePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (_all, dec: string) => codePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (all, name: string) => ENTITIES[name.toLowerCase()] ?? all)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function codePoint(code: number): string {
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
}

function compact(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function containsName(text: string, name: string): boolean {
  return compact(text).includes(compact(name));
}

function samePage(a: string, b: string): boolean {
  const key = (value: string): string => {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  };
  return key(a) === key(b);
}

function judgeEnrollment(target: CheckTarget, page: PageOutcome): { enrollment: Enrollment; detail: string } {
  if (compact(target.therapistName) === '') return { enrollment: 'unknown', detail: '源氏名が未入力' };
  if (!page.ok) return { enrollment: 'unknown', detail: page.reason };
  if (page.status === 404 || page.status === 410) return { enrollment: 'absent', detail: `プロフィールがHTTP ${page.status}` };
  if (page.status >= 400) return { enrollment: 'unknown', detail: `プロフィールがHTTP ${page.status}` };
  if (!samePage(page.finalUrl, target.profileUrl) && new URL(page.finalUrl).pathname.replace(/\/+$/, '') === '') {
    // 退店のほか、メンテナンスや年齢確認でも全ページがトップへ転送されるため、不在とは断定しない
    return { enrollment: 'unknown', detail: 'プロフィールがトップページへ転送された(退店の可能性)' };
  }
  return containsName(pageText(page.html), target.therapistName)
    ? { enrollment: 'present', detail: '' }
    : { enrollment: 'unknown', detail: 'プロフィールに源氏名が見つからない' };
}

/** today(YYYY-MM-DD)から days 日分の月日 */
function upcomingDays(today: string, days: number): { month: number; day: number }[] {
  const [year, month, day] = today.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined || [year, month, day].some(Number.isNaN)) {
    throw new Error(`確認日の書式が不正です: ${today}`);
  }
  return Array.from({ length: days }, (_unused, offset) => {
    const date = new Date(Date.UTC(year, month - 1, day + offset));
    return { month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  });
}

const DATE_PATTERN = /(?<!\d)(\d{1,2})\s?(?:\/|月)\s?(\d{1,2})(?!\d)/g;
const TIME_PATTERN = /(?<!\d)\d{1,2}:\d{2}|(?<!\d)\d{1,2}時/;
/** その日の欄として読む長さ。長くすると、後ろに続く営業時間などの案内を出勤時間と読み違える */
const DAY_CELL_LENGTH = 40;
const REST_PATTERN = /休|未定/;

/** プロフィール本文の日付の並びから、今後の出勤時間が載っているかを読む */
function attendanceFromProfile(text: string, today: string): { attendance: Attendance; detail: string } {
  const wanted = new Set(upcomingDays(today, ATTENDANCE_WINDOW_DAYS).map(({ month, day }) => `${month}/${day}`));
  const dates = [...text.matchAll(DATE_PATTERN)];
  const upcoming = dates.flatMap((match, index) => {
    const label = `${Number(match[1])}/${Number(match[2])}`;
    if (!wanted.has(label)) return [];
    const start = match.index + match[0].length;
    // 次の日付の手前までを、その日の欄として読む
    const end = Math.min(dates[index + 1]?.index ?? text.length, start + DAY_CELL_LENGTH);
    // 休みと書かれた後ろの時間は、その日の出勤時間ではない
    const cell = text.slice(start, end).split(REST_PATTERN)[0] ?? '';
    return [{ label, hasTime: TIME_PATTERN.test(cell) }];
  });
  if (upcoming.length === 0) return { attendance: 'unknown', detail: 'プロフィールに今後7日の出勤表が見つからない' };
  const listed = [...new Set(upcoming.filter((day) => day.hasTime).map((day) => day.label))];
  return listed.length > 0
    ? { attendance: 'listed', detail: `出勤予定: ${listed.join(', ')}` }
    : { attendance: 'not_listed', detail: '今後7日の出勤時間が載っていない' };
}

function judgeAttendance(
  target: CheckTarget, profile: PageOutcome, schedule: PageOutcome | null, today: string,
): { attendance: Attendance; detail: string } {
  if (target.scheduleUrl !== null) {
    if (schedule === null || !schedule.ok) {
      return { attendance: 'unknown', detail: schedule === null ? '出勤表を取得していない' : `出勤表: ${schedule.reason}` };
    }
    if (schedule.status >= 400) return { attendance: 'unknown', detail: `出勤表がHTTP ${schedule.status}` };
    // 名前だけでは日付・勤務時間との対応を確かめられない。構造未確認の別ページは目視へ回す。
    return { attendance: 'unknown', detail: '別ページの出勤表は対象者と今後7日の勤務時間の対応を要目視' };
  }
  if (!profile.ok || profile.status >= 400) return { attendance: 'unknown', detail: '' };
  return attendanceFromProfile(pageText(profile.html), today);
}

/**
 * 1人分の在籍と出勤を判定する。読み取れなかった場合は unknown にし、不在や出勤なしと決めつけない。
 * @param today 確認日(YYYY-MM-DD)。この日から7日分の出勤を見る
 */
export function judgeTarget(
  target: CheckTarget, profile: PageOutcome, schedule: PageOutcome | null, checkedAt: string, today: string,
): CheckResult {
  const enrollment = judgeEnrollment(target, profile);
  const base = { profileUrl: target.profileUrl, checkedAt, enrollment: enrollment.enrollment };
  if (enrollment.enrollment === 'absent') return { ...base, attendance: 'not_listed', detail: enrollment.detail };
  const attendance = judgeAttendance(target, profile, schedule, today);
  return {
    ...base,
    attendance: attendance.attendance,
    detail: [enrollment.detail, attendance.detail].filter((part) => part !== '').join(' / '),
  };
}
