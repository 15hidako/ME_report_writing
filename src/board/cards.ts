import type { VisitRecord } from '../types';
import type { CheckResult, CheckTarget, TargetsFile } from '../checks/files';
import { pageKey, siteKey } from '../identity';
import { isPublished, isWakustArticleUrl } from '../prompt/publication';
import type { ArticleKind, BoardState, ArticleAngle, Stage } from './state';
import type { ArticleDraft } from './articles';

/** 確認結果をこの日数より古いまま放置しない。週1回の実行が1回抜けたら知らせる */
export const STALE_AFTER_DAYS = 8;

export type Attention = 'absent' | 'not_listed' | 'review' | 'stale' | 'unchecked';

export interface Tracking {
  readonly profileUrl: string;
  readonly profileKey: string;
  readonly site: string;
  readonly scheduleUrl: string | null;
  readonly check: CheckResult | null;
  readonly attention: Attention | null;
}

export interface Card {
  readonly id: string;
  readonly source: 'record' | 'bundle';
  readonly kind: ArticleKind;
  /** 単体記事だけが持つ。未選択は null */
  readonly angle: ArticleAngle | null;
  readonly stage: Stage;
  readonly title: string;
  readonly detail: string;
  readonly postedUrl: string | null;
  /** 投稿済みで、プロフィールURLがある回答だけが追跡対象 */
  readonly tracking: Tracking | null;
  /** 原稿フォルダに書き出された記事。読んでいない・ないときは null */
  readonly draft: ArticleDraft | null;
}

function latestChecks(checks: readonly CheckResult[]): Map<string, CheckResult> {
  const latest = new Map<string, CheckResult>();
  for (const check of checks) {
    const key = pageKey(check.profileUrl);
    if (key === null) continue;
    const current = latest.get(key);
    if (current === undefined || Date.parse(check.checkedAt) > Date.parse(current.checkedAt)) latest.set(key, check);
  }
  return latest;
}

function attentionOf(check: CheckResult | null, acknowledgedAt: string | undefined, now: Date): Attention | null {
  if (check === null) return 'unchecked';
  if (now.getTime() - Date.parse(check.checkedAt) > STALE_AFTER_DAYS * 86_400_000) return 'stale';
  if (acknowledgedAt === check.checkedAt) return null;
  if (check.enrollment === 'absent') return 'absent';
  if (check.enrollment === 'unknown' || check.attendance === 'unknown') return 'review';
  return check.attendance === 'not_listed' ? 'not_listed' : null;
}

function trackingOf(
  record: VisitRecord, state: BoardState, checks: Map<string, CheckResult>, now: Date,
): Tracking | null {
  const profileUrl = record.basic.therapistProfileUrl;
  const profileKey = pageKey(profileUrl);
  const site = siteKey(profileUrl);
  if (!isPublished(record) || profileKey === null || site === null) return null;
  const check = checks.get(profileKey) ?? null;
  return {
    profileUrl, profileKey, site, check,
    scheduleUrl: state.scheduleUrls[site] ?? null,
    attention: attentionOf(check, state.acknowledged[profileKey], now),
  };
}

export function buildCards(
  records: readonly VisitRecord[], state: BoardState, now: Date,
  drafts: ReadonlyMap<string, ArticleDraft> = new Map(),
): Card[] {
  const checks = latestChecks(state.checks);
  const seriesNo = new Map(records.map((record) => [record.id, record.seriesNo]));
  const recordCards = [...records].sort((a, b) => b.seriesNo - a.seriesNo).map((record): Card => {
    const kind = record.revisitOf === null ? 'single' : 'revisit';
    return {
      id: record.id,
      source: 'record',
      kind,
      angle: kind === 'single' ? state.angles[record.id] ?? null : null,
      stage: isPublished(record) ? 'posted' : state.stages[record.id] ?? 'answered',
      title: `#${record.seriesNo} ${record.basic.shopName} — ${record.basic.therapistName}`,
      detail: `${record.basic.visitDate} / ${record.basic.area}`,
      postedUrl: record.postedUrl,
      tracking: trackingOf(record, state, checks, now),
      draft: drafts.get(record.id) ?? null,
    };
  });
  const bundleCards = state.bundles.map((bundle): Card => {
    const numbers = bundle.recordIds.flatMap((id) => seriesNo.get(id) ?? []).sort((a, b) => a - b);
    return {
      id: bundle.id,
      source: 'bundle',
      kind: bundle.kind,
      angle: null,
      stage: bundle.postedUrl !== null && isWakustArticleUrl(bundle.postedUrl) ? 'posted' : bundle.stage,
      title: bundle.title,
      detail: numbers.map((no) => `#${no}`).join(' '),
      postedUrl: bundle.postedUrl,
      tracking: null,
      draft: null,
    };
  });
  return [...bundleCards, ...recordCards];
}

/** 週次確認へ渡す対象。同じプロフィールの再訪記事は1件にまとめる */
export function buildTargets(records: readonly VisitRecord[], state: BoardState, generatedAt: string): TargetsFile {
  const targets = new Map<string, CheckTarget>();
  for (const record of [...records].sort((a, b) => b.seriesNo - a.seriesNo)) {
    const profileKey = pageKey(record.basic.therapistProfileUrl);
    const site = siteKey(record.basic.therapistProfileUrl);
    if (!isPublished(record) || profileKey === null || site === null || targets.has(profileKey)) continue;
    targets.set(profileKey, {
      profileUrl: record.basic.therapistProfileUrl,
      therapistName: record.basic.therapistName,
      scheduleUrl: state.scheduleUrls[site] ?? null,
    });
  }
  return { version: 1, generatedAt, targets: [...targets.values()] };
}
