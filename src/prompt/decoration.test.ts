import { describe, expect, it } from 'vitest';
import { DECORATION_PARTS, DECORATION_TAGS, decorationGuide } from './decoration';

const allowedTags = new Set([...DECORATION_TAGS.matchAll(/<([a-z0-9]+)/g)].map((match) => match[1]));

describe('装飾の部品(wakustで確かめた書き方だけ)', () => {
  const html = DECORATION_PARTS.map((part) => part.html).join('\n');

  it('部品は許可したタグだけで組む', () => {
    const used = [...html.matchAll(/<([a-z0-9]+)/g)].map((match) => match[1]);
    expect(used.filter((tag) => !allowedTags.has(tag))).toEqual([]);
  });

  it('削られる書き方とサイトのCSSに負ける書き方を使わない', () => {
    expect(html).not.toMatch(/<h3|<hr|<style|class=|rgba\(|letter-spacing/);
  });

  it('色は16進6桁で書く', () => {
    const colors = [...html.matchAll(/#[0-9a-zA-Z]+/g)].map((match) => match[0]);
    expect(colors.length).toBeGreaterThan(0);
    expect(colors.filter((color) => !/^#[0-9a-f]{6}$/.test(color))).toEqual([]);
  });

  it('彼女のセリフとクライマックスだけピンク、ほかの見出しは紺にする', () => {
    const byName = (name: string): string => DECORATION_PARTS.find((part) => part.name === name)?.html ?? '';
    expect(byName('彼女のセリフ')).toContain('#fdf0f4');
    expect(byName('クライマックスの見出し')).toContain('border-left: 5px solid #c2255c');
    expect(byName('見出し')).toContain('border-left: 5px solid #2b4a86');
    expect(byName('本編の見出し')).toContain('border-left: 5px solid #2b4a86');
  });

  it('カタログ記事とまとめ記事には体験談の構成に結びつく部品を入れない', () => {
    const guide = decorationGuide('list');
    expect(guide).toContain('- 見出し(');
    expect(guide).not.toContain('有料部分');
    expect(guide).not.toContain('クライマックス');
  });

  it('指示には全部品の見本と使えない書き方を入れる', () => {
    const guide = decorationGuide();
    for (const part of DECORATION_PARTS) expect(guide).toContain(part.html);
    expect(guide).toContain('<h3> と <hr> は使わない');
    expect(guide).toContain('<style> タグ、class 属性、rgba() は使わない');
  });
});
