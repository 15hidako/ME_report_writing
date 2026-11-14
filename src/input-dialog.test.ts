// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openInputDialog, type InputValues } from './ui/input-dialog';

const dialog = (): HTMLDialogElement | null => document.querySelector<HTMLDialogElement>('dialog.input-dialog');

function press(name: string): void {
  const match = [...dialog()!.querySelectorAll('button')].find((item) => item.textContent?.trim() === name);
  if (match === undefined) throw new Error(`button not found: ${name}`);
  match.click();
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('入力ダイアログ', () => {
  it('見出し・入力欄・初期値を出し、最初の入力欄にフォーカスする', () => {
    openInputDialog({
      title: '投稿URL',
      fields: [{ name: 'postedUrl', label: '記事URL', type: 'url', value: 'https://wakust.com/a' }],
      onSubmit: vi.fn(),
    });
    const node = dialog()!;
    expect(node.open).toBe(true);
    expect(node.querySelector('h2')?.textContent).toBe('投稿URL');
    expect(node.getAttribute('aria-labelledby')).toBe(node.querySelector('h2')?.id);
    const input = node.querySelector<HTMLInputElement>('input[name="postedUrl"]')!;
    expect(input.type).toBe('url');
    expect(input.value).toBe('https://wakust.com/a');
    expect(input.closest('label')?.textContent).toContain('記事URL');
    expect(document.activeElement).toBe(input);
  });

  it('日付欄は年を4桁までにし、4桁で月へ移れるようにする', () => {
    openInputDialog({ title: '出勤確認日', fields: [{ name: 'day', label: '日付', type: 'date' }], onSubmit: vi.fn() });
    expect(dialog()!.querySelector<HTMLInputElement>('input[name="day"]')!.max).toBe('9999-12-31');
  });

  it('「決定」で入力値を渡して閉じ、開いた要素へフォーカスを戻す', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const onSubmit = vi.fn((_values: InputValues) => undefined);
    openInputDialog({ title: '出勤確認日', fields: [{ name: 'day', label: '日付', type: 'date' }], onSubmit });
    dialog()!.querySelector('input')!.value = '2026-11-12';
    press('決定');
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]![0].text('day')).toBe('2026-11-12');
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('処理が Error を投げたら閉じずに理由を出し、入力を残す', () => {
    const onSubmit = vi.fn((): void => {
      throw new Error('wakust記事URLが必要です');
    });
    openInputDialog({ title: '投稿URL', fields: [{ name: 'url', label: 'URL', type: 'url' }], onSubmit });
    const input = dialog()!.querySelector('input')!;
    input.value = 'https://example.com/';
    press('決定');
    expect(dialog()?.open).toBe(true);
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toBe('wakust記事URLが必要です');
    expect(input.value).toBe('https://example.com/');
    onSubmit.mockImplementation(() => undefined);
    press('決定');
    expect(dialog()).toBeNull();
  });

  it('「キャンセル」では処理を呼ばずに閉じる', () => {
    const onSubmit = vi.fn();
    openInputDialog({ title: '投稿URL', fields: [{ name: 'url', label: 'URL', type: 'url' }], onSubmit });
    press('キャンセル');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it('入力欄で Enter を押すと決定と同じく送る', () => {
    const onSubmit = vi.fn((_values: InputValues) => undefined);
    openInputDialog({ title: '投稿URL', fields: [{ name: 'url', label: 'URL', type: 'url', value: 'x' }], onSubmit });
    dialog()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]![0].text('url')).toBe('x');
  });

  it('チェックの欄は選んだ値を選択肢の順で返し、文字の欄と並べて使える', () => {
    const onSubmit = vi.fn((_values: InputValues) => undefined);
    openInputDialog({
      title: 'まとめ記事',
      fields: [
        { name: 'targets', label: '対象', type: 'checks', options: [{ value: 'a', label: '#1' }, { value: 'b', label: '#2' }, { value: 'c', label: '#3' }] },
        { name: 'theme', label: 'テーマ', type: 'text' },
      ],
      onSubmit,
    });
    const boxes = [...dialog()!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.map((box) => box.closest('label')?.textContent)).toEqual(['#1', '#2', '#3']);
    expect(document.activeElement).toBe(boxes[0]);
    boxes[2]!.checked = true;
    boxes[0]!.checked = true;
    dialog()!.querySelector<HTMLInputElement>('input[name="theme"]')!.value = '寛容度★4';
    press('決定');
    const values = onSubmit.mock.calls[0]![0];
    expect(values.list('targets')).toEqual(['a', 'c']);
    expect(values.text('theme')).toBe('寛容度★4');
    expect(values.text('missing')).toBe('');
  });
});
