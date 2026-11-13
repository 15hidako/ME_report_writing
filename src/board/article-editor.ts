// 原稿を読む・直す画面。素の文章(title/tags/free-part.txt/paid-part.txt)だけを扱い、
// 投稿用HTMLは Claude がマークアップで書く(U-23)。文章は本人が決めるので、この画面は言葉を変えない。

import { SOURCE_PARTS, partSpec, type SourcePart } from '../prompt/article-files';
import { esc, toast } from '../ui/widgets';
import { errText } from '../guards';
import type { MarkupState } from './articles';
import type { PartText } from './local-api';

/**
 * 素の文章の記法(### 見出し、- 項目、空行で段落、段落内の改行)を読むための表示にする。
 * 文字はすべてエスケープし、リンクも作らない。投稿用のHTMLとは別物
 */
export function plainToReadingHtml(text: string): string {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/);
  return blocks.map((block) => {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    const out: string[] = [];
    let paragraph: string[] = [];
    let list: string[] = [];
    const flushParagraph = (): void => {
      if (paragraph.length > 0) out.push(`<p>${paragraph.map(esc).join('<br />')}</p>`);
      paragraph = [];
    };
    const flushList = (): void => {
      if (list.length > 0) out.push(`<ul>${list.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`);
      list = [];
    };
    for (const line of lines) {
      const heading = /^###\s+(.*)$/.exec(line);
      const item = /^-\s+(.*)$/.exec(line);
      if (heading !== null) {
        flushParagraph();
        flushList();
        out.push(`<h3>${esc(heading[1]!)}</h3>`);
      } else if (item !== null) {
        flushParagraph();
        list.push(item[1]!);
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushList();
    return out.join('');
  }).join('');
}

export type EditorMode = 'read' | 'edit';
export type SourceTexts = Readonly<Record<SourcePart, string>>;

const MARKUP_LABELS: Readonly<Record<MarkupState, string>> = {
  ready: 'マークアップ済み',
  stale: '直した文章はまだHTMLに入っていません',
  none: 'マークアップ前',
};

function readHtml(texts: SourceTexts): string {
  const tags = texts.tags.split(/[,、]/).map((tag) => tag.trim()).filter((tag) => tag !== '');
  return `
    <h2 class="article-title">${esc(texts.title.trim())}</h2>
    ${tags.length === 0 ? '' : `<ul class="article-tags">${tags.map((tag) => `<li>${esc(tag)}</li>`).join('')}</ul>`}
    <section class="article-part" aria-label="${partSpec('freeText').label}">${plainToReadingHtml(texts.freeText)}</section>
    <div class="article-paywall" role="separator">ここから有料</div>
    <section class="article-part" aria-label="${partSpec('paidText').label}">${plainToReadingHtml(texts.paidText)}</section>`;
}

/**
 * 入力欄に入れたときに見える文字。改行は LF にそろい、1行の入力欄(タグ)は改行が消える。
 * 開いただけで「変更あり」にならないよう、変更の有無はこの形どうしで比べる
 */
export function asShown(part: SourcePart, text: string): string {
  const lf = text.replace(/\r\n?/g, '\n');
  return part === 'tags' ? lf.replace(/\n/g, '') : lf;
}

/**
 * 入力欄は空で組み、中身は fillFields で入れる。textarea の中に書くと先頭の改行が読み飛ばされるため
 */
function editHtml(): string {
  const field = (part: SourcePart, control: string): string => `
    <label class="article-field" data-part="${part}"><span>${partSpec(part).label}</span>${control}</label>`;
  return `
    ${field('title', '<textarea name="title" rows="2" spellcheck="false"></textarea>')}
    ${field('tags', '<input name="tags" spellcheck="false" />')}
    ${field('freeText', '<textarea name="freeText" spellcheck="false"></textarea>')}
    <div class="article-paywall" role="separator">ここから有料</div>
    ${field('paidText', '<textarea name="paidText" spellcheck="false"></textarea>')}`;
}

function fillFields(root: ParentNode, texts: SourceTexts): void {
  for (const part of SOURCE_PARTS) {
    const field = root.querySelector<HTMLTextAreaElement | HTMLInputElement>(`[name="${part}"]`);
    if (field !== null) field.value = texts[part];
  }
}

export interface EditorView {
  readonly heading: string;
  readonly mode: EditorMode;
  readonly texts: SourceTexts;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly markup: MarkupState;
}

export function articleEditorHtml(view: EditorView): string {
  const tab = (mode: EditorMode, label: string): string =>
    `<button type="button" data-mode="${mode}" aria-pressed="${view.mode === mode}">${label}</button>`;
  return `
    <form method="dialog" class="article-form" data-mode="${view.mode}">
      <header class="article-head">
        <h2 class="article-heading">${esc(view.heading)}</h2>
        <div class="segmented" role="group" aria-label="表示">${tab('read', '読む')}${tab('edit', '直す')}</div>
        <button type="button" class="article-close" data-act="close" aria-label="閉じる">×</button>
      </header>
      <div class="article-body">${view.mode === 'read' ? readHtml(view.texts) : editHtml()}</div>
      <footer class="article-foot">
        <span class="article-status" data-markup="${view.markup}">${view.dirty ? '保存していない変更があります' : MARKUP_LABELS[view.markup]}</span>
        <button type="button" data-act="save"${view.dirty && !view.saving ? '' : ' disabled'}>${view.saving ? '保存中…' : '保存'}</button>
        <button type="button" class="primary" data-act="markup"${view.saving ? ' disabled' : ''}>${
          view.markup === 'ready' && !view.dirty ? 'マークアップし直す' : 'マークアップを依頼'}</button>
      </footer>
    </form>`;
}

export interface EditorDeps {
  readonly heading: string;
  /** 読む部分。素の文章がまだない部分は呼ばない */
  readonly exists: (part: SourcePart) => boolean;
  readonly fetchPart: (part: SourcePart) => Promise<PartText>;
  /** 書いたあとの更新時刻を返す */
  readonly savePart: (part: SourcePart, text: string, baseModifiedAt: number) => Promise<number>;
  /** いまのHTMLの状態。ボードが data/ を読み直すたびに変わる */
  readonly markup: () => MarkupState;
  /** 保存した文章のマークアップを Claude に頼む(プロンプトをコピーして Claude を開く) */
  readonly requestMarkup: () => Promise<void>;
  /** 保存したあと、ボードに data/ を読み直させる */
  readonly onSaved: () => void;
}

const EMPTY: SourceTexts = { title: '', tags: '', freeText: '', paidText: '' };

/**
 * 原稿を読み込んで画面を開く。開いたあとの操作はすべてこの中で扱う。
 * 戻り値の refresh は、ボードが data/ を読み直したときにHTMLの状態の表示を合わせる
 */
export async function openArticleEditor(dialog: HTMLDialogElement, deps: EditorDeps): Promise<{ refresh: () => void }> {
  const loaded = await Promise.all(SOURCE_PARTS.map(async (part): Promise<[SourcePart, PartText]> =>
    [part, deps.exists(part) ? await deps.fetchPart(part) : { text: '', modifiedAt: 0 }]));
  let saved: Record<SourcePart, PartText> = Object.fromEntries(loaded) as Record<SourcePart, PartText>;
  let texts: Record<SourcePart, string> = { ...EMPTY };
  for (const part of SOURCE_PARTS) texts[part] = asShown(part, saved[part].text);
  let mode: EditorMode = 'read';
  let saving = false;

  const changed = (part: SourcePart): boolean => texts[part] !== asShown(part, saved[part].text);
  const dirty = (): boolean => SOURCE_PARTS.some(changed);
  const render = (): void => {
    const focused = (document.activeElement as HTMLElement | null)?.getAttribute('name');
    const scroll = dialog.querySelector('.article-body')?.scrollTop ?? 0;
    dialog.innerHTML = articleEditorHtml({ heading: deps.heading, mode, texts, dirty: dirty(), saving, markup: deps.markup() });
    fillFields(dialog, texts);
    const body = dialog.querySelector('.article-body');
    if (body !== null) body.scrollTop = scroll;
    if (focused !== null && focused !== undefined) dialog.querySelector<HTMLElement>(`[name="${focused}"]`)?.focus({ preventScroll: true });
  };
  /** 入力のたびに全体を描き直すとカーソルが飛ぶので、足元の表示だけを合わせる */
  const renderFoot = (): void => {
    const status = dialog.querySelector<HTMLElement>('.article-status');
    const save = dialog.querySelector<HTMLButtonElement>('[data-act="save"]');
    const markup = dialog.querySelector<HTMLButtonElement>('[data-act="markup"]');
    const state = deps.markup();
    if (status !== null) {
      status.dataset['markup'] = state;
      status.textContent = dirty() ? '保存していない変更があります' : MARKUP_LABELS[state];
    }
    if (save !== null) {
      save.disabled = !dirty() || saving;
      save.textContent = saving ? '保存中…' : '保存';
    }
    if (markup !== null) {
      markup.disabled = saving;
      markup.textContent = state === 'ready' && !dirty() ? 'マークアップし直す' : 'マークアップを依頼';
    }
  };

  const save = async (): Promise<void> => {
    if (saving || !dirty()) return;
    saving = true;
    renderFoot();
    let wrote = false;
    try {
      const next = { ...saved };
      for (const part of SOURCE_PARTS) {
        if (!changed(part)) continue;
        const text = texts[part];
        const modifiedAt = await deps.savePart(part, text, saved[part].modifiedAt);
        next[part] = { text, modifiedAt };
        // 途中で失敗しても、書けた部分は保存済みとして扱う
        saved = { ...next };
        wrote = true;
      }
      toast('原稿を保存しました');
    } finally {
      saving = false;
      renderFoot();
      // 部分保存だけ成功したときも、古いHTMLのコピーを出したままにしない。
      if (wrote) deps.onSaved();
    }
  };

  const close = (): void => {
    if (saving) return;
    if (dirty() && !confirm('保存していない変更を破棄しますか?')) return;
    dialog.close();
  };

  const run = (action: () => Promise<void>): void => {
    void action().catch((error: unknown) => toast(errText(error)));
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const nextMode = target.closest<HTMLElement>('button[data-mode]')?.dataset['mode'];
    if (nextMode === 'read' || nextMode === 'edit') {
      if (nextMode !== mode) {
        mode = nextMode;
        render();
      }
      return;
    }
    const act = target.closest<HTMLElement>('button[data-act]')?.dataset['act'];
    if (act === 'close') close();
    else if (act === 'save') run(save);
    else if (act === 'markup') {
      run(async () => {
        await save();
        // 保存できなかった変更があるまま頼むと、直す前の文章がマークアップされる
        if (dirty()) return;
        await deps.requestMarkup();
      });
    }
  };
  const onInput = (event: Event): void => {
    const field = event.target as HTMLInputElement | HTMLTextAreaElement;
    const part = SOURCE_PARTS.find((item) => item === field.name);
    if (part === undefined) return;
    texts = { ...texts, [part]: field.value };
    renderFoot();
  };
  const onKey = (event: KeyboardEvent): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      run(save);
    }
  };
  // Esc でも未保存の変更を確かめる
  const onCancel = (event: Event): void => {
    event.preventDefault();
    close();
  };
  const onSubmit = (event: Event): void => { event.preventDefault(); };
  const onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!saving && !dirty()) return;
    event.preventDefault();
    event.returnValue = '';
  };

  dialog.classList.add('article-dialog');
  dialog.addEventListener('click', onClick);
  dialog.addEventListener('input', onInput);
  dialog.addEventListener('keydown', onKey);
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('submit', onSubmit);
  window.addEventListener('beforeunload', onBeforeUnload);
  dialog.addEventListener('close', () => {
    dialog.removeEventListener('click', onClick);
    dialog.removeEventListener('input', onInput);
    dialog.removeEventListener('keydown', onKey);
    dialog.removeEventListener('cancel', onCancel);
    dialog.removeEventListener('submit', onSubmit);
    window.removeEventListener('beforeunload', onBeforeUnload);
    dialog.classList.remove('article-dialog');
    dialog.innerHTML = '';
  }, { once: true });
  render();
  dialog.showModal();
  return { refresh: () => { if (dialog.open) renderFoot(); } };
}
