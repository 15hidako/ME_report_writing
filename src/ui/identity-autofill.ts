import { IDENTITY_FIELDS, shopUrlFromProfile, suggestIdentity } from '../identity';
import type { IdentityValues } from '../identity';
import type { IdentityField, VisitRecord } from '../types';
import { isHttpUrl } from '../url';

export const IDENTITY_LABELS: Readonly<Record<IdentityField, string>> = {
  shopName: '店名', shopUrl: '店URL', therapistName: 'セラピスト名', therapistXUrl: 'X URL',
};

function candidatesFor(records: readonly VisitRecord[], url: string, excludeId: string | null): {
  readonly values: Partial<IdentityValues>; readonly seriesNo: number | null;
} {
  if (!isHttpUrl(url)) return { values: {}, seriesNo: null };
  const suggestion = suggestIdentity(records, url, excludeId ?? undefined);
  return {
    values: { shopUrl: shopUrlFromProfile(url) ?? '', ...suggestion.values },
    seriesNo: suggestion.sameTherapistSeriesNo,
  };
}

/** プロフィールURLの確定時に、店とセラピストの空欄を補完する。手入力の値は変えない */
export function bindIdentityAutofill(
  form: HTMLFormElement, records: readonly VisitRecord[], excludeId: string | null,
): void {
  const profile = form.elements.namedItem('therapistProfileUrl');
  const status = form.querySelector<HTMLElement>('#identity-status');
  if (!(profile instanceof HTMLInputElement) || status === null) {
    throw new Error('プロフィールURLの入力欄が見つかりません');
  }
  // 自動で入れた値を覚えておき、URLを直したときはその欄だけ入れ替える。
  const autofilled = new Map<IdentityField, string>();
  profile.addEventListener('change', () => {
    const { values, seriesNo } = candidatesFor(records, profile.value.trim(), excludeId);
    const filled: IdentityField[] = [];
    for (const field of IDENTITY_FIELDS) {
      const input = form.elements.namedItem(field);
      if (!(input instanceof HTMLInputElement)) continue;
      if (input.value.trim() !== '' && input.value !== autofilled.get(field)) {
        autofilled.delete(field);
        continue;
      }
      const next = values[field] ?? '';
      if (input.value === next) continue;
      input.value = next;
      if (next === '') {
        autofilled.delete(field);
      } else {
        autofilled.set(field, next);
        filled.push(field);
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const labels = filled.map((field) => IDENTITY_LABELS[field]).join('・');
    status.textContent = filled.length === 0 ? ''
      : `${seriesNo === null ? '' : `#${seriesNo} の記録から `}${labels} を補完しました`;
  });
}
