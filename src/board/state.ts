import type { KeyValueStore } from '../storage';
import { parseCheckResults, type CheckResult } from '../checks/files';
import { isWakustArticleUrl } from '../prompt/publication';
import { isHttpUrl } from '../url';
import { isObject } from '../guards';

export const STAGES = ['answered', 'prompted', 'editing', 'posted'] as const;
export type Stage = (typeof STAGES)[number];
export type DraftStage = Exclude<Stage, 'posted'>;

export const BUNDLE_KINDS = ['matome', 'catalog'] as const;
export type BundleKind = (typeof BUNDLE_KINDS)[number];
export type ArticleKind = 'single' | 'revisit' | BundleKind;

/** 単体記事をどちらの型で売るか。名前を売るか、体験の中身を売るか */
export const ANGLES = ['therapist', 'experience'] as const;
export type ArticleAngle = (typeof ANGLES)[number];

/** 複数の回答から作る記事。単体と再訪は回答そのものが記事になるので、ここには持たない */
export interface BundleArticle {
  readonly id: string;
  readonly kind: BundleKind;
  readonly title: string;
  readonly recordIds: readonly string[];
  readonly stage: DraftStage;
  /** 投稿済みかどうかはこのURLの有無で決める */
  readonly postedUrl: string | null;
  readonly createdAt: string;
}

export interface BoardState {
  readonly version: 1;
  /** 回答ID → 投稿前の段階。投稿済みは回答の postedUrl から導く */
  readonly stages: Readonly<Record<string, DraftStage>>;
  /** 回答ID → 単体記事の販売型。未選択は持たない */
  readonly angles: Readonly<Record<string, ArticleAngle>>;
  readonly bundles: readonly BundleArticle[];
  /** 店のサイト(ホスト名) → 出勤表のURL */
  readonly scheduleUrls: Readonly<Record<string, string>>;
  readonly checks: readonly CheckResult[];
  /** プロフィールのページキー → 目視で確かめた確認結果の checkedAt */
  readonly acknowledged: Readonly<Record<string, string>>;
}

export const EMPTY_BOARD: BoardState = {
  version: 1, stages: {}, angles: {}, bundles: [], scheduleUrls: {}, checks: [], acknowledged: {},
};

const BOARD_KEY = 'me-report-writer/board/v1';
const DRAFT_STAGES: readonly string[] = STAGES.filter((stage) => stage !== 'posted');

function parseMap<T>(value: unknown, label: string, parse: (item: unknown) => T | undefined): Record<string, T> {
  if (!isObject(value)) throw new Error(`ボードの${label}が不正です`);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    const parsed = parse(item);
    if (parsed === undefined) throw new Error(`ボードの${label}に不正な値があります`);
    return [key, parsed];
  }));
}

function parseBundle(value: unknown, index: number): BundleArticle {
  const at = `ボードの記事${index + 1}件目`;
  if (!isObject(value)) throw new Error(`${at}が不正です`);
  const { id, kind, title, recordIds, stage, postedUrl, createdAt } = value;
  if (typeof id !== 'string' || id === '') throw new Error(`${at}のidが不正です`);
  if (kind !== 'matome' && kind !== 'catalog') throw new Error(`${at}の種類が不正です`);
  if (typeof title !== 'string' || title.trim() === '') throw new Error(`${at}のタイトルが不正です`);
  if (!Array.isArray(recordIds) || recordIds.some((item) => typeof item !== 'string')) throw new Error(`${at}の対象が不正です`);
  if (typeof stage !== 'string' || !DRAFT_STAGES.includes(stage)) throw new Error(`${at}の段階が不正です`);
  if (postedUrl !== null && (typeof postedUrl !== 'string' || !isWakustArticleUrl(postedUrl))) throw new Error(`${at}の投稿URLが不正です`);
  if (typeof createdAt !== 'string') throw new Error(`${at}の作成日時が不正です`);
  return { id, kind, title, recordIds: recordIds as string[], stage: stage as DraftStage, postedUrl, createdAt };
}

