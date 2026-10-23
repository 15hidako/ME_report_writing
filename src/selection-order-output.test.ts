import { describe, expect, it } from 'vitest';
import { buildMatomePrompt, buildRevisitPrompt, buildSinglePrompt } from './prompt/build-prompt';
import { serializeRecord } from './prompt/serialize';
import { VisitStore } from './storage';
import { MemoryStore, fixtureRecord } from './test-fixtures';
import { FLOW_PHASES, type Flow, type VisitRecord } from './types';

type PhaseKey = keyof Omit<Flow, 'bestMoment' | 'downside'>;
const phaseKeys = Object.keys(FLOW_PHASES) as PhaseKey[];

function recordWithReverseChecks(prefix: string, overrides: Partial<VisitRecord> = {}): VisitRecord {
  const base = fixtureRecord();
  const flow = { ...base.flow };
  for (const key of phaseKeys) {
    flow[key] = { checks: [`${prefix}-${key}-B`, `${prefix}-${key}-A`], note: '' };
  }
  return fixtureRecord({ flow, ...overrides });
}

function expectPhaseOrder(text: string, prefix: string): void {
  for (const key of phaseKeys) {
    const line = text.split('\n').find((part) => part.startsWith(`- ${FLOW_PHASES[key].label}: `));
    expect(line, `${prefix}: ${key} の観察行`).toBeDefined();
    expect(line).toContain(`${prefix}-${key}-B`);
    expect(line).toContain(`${prefix}-${key}-A`);
    expect(line!.indexOf(`${prefix}-${key}-B`)).toBeLessThan(line!.indexOf(`${prefix}-${key}-A`));
  }
}

function expectConservativePrompt(text: string): void {
  expect(text).toMatch(/入力.{0,4}保存.{0,8}(並び|順序)/);
  expect(text).toMatch(/旧記録.{0,12}押下順.{0,8}不明/);
  expect(text).toMatch(/実際.{0,12}(施術順|順序)/);
  expect(text).toMatch(/時刻/);
  expect(text).toMatch(/時間差/);
  expect(text).toMatch(/経過/);
  expect(text).toMatch(/出来事/);
  expect(text).toMatch(/補わ|推測|決めつけ/);
}

describe('観察候補の配列順と記事素材', () => {
  it('保存・再読込、JSON書出しと読込、バックアップ復元で旧値と空文字も含めて配列順を保つ', () => {
    const base = recordWithReverseChecks('保存');
    const checks = ['<旧候補 & 未知>', '', 'KP装着'];
    const record = { ...base, flow: { ...base.flow, meeting: { checks, note: '' } } };
    const store = new VisitStore(new MemoryStore());

    store.save(record);
    expect(store.get(record.id)?.flow.meeting.checks).toEqual(checks);
    for (const key of phaseKeys.filter((key) => key !== 'meeting')) {
      expect(store.loadAll()[0]?.flow[key].checks).toEqual(record.flow[key].checks);
    }

    const imported = new VisitStore(new MemoryStore());
    imported.importJson(store.exportJson());
    expect(imported.get(record.id)?.flow).toEqual(record.flow);

    imported.importJson('[]');
    expect(imported.loadAll()).toEqual([]);
    expect(imported.restoreBackup()[0]?.flow).toEqual(record.flow);
  });

  it('直列化では6段階を別々の配列順で渡し、並びの由来と限界を示す', () => {
    const text = serializeRecord(recordWithReverseChecks('直列化'));
    expectPhaseOrder(text, '直列化');
    expect(text).toMatch(/入力.{0,4}保存.{0,8}並び/);
    expect(text).toMatch(/旧記録.{0,12}押下順.{0,8}不明/);
    expect(text).toMatch(/実際.{0,12}順序/);
    expect(text).toMatch(/時刻/);
  });

  it('単体記事の素材では各段階の逆順を保ち、未記録の経過を補わせない', () => {
    const prompt = buildSinglePrompt(recordWithReverseChecks('単体'));
    expectPhaseOrder(prompt, '単体');
    expectConservativePrompt(prompt);
  });

  it('再訪記事の初回と今回の両方で、それぞれの段階の逆順を保つ', () => {
    const first = recordWithReverseChecks('初回', { postedUrl: 'https://wakust.com/u/first/' });
    const revisit = recordWithReverseChecks('再訪', {
      id: 'revisit', seriesNo: 2, revisitOf: first.id,
      sales: { points: 100, articleType: 'revisit' },
    });
    const prompt = buildRevisitPrompt(revisit, first);
    const [firstPart, currentPart] = prompt.split('### 今回(再訪)の訪問データ');
    expect(currentPart).toBeDefined();
    expectPhaseOrder(firstPart!, '初回');
    expectPhaseOrder(currentPart!, '再訪');
    expectConservativePrompt(prompt);
  });

  it('6人の投稿済み記事で解禁したまとめ記事に、各人の6段階の逆順を保つ', () => {
    const records = Array.from({ length: 6 }, (_, index) => recordWithReverseChecks(`まとめ${index}`, {
      id: `published-${index}`,
      seriesNo: index + 1,
      postedUrl: `https://wakust.com/u/${index}/`,
      basic: { ...fixtureRecord().basic, therapistName: `person-${index}` },
    }));
    const prompt = buildMatomePrompt(records, '順番の回帰確認');
    for (const [index, record] of records.entries()) {
      const start = prompt.indexOf(`### 訪問データ #${record.seriesNo}`);
      const end = index + 1 === records.length
        ? prompt.length
        : prompt.indexOf(`### 訪問データ #${records[index + 1]!.seriesNo}`);
      expect(start).toBeGreaterThanOrEqual(0);
      expectPhaseOrder(prompt.slice(start, end), `まとめ${index}`);
    }
    expectConservativePrompt(prompt);
  });
});
