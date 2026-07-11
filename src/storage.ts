import type { VisitRecord } from './types';

// Storage は注入可能(テスト時はインメモリ実装を渡す)
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'me-report-writer/visits/v1';

export class VisitStore {
  constructor(private readonly kv: KeyValueStore) {}

  loadAll(): VisitRecord[] {
    const raw = this.kv.getItem(STORAGE_KEY);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error('stored data is not an array');
      }
      return parsed as VisitRecord[];
    } catch (e) {
      throw new Error(
        `訪問レコードの読み込みに失敗しました。localStorageが破損している可能性があります: ${String(e)}`,
      );
    }
  }

  get(id: string): VisitRecord | undefined {
    return this.loadAll().find((r) => r.id === id);
  }

  /** 保存(既存idは置換、新規は追加)。常に新配列を書き戻す */
  save(record: VisitRecord): VisitRecord[] {
    const all = this.loadAll();
    const idx = all.findIndex((r) => r.id === record.id);
    const next =
      idx >= 0
        ? [...all.slice(0, idx), record, ...all.slice(idx + 1)]
        : [...all, record];
    this.kv.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  delete(id: string): VisitRecord[] {
    const next = this.loadAll().filter((r) => r.id !== id);
    this.kv.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  /** シリーズ通し番号の自動採番(既存最大値+1) */
  nextSeriesNo(): number {
    const all = this.loadAll();
    return all.reduce((max, r) => Math.max(max, r.seriesNo), 0) + 1;
  }

  /** バックアップ用エクスポート(端末間の手動移行に使う) */
  exportJson(): string {
    return JSON.stringify(this.loadAll(), null, 2);
  }

  importJson(json: string): VisitRecord[] {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      throw new Error('インポートデータが配列ではありません');
    }
    for (const r of parsed) {
      if (typeof r !== 'object' || r === null || typeof (r as { id?: unknown }).id !== 'string') {
        throw new Error('インポートデータに id のないレコードが含まれています');
      }
    }
    this.kv.setItem(STORAGE_KEY, JSON.stringify(parsed));
    return parsed as VisitRecord[];
  }
}
