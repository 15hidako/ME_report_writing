// data/answers に置かれた回答JSONのうち、ボード(ブラウザの保存領域)にまだ反映していないものを選ぶ。
// 取り込み自体は入力画面の「回答を追加読込」と同じ handoff-import の規則で行う。

import { prepareHandoffImport } from '../handoff-import';
import { parseRecordsJson } from '../record-validation';
import { errText } from '../guards';
import type { VisitRecord } from '../types';
import type { AnswerFile } from './local-api';

export interface IncomingAnswer {
  readonly record: VisitRecord;
  /** 回答1件ぶんの引き継ぎJSON。prepareHandoffImport にそのまま渡せる */
  readonly json: string;
  readonly fileName: string;
}

export interface AnswerScan {
  readonly incoming: readonly IncomingAnswer[];
  /** 読めなかったファイルと理由 */
  readonly errors: readonly string[];
}

const time = (record: VisitRecord): number => {
  const value = Date.parse(record.updatedAt);
  return Number.isNaN(value) ? 0 : value;
};

/**
 * 同じ回答が複数のファイルにあれば、更新日時がいちばん新しいものだけを使う。
 * ボードにない回答と、ボードより新しく中身も違う回答だけを返す。ボード側が新しい回答は古いファイルで戻さない。
 */
export function scanAnswerFiles(current: readonly VisitRecord[], files: readonly AnswerFile[]): AnswerScan {
  const errors: string[] = [];
  const newest = new Map<string, IncomingAnswer>();
  /** 更新日時が同じなのに中身が違う回答。どちらが正しいか決められないので取り込まない */
  const conflicted = new Map<string, string>();
  for (const file of files) {
    let records: VisitRecord[];
    try {
      records = parseRecordsJson(file.text);
    } catch (error) {
      errors.push(`${file.name}: ${errText(error)}`);
      continue;
    }
    for (const record of records) {
      const known = newest.get(record.id);
      const json = JSON.stringify([record]);
      if (known === undefined || time(record) > time(known.record)) {
        newest.set(record.id, { record, json, fileName: file.name });
        conflicted.delete(record.id);
      } else if (time(record) === time(known.record) && json !== known.json) {
        conflicted.set(record.id, `${record.basic.therapistName}: ${known.fileName} と ${file.name} で、更新日時が同じなのに中身が違います`);
      }
    }
  }
  errors.push(...conflicted.values());
  const byId = new Map(current.map((record) => [record.id, record]));
  const incoming = [...newest.values()].filter(({ record, json }) => {
    if (conflicted.has(record.id)) return false;
    const saved = byId.get(record.id);
    if (saved === undefined) return true;
    if (time(record) <= time(saved)) return false;
    try {
      return prepareHandoffImport(current, json).kind !== 'unchanged';
    } catch (error) {
      errors.push(`${record.basic.therapistName}: ${errText(error)}`);
      return false;
    }
  });
  return { incoming, errors };
}
