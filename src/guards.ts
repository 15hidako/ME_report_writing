// 画面とデータの両方で使う小さな判定。src/checks/ は Node から直接読むため、ここを import しない

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 例外を利用者に見せる文にする */
export function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
