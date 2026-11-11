// 週次確認の受け渡しファイル(targets.json / checks.json)の形式。
// scripts/weekly-check.mjs が Node から直接読み込むため、値のimportと型以外のTS構文を使わない。

export type Enrollment = 'present' | 'absent' | 'unknown';
export type Attendance = 'listed' | 'not_listed' | 'unknown';

export interface CheckTarget {
  readonly profileUrl: string;
  readonly therapistName: string;
  /** 出勤表がプロフィールと別ページの店だけ指定する */
  readonly scheduleUrl: string | null;
}

export interface TargetsFile {
  readonly version: 1;
  readonly generatedAt: string;
  readonly targets: readonly CheckTarget[];
}

export interface CheckResult {
  readonly profileUrl: string;
  readonly checkedAt: string;
  readonly enrollment: Enrollment;
  readonly attendance: Attendance;
  readonly detail: string;
}

export interface ChecksFile {
  readonly version: 1;
  readonly results: readonly CheckResult[];
}

export const MAX_TARGETS = 500;

const ENROLLMENTS: readonly string[] = ['present', 'absent', 'unknown'];
const ATTENDANCES: readonly string[] = ['listed', 'not_listed', 'unknown'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== '';
  } catch {
    return false;
  }
}

function parseJson(json: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`${label}のJSON形式が不正です`);
  }
  if (!isObject(parsed) || parsed.version !== 1) throw new Error(`${label}の形式が違います(version 1 のみ対応)`);
  return parsed;
}

function parseList(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label}が配列ではありません`);
  if (value.length > MAX_TARGETS) throw new Error(`${label}は${MAX_TARGETS}件以下にしてください`);
  return value;
}

export function parseCheckResults(value: unknown, label = '確認結果'): CheckResult[] {
  return parseList(value, label).map((item, index) => {
    const at = `${label}の${index + 1}件目`;
    if (!isObject(item)) throw new Error(`${at}が不正です`);
    const { profileUrl, checkedAt, enrollment, attendance, detail } = item;
    if (!isHttpUrl(profileUrl)) throw new Error(`${at}のprofileUrlが不正です`);
    if (typeof checkedAt !== 'string' || Number.isNaN(Date.parse(checkedAt))) throw new Error(`${at}のcheckedAtが不正です`);
    if (typeof enrollment !== 'string' || !ENROLLMENTS.includes(enrollment)) throw new Error(`${at}のenrollmentが不正です`);
    if (typeof attendance !== 'string' || !ATTENDANCES.includes(attendance)) throw new Error(`${at}のattendanceが不正です`);
    if (typeof detail !== 'string') throw new Error(`${at}のdetailが不正です`);
    return {
      profileUrl, checkedAt, detail: detail.slice(0, 200),
      enrollment: enrollment as Enrollment, attendance: attendance as Attendance,
    };
  });
}

export function parseChecksFile(json: string): ChecksFile {
  const parsed = parseJson(json, '確認結果');
  return { version: 1, results: parseCheckResults(parsed.results) };
}

export function parseTargetsFile(json: string): TargetsFile {
  const parsed = parseJson(json, '確認対象');
  if (typeof parsed.generatedAt !== 'string') throw new Error('確認対象のgeneratedAtが不正です');
  const targets = parseList(parsed.targets, '確認対象').map((item, index) => {
    const at = `確認対象の${index + 1}件目`;
    if (!isObject(item)) throw new Error(`${at}が不正です`);
    const { profileUrl, therapistName, scheduleUrl } = item;
    if (!isHttpUrl(profileUrl)) throw new Error(`${at}のprofileUrlが不正です`);
    if (typeof therapistName !== 'string') throw new Error(`${at}のtherapistNameが不正です`);
    if (scheduleUrl !== null && !isHttpUrl(scheduleUrl)) throw new Error(`${at}のscheduleUrlが不正です`);
    return { profileUrl, therapistName, scheduleUrl };
  });
  return { version: 1, generatedAt: parsed.generatedAt, targets };
}
