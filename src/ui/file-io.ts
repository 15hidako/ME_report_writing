/** 文字列をJSONファイルとしてダウンロードさせる */
export function downloadJson(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  try {
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** ファイルを選ばせる。選ばれなかったときは何もしない */
export function pickFile(accept: string, onFile: (file: File) => void): void {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file !== undefined) onFile(file);
  });
  input.click();
}
