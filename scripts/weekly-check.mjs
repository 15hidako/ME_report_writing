// 週1回の在籍・出勤確認。ボードが書き出した targets.json を読み、結果を checks.json に書く。
//   node scripts/weekly-check.mjs <受け渡しフォルダ>
// 受け渡しフォルダはリポジトリの外に置く。確認対象のURLと結果をリポジトリへ入れない。
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseTargetsFile } from '../src/checks/files.ts';
import { judgeTarget } from '../src/checks/judge.ts';

const REQUEST_INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_BODY_BYTES = 3 * 1024 * 1024;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function localDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 日本の店舗サイトに残る Shift_JIS や EUC-JP を、ヘッダーかmetaの指定で読む */
function decodeBody(bytes, contentType) {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  const charset = fromHeader ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** @returns {Promise<import('../src/checks/judge.ts').PageOutcome>} */
async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; weekly-listing-check/1.0)', accept: 'text/html,*/*;q=0.8' },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES) return { ok: false, reason: 'ページが大きすぎる' };
    return {
      ok: true,
      status: response.status,
      finalUrl: response.url,
      html: decodeBody(bytes, response.headers.get('content-type')),
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return { ok: false, reason: timedOut ? 'タイムアウト' : '取得に失敗' };
  }
}

async function main() {
  const dir = process.argv[2];
  if (dir === undefined || dir.trim() === '') throw new Error('受け渡しフォルダを指定してください: node scripts/weekly-check.mjs <フォルダ>');
  const targetsPath = path.join(dir, 'targets.json');
  let json;
  try {
    json = await readFile(targetsPath, 'utf8');
  } catch (error) {
    throw new Error(`targets.json を読めません。ボードで同期してから実行してください: ${targetsPath}`, { cause: error });
  }
  const { targets } = parseTargetsFile(json);

  const schedules = new Map();
  let requested = false;
  const fetchPolitely = async (url) => {
    if (requested) await sleep(REQUEST_INTERVAL_MS);
    requested = true;
    return fetchPage(url);
  };

  const results = [];
  for (const target of targets) {
    const profile = await fetchPolitely(target.profileUrl);
    let schedule = null;
    if (target.scheduleUrl !== null) {
      if (!schedules.has(target.scheduleUrl)) schedules.set(target.scheduleUrl, await fetchPolitely(target.scheduleUrl));
      schedule = schedules.get(target.scheduleUrl);
    }
    const now = new Date();
    results.push(judgeTarget(target, profile, schedule, now.toISOString(), localDate(now)));
  }

  const checksPath = path.join(dir, 'checks.json');
  const tempPath = `${checksPath}.tmp`;
  await writeFile(tempPath, JSON.stringify({ version: 1, results }, null, 2), 'utf8');
  await rename(tempPath, checksPath);

  const count = (predicate) => results.filter(predicate).length;
  process.stdout.write([
    `確認 ${results.length}件`,
    `在籍なし ${count((r) => r.enrollment === 'absent')}`,
    `出勤なし ${count((r) => r.enrollment !== 'absent' && r.attendance === 'not_listed')}`,
    `要目視 ${count((r) => r.enrollment === 'unknown' || r.attendance === 'unknown')}`,
  ].join(' / ') + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
