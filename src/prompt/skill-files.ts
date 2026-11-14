// PCの記事ボードから Claude Code に書かせるときの skill(.claude/skills/*/SKILL.md)を、生成プロンプトと同じ規則から作る。
// skillには記事によらない規則だけを置き、販売型・出勤確認日・保存先・訪問データは記事ごとの依頼文で渡す(docs/19)。
// SKILL.md は skill-files.test.ts が書き出す。手で直さず、規則の TS を直して `npx vitest run -u` で作り直す。

import { ARTICLE_SAVE_RULE } from './article-files';
import {
  ARTICLE_PREMISES, outputFormat, renderStructure,
} from './build-prompt';
import { MARKUP_FILE_RULE, MARKUP_RULES, MARKUP_TASK } from './markup-prompt';
import { STYLE_PROFILE, wakustCommonRules } from './style-profile';
import {
  ARTICLE_SKILL_NAME, BRIEF_LABELS, MARKUP_SKILL_NAME, STRUCTURE_SLOT_LABELS,
} from './brief-labels';

const GENERATED_NOTE = '<!-- src/prompt/skill-files.ts から生成。直接編集しない。規則の TS を直して `npx vitest run -u` で作り直す -->';

const frontmatter = (name: string, description: string): string => `---
name: ${name}
description: ${description}
---`;

const briefItem = (label: string): string => `依頼文の「${label}」`;

/** 記事を素の文章で書き、原稿4ファイルを保存する skill */
export function articleSkill(): string {
  const structure = renderStructure((name) => `- (${briefItem(STRUCTURE_SLOT_LABELS[name])}の行をここに置く)`);
  const format = outputFormat({
    title: `${briefItem(BRIEF_LABELS.title)}の規則に従う`, lookup: 'brief', body: 'plain', decoration: 'article',
  });
  return `${frontmatter(ARTICLE_SKILL_NAME, '記事ボードの「プロンプト」で出した依頼文(1行目が /me-article)を受けて、wakustに投稿するメンズエステ体験談を素の文章で書き、data/articles の原稿4ファイルに保存する。依頼文がないときは使わない')}

${GENERATED_NOTE}

# 体験談記事を書く

あなたはメンズエステ体験レポートの専属ライターです。依頼文の訪問データだけを素材に、wakust投稿用の体験談記事(再訪のときは再訪レポート記事)を作成してください。
このskillは記事によらない規則です。販売型で変わる行、タイトルの規則、出勤確認、保存先、訪問データは依頼文にあります。

## 手順
1. 書く前に、${briefItem(BRIEF_LABELS.disclosure)}と「${BRIEF_LABELS.save}」のフォルダを一言で確かめる(体験内容起点は standard、セラピスト起点は names)。食い違っていたら書かずに知らせる
2. ${briefItem(BRIEF_LABELS.lookup)}があれば、記事を書く前に行う
3. ${briefItem(BRIEF_LABELS.revisit)}があれば再訪記事として、その指示を下の記事構成より先に読む
4. ${briefItem(BRIEF_LABELS.structure)}を下の記事構成の同じ名前の行に置き、下の規則で記事を書いて、「保存」に従って保存する

${ARTICLE_PREMISES}

${STYLE_PROFILE}

## wakust規約の遵守(生成時必須)
- 店名・源氏名の扱いは${briefItem(BRIEF_LABELS.nameRule)}に従う
${wakustCommonRules('article')}

${structure}

${format}

## 保存(Claude Code)
${ARTICLE_SAVE_RULE}
(次のファイルは、${briefItem(BRIEF_LABELS.save)}にある4ファイル)
`;
}

/** 本人が直した素の文章を、言葉を変えずに投稿用HTMLにする skill */
export function markupSkill(): string {
  return `${frontmatter(MARKUP_SKILL_NAME, '記事ボードの「マークアップを依頼」で出した依頼文(1行目が /me-markup)を受けて、本人が直した素の文章を、言葉を変えずにwakustの投稿欄へ貼るHTMLにする。依頼文がないときは使わない')}

${GENERATED_NOTE}

# 素の文章をHTMLにする

${MARKUP_TASK}

## ファイル(Claude Code)
${MARKUP_FILE_RULE}
(読む素の文章と矢印の先のファイルは、${briefItem(BRIEF_LABELS.save)}にある2組)

${MARKUP_RULES}
`;
}
