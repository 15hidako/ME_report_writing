import type { VisitRecord } from './types';

export function fixtureRecord(overrides: Partial<VisitRecord> = {}): VisitRecord {
  return {
    id: 'test-id-1',
    seriesNo: 1,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    revisitOf: null,
    postedUrl: null,
    basic: {
      visitDate: '2026-07-01',
      timeSlot: 'evening',
      prefecture: '東京都',
      area: '恵比寿・中目黒',
      shopName: '天界のスパ',
      shopUrl: 'https://example.com/',
      therapistName: 'えりか',
      therapistProfileUrl: 'https://example.com/profile/1',
      therapistXUrl: 'https://x.com/example',
      age: 24,
      ageIsEstimate: true,
      course: '80分 18,000円',
      optionSystem: '3種類(4K・5K・6K)',
      optionChosen: '6K',
      nominationFee: 1000,
      roomType: 'mansion',
      bookingMethod: 'x_dm',
      evidenceSaved: true,
    },
    ratings: {
      face: { stars: 3, note: 'エキゾチック系' },
      style: { stars: 3, note: '小柄で引き締まった体' },
      service: { stars: 4, note: '丁寧かつフレンドリー' },
      massage: { stars: 4, note: '圧強めでしっかり効く' },
      ero: { stars: 4, note: 'KWKWテクが上手い' },
      tolerance: { stars: 2, note: 'ガードやや堅め' },
    },
    spec: {
      genre: ['gal'],
      body: ['petite'],
      cup: 'F',
      cupImpression: 'padded_suspect',
      notes: ['ex_menesu', 'tanned'],
      freeTags: ['オイル'],
    },
    flow: {
      meeting: { checks: ['KP装着', 'バスローブ'], note: '' },
      faceDown: { checks: ['指圧', '圧強め'], note: '本格派の腕前' },
      oilSp: { checks: ['SPPN', 'カエル足', 'BK'], note: 'ネイルがSKBをかすめる' },
      faceUp: { checks: ['またがり', 'ロック'], note: '' },
      climax: { checks: ['HJ', 'SKR'], note: 'マーメイド体勢から' },
      after: { checks: [], note: '' },
      bestMoment: 'マーメイド体勢からのHJで気持ち良すぎてあっという間だった',
      downside: '気分的にグッとくる感じは控えめ',
    },
    voice: {
      herLines: ['気持ちいいですか〜♡'],
      innerVoice: ['今は聞かないでくれ…'],
      titleHook: '元メンエス経験者のKWKWテクがヤバい',
      repeatIntent: 'yes',
    },
    sales: { points: 100, articleType: 'single' },
    ...overrides,
  };
}

export class MemoryStore {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}
