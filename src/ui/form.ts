import type { BookingMethod, CupImpression, RepeatIntent, RoomType, TimeSlot, VisitRecord } from '../types';
import {
  BODY_LABELS, CUP_IMPRESSION_LABELS, FLOW_PHASES, GENRE_LABELS,
  RATING_LABELS, REPEAT_LABELS, SPEC_NOTE_LABELS,
} from '../types';
import { chipGroup, chipValues, esc, starValue, starWidget } from './widgets';

const today = (): string => new Date().toISOString().slice(0, 10);

function input(name: string, label: string, value = '', placeholder = '', type = 'text'): string {
  return `<label class="field"><span>${label}</span>
    <input name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" /></label>`;
}

function textarea(name: string, label: string, value = '', placeholder = ''): string {
  return `<label class="field"><span>${label}</span>
    <textarea name="${name}" rows="2" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
}

/** 質問票フォームのHTMLを生成。existing=編集、prefill=再訪の事前入力 */
export function renderForm(record: VisitRecord | null, revisitOf: VisitRecord | null): string {
  const r = record ?? revisitOf; // 再訪時は初回の基本情報を引き継ぐ
  const b = r?.basic;
  const isEdit = record !== null;

  const ratingRows = (Object.keys(RATING_LABELS) as (keyof typeof RATING_LABELS)[])
    .map((k) => `<div class="rating-row">
      <span class="rating-label">${RATING_LABELS[k]}</span>
      ${starWidget(k, record?.ratings[k].stars ?? 3)}
      <input name="note_${k}" placeholder="★の理由を一言" value="${esc(record?.ratings[k].note ?? '')}" />
    </div>`).join('');

  const flowRows = (Object.keys(FLOW_PHASES) as (keyof typeof FLOW_PHASES)[])
    .map((k) => {
      const def = FLOW_PHASES[k];
      const sel = record?.flow[k].checks ?? [];
      return `<div class="phase">
        <h4>${def.label}</h4>
        ${chipGroup(`flow_${k}`, def.checks.map((c) => ({ value: c, label: c })), sel)}
        <input name="flownote_${k}" placeholder="ハイライトメモ(任意)" value="${esc(record?.flow[k].note ?? '')}" />
      </div>`;
    }).join('');

  return `<form id="visit-form" autocomplete="off">
  <p class="form-mode">${isEdit ? `編集中: #${record.seriesNo}` : revisitOf ? `再訪入力(初回: #${revisitOf.seriesNo} ${esc(revisitOf.basic.therapistName)})` : '新規入力'}</p>

  <details class="sec" ${isEdit || revisitOf ? '' : 'open'}>
    <summary>A. 基本情報(予約時に事前入力OK)</summary>
    ${input('visitDate', '訪問日', record?.basic.visitDate ?? today(), '', 'date')}
    <label class="field"><span>時間帯</span><select name="timeSlot">
      ${(['morning', 'afternoon', 'evening', 'night'] as TimeSlot[]).map((t) => `<option value="${t}" ${(record?.basic.timeSlot ?? 'evening') === t ? 'selected' : ''}>${{ morning: '午前', afternoon: '午後', evening: '夕方', night: '夜' }[t]}</option>`).join('')}
    </select></label>
    ${input('prefecture', '都道府県(wakustカテゴリー)', b?.prefecture ?? '', '東京都')}
    ${input('area', 'エリア(駅)', b?.area ?? '', '恵比寿・中目黒')}
    ${input('shopName', '店名(有料部でのみ開示)', b?.shopName ?? '')}
    ${input('shopUrl', '店URL', b?.shopUrl ?? '', 'https://')}
    ${input('therapistName', 'セラピスト名(有料部でのみ開示)', b?.therapistName ?? '')}
    ${input('therapistProfileUrl', 'プロフィールURL', b?.therapistProfileUrl ?? '', 'https://')}
    ${input('therapistXUrl', 'X URL(任意)', b?.therapistXUrl ?? '', 'https://x.com/')}
    <div class="row2">
      ${input('age', '年齢', b?.age === null || b === undefined ? '' : String(b.age), '', 'number')}
      <label class="check"><input type="checkbox" name="ageIsEstimate" ${b?.ageIsEstimate === false ? '' : 'checked'} /> 推定</label>
    </div>
    ${input('course', 'コース(時間・料金)', record?.basic.course ?? '', '80分 18,000円')}
    ${input('optionSystem', 'オプション体系', b?.optionSystem ?? '', '3種類(4K・5K・6K)')}
    ${input('optionChosen', '選択したオプション', record?.basic.optionChosen ?? '', '6K')}
    ${input('nominationFee', '指名料(任意)', record?.basic.nominationFee === null || record === null ? '' : String(record.basic.nominationFee), '', 'number')}
    <label class="field"><span>部屋タイプ</span><select name="roomType">
      ${(['mansion', 'room', 'other'] as RoomType[]).map((t) => `<option value="${t}" ${(b?.roomType ?? 'mansion') === t ? 'selected' : ''}>${{ mansion: 'マンション型', room: 'ルーム型', other: 'その他' }[t]}</option>`).join('')}
    </select></label>
    <label class="field"><span>予約方法</span><select name="bookingMethod">
      ${(['x_dm', 'line', 'phone', 'web'] as BookingMethod[]).map((t) => `<option value="${t}" ${(b?.bookingMethod ?? 'x_dm') === t ? 'selected' : ''}>${{ x_dm: 'X DM', line: 'LINE', phone: '電話', web: 'Web' }[t]}</option>`).join('')}
    </select></label>
    <label class="check important"><input type="checkbox" name="evidenceSaved" ${record?.basic.evidenceSaved ? 'checked' : ''} /> 予約スクショを保存した(規約2-1対策)</label>
  </details>

  <details class="sec" open>
    <summary>B. 評価6軸</summary>
    ${ratingRows}
  </details>

  <details class="sec" open>
    <summary>C. スペック/タグ</summary>
    <h4>系統</h4>${chipGroup('genre', Object.entries(GENRE_LABELS).map(([value, label]) => ({ value, label })), record?.spec.genre ?? [])}
    <h4>体型</h4>${chipGroup('body', Object.entries(BODY_LABELS).map(([value, label]) => ({ value, label })), record?.spec.body ?? [])}
    <h4>カップ(推定)</h4>${chipGroup('cup', 'ABCDEFGHIJ'.split('').map((c) => ({ value: c, label: c })), record?.spec.cup === null || record === null ? [] : [record.spec.cup], false)}
    ${chipGroup('cupImpression', Object.entries(CUP_IMPRESSION_LABELS).map(([value, label]) => ({ value, label })), record?.spec.cupImpression === null || record === null ? [] : [record.spec.cupImpression], false)}
    <h4>特記</h4>${chipGroup('specNotes', Object.entries(SPEC_NOTE_LABELS).map(([value, label]) => ({ value, label })), record?.spec.notes ?? [])}
    ${input('freeTags', '自由タグ(コンマ区切り)', record?.spec.freeTags.join(', ') ?? '')}
  </details>

  <details class="sec" open>
    <summary>D. 施術フロー</summary>
    ${flowRows}
    ${textarea('bestMoment', '一番良かった瞬間【必須】', record?.flow.bestMoment ?? '', '1〜2文で')}
    ${textarea('downside', '残念ポイント(正直に・任意)', record?.flow.downside ?? '')}
  </details>

  <details class="sec" open>
    <summary>E. 臨場感素材</summary>
    ${input('herLine1', '彼女のセリフ 1', record?.voice.herLines[0] ?? '', '「気持ちいいですか〜♡」')}
    ${input('herLine2', '彼女のセリフ 2', record?.voice.herLines[1] ?? '')}
    ${input('herLine3', '彼女のセリフ 3', record?.voice.herLines[2] ?? '')}
    ${input('inner1', '心の声・ツッコミ 1', record?.voice.innerVoice[0] ?? '', '(今は聞かないでくれ…)')}
    ${input('inner2', '心の声・ツッコミ 2', record?.voice.innerVoice[1] ?? '')}
    ${input('titleHook', 'タイトル用フック一言', record?.voice.titleHook ?? '', '元メンエス経験者のKWKWテクがヤバい')}
    <h4>リピート意向</h4>${chipGroup('repeatIntent', Object.entries(REPEAT_LABELS).map(([value, label]) => ({ value, label })), [record?.voice.repeatIntent ?? 'unsure'], false)}
  </details>

  <details class="sec">
    <summary>F. 販売設定</summary>
    ${input('points', '販売ポイント案', String(record?.sales.points ?? 100), '', 'number')}
  </details>

  <div class="actions">
    <button type="submit" class="primary">保存</button>
  </div>
</form>`;
}

function val(form: HTMLFormElement, name: string): string {
  const el = form.elements.namedItem(name);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return el.value.trim();
  }
  return '';
}

function checked(form: HTMLFormElement, name: string): boolean {
  const el = form.elements.namedItem(name);
  return el instanceof HTMLInputElement && el.checked;
}

const clampStars = (n: number): 1 | 2 | 3 | 4 | 5 =>
  (Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5);

/** フォームDOMから VisitRecord を構築 */
export function collectRecord(
  formRoot: HTMLElement,
  base: { id: string; seriesNo: number; createdAt: string; revisitOf: string | null; postedUrl: string | null },
): VisitRecord {
  const form = formRoot.querySelector<HTMLFormElement>('#visit-form');
  if (form === null) throw new Error('フォームが見つかりません');

  const ageStr = val(form, 'age');
  const nomStr = val(form, 'nominationFee');
  const bestMoment = val(form, 'bestMoment');
  if (bestMoment === '') throw new Error('「一番良かった瞬間」は必須です');
  if (val(form, 'prefecture') === '' || val(form, 'area') === '') {
    throw new Error('都道府県とエリアは必須です');
  }

  const rating = (k: string) => ({
    stars: clampStars(starValue(formRoot, k)),
    note: val(form, `note_${k}`),
  });
  const phase = (k: string) => ({
    checks: chipValues(formRoot, `flow_${k}`),
    note: val(form, `flownote_${k}`),
  });

  const cup = chipValues(formRoot, 'cup')[0] ?? null;
  const cupImpression = (chipValues(formRoot, 'cupImpression')[0] ?? null) as CupImpression | null;
  const repeatIntent = (chipValues(formRoot, 'repeatIntent')[0] ?? 'unsure') as RepeatIntent;

  return {
    id: base.id,
    seriesNo: base.seriesNo,
    createdAt: base.createdAt,
    updatedAt: new Date().toISOString(),
    revisitOf: base.revisitOf,
    postedUrl: base.postedUrl,
    basic: {
      visitDate: val(form, 'visitDate') || today(),
      timeSlot: (val(form, 'timeSlot') || 'evening') as TimeSlot,
      prefecture: val(form, 'prefecture'),
      area: val(form, 'area'),
      shopName: val(form, 'shopName'),
      shopUrl: val(form, 'shopUrl'),
      therapistName: val(form, 'therapistName'),
      therapistProfileUrl: val(form, 'therapistProfileUrl'),
      therapistXUrl: val(form, 'therapistXUrl'),
      age: ageStr === '' ? null : Number(ageStr),
      ageIsEstimate: checked(form, 'ageIsEstimate'),
      course: val(form, 'course'),
      optionSystem: val(form, 'optionSystem'),
      optionChosen: val(form, 'optionChosen'),
      nominationFee: nomStr === '' ? null : Number(nomStr),
      roomType: (val(form, 'roomType') || 'mansion') as RoomType,
      bookingMethod: (val(form, 'bookingMethod') || 'x_dm') as BookingMethod,
      evidenceSaved: checked(form, 'evidenceSaved'),
    },
    ratings: {
      face: rating('face'), style: rating('style'), service: rating('service'),
      massage: rating('massage'), ero: rating('ero'), tolerance: rating('tolerance'),
    },
    spec: {
      genre: chipValues(formRoot, 'genre') as VisitRecord['spec']['genre'][number][],
      body: chipValues(formRoot, 'body') as VisitRecord['spec']['body'][number][],
      cup,
      cupImpression,
      notes: chipValues(formRoot, 'specNotes') as VisitRecord['spec']['notes'][number][],
      freeTags: val(form, 'freeTags').split(',').map((t) => t.trim()).filter((t) => t !== ''),
    },
    flow: {
      meeting: phase('meeting'), faceDown: phase('faceDown'), oilSp: phase('oilSp'),
      faceUp: phase('faceUp'), climax: phase('climax'), after: phase('after'),
      bestMoment,
      downside: val(form, 'downside'),
    },
    voice: {
      herLines: [val(form, 'herLine1'), val(form, 'herLine2'), val(form, 'herLine3')].filter((l) => l !== ''),
      innerVoice: [val(form, 'inner1'), val(form, 'inner2')].filter((l) => l !== ''),
      titleHook: val(form, 'titleHook'),
      repeatIntent,
    },
    sales: {
      points: Number(val(form, 'points')) || 100,
      articleType: base.revisitOf === null ? 'single' : 'revisit',
    },
  };
}