export function parseBoardState(json: string): BoardState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('ボードのJSON形式が不正です');
  }
  if (!isObject(parsed) || parsed.version !== 1) throw new Error('ボードの形式が違います(version 1 のみ対応)');
  if (!Array.isArray(parsed.bundles)) throw new Error('ボードの記事が配列ではありません');
  const bundles = parsed.bundles.map(parseBundle);
  if (new Set(bundles.map((bundle) => bundle.id)).size !== bundles.length) throw new Error('ボードの記事のidが重複しています');
  const text = (item: unknown): string | undefined => typeof item === 'string' ? item : undefined;
  return {
    version: 1,
    stages: parseMap(parsed.stages, '段階', (item) =>
      typeof item === 'string' && DRAFT_STAGES.includes(item) ? item as DraftStage : undefined),
    // 販売型を足す前の保存内容には項目がないため、空として読む
    angles: parseMap(parsed.angles ?? {}, '販売型', (item) =>
      ANGLES.find((type) => type === item)),
    bundles,
    scheduleUrls: parseMap(parsed.scheduleUrls, '出勤表URL', (item) =>
      typeof item === 'string' && isHttpUrl(item) ? item : undefined),
    checks: parseCheckResults(parsed.checks, 'ボードの確認結果'),
    acknowledged: parseMap(parsed.acknowledged, '確認済み', text),
  };
}

export class BoardStore {
  constructor(private readonly kv: KeyValueStore) {}

  load(): BoardState {
    const raw = this.kv.getItem(BOARD_KEY);
    if (raw === null) return EMPTY_BOARD;
    try {
      return parseBoardState(raw);
    } catch (error) {
      throw new Error('ボードの読み込みに失敗しました。保存(JSON)で元データを控えてから復旧してください', { cause: error });
    }
  }

  save(state: BoardState): BoardState {
    const validated = parseBoardState(JSON.stringify(state));
    try {
      this.kv.setItem(BOARD_KEY, JSON.stringify(validated));
    } catch (error) {
      throw new Error('ボードの保存に失敗しました。保存容量やブラウザの設定を確認してください', { cause: error });
    }
    return validated;
  }

  exportRawJson(): string {
    return this.kv.getItem(BOARD_KEY) ?? JSON.stringify(EMPTY_BOARD);
  }
}

function without<T>(map: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(map).filter(([name]) => name !== key));
}

export function setRecordStage(state: BoardState, recordId: string, stage: DraftStage): BoardState {
  // 既定の段階は保存しない。回答を消したあとに残る値を減らす
  const stages = stage === 'answered' ? without(state.stages, recordId) : { ...state.stages, [recordId]: stage };
  return { ...state, stages };
}

/** プロンプトを出した回答を「プロンプト出力」へ進める。すでに先の段階にある回答は変えない */
export function markPrompted(state: BoardState, recordId: string): BoardState {
  return state.stages[recordId] === undefined ? setRecordStage(state, recordId, 'prompted') : state;
}

export function setArticleAngle(state: BoardState, recordId: string, type: ArticleAngle | null): BoardState {
  const angles = type === null ? without(state.angles, recordId) : { ...state.angles, [recordId]: type };
  return { ...state, angles };
}

export function upsertBundle(state: BoardState, bundle: BundleArticle): BoardState {
  const exists = state.bundles.some((item) => item.id === bundle.id);
  const bundles = exists
    ? state.bundles.map((item) => item.id === bundle.id ? bundle : item)
    : [...state.bundles, bundle];
  return { ...state, bundles };
}

export function removeBundle(state: BoardState, id: string): BoardState {
  return { ...state, bundles: state.bundles.filter((bundle) => bundle.id !== id) };
}

export function setScheduleUrl(state: BoardState, site: string, url: string | null): BoardState {
  if (url !== null && !isHttpUrl(url)) throw new Error('出勤表のURLは http(s) で入力してください');
  const scheduleUrls = url === null ? without(state.scheduleUrls, site) : { ...state.scheduleUrls, [site]: url };
  return { ...state, scheduleUrls };
}

export function acknowledge(state: BoardState, profileKey: string, checkedAt: string): BoardState {
  return { ...state, acknowledged: { ...state.acknowledged, [profileKey]: checkedAt } };
}

export function withChecks(state: BoardState, checks: readonly CheckResult[]): BoardState {
  return { ...state, checks };
}
