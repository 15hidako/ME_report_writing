import { describe, expect, it, vi } from 'vitest';
import { fetchLatestBuildId, parseBuildId, updateUrl } from './update-check';

function fetcher(response: Partial<Response> | Error): typeof fetch {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response as Response;
  });
}

describe('更新チェック', () => {
  it('公開中の版を、キャッシュを使わずに取得する', async () => {
    const fetchVersion = fetcher({ ok: true, json: async () => ({ buildId: 'abc' }) });
    expect(await fetchLatestBuildId(fetchVersion)).toBe('abc');
    expect(fetchVersion).toHaveBeenCalledWith(expect.stringMatching(/^\.\/version\.json\?t=\d+$/), { cache: 'no-store' });
  });

  it.each([
    ['オフライン', new TypeError('Failed to fetch')],
    ['version.json がない', { ok: false, status: 404 }],
  ])('%sときは確認できなかったとして null を返す', async (_label, response) => {
    expect(await fetchLatestBuildId(fetcher(response))).toBeNull();
  });

  it.each([[{}], [{ buildId: '' }], [{ buildId: 1 }], [null]])('不正な version.json %j は拒否する', (value) => {
    expect(() => parseBuildId(value)).toThrow('version.json');
  });

  it('再読み込み先のURLに版を付け、前回の版とハッシュは残さない', () => {
    expect(updateUrl('https://example.github.io/app/?v=old#x', 'new')).toBe('https://example.github.io/app/?v=new');
  });
});
