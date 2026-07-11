// 小さなUI部品(星・チップ・トースト・クリップボード)

export function starWidget(name: string, value = 3): string {
  const btns = [1, 2, 3, 4, 5]
    .map((n) => `<button type="button" class="star${n <= value ? ' on' : ''}" data-n="${n}">★</button>`)
    .join('');
  return `<div class="stars" data-star="${name}" data-value="${value}">${btns}</div>`;
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
      b.classList.toggle('on', Number(b.getAttribute('data-n')) <= n);
    });
    onChange();
  });
}

export function chipGroup(name: string, items: readonly { value: string; label: string }[], selected: readonly string[] = [], multi = true): string {
  const chips = items
    .map(({ value, label }) => `<button type="button" class="chip${selected.includes(value) ? ' on' : ''}" data-value="${value}">${label}</button>`)
    .join('');
  return `<div class="chips" data-chips="${name}" data-multi="${multi ? '1' : '0'}">${chips}</div>`;
}

export function bindChips(root: HTMLElement, onChange: () => void): void {
  root.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest('button.chip');
    if (chip === null) return;
    const wrap = chip.closest<HTMLElement>('[data-chips]');
    if (wrap === null) return;
    if (wrap.getAttribute('data-multi') === '0') {
      const wasOn = chip.classList.contains('on');
      wrap.querySelectorAll('button.chip').forEach((c) => c.classList.remove('on'));
      if (!wasOn) chip.classList.add('on');
    } else {
      chip.classList.toggle('on');
    }
    onChange();
  });
}

export function chipValues(root: HTMLElement, name: string): string[] {
  const wrap = root.querySelector(`[data-chips="${name}"]`);
  if (wrap === null) return [];
  return [...wrap.querySelectorAll('button.chip.on')]
    .map((c) => c.getAttribute('data-value') ?? '')
    .filter((v) => v !== '');
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
  } catch {
    // クリップボードAPI不可の環境(非https等)向けフォールバック
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('コピーしました(fallback)');
  }
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
