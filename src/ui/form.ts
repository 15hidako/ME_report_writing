import type { BookingMethod, CupImpression, RepeatIntent, RoomType, SpeechTopic, TimeSlot, VisitOption, VisitRecord } from '../types';
import {
  BODY_LABELS, CUP_IMPRESSION_LABELS, FLOW_PHASES, GENRE_LABELS,
  RATING_LABELS, SPEC_NOTE_LABELS,
} from '../types';
import { localDate } from '../date';
import { chipGroup, chipValues, esc, starValue, starWidget } from './widgets';
import { renderDownsideSuggestions, renderFlowChecks, renderNoteSuggestions, renderPhaseNoteSuggestions } from './questionnaire-candidates';
import { MAX_OPTIONS, OPTION_TYPE_LABELS } from '../options';
import { renderVoiceFields } from './voice-patterns';

const COURSE_TIMES = [70, 80, 90, 100, 110, 120].map((minutes) => `${minutes}分`);
const COURSE_FEES = Array.from({ length: 21 }, (_, index) => 10000 + index * 1000);

function input(name: string, label: string, value = '', placeholder = '', type = 'text'): string {
  return `<label class="field"><span>${label}</span>
    <input name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" /></label>`;
}

function feeInput(name: string, label: string, value: number | null | undefined): string {
  return `<label class="field"><span>${label}(円・任意)</span>
    <input name="${name}" type="number" min="0" max="${Number.MAX_SAFE_INTEGER}" step="1" inputmode="numeric"
      value="${value === null || value === undefined ? '' : esc(String(value))}" placeholder="未確認は空欄、0円は0" /></label>`;
}

function courseFields(value: string): string {
  const other = value !== '' && !COURSE_TIMES.includes(value);
  return `<label class="field"><span>コース時間</span><select name="course" aria-controls="course-other-field">
    <option value="" ${value === '' ? 'selected' : ''}>未選択</option>
    ${COURSE_TIMES.map((time) => `<option value="${time}" ${value === time ? 'selected' : ''}>${time}</option>`).join('')}
    <option value="other" ${other ? 'selected' : ''}>その他</option>
  </select></label>
  <div id="course-other-field" ${other ? '' : 'hidden'}>
    <label class="field"><span>その他のコース時間</span>
      <input name="courseOther" type="text" value="${esc(other ? value : '')}" placeholder="例: 150分" ${other ? 'required' : 'disabled'} /></label>
  </div>`;
}

function courseFeeSelect(value: number | null | undefined): string {
  const selected = value === null || value === undefined ? '' : String(value);
  const legacy = value !== null && value !== undefined && !COURSE_FEES.includes(value);
  return `<label class="field"><span>コース代(円・任意)</span><select name="courseFee">
    <option value="" ${selected === '' ? 'selected' : ''}>未確認</option>
    ${COURSE_FEES.map((fee) => `<option value="${fee}" ${selected === String(fee) ? 'selected' : ''}>${fee.toLocaleString('ja-JP')}円</option>`).join('')}
    ${legacy ? `<option value="${esc(selected)}" selected>${esc(value.toLocaleString('ja-JP'))}円（既存の値）</option>` : ''}
  </select></label>`;
}

function optionItem(index: number, option?: VisitOption): string {
  const type = option?.type ?? '';
  const label = `オプション${index + 1}`;
  const custom = type !== '' && !Object.hasOwn(OPTION_TYPE_LABELS, type);
  return `<fieldset class="option-item" data-option-index="${index}">
    <legend>${label}</legend>
    <label class="field"><span>${label} 種類</span><select name="optionType_${index}">
      <option value="" ${type === '' ? 'selected' : ''}>未選択</option>
      ${Object.entries(OPTION_TYPE_LABELS).map(([value, text]) => `<option value="${value}" ${type === value ? 'selected' : ''}>${text}</option>`).join('')}
      ${custom ? `<option value="${esc(type)}" selected>${esc(type)}（保存済みの種類）</option>` : ''}
    </select></label>
    ${input(`optionDetail_${index}`, `${label} 種類詳細`, option?.detail ?? '', '衣装の内容、追加内容など')}
    ${feeInput(`optionPrice_${index}`, `${label} 価格`, option?.price)}
  </fieldset>`;
}

