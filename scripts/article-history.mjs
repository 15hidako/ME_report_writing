// 本人がボードで原稿を直した記録を、data/articles の各版フォルダの .history に残す(H-16)。
// 文体を調整するために、生成された文章(base)と本人が直した文章(edit)を比べられるようにする。
// data/ は gitignore 済みなので、履歴もこのPCの中だけに置かれる。
//
// 使い方: node scripts/article-history.mjs [記事フォルダ名の先頭(例: 0005)]
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARTICLE_PARTS, SOURCE_PARTS, VARIANT_DIRS, recordIdOfFolder } from '../src/prompt/article-files.ts';

export const HISTORY_DIR = '.history';
const SNAPSHOT = /^(\d{8}-\d{6}-\d{3})(?:-(\d+))?-(base|edit)\.txt$/;
const SOURCE_FILES = SOURCE_PARTS.map((id) => ARTICLE_PARTS.find((part) => part.id === id).file);

/** @param {unknown} error */
const isMissing = (error) => error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
const isTaken = (error) => error instanceof Error && 'code' in error && error.code === 'EEXIST';

/** 名前順が時刻順になる、ローカル時刻の印。例: 20261113-210912-345 */
function stamp(date) {
  const pad = (value, width = 2) => String(value).padStart(width, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
}

/**
 * 1つの部分の履歴を古い順に返す。履歴がなければ空。
 * @returns {Promise<{ name: string; kind: 'base' | 'edit'; file: string }[]>}
 */
export async function snapshotsOf(variantDir, partFile) {
  const dir = path.join(variantDir, HISTORY_DIR, partFile);
  let names;
  try {
    names = await readdir(dir);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  return names
    .map((name) => ({ name, match: SNAPSHOT.exec(name) }))
    .filter((item) => item.match !== null)
    .sort((a, b) => a.match[1].localeCompare(b.match[1]) || Number(a.match[2] ?? 0) - Number(b.match[2] ?? 0)
      || a.match[3].localeCompare(b.match[3]))
    .map(({ name, match }) => ({ name, kind: match[3], file: path.join(dir, name) }));
}

/** 同じ時刻の印が重なったときは番号を足して、既存の履歴を上書きしない */
async function writeSnapshot(variantDir, partFile, kind, text, now) {
  const dir = path.join(variantDir, HISTORY_DIR, partFile);
  await mkdir(dir, { recursive: true });
  for (let n = 0; n < 100; n += 1) {
    const name = `${stamp(now)}${n === 0 ? '' : `-${n}`}-${kind}.txt`;
    try {
      await writeFile(path.join(dir, name), text, { encoding: 'utf8', flag: 'wx' });
      return;
    } catch (error) {
      if (!isTaken(error)) throw error;
    }
  }
  throw new Error(`履歴の名前を決められませんでした: ${dir}`);
}

/**
 * 保存の直前に呼ぶ。今のファイルが最後の履歴と違えば、ボード以外(Claude の生成や書き直し)で書かれた文章として base に残す。
 * @param {string | null} current 今のファイルの中身。まだなければ null
 */
export async function recordBase(variantDir, partFile, current, now = new Date()) {
  if (current === null) return;
  const snapshots = await snapshotsOf(variantDir, partFile);
  const last = snapshots.at(-1);
  if (last !== undefined && await readFile(last.file, 'utf8') === current) return;
  await writeSnapshot(variantDir, partFile, 'base', current, now);
}

/** 保存のあとに呼ぶ。本人が直した文章を edit に残す */
export async function recordEdit(variantDir, partFile, text, now = new Date()) {
  await writeSnapshot(variantDir, partFile, 'edit', text, now);
}

/**
 * 行単位の差分(最長共通部分列)。同じ行は ' '、消えた行は '-'、足した行は '+'
 * @returns {{ op: ' ' | '-' | '+'; line: string }[]}
 */
export function diffLines(before, after) {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const lengths = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const result = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ op: ' ', line: a[i] });
      i += 1;
      j += 1;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      result.push({ op: '-', line: a[i] });
      i += 1;
    } else {
      result.push({ op: '+', line: b[j] });
      j += 1;
    }
  }
  return [
    ...result,
    ...a.slice(i).map((line) => ({ op: '-', line })),
    ...b.slice(j).map((line) => ({ op: '+', line })),
  ];
}

async function readOrNull(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/**
 * 記事ごとに、最新の base と今の原稿を比べる。変わっていない部分と、base がない部分は返さない。
 * @param {string} articlesDir data/articles
 * @param {string} [prefix] 記事フォルダ名の先頭で絞り込む
 */
export async function collectEdits(articlesDir, prefix = '') {
  let folders;
  try {
    folders = await readdir(articlesDir, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const edits = [];
  const names = folders
    .filter((entry) => entry.isDirectory() && recordIdOfFolder(entry.name) !== null && entry.name.startsWith(prefix))
    .map((entry) => entry.name)
    .sort();
  for (const folderName of names) {
    for (const variant of Object.values(VARIANT_DIRS)) {
      const variantDir = path.join(articlesDir, folderName, variant);
      for (const partFile of SOURCE_FILES) {
        const base = (await snapshotsOf(variantDir, partFile)).filter((item) => item.kind === 'base').at(-1);
        const current = await readOrNull(path.join(variantDir, partFile));
        if (base === undefined || current === null) continue;
        const diff = diffLines(await readFile(base.file, 'utf8'), current);
        if (diff.some((item) => item.op !== ' ')) edits.push({ folderName, variant, partFile, baseName: base.name, diff });
      }
    }
  }
  return edits;
}

/** 変わった行だけを、記事と部分ごとに並べる */
export function formatEdits(edits) {
  if (edits.length === 0) return '手直しの記録はありません';
  return edits.map((edit) => {
    const lines = edit.diff.filter((item) => item.op !== ' ').map((item) => `${item.op} ${item.line}`);
    return `## ${edit.folderName}/${edit.variant}/${edit.partFile}(${edit.baseName} から)\n${lines.join('\n')}`;
  }).join('\n\n');
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const edits = await collectEdits(path.join(root, 'data', 'articles'), process.argv[2] ?? '');
  process.stdout.write(`${formatEdits(edits)}\n`);
}
