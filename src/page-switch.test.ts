// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { bindPageSwitch, samePage } from './links';

describe('画面切替で開いているタブを保持する', () => {
  function setup(href: string | null = 'https://example.test/app/') {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<a href="https://example.test/app/" target="me-input" data-switch><span>入力画面</span></a>';
    const location = { href };
    const focus = vi.fn();
    const other = { location, focus } as unknown as WindowProxy;
    const open = vi.fn((): WindowProxy | null => other);
    bindPageSwitch(doc, open);
    const click = (options: MouseEventInit = {}) => {
      // happy-dom のリンク先取得を起こさず、クリックの判定と伝播を確かめる。
      const event = Object.assign(new Event('click', { bubbles: true, cancelable: true }), { button: 0, ...options });
      doc.querySelector('span')!.dispatchEvent(event);
      return event;
    };
    return { doc, location, focus, open, click };
  }

  it('同じ画面なら読み直さず前へ出す', () => {
    const { location, focus, open, click } = setup('https://example.test/app/index.html?tab=form');
    expect(click().defaultPrevented).toBe(true);
    expect(open).toHaveBeenCalledWith('', 'me-input');
    expect(focus).toHaveBeenCalledOnce();
    expect(location.href).toBe('https://example.test/app/index.html?tab=form');
  });

  it('初めて開くタブは目的の画面へ移動する', () => {
    const { location, click } = setup('about:blank');
    expect(click().defaultPrevented).toBe(true);
    expect(location.href).toBe('https://example.test/app/');
  });

  it('ポップアップが止められたときは通常のリンクに任せる', () => {
    const { open, click } = setup();
    open.mockReturnValue(null);
    expect(click().defaultPrevented).toBe(false);
  });

  it.each([{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }])(
    '修飾キーと中クリックは通常のリンクに任せる: %j', (options) => {
      const { open, click } = setup();
      expect(click(options).defaultPrevented).toBe(false);
      expect(open).not.toHaveBeenCalled();
    },
  );

  it('特定の回答を開くリンクは従来どおり移動する', () => {
    const { doc, open, click } = setup();
    const link = doc.querySelector('a')!;
    link.removeAttribute('data-switch');
    link.href = 'https://example.test/app/?edit=test';
    expect(click().defaultPrevented).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('別オリジンへ移ったタブにも目的の画面を開ける', () => {
    const { open, click } = setup();
    const location = { get href(): string { throw new DOMException('Blocked', 'SecurityError'); } };
    const other = { location, focus: vi.fn() } as unknown as WindowProxy;
    const setHref = vi.fn();
    Object.defineProperty(location, 'href', { get: () => { throw new DOMException('Blocked', 'SecurityError'); }, set: setHref });
    open.mockReturnValue(other);
    expect(click().defaultPrevented).toBe(true);
    expect(setHref).toHaveBeenCalledWith('https://example.test/app/');
  });

  it.each([null, 'about:blank', 'invalid', 'https://other.test/app/', 'https://example.test/board.html'])(
    '別の画面を再利用しない: %s', (href) => {
      expect(samePage(href, 'https://example.test/app/')).toBe(false);
    },
  );
});