function optionFields(options: readonly VisitOption[] | undefined, legacy: string): string {
  const count = options === undefined ? '' : String(options.length);
  return `<label class="field"><span>オプションのタイプ数</span><select name="optionCount" aria-controls="option-fields">
    <option value="" ${count === '' ? 'selected' : ''}>未確認</option>
    ${Array.from({ length: MAX_OPTIONS + 1 }, (_, index) => `<option value="${index}" ${count === String(index) ? 'selected' : ''}>${index === 0 ? '0種類（なし）' : `${index}種類`}</option>`).join('')}
  </select></label>
  <div id="option-fields">${options?.map((option, index) => optionItem(index, option)).join('') ?? ''}</div>
  <p class="field-hint" id="option-count-status" role="status" aria-live="polite"></p>
  ${legacy === '' ? '<input type="hidden" name="optionSystem" value="" />' : `<details class="candidate-details">
    <summary>以前のオプション体系</summary>
    ${input('optionSystem', '保存済みの自由記述', legacy)}
  </details>`}`;
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
      <input name="note_${k}" aria-label="${RATING_LABELS[k]}の評価理由" placeholder="★の理由を一言" value="${esc(record?.ratings[k].note ?? '')}" />
      ${renderNoteSuggestions(k)}
    </div>`).join('');

  const flowRows = (Object.keys(FLOW_PHASES) as (keyof typeof FLOW_PHASES)[])
    .map((k) => {
      const def = FLOW_PHASES[k];
      const sel = record?.flow[k].checks ?? [];
      return `<div class="phase">
        <h4>${def.label}</h4>
        ${renderFlowChecks(k, sel)}
        <input name="flownote_${k}" aria-label="${def.label}のハイライトメモ" placeholder="ハイライトメモ(任意)" value="${esc(record?.flow[k].note ?? '')}" />
        ${renderPhaseNoteSuggestions(k)}
      </div>`;
    }).join('');

  return `<form id="visit-form" autocomplete="off">
  <p class="form-mode">${isEdit ? `編集中: #${record.seriesNo}` : revisitOf ? `再訪入力(初回: #${revisitOf.seriesNo} ${esc(revisitOf.basic.therapistName)})` : '新規入力'}</p>

  <details class="sec" ${isEdit || revisitOf ? '' : 'open'}>
    <summary>A. 基本情報(予約時に事前入力OK)</summary>
    ${input('visitDate', '訪問日', record?.basic.visitDate ?? localDate(), '', 'date')}
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
    ${courseFields(record?.basic.course ?? '')}
    ${courseFeeSelect(record?.basic.courseFee)}
    ${optionFields(record?.basic.options, b?.optionSystem ?? '')}
    ${input('optionChosen', '選択したオプション', record?.basic.optionChosen ?? '', '6K')}
    ${feeInput('optionFee', '今回のオプション代合計', record?.basic.optionFee)}
    ${feeInput('nominationFee', '指名料', record?.basic.nominationFee)}
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
    ${renderDownsideSuggestions()}
  </details>

  <details class="sec" open>
    <summary>E. 臨場感素材</summary>
    ${renderVoiceFields(record?.voice)}
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

export function bindCourseFields(root: HTMLElement, onChange: () => void): void {
  const course = root.querySelector<HTMLSelectElement>('select[name="course"]');
  const fee = root.querySelector<HTMLSelectElement>('select[name="courseFee"]');
  const otherField = root.querySelector<HTMLElement>('#course-other-field');
  const otherInput = root.querySelector<HTMLInputElement>('input[name="courseOther"]');
  if (course === null || fee === null || otherField === null || otherInput === null) {
    throw new Error('コースの入力欄が見つかりません');
  }
  for (const select of [course, fee]) {
    select.value = select.querySelector<HTMLOptionElement>('option[selected]')?.value ?? '';
  }
  const syncOther = (): void => {
    const active = course.value === 'other';
    otherField.hidden = !active;
    otherInput.disabled = !active;
    otherInput.required = active;
  };
  syncOther();
  course.addEventListener('change', () => {
    syncOther();
    onChange();
  });
  fee.addEventListener('change', onChange);
}

export function bindOptionFields(root: HTMLElement, onChange: () => void): void {
  const count = root.querySelector<HTMLSelectElement>('select[name="optionCount"]');
  const fields = root.querySelector<HTMLElement>('#option-fields');
  const status = root.querySelector<HTMLElement>('#option-count-status');
  if (count === null || fields === null || status === null) throw new Error('オプションの入力欄が見つかりません');
  for (const select of [count, ...fields.querySelectorAll<HTMLSelectElement>('select')]) {
    select.value = select.querySelector<HTMLOptionElement>('option[selected]')?.value ?? '';
  }
  const sync = (): void => {
    const active = optionCountValue(count.value) ?? 0;
    for (let index = fields.children.length; index < active; index++) {
      fields.insertAdjacentHTML('beforeend', optionItem(index));
    }
    for (const fieldset of fields.querySelectorAll<HTMLFieldSetElement>('[data-option-index]')) {
      const hidden = Number(fieldset.dataset.optionIndex) >= active;
      fieldset.hidden = hidden;
      fieldset.disabled = hidden;
    }
  };
  sync();
  root.addEventListener('change', (event) => {
    if (event.target === count) {
      sync();
      status.textContent = count.value === '' ? 'オプションのタイプ数は未確認です。' : `${count.value}種類の入力欄を表示しています。`;
      onChange();
    } else if (event.target instanceof HTMLSelectElement && fields.contains(event.target)) {
      onChange();
    }
  });
}

function optionCountValue(value: string): number | undefined {
  if (value === '') return undefined;
  const count = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(count) || count > MAX_OPTIONS) {
    throw new Error('オプションのタイプ数を選び直してください');
  }
  return count;
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

function feeValue(form: HTMLFormElement, name: string, label: string): number | null {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) throw new Error(`${label}の入力欄が見つかりません`);
  const raw = field.value.trim();
  const amount = raw === '' ? null : Number(raw);
  // 数値変換後だけでは小数が丸められて整数になるため、入力文字列も検証する。
  if (field.validity.badInput || (amount !== null && (!/^\d+$/.test(raw) || !Number.isSafeInteger(amount)))) {
    throw new Error(`${label}は0以上の整数の金額を円で入力してください`);
  }
  return amount;
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
  const pointsStr = val(form, 'points');
  const selectedCourse = val(form, 'course');
  const course = selectedCourse === 'other' ? val(form, 'courseOther') : selectedCourse;
  if (selectedCourse === 'other' && course === '') {
    throw new Error('その他のコース時間を入力してください');
  }
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
  const optionCount = optionCountValue(val(form, 'optionCount'));
  const options = optionCount === undefined ? undefined : Array.from({ length: optionCount }, (_, index) => ({
    type: val(form, `optionType_${index}`),
    detail: val(form, `optionDetail_${index}`),
    price: feeValue(form, `optionPrice_${index}`, `オプション${index + 1}の価格`),
  }));

  return {
    id: base.id,
    seriesNo: base.seriesNo,
    createdAt: base.createdAt,
    updatedAt: new Date().toISOString(),
    revisitOf: base.revisitOf,
    postedUrl: base.postedUrl,
    basic: {
      visitDate: val(form, 'visitDate') || localDate(),
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
      course,
      courseFee: feeValue(form, 'courseFee', 'コース代'),
      optionSystem: val(form, 'optionSystem'),
      ...(options === undefined ? {} : { options }),
      optionChosen: val(form, 'optionChosen'),
      optionFee: feeValue(form, 'optionFee', 'オプション代'),
      nominationFee: feeValue(form, 'nominationFee', '指名料'),
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
      speechTopics: chipValues(formRoot, 'speechTopics') as SpeechTopic[],
      herLines: [val(form, 'herLine1'), val(form, 'herLine2'), val(form, 'herLine3')].filter((l) => l !== ''),
      innerVoice: [val(form, 'inner1'), val(form, 'inner2')].filter((l) => l !== ''),
      titleHook: val(form, 'titleHook'),
      repeatIntent,
    },
    sales: {
      // 数値の 0 は未入力ではない。空だけ 100 にし、非数は検証側で落とす
      points: pointsStr === '' ? 100 : Number(pointsStr),
      articleType: base.revisitOf === null ? 'single' : 'revisit',
    },
  };
}
