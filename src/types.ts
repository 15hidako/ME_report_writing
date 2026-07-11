// schema/visit-record.schema.json と1対1対応する型定義(真実源はスキーマ)

export type TimeSlot = 'morning' | 'afternoon' | 'evening' | 'night';
export type RoomType = 'mansion' | 'room' | 'other';
export type BookingMethod = 'x_dm' | 'line' | 'phone' | 'web';
export type Genre =
  | 'gal' | 'seiso' | 'oneesan' | 'imouto'
  | 'jukujo' | 'model' | 'genki' | 'cool';
export type BodyType = 'petite' | 'slender' | 'muchimuchi' | 'glamour' | 'tall';
export type SpecNote =
  | 'ex_menesu' | 'newbie' | 'just_joined' | 'tattoo' | 'nail' | 'tanned';
export type CupImpression = 'as_seen' | 'padded_suspect' | 'beyond_expectation';
export type RepeatIntent = 'definitely' | 'yes' | 'no' | 'unsure';
export type ArticleType = 'single' | 'revisit';

export interface Rating {
  readonly stars: 1 | 2 | 3 | 4 | 5;
  readonly note: string;
}

export interface Phase {
  readonly checks: readonly string[];
  readonly note: string;
}

export interface BasicInfo {
  readonly visitDate: string;
  readonly timeSlot: TimeSlot;
  readonly prefecture: string;
  readonly area: string;
  readonly shopName: string;
  readonly shopUrl: string;
  readonly therapistName: string;
  readonly therapistProfileUrl: string;
  readonly therapistXUrl: string;
  readonly age: number | null;
  readonly ageIsEstimate: boolean;
  readonly course: string;
  readonly optionSystem: string;
  readonly optionChosen: string;
  readonly nominationFee: number | null;
  readonly roomType: RoomType;
  readonly bookingMethod: BookingMethod;
  readonly evidenceSaved: boolean;
}

export interface Ratings {
  readonly face: Rating;
  readonly style: Rating;
  readonly service: Rating;
  readonly massage: Rating;
  readonly ero: Rating;
  readonly tolerance: Rating;
}

export interface Spec {
  readonly genre: readonly Genre[];
  readonly body: readonly BodyType[];
  readonly cup: string | null;
  readonly cupImpression: CupImpression | null;
  readonly notes: readonly SpecNote[];
  readonly freeTags: readonly string[];
}

export interface Flow {
  readonly meeting: Phase;
  readonly faceDown: Phase;
  readonly oilSp: Phase;
  readonly faceUp: Phase;
  readonly climax: Phase;
  readonly after: Phase;
  readonly bestMoment: string;
  readonly downside: string;
}

export interface Voice {
  readonly herLines: readonly string[];
  readonly innerVoice: readonly string[];
  readonly titleHook: string;
  readonly repeatIntent: RepeatIntent;
}

export interface Sales {
  readonly points: number;
  readonly articleType: ArticleType;
}

export interface VisitRecord {
  readonly id: string;
  readonly seriesNo: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revisitOf: string | null;
  readonly postedUrl: string | null;
  readonly basic: BasicInfo;
  readonly ratings: Ratings;
  readonly spec: Spec;
  readonly flow: Flow;
  readonly voice: Voice;
  readonly sales: Sales;
}

export const RATING_LABELS: Record<keyof Ratings, string> = {
  face: '顔',
  style: 'スタイル',
  service: '接客',
  massage: 'マッサージ技術',
  ero: 'エロ施術',
  tolerance: '寛容度',
};

export const GENRE_LABELS: Record<Genre, string> = {
  gal: 'ギャル', seiso: '清楚', oneesan: 'お姉さん', imouto: '妹系',
  jukujo: '熟女', model: 'モデル系', genki: '元気系', cool: 'クール',
};

export const BODY_LABELS: Record<BodyType, string> = {
  petite: '小柄', slender: 'スレンダー', muchimuchi: 'ムチムチ',
  glamour: 'グラマー', tall: '長身',
};

export const SPEC_NOTE_LABELS: Record<SpecNote, string> = {
  ex_menesu: '元メンエス経験者', newbie: '新人', just_joined: '入店したて',
  tattoo: 'タトゥー', nail: 'ネイル', tanned: '日焼け',
};

export const CUP_IMPRESSION_LABELS: Record<CupImpression, string> = {
  as_seen: '見た目通り', padded_suspect: '盛ってる疑惑',
  beyond_expectation: '期待以上',
};

export const REPEAT_LABELS: Record<RepeatIntent, string> = {
  definitely: 'リピ確', yes: 'あり', no: 'なし', unsure: '微妙',
};

export const FLOW_PHASES: Record<keyof Omit<Flow, 'bestMoment' | 'downside'>, { label: string; checks: readonly string[] }> = {
  meeting: {
    label: '対面〜シャワー',
    checks: ['KP装着', 'バスローブ', '私服対面', '会話が弾んだ'],
  },
  faceDown: {
    label: 'うつ伏せ前半',
    checks: ['指圧', 'パウダー', '圧強め', '圧弱め', '密着あり'],
  },
  oilSp: {
    label: 'オイル〜SP展開',
    checks: ['SPPN', 'MB等衣装', 'カエル足', 'TMアプローチ', 'BK', 'キワ攻め(KWKW)'],
  },
  faceUp: {
    label: '仰向け',
    checks: ['上半身ケア', 'またがり', 'ロック', '絶景'],
  },
  climax: {
    label: 'クライマックス',
    checks: ['HJ', 'SKR', '2回戦', '発展の気配'],
  },
  after: {
    label: 'その後',
    checks: ['シャワー', '会話', '次回営業トーク'],
  },
};
