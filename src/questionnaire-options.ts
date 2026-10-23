import type { FLOW_PHASES, Ratings } from './types';

export const CANDIDATE_LABELS = {
  "welcome_01": "笑顔で迎えられた",
  "welcome_07": "緊張がほぐれた",
  "photo_match_01": "写真とほぼ同じ印象",
  "photo_match_02": "写真より好印象",
  "photo_match_03": "写真とは雰囲気が違った",
  "photo_match_05": "体型の印象が違った",
  "photo_match_06": "写真だけでは判断できなかった",
  "conversation_style_02": "話題を広げてくれた",
  "conversation_style_03": "話しやすかった",
  "conversation_style_07": "一方的に話す印象",
  "conversation_style_08": "受け答えは短め",
  "conversation_fit_01": "会話が好みに合った",
  "conversation_fit_05": "会話量が多く感じた",
  "conversation_fit_06": "話題が合わなかった",
  "professionalism_02": "気配りがあった",
  "professionalism_06": "事務的に感じた",
  "assessment_06": "重点的にケアする部位の確認はなかった",
  "assessment_07": "相談内容が施術に反映された",
  "pressure_07": "自分には弱かった",
  "pressure_08": "強さはちょうどよかった",
  "pace_05": "単調に感じた",
  "technique_01": "手つきが慣れていた",
  "technique_03": "丁寧に流してくれた",
  "technique_06": "手つきに不慣れさがあった",
  "technique_07": "丁寧だが技術は普通",
  "technique_08": "自分の好みに合った",
  "focus_06": "手のひらまでケア",
  "method_05": "ストレッチあり",
  "aftercare_03": "見送りがあった",
  "booking_response_03": "所在地の連絡を催促した",
  "booking_flow_04": "入室後にコースの確認があった",
  "access_02": "駅から歩く距離があると感じた",
  "access_04": "場所を探して迷った",
  "welcome_03": "明るい応対だった",
  "welcome_05": "親しみやすい応対だった",
  "price_clarity_02": "入室後にコース・追加内容を確認して支払った",
  "price_clarity_05": "追加内容と料金の説明があった",
  "price_clarity_07": "追加内容や料金の説明が分かりにくかった",
  "upsell_01": "追加提案はなかった",
  "upsell_03": "有料追加を勧められた",
  "upsell_04": "追加を断った後も丁寧だった",
  "upsell_05": "追加提案を断りにくく感じた",
  "room_facility_01": "マットで施術",
  "room_facility_02": "ベッドで施術",
  "cleanliness_01": "部屋が清潔に感じられた",
  "cleanliness_04": "浴室の清掃が気になった",
  "comfort_03": "照明が控えめだった",
  "amenities_01": "入室後に飲み物が出された",
  "amenities_02": "終了後に飲み物があった",
  "amenities_05": "備品の選択について説明があった",
  "shower_05": "お湯が温まるまで待った",
  "shower_06": "浴室が狭く感じられた",
  "scent_03": "香水の香りがした",
  "scent_06": "香水の香りが強く感じられた",
  "appearance_02": "自然な雰囲気だった",
  "appearance_03": "華やかな雰囲気だった",
  "appearance_04": "落ち着いた雰囲気だった",
  "appearance_06": "スポーティーな印象だった",
  "conversation_amount_01": "会話が多かった",
  "conversation_amount_03": "施術中の会話は少なめだった",
  "conversation_amount_05": "場面によって会話量が変わった",
  "conversation_amount_06": "こちらから話題を振ることが多かった",
  "professionalism_05": "慣れた対応だった",
  "professionalism_07": "準備が慌ただしく感じられた",
  "assessment_05": "こちらから希望する部位を伝えた",
  "technique_05": "手順が一定だった",
  "focus_02": "背中を中心にケア",
  "focus_04": "ふくらはぎを中心にケア",
  "focus_08": "疲れた部位を重点的にケア",
  "method_02": "ドライマッサージ",
  "method_03": "オイルマッサージ",
  "pace_of_time_01": "施術時間は十分に感じられた",
  "pace_of_time_02": "施術前の準備時間が長く感じられた",
  "pace_of_time_03": "途中で準備待ちがあった",
  "pace_of_time_04": "後半の施術時間を短く感じた",
  "pace_of_time_05": "予約時間より早く終わった",
  "comfort_distance_01": "距離感が自分にちょうどよかった",
  "comfort_distance_02": "リラックスできた",
  "comfort_distance_03": "対面時に緊張した",
  "scope_confirmation_01": "対応範囲の説明があった",
  "scope_confirmation_02": "希望する施術部位を尋ねられた",
  "scope_confirmation_05": "断った施術手順は行われなかった",
  "aftercare_02": "帰り支度を急かされなかった",
  "satisfaction_05": "受付・案内が丁寧だった",
  "downside_07": "所在地や入口の案内が分かりにくかった",
  "value_03": "内容に対して割高に感じた",
  "comparison_03": "前回より物足りなく感じた"
} as const;

