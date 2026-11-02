import type { VisitRecord } from '../types';
import { parseVisitRecords } from '../record-validation';

function syntheticRecord(): VisitRecord {
  const now = new Date().toISOString();
  return {
    id: 'slack-share-test',
    seriesNo: 1,
    createdAt: now,
    updatedAt: now,
    revisitOf: null,
    postedUrl: null,
    basic: {
      visitDate: now.slice(0, 10),
      timeSlot: 'evening',
      prefecture: '東京都',
      area: '共有テスト用エリア',
      shopName: '共有テスト用の架空店舗',
      shopUrl: '',
      therapistName: '共有テスト用の架空人物',
      therapistProfileUrl: '',
      therapistXUrl: '',
      age: null,
      ageIsEstimate: false,
      course: '',
      courseFee: null,
      optionSystem: '',
      options: [],
      optionChosen: '',
      optionFee: null,
      nominationFee: null,
      roomType: 'other',
      bookingMethod: 'web',
      evidenceSaved: false,
    },
    ratings: {
      face: { stars: 3, note: '' },
      style: { stars: 3, note: '' },
      service: { stars: 3, note: '' },
      massage: { stars: 3, note: '' },
      ero: { stars: 3, note: '' },
      tolerance: { stars: 3, note: '' },
    },
    spec: { genre: [], body: [], cup: null, cupImpression: null, notes: [], freeTags: [] },
    flow: {
      meeting: { checks: [], note: '' },
      faceDown: { checks: [], note: '' },
      oilSp: { checks: [], note: '' },
      faceUp: { checks: [], note: '' },
      climax: { checks: [], note: '' },
      after: { checks: [], note: '' },
      bestMoment: 'Slack共有テスト用の合成回答です。実際の訪問記録ではありません。',
      downside: '',
    },
    voice: { speechTopics: [], herLines: [], innerVoice: [], titleHook: '', repeatIntent: 'unsure' },
    sales: { points: 100, articleType: 'single' },
  };
}

export function renderShareProbe(): string {
  return `<details class="sec" id="share-probe">
    <summary>Slack共有テスト</summary>
    <p class="field-hint">合成回答1件を共有します。JSONを添付できない場合はテキストを試してください。</p>
    <div class="toolbar">
      <button type="button" class="primary" data-share-format="json">JSONを共有</button>
      <button type="button" data-share-format="txt">テキストを共有</button>
    </div>
    <p class="field-hint" role="status" aria-live="polite" data-share-status></p>
  </details>`;
}

export function bindShareProbe(root: HTMLElement): void {
  const status = root.querySelector<HTMLElement>('[data-share-status]');
  if (status === null) throw new Error('共有テストの状態表示が見つかりません');
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-share-format]')];
  let body: string | undefined;
  let sharing = false;

  for (const button of buttons) {
    button.addEventListener('click', () => {
      if (sharing) return;
      try {
        if (!window.isSecureContext) throw new Error('共有にはHTTPSで開く必要があります。');
        if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
          throw new Error('このブラウザはファイル共有に対応していません。スマホの対応ブラウザで試してください。');
        }
        body ??= JSON.stringify(parseVisitRecords([syntheticRecord()]), null, 2);
        const format = button.dataset.shareFormat === 'txt' ? 'txt' : 'json';
        const file = new File([body], `me-report-share-test.${format}`, {
          type: format === 'json' ? 'application/json' : 'text/plain',
        });
        const data: ShareData = { files: [file] };
        if (!navigator.canShare(data)) {
          throw new Error(format === 'json'
            ? 'この端末ではJSONファイルを共有できません。テキストを試してください。'
            : 'この端末ではテキストファイルを共有できません。');
        }
        // 事前のawaitでユーザー操作の有効期間を失わないよう、クリック内で直接呼ぶ。
        const result = navigator.share(data);
        sharing = true;
        for (const item of buttons) item.disabled = true;
        status.textContent = '共有画面でSlackと宛先を選んでください。';
        void result.then(() => {
          status.textContent = '共有先に渡しました。Slackで投稿を確認し、PCで添付を取得して内容を確認してください。';
        }).catch((error: unknown) => {
          status.textContent = shareError(error);
        }).finally(() => {
          sharing = false;
          for (const item of buttons) item.disabled = false;
        });
      } catch (error) {
        status.textContent = shareError(error);
      }
    });
  }
}

function shareError(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return '共有がキャンセルされたか、共有先が見つかりませんでした。もう一度試せます。';
  }
  const message = error instanceof Error ? error.message : String(error);
  return `共有できませんでした: ${message}`;
}
