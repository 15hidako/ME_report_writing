import type { Voice } from '../types';
import { REPEAT_LABELS } from '../types';
import { INNER_VOICE_SUGGESTIONS, SPEECH_TOPIC_LABELS, TITLE_HOOK_SUGGESTIONS } from '../voice-patterns';
import { chipGroup, esc } from './widgets';

function input(name: string, label: string, value: string): string {
  return `<label class="field"><span>${esc(label)}</span>
    <input name="${esc(name)}" type="text" value="${esc(value)}" /></label>`;
}

function suggestions(target: string, targetLabel: string, phrases: readonly string[]): string {
  return `<details class="candidate-details">
    <summary>表現の候補（${phrases.length}）</summary>
    <p>自分の実際の印象に合う場合だけ追加し、必要に応じて書き換えてください。</p>
    <div class="chips">${phrases.map((phrase) => `<button type="button" class="chip note-action"
      data-note-target="${esc(target)}" data-phrase="${esc(phrase)}"
      aria-label="${esc(`${phrase}を${targetLabel}へ追加`)}">${esc(phrase)}</button>`).join('')}</div>
    <p class="candidate-status" role="status" aria-live="polite"></p>
  </details>`;
}

export function renderVoiceFields(voice: Voice | undefined): string {
  const hasSpeech = voice?.herLines.some((line) => line.trim() !== '') ?? false;
  return `<h4>覚えている会話の話題（任意）</h4>
    <p class="field-hint">覚えている話題を選べます。実際の言葉は下の欄に入力できます。</p>
    ${chipGroup('speechTopics', Object.entries(SPEECH_TOPIC_LABELS).map(([value, label]) => ({ value, label })), voice?.speechTopics ?? [])}
    <details class="candidate-details" ${hasSpeech ? 'open' : ''}>
      <summary>覚えているセリフ（任意）</summary>
      <p>実際の言葉を覚えている場合だけ入力します。</p>
      ${input('herLine1', '彼女のセリフ 1', voice?.herLines[0] ?? '')}
      ${input('herLine2', '彼女のセリフ 2', voice?.herLines[1] ?? '')}
      ${input('herLine3', '彼女のセリフ 3', voice?.herLines[2] ?? '')}
    </details>
    ${input('inner1', '心の声・ツッコミ 1', voice?.innerVoice[0] ?? '')}
    ${input('inner2', '心の声・ツッコミ 2', voice?.innerVoice[1] ?? '')}
    ${suggestions('inner1', '心の声', INNER_VOICE_SUGGESTIONS)}
    ${input('titleHook', 'タイトル用フック一言', voice?.titleHook ?? '')}
    ${suggestions('titleHook', 'タイトル用フック', TITLE_HOOK_SUGGESTIONS)}
    <h4>リピート意向</h4>${chipGroup('repeatIntent', Object.entries(REPEAT_LABELS).map(([value, label]) => ({ value, label })), [voice?.repeatIntent ?? 'unsure'], false)}`;
}
