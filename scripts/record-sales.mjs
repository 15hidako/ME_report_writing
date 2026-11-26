// wakust の購入通知メールから、記事ごとの売上を data/sales に記録する。
// Gmail はスケジュールタスクの Claude が読み、本文を inbox.json に書く。読み取り・重複除去・保存はこのスクリプトが行う。
// 売上は公開禁止(投稿ガイドライン4-5)。data/ は gitignore 済みで、記録はこのPCの中だけに置く。
//
// 使い方:
//   node scripts/record-sales.mjs since <売上フォルダ>          Gmail を読み始める日(YYYY/MM/DD)。記録がなければ all
//   node scripts/record-sales.mjs record <売上フォルダ> [YYYY-MM-DD]  inbox.json を記録に足し、その日の報告を出す
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STORE_FILE = 'purchases.json';
export const INBOX_FILE = 'inbox.json';
const STORE_VERSION = 1;
/** 最後に記録した受付日の何日前から Gmail を読み直すか。届くのが遅れたメールと、日付の境目を拾う */
const LOOKBACK_DAYS = 3;
/** この時刻(日本時間)までに始まった実行は、前の日の報告にする。23:59 の実行が数分遅れて日付をまたぐため */
const REPORT_DAY_SHIFT_HOURS = 3;
const JST_OFFSET_HOURS = 9;
const HOUR_MS = 60 * 60 * 1000;

/** @typedef {{ messageId: string; receivedAt: string; articleId: string; articleUrl: string; title: string; price: number; points: number }} Purchase */
/** @typedef {{ messageId: string; body: string }} InboxMessage */
/** @typedef {{ messageId: string; reason: string }} Rejected */

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isMissing = (error) => error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** 「ラベル：値」の値を返す。値が次の行にある書き方(記事URL)にも対応する */
function field(lines, label) {
  const index = lines.findIndex((line) => line.startsWith(`${label}：`) || line.startsWith(`${label}:`));
  if (index === -1) return null;
  const inline = lines[index].slice(label.length + 1).trim();
  if (inline !== '') return inline;
  const next = lines.slice(index + 1).find((line) => line.trim() !== '');
  return next === undefined ? null : next.trim();
}

/** 「2026-11-27 01:12:44」を日本時間のISO文字列にする。存在しない日時なら null */
function toJstIso(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (match === null) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, hour - JST_OFFSET_HOURS, minute, second));
  const back = new Date(utc.getTime() + JST_OFFSET_HOURS * HOUR_MS);
  const same = back.getUTCFullYear() === year && back.getUTCMonth() === month - 1 && back.getUTCDate() === day
    && back.getUTCHours() === hour && back.getUTCMinutes() === minute && back.getUTCSeconds() === second;
  return same ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+09:00` : null;
}

/** wakust の記事URL(https://wakust.com/<ユーザーID>/<記事番号>/)から記事番号を返す */
function articleIdOf(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'wakust.com') return null;
  return /^\/[^/]+\/(\d+)\/?$/.exec(url.pathname)?.[1] ?? null;
}

/** 「1,000円」「1000pt」の数を返す */
function amountOf(text, unit) {
  const match = new RegExp(`^([\\d,]+)\\s*${unit}$`).exec(text ?? '');
  if (match === null) return null;
  const value = Number(match[1].replaceAll(',', ''));
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * 購入通知メール1通を読む。読めなければ理由を返し、推測で埋めない。
 * @param {InboxMessage} message
 * @returns {{ ok: true; purchase: Purchase } | { ok: false; reason: string }}
 */
export function parsePurchaseMail({ messageId, body }) {
  const lines = body.split(/\r?\n/).map((line) => line.trimEnd());
  const receivedText = field(lines, '受付日時');
  const receivedAt = receivedText === null ? null : toJstIso(receivedText);
  if (receivedAt === null) return { ok: false, reason: `受付日時が読めない(${receivedText ?? 'なし'})` };
  const title = field(lines, '記事タイトル');
  if (title === null) return { ok: false, reason: '記事タイトルがない' };
  const articleUrl = field(lines, '記事URL');
  const articleId = articleUrl === null ? null : articleIdOf(articleUrl);
  if (articleUrl === null || articleId === null) return { ok: false, reason: `記事URLがwakustの記事でない(${articleUrl ?? 'なし'})` };
  const price = amountOf(field(lines, 'サービス価格'), '円');
  if (price === null) return { ok: false, reason: 'サービス価格が読めない' };
  const points = amountOf(field(lines, '獲得ポイント'), 'pt');
  if (points === null) return { ok: false, reason: '獲得ポイントが読めない' };
  return { ok: true, purchase: { messageId, receivedAt, articleId, articleUrl, title, price, points } };
}

const byReceivedAt = (a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.messageId.localeCompare(b.messageId);

/**
 * 既にあるメッセージIDは足さない(先に記録した内容を残す)。
 * @param {readonly Purchase[]} existing
 * @param {readonly Purchase[]} incoming
 * @returns {{ purchases: Purchase[]; added: Purchase[] }}
 */
export function mergePurchases(existing, incoming) {
  const seen = new Set(existing.map((item) => item.messageId));
  const added = incoming.filter((item) => {
    if (seen.has(item.messageId)) return false;
    seen.add(item.messageId);
    return true;
  });
  return { purchases: [...existing, ...added].sort(byReceivedAt), added };
}

/**
 * Gmail の after: に渡す日付。記録がなければ null(全期間)。
 * @param {readonly Purchase[]} purchases
 */
export function searchSince(purchases) {
  if (purchases.length === 0) return null;
  const latest = purchases.map((item) => item.receivedAt.slice(0, 10)).sort().at(-1);
  const date = new Date(`${latest}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - LOOKBACK_DAYS);
  return date.toISOString().slice(0, 10).replaceAll('-', '/');
}

