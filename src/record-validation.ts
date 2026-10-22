import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../schema/visit-record.schema.json';
import type { VisitRecord } from './types';
import { isHttpUrl } from './url';

const ajv = new Ajv2020({ allErrors: true, ownProperties: true });
addFormats(ajv, ['date', 'date-time']);
ajv.addFormat('http-url', isHttpUrl);
const validate = ajv.compile<VisitRecord>(schema);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeLegacyRecord(value: unknown): unknown {
  if (!isObject(value)) return value;
  const ratings = isObject(value.ratings)
    ? Object.fromEntries(Object.entries(value.ratings).map(([key, rating]) => [
      key, isObject(rating) && rating.note === undefined ? { ...rating, note: '' } : rating,
    ]))
    : value.ratings;
  const flow = isObject(value.flow)
    ? Object.fromEntries(Object.entries(value.flow).map(([key, phase]) => [
      key, isObject(phase) && (phase.note === null || phase.note === undefined) ? { ...phase, note: '' } : phase,
    ]))
    : value.flow;
  if (isObject(flow) && (flow.downside === null || flow.downside === undefined)) flow.downside = '';
  return {
    ...value,
    updatedAt: value.updatedAt === undefined ? value.createdAt : value.updatedAt,
    revisitOf: value.revisitOf === undefined ? null : value.revisitOf,
    postedUrl: value.postedUrl === undefined ? null : value.postedUrl,
    ratings,
    flow,
  };
}

export function parseVisitRecords(value: unknown): VisitRecord[] {
  if (!Array.isArray(value)) throw new Error('訪問データが配列ではありません。対応形式はv1のJSON配列です');
  const records: VisitRecord[] = [];
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const [index, item] of value.entries()) {
    const record = normalizeLegacyRecord(item);
    if (!validate(record)) {
      const error = validate.errors?.[0];
      throw new Error(`${index + 1}件目の訪問データが不正です: ${error?.instancePath || '/'} ${error?.message ?? ''}`);
    }
    if (ids.has(record.id)) throw new Error(`${index + 1}件目のidが重複しています`);
    if (numbers.has(record.seriesNo)) throw new Error(`${index + 1}件目の通し番号が重複しています`);
    if (record.revisitOf === record.id) throw new Error(`${index + 1}件目の再訪先が自分自身です`);
    if (record.sales.articleType !== (record.revisitOf === null ? 'single' : 'revisit')) {
      throw new Error(`${index + 1}件目の再訪先と記事タイプが一致しません`);
    }
    ids.add(record.id);
    numbers.add(record.seriesNo);
    records.push(record);
  }
  return records;
}

export function parseRecordsJson(json: string): VisitRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('訪問データのJSON形式が不正です');
  }
  return parseVisitRecords(parsed);
}
