import { describe, expect, it } from 'vitest';
import { folderNameOf } from './local-setup';

describe('保存先の末尾のフォルダ名', () => {
  it.each([
    ['C:\\a\\b\\', 'b'],
    ['C:\\a\\b', 'b'],
    ['/a/b', 'b'],
    ['/a/b//', 'b'],
    ['C:/a/b', 'b'],
    ['C:\\a/原稿 フォルダ', '原稿 フォルダ'],
  ])('%s → %s', (path, name) => {
    expect(folderNameOf(path)).toBe(name);
  });

  it.each(['/', 'C:\\', 'C:/'])('フォルダ名のないルート %s は空文字にする', (path) => {
    expect(folderNameOf(path)).toBe('');
  });
});