/** 実行時刻から、報告する日(日本時間の YYYY-MM-DD)を決める */
export function reportDate(now) {
  return new Date(now.getTime() + (JST_OFFSET_HOURS - REPORT_DAY_SHIFT_HOURS) * HOUR_MS).toISOString().slice(0, 10);
}

const yen = (value) => `${value.toLocaleString('en-US')}円`;
const total = (items) => items.reduce((sum, item) => sum + item.price, 0);

/** 記事ごとに件数と金額をまとめる。売上の多い順 */
function byArticle(items) {
  const groups = Map.groupBy(items, (item) => item.articleId);
  return [...groups.values()]
    .map((group) => ({ articleId: group[0].articleId, title: group.at(-1).title, count: group.length, amount: total(group) }))
    .sort((a, b) => b.amount - a.amount || a.articleId.localeCompare(b.articleId));
}

/**
 * 日次の報告文。金額は手数料を引く前のサービス価格。
 * @param {{ purchases: readonly Purchase[]; added: readonly Purchase[]; rejected: readonly Rejected[]; date: string }} input
 */
export function summarize({ purchases, added, rejected, date }) {
  const onDate = purchases.filter((item) => item.receivedAt.startsWith(date));
  const month = date.slice(0, 7);
  const inMonth = purchases.filter((item) => item.receivedAt.startsWith(month));
  const lines = onDate.length === 0
    ? [`${date}の売上: なし`]
    : [`${date}の売上: ${onDate.length}件 / ${yen(total(onDate))}`,
      ...byArticle(onDate).map((row) => `- ${row.title}(${row.articleId}): ${row.count}件 / ${yen(row.amount)}`)];
  lines.push(`${month}の累計: ${inMonth.length}件 / ${yen(total(inMonth))}(手数料前)`);
  const late = added.filter((item) => !item.receivedAt.startsWith(date));
  if (late.length > 0) {
    lines.push('', `${date}以外の日に新しく記録した分:`,
      ...late.map((item) => `- ${item.receivedAt.slice(0, 10)} ${item.title}(${item.articleId}): ${yen(item.price)}`));
  }
  if (rejected.length > 0) {
    lines.push('', '記録できなかったメール:', ...rejected.map((item) => `- ${item.messageId}: ${item.reason}`));
  }
  return lines.join('\n');
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} がJSONとして読めません: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function checkVersion(data, label) {
  if (!isObject(data) || data.version !== STORE_VERSION) throw new Error(`${label} の version が ${STORE_VERSION} ではありません`);
}

const STRING_FIELDS = ['messageId', 'articleId', 'articleUrl', 'title'];
const AMOUNT_FIELDS = ['price', 'points'];

