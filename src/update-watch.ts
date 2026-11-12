import { BUILD_ID, fetchLatestBuildId, updateUrl } from './update-check';

export const RELOADED_FOR_KEY = 'me-report-writer/reloaded-for';

export interface UpdateWatchOptions {
  /** 入力や共有の途中なら true。勝手に読み込み直さず、ボタンを出す */
  readonly isBusy: () => boolean;
  /** ボタンを押したとき、破棄してよいかを確かめる */
  readonly confirmLeave: () => boolean;
  /** 読み込み直す直前に呼ぶ。離脱確認を重ねないために使う */
  readonly onLeave: () => void;
  readonly onError: (err: unknown) => void;
}

function applyUpdate(latest: string, options: UpdateWatchOptions): void {
  options.onLeave();
  sessionStorage.setItem(RELOADED_FOR_KEY, latest);
  location.replace(updateUrl(location.href, latest));
}

function offerUpdate(latest: string, options: UpdateWatchOptions): void {
  if (document.getElementById('update-app') !== null) return;
  const bar = document.createElement('div');
  bar.className = 'actions';
  bar.innerHTML = '<button type="button" id="update-app" class="primary">新しい版に更新</button>';
  bar.addEventListener('click', () => {
    if (options.confirmLeave()) applyUpdate(latest, options);
  });
  document.querySelector('header')?.append(bar);
}

/** 新しい版が公開されていれば読み込み直す。入力や共有の途中では勝手に読み込み直さず、ボタンを出す */
async function checkForUpdate(options: UpdateWatchOptions): Promise<void> {
  const latest = await fetchLatestBuildId();
  if (latest === null || latest === BUILD_ID) return;
  // 同じ版へ読み込み直しても古いままなら、繰り返さずボタンに任せる
  if (options.isBusy() || sessionStorage.getItem(RELOADED_FOR_KEY) === latest) offerUpdate(latest, options);
  else applyUpdate(latest, options);
}

export function watchForUpdate(options: UpdateWatchOptions): void {
  const check = (): void => {
    if (document.visibilityState !== 'visible') return;
    void checkForUpdate(options).catch(options.onError);
  };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('pageshow', check);
  check();
}
