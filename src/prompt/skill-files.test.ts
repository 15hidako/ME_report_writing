import { describe, expect, it } from 'vitest';
import { ARTICLE_SAVE_RULE } from './article-files';
import { ARTICLE_PREMISES, PLAIN_NOTATION, SINGLE_STRUCTURE } from './build-prompt';
import { decorationGuide } from './decoration';
import { MARKUP_RULES } from './markup-prompt';
import {
  ARTICLE_SKILL_NAME, BRIEF_LABELS, MARKUP_SKILL_NAME, STRUCTURE_SLOT_LABELS, articleSkill, markupSkill,
} from './skill-files';
import { STYLE_PROFILE, nameRule, wakustCommonRules } from './style-profile';

// SKILL.md は規則の TS から作る。ずれていれば失敗するので、`npx vitest run -u` で書き直す(docs/19 WP2)
describe('SKILL.md', () => {
  it('me-article は生成した内容と一致する', async () => {
    await expect(articleSkill()).toMatchFileSnapshot(`../../.claude/skills/${ARTICLE_SKILL_NAME}/SKILL.md`);
  });

  it('me-markup は生成した内容と一致する', async () => {
    await expect(markupSkill()).toMatchFileSnapshot(`../../.claude/skills/${MARKUP_SKILL_NAME}/SKILL.md`);
  });
});

describe('articleSkill', () => {
  const skill = articleSkill();

  it('記事によらない規則を全文プロンプトと同じ文で持つ', () => {
    for (const rule of [ARTICLE_PREMISES, STYLE_PROFILE, wakustCommonRules('article'), PLAIN_NOTATION, ARTICLE_SAVE_RULE]) {
      expect(skill).toContain(rule);
    }
    for (const line of SINGLE_STRUCTURE) {
      if (typeof line === 'string') expect(skill).toContain(line);
    }
  });

  it('販売型で変わる行は持たず、依頼文の見出しを指す', () => {
    expect(skill).not.toContain(nameRule('paid'));
    expect(skill).not.toContain(nameRule('free'));
    for (const label of [...Object.values(STRUCTURE_SLOT_LABELS), ...Object.values(BRIEF_LABELS)]) {
      expect(skill).toContain(`依頼文の「${label}」`);
    }
  });

  it('素の文章で書かせ、HTMLの装飾は持たない', () => {
    expect(skill).not.toContain(decorationGuide());
    expect(skill).not.toContain('無料部分HTML');
  });

  it('先頭は skill の frontmatter', () => {
    expect(skill.startsWith(`---\nname: ${ARTICLE_SKILL_NAME}\ndescription: `)).toBe(true);
  });
});

describe('markupSkill', () => {
  const skill = markupSkill();

  it('マークアップの規則と装飾を持ち、執筆の規則は持たない', () => {
    expect(skill).toContain(MARKUP_RULES);
    expect(skill).toContain(decorationGuide());
    expect(skill).not.toContain(STYLE_PROFILE);
  });

  it('先頭は skill の frontmatter', () => {
    expect(skill.startsWith(`---\nname: ${MARKUP_SKILL_NAME}\ndescription: `)).toBe(true);
  });
});
