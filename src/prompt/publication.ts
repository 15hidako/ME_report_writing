import type { VisitRecord } from '../types';
import { isHttpUrl } from '../url';

export const SUMMARY_MIN_THERAPISTS = 6;

export function isPublished(record: VisitRecord): boolean {
  if (record.postedUrl === null || !isHttpUrl(record.postedUrl)) return false;
  const url = new URL(record.postedUrl);
  return (url.hostname === 'wakust.com' || url.hostname === 'www.wakust.com')
    && url.username === '' && url.password === '' && url.pathname !== '/';
}

export function therapistIdentity(record: VisitRecord): string | null {
  const normalize = (value: string): string => value.normalize('NFKC').trim().toLowerCase();
  const shop = normalize(record.basic.shopName);
  const name = normalize(record.basic.therapistName);
  return shop === '' || name === '' ? null : JSON.stringify([shop, name]);
}

export function countPublishedTherapists(records: readonly VisitRecord[]): number {
  const people = new Set<string>();
  const urls = new Set<string>();
  for (const record of records) {
    if (!isPublished(record) || record.revisitOf !== null || record.sales.articleType !== 'single') continue;
    const identity = therapistIdentity(record);
    if (identity === null) continue;
    const url = new URL(record.postedUrl!);
    url.protocol = 'https:';
    url.hostname = 'wakust.com';
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    if (people.has(identity) || urls.has(url.href)) continue;
    people.add(identity);
    urls.add(url.href);
  }
  return people.size;
}
