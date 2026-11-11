export function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 出勤確認日の入力を検証する。空欄は「確認していない」として null を返す。
 * 実在しない日付や別の書式は、記事に誤った日付を出さないよう拒否する。
 */
export function parseListingCheckDate(input: string): string | null {
  const value = input.trim();
  if (value === '') return null;
  const match = ISO_DATE.exec(value);
  const invalid = new Error(`出勤確認日はYYYY-MM-DDの実在する日付で入力してください: ${value}`);
  if (match === null) throw invalid;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw invalid;
  return value;
}

/** YYYY-MM-DD → 2026年11月3日 */
export function formatJapaneseDate(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate);
  if (match === null) throw new Error(`日付の書式が不正です: ${isoDate}`);
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`;
}
