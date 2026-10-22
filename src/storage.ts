import type { VisitRecord } from './types';
import { parseRecordsJson, parseVisitRecords } from './record-validation';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'me-report-writer/visits/v1';
const BACKUP_KEY = `${STORAGE_KEY}/backup`;
const PENDING_KEY = `${BACKUP_KEY}/pending`;
const RECOVERY_KEY = `${STORAGE_KEY}/recovery`;

export class VisitStore {
  constructor(private readonly kv: KeyValueStore) {}

  loadAll(): VisitRecord[] {
    try {
      const raw = this.kv.getItem(STORAGE_KEY);
      return raw === null ? [] : parseRecordsJson(raw);
    } catch (error) {
      throw new Error('訪問レコードの読み込みに失敗しました。元データをJSON保存してから復旧してください', { cause: error });
    }
  }

  get(id: string): VisitRecord | undefined {
    return this.loadAll().find((r) => r.id === id);
  }

  save(record: VisitRecord): VisitRecord[] {
    const validated = parseVisitRecords([record])[0]!;
    const all = this.loadAll();
    const idx = all.findIndex((r) => r.id === validated.id);
    const next =
      idx >= 0
        ? [...all.slice(0, idx), validated, ...all.slice(idx + 1)]
        : [...all, validated];
    return this.writeAll(next);
  }

  delete(id: string): VisitRecord[] {
    const next = this.loadAll().filter((r) => r.id !== id);
    return this.writeAll(next);
  }

  nextSeriesNo(): number {
    const max = this.loadAll().reduce((n, record) => Math.max(n, record.seriesNo), 0);
    if (max === Number.MAX_SAFE_INTEGER) throw new Error('通し番号の上限に達したため保存できません');
    return max + 1;
  }

  exportJson(): string {
    return JSON.stringify(this.loadAll(), null, 2);
  }

  importJson(json: string): VisitRecord[] {
    return this.writeAll(this.validateImport(json));
  }

  validateImport(json: string): VisitRecord[] {
    return parseRecordsJson(json);
  }

  exportRawJson(): string {
    try {
      return this.kv.getItem(STORAGE_KEY) ?? '[]';
    } catch (error) {
      throw new Error('元データの読み込みに失敗しました。ブラウザの保存設定を確認してください', { cause: error });
    }
  }

  hasBackup(): boolean {
    try {
      return this.backupRaw() !== null;
    } catch (error) {
      throw new Error('バックアップの読み込みに失敗しました', { cause: error });
    }
  }

  restoreBackup(): VisitRecord[] {
    try {
      const backup = this.backupRaw();
      if (backup === null) throw new Error('復元できるバックアップがありません');
      const records = parseRecordsJson(backup);
      const raw = this.kv.getItem(STORAGE_KEY);
      const next = JSON.stringify(records);
      if (raw !== null && raw !== next) this.archiveRaw(raw);
      this.kv.setItem(BACKUP_KEY, backup);
      this.kv.setItem(STORAGE_KEY, next);
      return records;
    } catch (error) {
      throw new Error('バックアップからの復元に失敗しました。元データとバックアップは保持しています', { cause: error });
    }
  }

  private writeAll(records: readonly VisitRecord[]): VisitRecord[] {
    const validated = parseVisitRecords(records);
    try {
      const previous = this.kv.getItem(STORAGE_KEY);
      const next = JSON.stringify(validated);
      if (previous === next) return validated;
      if (previous !== null) {
        const backup = this.backupRaw();
        if (backup !== null) this.kv.setItem(BACKUP_KEY, backup);
        let previousIsValid = true;
        try {
          parseRecordsJson(previous);
        } catch {
          previousIsValid = false;
        }
        if (previousIsValid) this.kv.setItem(PENDING_KEY, previous);
        else this.archiveRaw(previous);
      }
      this.kv.setItem(STORAGE_KEY, next);
      return validated;
    } catch (error) {
      throw new Error('保存に失敗しました。元データは変更していません。保存容量やブラウザの設定を確認してください', { cause: error });
    }
  }

  private backupRaw(): string | null {
    const pending = this.kv.getItem(PENDING_KEY);
    // 先に主データを更新すると、バックアップ書込失敗時に旧データを失う。
    // 主データと同じ候補は未完了の書込なので、確定済みの退避先を使う。
    if (pending !== null && pending !== this.kv.getItem(STORAGE_KEY)) return pending;
    return this.kv.getItem(BACKUP_KEY);
  }

  private archiveRaw(raw: string): void {
    for (let index = 0; ; index++) {
      const key = index === 0 ? RECOVERY_KEY : `${RECOVERY_KEY}/${index}`;
      const existing = this.kv.getItem(key);
      if (existing === raw) return;
      if (existing === null) {
        this.kv.setItem(key, raw);
        return;
      }
    }
  }
}
