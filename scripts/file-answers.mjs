// ダウンロードフォルダに届いた回答JSON(me-report-*.json)を回答データフォルダへ移す。
//   node scripts/file-answers.mjs [回答データフォルダ] [ダウンロードフォルダ]
//   回答データフォルダを省くと PJ内の data/answers(gitignore済み)に移す。start.bat が起動時に呼ぶ。
// 実データは data/ の外へ出さず、リポジトリにも入れない。
// 移し先に同じ中身があるときは、ダウンロード側の重複を消す。訪問記録でないファイルには触らない。
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, realpath, rename, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { isAnswerFileName, looksLikeVisitRecords, planFiling } from '../src/answers/files.ts';

const sha256 =(bytes) => createHash('sha256').update(bytes).digest('hex');

function parseOrNull(bytes) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    return null;
  }
}

async function listJson(dir, filter) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && filter(entry.name)).map((entry) => entry.name);
}

/** ドライブが違うと rename できないので、そのときだけ複製してから消す */
async function moveFile(from, to) {
  try {
    await rename(from, to);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    await copyFile(from, to);
    await unlink(from);
  }
}

/** 引数がなければ PJ内の data/answers に移す */
function resolveDestDir() {
  const fromArg = process.argv[2];
  if (fromArg !== undefined && fromArg.trim() !== '') return fromArg;
  return path.join(import.meta.dirname, '..', 'data', 'answers');
}

async function main() {
  const destDir = resolveDestDir();
  const sourceDir = process.argv[3] ?? path.join(os.homedir(), 'Downloads');
  await mkdir(destDir, { recursive: true });
  // 同じフォルダだと全件が「重複」になり消えるので、実体のパスで比べる。Windows は大文字小文字を区別しない
  const canonical = async (dir) => {
    const real = await realpath(dir);
    return process.platform === 'win32' ? real.toLowerCase() : real;
  };
  if ((await canonical(destDir)) === (await canonical(sourceDir))) {
    throw new Error('回答データフォルダとダウンロードフォルダが同じです。');
  }

  const sources = await Promise.all(
    (await listJson(sourceDir, isAnswerFileName)).map(async (name) => {
      const bytes = await readFile(path.join(sourceDir, name));
      return { name, hash: sha256(bytes), isRecords: looksLikeVisitRecords(parseOrNull(bytes)) };
    }),
  );
  const stored = await Promise.all(
    (await listJson(destDir, (name) => name.toLowerCase().endsWith('.json'))).map(async (name) => ({
      name,
      hash: sha256(await readFile(path.join(destDir, name))),
    })),
  );

  const actions = planFiling(sources, stored);
  if (actions.length === 0) {
    console.log(`${sourceDir} に回答JSONはありません。`);
    return;
  }
  for (const action of actions) {
    const from = path.join(sourceDir, action.from);
    if (action.kind === 'move') {
      await moveFile(from, path.join(destDir, action.to));
      console.log(`移動: ${action.from} -> ${action.to}`);
    } else if (action.kind === 'duplicate') {
      await unlink(from);
      console.log(`重複を削除: ${action.from} (${action.sameAs} と同じ中身)`);
    } else {
      console.log(`そのまま: ${action.from} (${action.reason})`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
