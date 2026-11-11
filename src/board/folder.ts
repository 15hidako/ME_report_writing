// 週次確認との受け渡しフォルダ。File System Access API(PCのChrome/Edge)で読み書きし、
// 選んだフォルダはIndexedDBに覚えておく。

type Permission = 'granted' | 'denied' | 'prompt';
export type Folder = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: 'readwrite' }): Promise<Permission>;
  requestPermission(options: { mode: 'readwrite' }): Promise<Permission>;
};
type Picker = (options: { id: string; mode: 'readwrite' }) => Promise<Folder>;

const DB_NAME = 'me-report-writer-board';
const STORE = 'handles';
const HANDLE_KEY = 'handoff';

function picker(): Picker | undefined {
  return (window as { showDirectoryPicker?: Picker }).showDirectoryPicker;
}

export function folderSupported(): boolean {
  return picker() !== undefined && 'indexedDB' in window;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDBの操作に失敗しました'));
  });
}

async function handleStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const db = await request(open);
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function savedFolder(): Promise<Folder | null> {
  const handle: unknown = await request((await handleStore('readonly')).get(HANDLE_KEY));
  return handle === undefined ? null : handle as Folder;
}

/** フォルダを選び直す。利用者の操作(クリック)の中から呼ぶ */
export async function pickFolder(): Promise<Folder> {
  const pick = picker();
  if (pick === undefined) throw new Error('このブラウザはフォルダの読み書きに対応していません');
  const folder = await pick({ id: 'me-report-handoff', mode: 'readwrite' });
  await request((await handleStore('readwrite')).put(folder, HANDLE_KEY));
  return folder;
}

/** 読み書きの許可を確かめる。利用者の操作(クリック)の中から呼ぶ */
export async function ensureAccess(folder: Folder): Promise<void> {
  const options = { mode: 'readwrite' } as const;
  if (await folder.queryPermission(options) === 'granted') return;
  if (await folder.requestPermission(options) !== 'granted') {
    throw new Error(`フォルダ「${folder.name}」の読み書きが許可されませんでした`);
  }
}

export async function writeText(folder: Folder, name: string, text: string): Promise<void> {
  const writable = await (await folder.getFileHandle(name, { create: true })).createWritable();
  await writable.write(text);
  await writable.close();
}

/** ファイルがまだなければ null */
export async function readText(folder: Folder, name: string): Promise<string | null> {
  try {
    return await (await (await folder.getFileHandle(name)).getFile()).text();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
}
