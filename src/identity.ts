import type { IdentityField, VisitRecord } from './types';
import { isHttpUrl } from './url';

export const IDENTITY_FIELDS = ['shopName', 'shopUrl', 'therapistName', 'therapistXUrl'] as const satisfies readonly IdentityField[];
const SHOP_FIELDS = ['shopName', 'shopUrl'] as const satisfies readonly IdentityField[];

export type IdentityValues = Readonly<Record<IdentityField, string>>;

export interface IdentitySuggestion {
  readonly values: Partial<IdentityValues>;
  /** 同じプロフィールURLを持つ過去記録の通し番号 */
  readonly sameTherapistSeriesNo: number | null;
}

function parseHttpUrl(url: string): URL | null {
  return isHttpUrl(url) ? new URL(url) : null;
}

/** 同じサイトかを比べるキー。www の有無は区別しない */
export function siteKey(url: string): string | null {
  const parsed = parseHttpUrl(url);
  return parsed === null ? null : parsed.hostname.replace(/^www\./, '');
}

/** 同じページかを比べるキー。クエリでセラピストを分けるサイトがあるため、クエリは残す */
export function pageKey(url: string): string | null {
  const parsed = parseHttpUrl(url);
  return parsed === null ? null : `${siteKey(url)}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
}

export function shopUrlFromProfile(profileUrl: string): string | null {
  const parsed = parseHttpUrl(profileUrl);
  return parsed === null ? null : `${parsed.origin}/`;
}

export function blankFields(values: IdentityValues): IdentityField[] {
  return IDENTITY_FIELDS.filter((field) => values[field].trim() === '');
}

function filledValues(record: VisitRecord | undefined, fields: readonly IdentityField[]): Partial<IdentityValues> {
  if (record === undefined) return {};
  return Object.fromEntries(fields.flatMap((field) => {
    const value = record.basic[field].trim();
    return value === '' ? [] : [[field, value]];
  }));
}

/** プロフィールURLを手がかりに、過去記録から店とセラピストの情報を探す */
export function suggestIdentity(
  records: readonly VisitRecord[], profileUrl: string, excludeId?: string,
): IdentitySuggestion {
  const page = pageKey(profileUrl);
  const site = siteKey(profileUrl);
  if (page === null || site === null) return { values: {}, sameTherapistSeriesNo: null };
  const latestFirst = records.filter((record) => record.id !== excludeId).sort((a, b) => b.seriesNo - a.seriesNo);
  const sameTherapist = latestFirst.find((record) => pageKey(record.basic.therapistProfileUrl) === page);
  const sameShop = latestFirst.find((record) =>
    record.basic.shopName.trim() !== '' && siteKey(record.basic.therapistProfileUrl) === site);
  return {
    values: { ...filledValues(sameShop, SHOP_FIELDS), ...filledValues(sameTherapist, IDENTITY_FIELDS) },
    sameTherapistSeriesNo: sameTherapist?.seriesNo ?? null,
  };
}
