// 小さなUI部品(星・チップ・トースト・クリップボード)

export function starWidget(name: string, value = 3): string {
  const btns = [1, 2, 3, 4, 5]
    .map((n) => {
      const on = n <= value;
      const label = `${n}つ星`;
      return `<button type="button" class="star${on ? ' on' : ''}" data-n="${esc(String(n))}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${esc(label)}">★</button>`;
    })
    .join('');
  return `<div class="stars" data-star="${esc(name)}" data-value="${esc(String(value))}">${btns}</div>`;
}

export function bindStars(root: HTMLElement, onChange: () => void): void {
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button.star');
    if (btn === null) return;
    const wrap = btn.closest<HTMLElement>('[data-star]');
    if (wrap === null) return;
    const n = Number(btn.getAttribute('data-n'));
    wrap.setAttribute('data-value', String(n));
    wrap.querySelectorAll('button.star').forEach((b) => {
      const pressed = Number(b.getAttribute('data-n')) <= n;
      b.classList.toggle('on', pressed);
      b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    });
    onChange();
  });
}

export function chipButton(item: { value: string; label: string; candidateId?: string }, selected = false): string {
  const candidate = item.candidateId === undefined ? '' : ` data-candidate="${esc(item.candidateId)}"`;
  return `<button type="button" class="chip${selected ? ' on' : ''}" data-value="${esc(item.value)}"${candidate} aria-pressed="${selected ? 'true' : 'false'}">${esc(item.label)}</button>`;
}

export function chipGroup(name: string, items: readonly { value: string; label: string }[], selected: readonly string[] = [], multi = true): string {
  const chips = items
    .map((item) => chipButton(item, selected.includes(item.value)))
    .join('');
  return `<div class="chips" data-chips="${esc(name)}" data-multi="${multi ? '1' : '0'}">${chips}</div>`;
}

export function chipOrderItems(values: readonly string[]): string {
  return values.map((value) => `<li>${esc(value === '' ? '（空の保存値）' : value)}</li>`).join('');
}

export function bindChips(root: HTMLElement, onChange: () => void): void {
  root.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('button.chip');
    if (chip === null) return;
    const wrap = chip.closest<HTMLElement>('[data-chips]');
    if (wrap === null) return;
    if (wrap.getAttribute('data-multi') === '0') {
      const wasOn = chip.classList.contains('on');
      wrap.querySelectorAll('button.chip').forEach((c) => {
        c.classList.remove('on');
        c.setAttribute('aria-pressed', 'false');
      });
      if (!wasOn) {
        chip.classList.add('on');
        chip.setAttribute('aria-pressed', 'true');
      }
    } else {
      const pressed = chip.classList.toggle('on');
      chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    }
    const order = wrap.getAttribute('data-selection-order');
    const value = chip.getAttribute('data-value');
    if (order !== null && value !== null) {
      const selected = JSON.parse(order) as string[];
      const next = chip.classList.contains('on')
        ? [...selected, value]
        : selected.filter((item) => item !== value);
      wrap.setAttribute('data-selection-order', JSON.stringify(next));
      const display = wrap.querySelector<HTMLElement>('.selection-order');
      const list = display?.querySelector('ol');
      if (display && list) {
        list.innerHTML = chipOrderItems(next);
        display.hidden = next.length === 0;
      }
    }
    onChange();
  });
}

export function chipValues(root: HTMLElement, name: string): string[] {
  const wrap = root.querySelector(`[data-chips="${name}"]`);
  if (wrap === null) return [];
  const order = wrap.getAttribute('data-selection-order');
  if (order !== null) return JSON.parse(order) as string[];
  return [...wrap.querySelectorAll('button.chip.on')]
    .flatMap((c) => {
      const value = c.getAttribute('data-value');
      return value === null ? [] : [value];
    });
}

export function starValue(root: HTMLElement, name: string): number {
  const el = root.querySelector(`[data-star="${name}"]`);
  return el === null ? 3 : Number(el.getAttribute('data-value'));
}

export function toast(message: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2200);
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('コピーしました');
    return;
  } catch {
    // クリップボードAPI不可の環境(非https等)向けフォールバック
  }

  let ta: HTMLTextAreaElement | undefined;
  let copied = false;
  try {
    ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    if (ta !== undefined) ta.remove();
  }
  toast(copied ? 'コピーしました(fallback)' : 'コピーに失敗しました');
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
