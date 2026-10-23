import type { SpeechTopic } from './types';

export const SPEECH_TOPIC_LABELS = {
  welcome: '出迎え・あいさつ',
  preference_check: '希望や強さの確認',
  conversation: '雑談・話題',
  aftercare: '帰り際の会話',
} as const satisfies Record<SpeechTopic, string>;

export const INNER_VOICE_SUGGESTIONS = [
  '少し緊張していた',
  '話しやすいと感じた',
  '静かに過ごしたかった',
  '気持ちが落ち着いた',
] as const;

export const TITLE_HOOK_SUGGESTIONS = [
  '写真に近い印象だった',
  '落ち着いた雰囲気が印象に残った',
  '会話が自分に合った',
  '丁寧な手技が印象に残った',
  '圧の強さがちょうどよかった',
  '帰り際の見送りが印象に残った',
] as const;
