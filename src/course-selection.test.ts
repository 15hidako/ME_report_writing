// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import * as formUI from './ui/form';
import { fixtureRecord } from './test-fixtures';
import type { VisitRecord } from './types';

function mount(record: VisitRecord | null = null): { root: HTMLElement; course: HTMLSelectElement } {
  const root = document.createElement('div');
  root.innerHTML = formUI.renderForm(record, null);
  const course = root.querySelector<HTMLSelectElement>('select[name="course"]');
  expect(course).not.toBeNull();
  return { root, course: course! };
}

function bind(root: HTMLElement, onChange = vi.fn()): ReturnType<typeof vi.fn> {
  formUI.bindCourseFields(root, onChange);
  return onChange;
}

function select(root: HTMLElement, name: string): HTMLSelectElement {
  const field = root.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
  expect(field).not.toBeNull();
  return field!;
}

function courseOther(root: HTMLElement): HTMLInputElement {
  const field = root.querySelector<HTMLInputElement>('input[name="courseOther"]');
  expect(field).not.toBeNull();
  return field!;
}

function collect(root: HTMLElement, record: VisitRecord): VisitRecord {
  return formUI.collectRecord(root, record);
}

describe('コースとコース代の選択', () => {
  it('新規入力ではコースが未選択で、コース代は未確認と1万円から3万円まで千円刻みで選べる', () => {
    const { root, course } = mount();
    expect([...course.options].map((option) => option.value)).toEqual([
      '', '70分', '80分', '90分', '100分', '110分', '120分', 'other',
    ]);
    const courseFee = select(root, 'courseFee');
    expect([...courseFee.options].map((option) => option.value)).toEqual([
      '', ...Array.from({ length: 21 }, (_, index) => String(10000 + index * 1000)),
    ]);
    bind(root);
    expect(course.value).toBe('');
    expect(courseFee.value).toBe('');
    const other = courseOther(root);
    expect(other.closest('[hidden]')).not.toBeNull();
    expect(other.disabled).toBe(true);
  });

  it('標準コースと定額の既存値を選択し、保存値を数値で保持する', () => {
    const base = fixtureRecord();
    const record = fixtureRecord({ basic: { ...base.basic, course: '90分', courseFee: 15000 } });
    const { root, course } = mount(record);
    bind(root);
    expect(course.value).toBe('90分');
    expect(select(root, 'courseFee').value).toBe('15000');
    expect(collect(root, record).basic).toMatchObject({ course: '90分', courseFee: 15000 });
  });

  it('標準コースからその他へ切り替えても自由入力を保持し、変更を通知する', () => {
    const base = fixtureRecord();
    const record = fixtureRecord({ basic: { ...base.basic, course: '特別90分コース' } });
    const { root, course } = mount(record);
    const onChange = bind(root);
    const other = courseOther(root);
    expect(course.value).toBe('other');
    expect(other.value).toBe('特別90分コース');
    expect(other.closest('[hidden]')).toBeNull();
    expect(other.disabled).toBe(false);
    expect(other.required).toBe(true);

    course.value = '80分';
    course.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(other.closest('[hidden]')).not.toBeNull();
    expect(other.disabled).toBe(true);
    expect(other.value).toBe('特別90分コース');
    expect(collect(root, record).basic.course).toBe('80分');

    course.value = 'other';
    course.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(other.closest('[hidden]')).toBeNull();
    expect(other.disabled).toBe(false);
    expect(other.required).toBe(true);
    expect(other.value).toBe('特別90分コース');
    expect(collect(root, record).basic.course).toBe('特別90分コース');
  });

  it('その他の自由入力をtrimして保存し、空欄は理由を示して拒否する', () => {
    const record = fixtureRecord();
    const { root, course } = mount(record);
    bind(root);
    expect(course.value).toBe('other');
    const other = courseOther(root);
    other.value = '  80分＋延長  ';
    expect(collect(root, record).basic.course).toBe('80分＋延長');
    other.value = '   ';
    expect(() => collect(root, record)).toThrow(/コース/);
  });

  it.each([['null', null], ['省略', undefined]] as const)(
    '旧記録の空コースと%sのコース代をそのまま扱う',
    (_label, amount) => {
      const base = fixtureRecord();
      const basic = { ...base.basic, course: '', ...(amount === undefined ? {} : { courseFee: amount }) };
      const record = fixtureRecord({ basic });
      const { root, course } = mount(record);
      bind(root);
      expect(course.value).toBe('');
      expect(select(root, 'courseFee').value).toBe('');
      expect(collect(root, record).basic).toMatchObject({ course: '', courseFee: null });
    },
  );

  it.each([0, 10500, 35000, Number.MAX_SAFE_INTEGER])(
    '過去のコース代 %s 円は専用選択肢を一つ追加して復元する',
    (amount) => {
      const base = fixtureRecord();
      const record = fixtureRecord({ basic: { ...base.basic, courseFee: amount } });
      const { root } = mount(record);
      bind(root);
      const fee = select(root, 'courseFee');
      const values = [...fee.options].map((option) => option.value);
      expect(values.filter((value) => value === String(amount))).toHaveLength(1);
      expect(values).toHaveLength(23);
      expect(fee.value).toBe(String(amount));
      expect(collect(root, record).basic.courseFee).toBe(amount);
    },
  );

  it('コース代の未確認と定額の選択を区別し、他の料金入力を維持する', () => {
    const base = fixtureRecord();
    const record = fixtureRecord({ basic: { ...base.basic, course: '70分', courseFee: null, optionFee: 0 } });
    const { root } = mount(record);
    const onChange = bind(root);
    const fee = select(root, 'courseFee');
    expect(fee.value).toBe('');
    fee.value = '30000';
    fee.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(collect(root, record).basic).toMatchObject({ courseFee: 30000, optionFee: 0, nominationFee: 1000 });
    fee.value = '';
    fee.dispatchEvent(new Event('change', { bubbles: true }));
    expect(collect(root, record).basic.courseFee).toBeNull();
  });
});
