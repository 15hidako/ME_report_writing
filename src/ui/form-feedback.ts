import type { FormIssue } from '../form-validation';

export interface FormFeedback {
  show(issues: readonly FormIssue[]): void;
  showGeneral(message: string): void;
  clear(): void;
}

let feedbackId = 0;

export function bindFormFeedback(form: HTMLFormElement, validate: () => readonly FormIssue[]): FormFeedback {
  let attempted = false;
  let summary: HTMLElement | null = null;
  let currentIssues: readonly FormIssue[] = [];
  const markers = new Map<HTMLElement, { error: HTMLElement; invalid: string | null }>();
  const idPrefix = `form-error-${++feedbackId}`;

  function clearMarkers(): void {
    for (const [control, marker] of markers) {
      const describedBy = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== marker.error.id);
      if (describedBy.length) control.setAttribute('aria-describedby', describedBy.join(' '));
      else control.removeAttribute('aria-describedby');
      if (marker.invalid === null) control.removeAttribute('aria-invalid');
      else control.setAttribute('aria-invalid', marker.invalid);
      marker.error.remove();
    }
    markers.clear();
  }

  function findControl(name: string): HTMLElement | null {
    const control = form.elements.namedItem(name);
    return control instanceof HTMLElement ? control : null;
  }

  function getSummary(): HTMLElement {
    if (summary) return summary;
    summary = document.createElement('section');
    summary.className = 'form-errors';
    summary.tabIndex = -1;
    summary.setAttribute('role', 'alert');
    const actions = form.querySelector('.actions');
    if (actions) actions.before(summary);
    else form.append(summary);
    return summary;
  }

  function navigate(control: HTMLElement): void {
    for (let parent = control.parentElement; parent && parent !== form; parent = parent.parentElement) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
    }
    updateScrollOffset();
    control.focus({ preventScroll: true });
    (control.closest('.field') ?? control).scrollIntoView({ block: 'start' });
  }

  function updateScrollOffset(): void {
    const header = document.querySelector('body > header');
    form.style.setProperty('--form-header-offset', `${(header?.getBoundingClientRect().height ?? 0) + 12}px`);
  }

  function render(issues: readonly FormIssue[], focus: boolean): void {
    currentIssues = issues;
    clearMarkers();
    if (issues.length === 0) {
      summary?.remove();
      summary = null;
      return;
    }
    const container = getSummary();
    container.replaceChildren();
    const heading = document.createElement('h2');
    heading.id = `${idPrefix}-heading`;
    heading.textContent = `保存できません。${issues.length}項目を確認してください`;
    container.setAttribute('aria-labelledby', heading.id);
    const list = document.createElement('ul');
    issues.forEach((issue, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = issue.message;
      const control = findControl(issue.field);
      if (control) {
        button.addEventListener('click', () => navigate(control));
        if (!markers.has(control)) {
          const error = document.createElement('span');
          error.className = 'field-error';
          error.id = `${idPrefix}-${index}`;
          error.textContent = issue.message;
          control.insertAdjacentElement('afterend', error);
          markers.set(control, { error, invalid: control.getAttribute('aria-invalid') });
          control.setAttribute('aria-invalid', 'true');
          const existing = control.getAttribute('aria-describedby');
          control.setAttribute('aria-describedby', existing ? `${existing} ${error.id}` : error.id);
        }
      } else {
        button.disabled = true;
      }
      item.append(button);
      list.append(item);
    });
    container.append(heading, list);
    if (focus) {
      updateScrollOffset();
      container.focus({ preventScroll: true });
      container.scrollIntoView({ block: 'start' });
    }
  }

  function revalidate(event: Event): void {
    if (!attempted) return;
    // 選択に伴う入力欄の生成はchange時に完了するため、先行するinputでは検証しない。
    if (event.type === 'input' && event.target instanceof HTMLSelectElement) return;
    const issues = validate();
    if (issues.length !== currentIssues.length || issues.some((issue, index) => issue.field !== currentIssues[index]?.field || issue.message !== currentIssues[index]?.message)) {
      render(issues, false);
    }
  }
  form.addEventListener('input', revalidate);
  form.addEventListener('change', revalidate);

  return {
    show(issues) {
      attempted = true;
      render(issues, true);
    },
    showGeneral(message) {
      clearMarkers();
      attempted = false;
      currentIssues = [];
      const container = getSummary();
      container.replaceChildren();
      const text = document.createElement('p');
      text.id = `${idPrefix}-heading`;
      text.textContent = message;
      container.setAttribute('aria-labelledby', text.id);
      container.append(text);
      updateScrollOffset();
      container.focus({ preventScroll: true });
      container.scrollIntoView({ block: 'start' });
    },
    clear() {
      attempted = false;
      currentIssues = [];
      clearMarkers();
      summary?.remove();
      summary = null;
    },
  };
}