/** 記録した受付日時(2026-11-27T01:12:44+09:00)が実在する日本時間か */
function isStoredReceivedAt(value) {
  const match = typeof value === 'string' ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})\+09:00$/.exec(value) : null;
  return match !== null && toJstIso(`${match[1]} ${match[2]}`) === value;
}

/** 記録の1件が保存した形のままか */
function isPurchase(item) {
  return isObject(item)
    && STRING_FIELDS.every((key) => typeof item[key] === 'string' && item[key] !== '')
    && AMOUNT_FIELDS.every((key) => Number.isSafeInteger(item[key]) && item[key] >= 0)
    && isStoredReceivedAt(item.receivedAt);
}

/** @returns {Purchase[]} */
export function parseStore(text) {
  const data = parseJson(text, STORE_FILE);
  checkVersion(data, STORE_FILE);
  if (!Array.isArray(data.purchases)) throw new Error(`${STORE_FILE} に purchases の配列がありません`);
  data.purchases.forEach((item, index) => {
    if (!isPurchase(item)) throw new Error(`${STORE_FILE} の purchases[${index}] の形が違います`);
  });
  return data.purchases;
}

/** YYYY-MM-DD が実在する日付か */
export const isCalendarDate = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text) && toJstIso(`${text} 00:00:00`) !== null;

/** @returns {InboxMessage[]} */
export function parseInbox(text) {
  const data = parseJson(text, INBOX_FILE);
  checkVersion(data, INBOX_FILE);
  if (!Array.isArray(data.messages)) throw new Error(`${INBOX_FILE} に messages の配列がありません`);
  data.messages.forEach((item, index) => {
    if (!isObject(item) || typeof item.messageId !== 'string' || item.messageId === '' || typeof item.body !== 'string') {
      throw new Error(`${INBOX_FILE} の messages[${index}] には messageId と body の文字列が要ります`);
    }
  });
  return data.messages.map(({ messageId, body }) => ({ messageId, body }));
}

async function loadStore(dir) {
  try {
    return parseStore(await readFile(path.join(dir, STORE_FILE), 'utf8'));
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

async function saveStore(dir, purchases) {
  const file = path.join(dir, STORE_FILE);
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ version: STORE_VERSION, purchases }, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}

/** 売上フォルダの記録から、Gmail を読み始める日を返す */
export async function sinceOf(dir) {
  return searchSince(await loadStore(dir));
}

/**
 * inbox.json を読み、読めた購入を記録に足す。記録が壊れていれば書き込まずに止める。
 * @returns {Promise<{ purchases: Purchase[]; added: Purchase[]; rejected: Rejected[] }>}
 */
export async function recordInbox(dir, date) {
  const existing = await loadStore(dir);
  let inboxText;
  try {
    inboxText = await readFile(path.join(dir, INBOX_FILE), 'utf8');
  } catch (error) {
    if (isMissing(error)) throw new Error(`${path.join(dir, INBOX_FILE)} がありません。先に Gmail の本文を書き出してください`);
    throw error;
  }
  const results = parseInbox(inboxText).map((message) => ({ messageId: message.messageId, result: parsePurchaseMail(message) }));
  const parsed = results.flatMap(({ result }) => (result.ok ? [result.purchase] : []));
  const rejected = results.flatMap(({ messageId, result }) => (result.ok ? [] : [{ messageId, reason: result.reason }]));
  const { purchases, added } = mergePurchases(existing, parsed);
  if (added.length > 0) await saveStore(dir, purchases);
  return { purchases, added, rejected, date };
}

async function main(args) {
  const [command, dir, dateArg] = args;
  if (dir === undefined || dir.trim() === '') throw new Error('売上フォルダを指定してください: node scripts/record-sales.mjs <since|record> <フォルダ>');
  if (command === 'since') return `${(await sinceOf(dir)) ?? 'all'}`;
  if (command === 'record') {
    if (dateArg !== undefined && !isCalendarDate(dateArg)) throw new Error(`日付は実在する YYYY-MM-DD で指定してください: ${dateArg}`);
    const date = dateArg ?? reportDate(new Date());
    const result = await recordInbox(dir, date);
    return `新しく記録: ${result.added.length}件\n${summarize(result)}`;
  }
  throw new Error(`知らないコマンドです: ${command ?? '(なし)'}。since か record を指定してください`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${await main(process.argv.slice(2))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