export type CandidateId = keyof typeof CANDIDATE_LABELS;

export interface CandidateGroup {
  readonly label: string;
  readonly hint?: string;
  readonly ids: readonly CandidateId[];
}

export const NOTE_SUGGESTIONS: Readonly<Partial<Record<keyof Ratings, readonly CandidateGroup[]>>> = {
  "face": [
    {
      "label": "写真との印象",
      "ids": [
        "photo_match_01",
        "photo_match_02",
        "photo_match_03",
        "photo_match_06"
      ]
    },
    {
      "label": "対面で受けた印象",
      "ids": [
        "appearance_02",
        "appearance_03",
        "appearance_04"
      ]
    }
  ],
  "style": [
    {
      "label": "写真との印象",
      "ids": [
        "photo_match_01",
        "photo_match_02",
        "photo_match_05",
        "photo_match_06"
      ]
    },
    {
      "label": "対面で受けた印象",
      "ids": [
        "appearance_06"
      ]
    }
  ],
  "service": [
    {
      "label": "話し方と働きかけ",
      "ids": [
        "conversation_style_02",
        "conversation_style_03",
        "conversation_style_07",
        "conversation_style_08"
      ]
    },
    {
      "label": "会話の量",
      "ids": [
        "conversation_amount_01",
        "conversation_amount_03",
        "conversation_amount_05",
        "conversation_amount_06"
      ]
    },
    {
      "label": "自分との相性",
      "hint": "応対が理由の印象を、この接客メモへ追加します。",
      "ids": [
        "conversation_fit_01",
        "conversation_fit_05",
        "conversation_fit_06",
        "comfort_distance_01",
        "comfort_distance_02"
      ]
    },
    {
      "label": "接客の受け止め方",
      "hint": "受付・案内の相手が別の場合は、実際の段階のメモに相手を添えて記録できます。",
      "ids": [
        "welcome_03",
        "welcome_05",
        "professionalism_02",
        "professionalism_05",
        "professionalism_06",
        "professionalism_07",
        "satisfaction_05"
      ]
    },
    {
      "label": "希望と追加提案への対応",
      "ids": [
        "scope_confirmation_05",
        "upsell_01",
        "upsell_04",
        "upsell_05"
      ]
    }
  ],
  "massage": [
    {
      "label": "希望と強さ",
      "ids": [
        "assessment_05",
        "scope_confirmation_02",
        "assessment_07",
        "assessment_06",
        "pressure_08",
        "pressure_07",
        "focus_08"
      ]
    },
    {
      "label": "手技の受け止め方",
      "ids": [
        "technique_01",
        "technique_03",
        "technique_05",
        "technique_06",
        "technique_07",
        "technique_08",
        "pace_05",
        "pace_of_time_01"
      ]
    },
    {
      "label": "施術による印象",
      "hint": "施術が理由の場合に追加します。接客の理由へは自動で複製しません。",
      "ids": [
        "comfort_distance_02"
      ]
    }
  ]
};

