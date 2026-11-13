import type { VisitStore } from '../storage';
import { MAX_HANDOFF_FILE_BYTES } from '../handoff-import';
import { localDate } from '../date';
import { openHandoffUpdate } from './handoff-import';
import { toast } from './widgets';
import { downloadJson, pickFile } from './file-io';
import { errText } from '../guards';

export interface DataButtonDeps {
  readonly getStore: () => VisitStore;
  readonly confirmDiscardDraft: () => boolean;
  readonly clearContext: () => void;
  readonly render: () => void;
}

/** バックアップがあるか。保存領域を読めないときは復元を出さない */
export function canRestoreBackup(store: () => VisitStore): boolean {
  try {
    return store().hasBackup();
  } catch {
    return false;
  }
}

/** データ操作のボタン。handoff は「回答を追加読込」を含めるか */
export function dataButtonsHtml(options: { readonly handoff: boolean; readonly canRestore: boolean }): string {
  return `<button id="export">保存(JSON)</button>
      <button id="import">読込(JSON)</button>${
    options.handoff ? '\n      <button id="import-handoff">回答を追加読込</button>' : ''}${
    options.canRestore ? '\n      <button id="restore">バックアップ復元</button>' : ''}`;
}

function rawHasSavedData(deps: DataButtonDeps): boolean {
  try {
    const parsed: unknown = JSON.parse(deps.getStore().exportRawJson());
    return !(Array.isArray(parsed) && parsed.length === 0);
  } catch {
    return true;
  }
}

function downloadRaw(deps: DataButtonDeps): void {
  try {
    downloadJson(`me-report-backup-${localDate()}.json`, deps.getStore().exportRawJson());
  } catch (err) {
    toast(errText(err));
  }
}

function applyImport(text: string, deps: DataButtonDeps): void {
  try {
    deps.getStore().validateImport(text);
    if (rawHasSavedData(deps) && !confirm('保存済みの全レコードを置き換えますか?')) return;
  } catch (err) {
    toast(errText(err));
    return;
  }
  if (!deps.confirmDiscardDraft()) return;
  try {
    deps.getStore().importJson(text);
  } catch (err) {
    toast(errText(err));
    return;
  }
  deps.clearContext();
  toast('インポートしました');
  deps.render();
}

function applyHandoffImport(text: string, deps: DataButtonDeps): void {
  try {
    const db = deps.getStore();
    const plan = db.prepareHandoffImport(text);
    if (plan.kind === 'unchanged') {
      toast('同じ回答のため変更はありません');
      return;
    }
    const apply = (): boolean => {
      if (!deps.confirmDiscardDraft()) return false;
      db.importHandoffJson(text, plan.snapshot);
      deps.clearContext();
      toast(`#${plan.record.seriesNo} を${plan.kind === 'update' ? '更新' : '追加'}しました`);
      deps.render();
      return true;
    };
    if (plan.kind === 'update') {
      openHandoffUpdate(plan, apply);
    } else if (plan.renumberedFrom === null || confirm(`通し番号 #${plan.renumberedFrom} は使用済みです。#${plan.record.seriesNo} として追加しますか?`)) {
      apply();
    }
  } catch (error) {
    toast(errText(error));
  }
}

function pickImport(deps: DataButtonDeps, additive = false): void {
  pickFile(additive ? '.json,.txt,application/json,text/plain' : '.json,application/json', (file) => {
    if (additive && file.size > MAX_HANDOFF_FILE_BYTES) {
      toast('引き継ぎファイルは1MB以下にしてください');
      return;
    }
    void file.text()
      .then((text) => (additive ? applyHandoffImport(text, deps) : applyImport(text, deps)))
      .catch((err: unknown) => toast(errText(err)));
  });
}

function restoreFromBackup(deps: DataButtonDeps): void {
  let db: VisitStore;
  try {
    db = deps.getStore();
    if (!db.hasBackup()) {
      toast('バックアップがありません');
      return;
    }
  } catch (err) {
    toast(errText(err));
    return;
  }
  if (!confirm('バックアップで現在の全レコードを置き換えますか?')) return;
  if (!deps.confirmDiscardDraft()) return;
  try {
    db.restoreBackup();
  } catch (err) {
    toast(errText(err));
    return;
  }
  deps.clearContext();
  toast('バックアップを復元しました');
  deps.render();
}

export function bindDataButtons(deps: DataButtonDeps): void {
  document.getElementById('export')?.addEventListener('click', () => downloadRaw(deps));
  document.getElementById('import')?.addEventListener('click', () => pickImport(deps));
  document.getElementById('import-handoff')?.addEventListener('click', () => pickImport(deps, true));
  document.getElementById('restore')?.addEventListener('click', () => restoreFromBackup(deps));
}