export const PHASE_SUGGESTIONS: Readonly<Partial<Record<keyof typeof FLOW_PHASES, readonly CandidateId[]>>> = {
  "meeting": [
    "welcome_01",
    "welcome_07",
    "booking_flow_04",
    "price_clarity_02",
    "price_clarity_05",
    "amenities_01",
    "upsell_03",
    "amenities_05",
    "scope_confirmation_01"
  ],
  "faceDown": [
    "price_clarity_05",
    "focus_06",
    "method_05",
    "room_facility_01",
    "room_facility_02",
    "focus_02",
    "focus_04",
    "method_02",
    "method_03",
    "pace_of_time_03",
    "upsell_03",
    "amenities_05",
    "scope_confirmation_01"
  ],
  "oilSp": [
    "price_clarity_05",
    "focus_06",
    "method_05",
    "room_facility_01",
    "room_facility_02",
    "focus_02",
    "focus_04",
    "method_02",
    "method_03",
    "pace_of_time_03",
    "upsell_03",
    "amenities_05",
    "scope_confirmation_01"
  ],
  "faceUp": [
    "price_clarity_05",
    "focus_06",
    "method_05",
    "room_facility_01",
    "room_facility_02",
    "focus_02",
    "focus_04",
    "method_02",
    "method_03",
    "pace_of_time_03",
    "upsell_03",
    "amenities_05",
    "scope_confirmation_01"
  ],
  "climax": [
    "price_clarity_05",
    "room_facility_01",
    "room_facility_02",
    "focus_02",
    "focus_04",
    "method_02",
    "method_03",
    "pace_of_time_03",
    "upsell_03",
    "amenities_05",
    "scope_confirmation_01"
  ],
  "after": [
    "aftercare_03",
    "aftercare_02",
    "amenities_02",
    "upsell_03",
    "amenities_05",
    "scope_confirmation_01"
  ]
};

export const PHASE_NOTE_SUGGESTIONS: Readonly<Partial<Record<keyof typeof FLOW_PHASES, readonly CandidateGroup[]>>> = {
  "meeting": [
    {
      "label": "この段階での印象",
      "hint": "この段階で気づいた内容だけを追加し、必要なら状況を書き足してください。",
      "ids": [
        "cleanliness_01",
        "comfort_03",
        "scent_03",
        "comfort_distance_02"
      ]
    },
    {
      "label": "対面・準備・案内",
      "hint": "受付・案内の相手や、待った状況は必要に応じて書き足してください。",
      "ids": [
        "pace_of_time_02",
        "comfort_distance_03",
        "satisfaction_05"
      ]
    }
  ],
  "faceDown": [
    {
      "label": "この段階での印象",
      "hint": "この段階で気づいた内容だけを追加し、必要なら状況を書き足してください。",
      "ids": [
        "cleanliness_01",
        "comfort_03",
        "scent_03",
        "comfort_distance_02"
      ]
    }
  ],
  "oilSp": [
    {
      "label": "この段階での印象",
      "hint": "この段階で気づいた内容だけを追加し、必要なら状況を書き足してください。",
      "ids": [
        "cleanliness_01",
        "comfort_03",
        "scent_03",
        "comfort_distance_02"
      ]
    }
  ],
  "faceUp": [
    {
      "label": "この段階での印象",
      "hint": "この段階で気づいた内容だけを追加し、必要なら状況を書き足してください。",
      "ids": [
        "cleanliness_01",
        "comfort_03",
        "scent_03",
        "comfort_distance_02"
      ]
    }
  ],
  "climax": [
    {
      "label": "この段階での印象",
      "hint": "この段階で気づいた内容だけを追加し、必要なら状況を書き足してください。",
      "ids": [
        "cleanliness_01",
        "comfort_03",
        "scent_03",
        "comfort_distance_02"
      ]
    }
  ],
  "after": [
    {
      "label": "この段階での印象",
      "hint": "この段階で気づいた内容だけを追加し、必要なら状況を書き足してください。",
      "ids": [
        "cleanliness_01",
        "comfort_03",
        "scent_03",
        "comfort_distance_02"
      ]
    }
  ]
};

export const DOWNSIDE_SUGGESTIONS: readonly CandidateGroup[] = [
  {
    "label": "連絡と案内",
    "ids": [
      "booking_response_03",
      "access_02",
      "access_04",
      "downside_07"
    ]
  },
  {
    "label": "説明と内容への納得",
    "hint": "前回との比較は、同じ担当者を自分が利用した記録と比べる場合に使います。",
    "ids": [
      "price_clarity_07",
      "value_03",
      "comparison_03"
    ]
  },
  {
    "label": "設備と香り",
    "hint": "自分が実際に使った場所で、気になった場合に追加します。",
    "ids": [
      "cleanliness_04",
      "shower_05",
      "shower_06",
      "scent_06"
    ]
  },
  {
    "label": "施術時間",
    "hint": "短く感じたことと、予約時間より早い終了は分けて記録してください。",
    "ids": [
      "pace_of_time_04",
      "pace_of_time_05"
    ]
  }
];
