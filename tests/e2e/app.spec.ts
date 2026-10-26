import { test, expect } from '@playwright/test';

test('記録、カテゴリ追加、編集、まとめ、表示名の変更、削除', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('まだ記録がありません。')).toBeVisible();
  await page.getByRole('link', { name: '記録する', exact: true }).first().click();
  await page.getByLabel('物忘れ').check();
  await page.getByLabel('朝', { exact: true }).check();
  await page.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('鍵を探していた');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByText('鍵を探していた')).toBeVisible();
  await page.getByText('鍵を探していた').click();
  await page.getByRole('link', { name: '編集' }).click();
  await page.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('鍵を一緒に探した');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByText('鍵を一緒に探した')).toBeVisible();
  await expect(page.getByText('編集済み')).toBeVisible();
  await page.goto('/summary');
  await expect(page.getByText('物忘れ').first()).toBeVisible();
  await expect(page.getByText('1件').first()).toBeVisible();
  await page.goto('/settings');
  await page.getByLabel('表示名').fill('家族');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByText('表示名を保存しました。')).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('家族')).toBeVisible();
  await page.getByText('鍵を一緒に探した').click();
  await page.getByText('この記録を削除する').click();
  await page.getByRole('button', { name: '削除する' }).click();
  await expect(page.getByText('まだ記録がありません。')).toBeVisible();
  await page.goto('/entries/new');
  await page.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('書きかけを保持');
  await page.getByText('＋ 新しいカテゴリ').click();
  await page.getByLabel('カテゴリ名').fill('できごと');
  await page.getByRole('button', { name: 'カテゴリを追加' }).click();
  await expect(page.getByLabel('できごと')).toBeVisible();
  await expect(page.getByLabel('気になったことを、思いついたまま書いてください。（必須）')).toHaveValue('書きかけを保持');
  await page.getByRole('link', { name: 'キャンセル', exact: true }).click();
});

// 暦の月の計算。日付(Date)を介さないので、月末(31日など)でも別の月へずれない。
const monthsBefore = (date: string, months: number, day = 10) => {
  const [year, month] = date.split('-').map(Number);
  const index = year * 12 + (month - 1) - months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

test('一覧の期間・順序と印刷では本文全体を表示する', async ({ page, baseURL }) => {
  // 記録は画面の入力ではなく、保存のPOSTを直接送って用意する。
  // ハイドレーション前に操作した値は初期値に戻されることがあり、日付やカテゴリが意図とずれるため。
  await page.goto('/entries/new');
  // サーバーの「今日」は、入力欄の max に入っている(SSRの属性なので、ハイドレーションを待たずに読める)
  const today = (await page.getByLabel('いつあったことか（必須）').getAttribute('max'))!;
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // 既定の期間(直近1か月)より必ず前の月。先月への移動も、必ずできる
  const older = monthsBefore(today, 2);
  const categoryId = async (name: string) => (await page.getByLabel(name).getAttribute('value'))!;
  const seed = async (fields: Record<string, string>) => {
    const response = await page.request.post('/entries/new?/save', {
      form: fields, maxRedirects: 0, headers: { Origin: new URL(baseURL!).origin, Accept: 'text/html' }
    });
    expect(response.status()).toBe(303);
  };
  await seed({ body: '最近の記録', eventDate: today, categoryId: await categoryId('物忘れ') });
  await seed({ body: '以前の記録\n2行目\n3行目\n4行目', eventDate: older, categoryId: await categoryId('思い込み') });

  // 既定の期間では、最近の記録だけが出る(一覧が表示されてから「出ていない」ことを確かめる)
  await page.goto('/');
  await expect(page.locator('.entry-body').filter({ hasText: '最近の記録' })).toBeVisible();
  await expect(page.locator('.entry-body').filter({ hasText: '以前の記録' })).toHaveCount(0);

  // 期間と並び順を選んで表示する。ハイドレーション前の選択は戻されることがあるので、反映されるまで同じ操作を繰り返す
  await expect(async () => {
    await page.getByLabel('期間').selectOption('all');
    await page.getByLabel('並び順').selectOption('asc');
    await page.getByRole('button', { name: '表示する' }).click();
    await expect(page).toHaveURL(/period=all/, { timeout: 1500 });
    await expect(page).toHaveURL(/order=asc/, { timeout: 1500 });
  }).toPass();
  await expect(page.locator('.entry-body').filter({ hasText: '以前の記録' })).toBeVisible();
  await expect(page.locator('.entry-body').first()).toContainText('以前の記録');
  await expect(page.locator('.entry-body').last()).toContainText('最近の記録');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-only')).toContainText('すべて');
  await expect(page.locator('.print-only')).toContainText('古い順');
  const olderEntry = page.locator('.entry-body').filter({ hasText: '以前の記録' });
  await expect(olderEntry).toHaveCSS('overflow', 'visible');
  await expect(olderEntry).toContainText('4行目');
  await page.emulateMedia({ media: 'screen' });

  // まとめ: 2か月前の記録があるので、今月から先月へ必ず移動できる
  await page.goto('/summary');
  const columns = await page.locator('.bar-column').allTextContents();
  await expect(page.locator('.bar-column')).toHaveCount(3);
  const picker = page.locator('.month-picker strong');
  const label = (date: string) => `${date.slice(0, 4)}年${Number(date.slice(5, 7))}月`;
  await expect(picker).toHaveText(label(today));
  const previous = page.getByRole('button', { name: '先月を表示' });
  await expect(previous).toBeEnabled();
  // 移動済みなら押さない(押し過ぎて二つ前の月へ行かない)。ハイドレーション前の押下は効かないので、移るまで繰り返す
  await expect(async () => {
    if ((await picker.textContent()) === label(today)) await previous.click();
    await expect(picker).toHaveText(label(monthsBefore(today, 1)), { timeout: 1000 });
  }).toPass();
  expect(await page.locator('.bar-column').allTextContents()).toEqual(columns);
});

test('別端末で更新された記録に古い編集を上書きしない', async ({ page, browser }) => {
  await page.goto('/entries/new');
  await page.getByLabel('物忘れ').check();
  await page.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('元の記録');
  await page.getByRole('button', { name: '保存する' }).click();
  await page.getByText('元の記録').click();
  await page.getByRole('link', { name: '編集' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  const editUrl = page.url();
  await page.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('端末1の書きかけ');
  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    await second.goto(editUrl);
    await second.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('端末2の更新');
    await second.getByRole('button', { name: '保存する' }).click();
    await expect(second.getByText('端末2の更新')).toBeVisible();
    await page.getByRole('button', { name: '保存する' }).press('Enter');
    await expect(page.getByRole('alert')).toContainText('別の画面で記録が更新されました');
    await expect(page.getByLabel('気になったことを、思いついたまま書いてください。（必須）')).toHaveValue('端末1の書きかけ');
    await page.reload();
    await expect(page.getByLabel('以前の書きかけ')).toHaveValue('端末1の書きかけ');
    await page.getByRole('button', { name: '書きかけを破棄して最新の記録を編集' }).click();
    await expect(page.getByLabel('気になったことを、思いついたまま書いてください。（必須）')).toHaveValue('端末2の更新');
  } finally { await other.close(); }
});

test.describe('JavaScriptがない場合', () => {
  test.use({ javaScriptEnabled: false });
  test('記録の作成、カテゴリ追加、編集、削除と表示名の変更ができる', async ({ page }) => {
    await page.goto('/entries/new');
    await page.getByLabel('物忘れ').check();
    await page.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('   ');
    await page.getByRole('button', { name: '保存する' }).press('Enter');
    await expect(page.getByRole('alert')).toContainText('本文が空です');
    await expect(page.getByLabel('気になったことを、思いついたまま書いてください。（必須）')).toHaveValue('   ');
    await expect(page.getByLabel('物忘れ')).toBeChecked();
    await page.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('JavaScriptなしの記録');
    await page.getByRole('button', { name: '保存する' }).press('Enter');
    await expect(page.getByText('JavaScriptなしの記録')).toBeVisible();
    await page.getByText('JavaScriptなしの記録').click();
    await page.getByRole('link', { name: '編集' }).click();
    await page.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('JavaScriptなしで編集');
    await expect(page.getByLabel('気になったことを、思いついたまま書いてください。（必須）')).toHaveValue('JavaScriptなしで編集');
    await page.getByRole('button', { name: '保存する' }).press('Enter');
    await expect(page.getByText('JavaScriptなしで編集')).toBeVisible();
    await page.getByRole('link', { name: '編集' }).click();
    await page.getByText('＋ 新しいカテゴリ').press('Enter');
    await page.getByLabel('カテゴリ名').fill('JSなしカテゴリ');
    await page.getByRole('button', { name: 'カテゴリを追加' }).press('Enter');
    await expect(page.getByLabel('JSなしカテゴリ')).toBeVisible();
    await page.getByRole('link', { name: 'キャンセル' }).click();
    await page.getByText('この記録を削除する').click();
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(page.getByText('JavaScriptなしで編集')).toHaveCount(0);
    await page.goto('/settings');
    await page.getByLabel('表示名').fill('家族B');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByText('表示名を保存しました。')).toBeVisible();
  });
});

const bodyLabel = '気になったことを、思いついたまま書いてください。（必須）';
// 共通レイアウトの通知領域。設定画面にも別の role=status があるため、通知のある画面でだけ使う
// 読み上げ対象の status の領域だけ(「閉じる」リンクは含めない)
const flash = (page: import('@playwright/test').Page) => page.locator('.flash-region [role="status"]');

test('保存・更新・削除の成功通知は303の先で一度だけ表示され、URLにも残らない', async ({ page }) => {
  await page.goto('/entries/new');
  await page.getByLabel('物忘れ').check();
  await page.getByLabel(bodyLabel).fill('通知の確認');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByRole('status').filter({ hasText: '記録を保存しました' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  // 同じ画面を読み直す・別の画面へ移る・戻ると、通知は出ない
  await page.reload();
  await expect(flash(page)).toBeEmpty();
  await page.goto('/summary');
  await expect(flash(page)).toBeEmpty();

  await page.goto('/');
  await page.getByText('通知の確認').click();
  await expect(page).toHaveURL(/\/entries\/[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: '編集' }).click();
  // 編集画面に移り、書きかけの復元パネルではなく入力フォームが出てから入力する
  await expect(page).toHaveURL(/\/edit$/);
  const body = page.getByLabel(bodyLabel);
  await expect(body).toBeVisible();
  await expect(page.getByLabel('以前の書きかけ')).toHaveCount(0);
  await body.fill('通知の確認(更新)');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(flash(page)).toHaveText('記録を更新しました');
  expect(new URL(page.url()).search).toBe('');
  await page.getByRole('link', { name: '‹ 一覧' }).click();
  await expect(flash(page)).toBeEmpty();

  await page.getByText('通知の確認(更新)').click();
  await page.getByText('この記録を削除する').click();
  await page.getByRole('button', { name: '削除する' }).click();
  await expect(flash(page)).toHaveText('記録を削除しました');
  await page.reload();
  await expect(flash(page)).toBeEmpty();
});

test('保存に失敗したときはエラーを出し、成功通知は出さない', async ({ page }) => {
  await page.goto('/entries/new');
  await page.getByLabel('物忘れ').check();
  await page.getByLabel(bodyLabel).fill('   ');
  // HTML の必須検査は空白だけの本文を通すので、サーバー側のエラーまで届く
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '本文が空です' })).toBeVisible();
  await expect(flash(page)).toBeEmpty();
});

test.describe('JavaScriptがない場合の通知', () => {
  test.use({ javaScriptEnabled: false });
  test('保存の成功通知がrole=statusで表示され、次の画面には残らない', async ({ page }) => {
    await page.goto('/entries/new');
    await page.getByLabel('物忘れ').check();
    await page.getByLabel(bodyLabel).fill('JavaScriptなしの通知');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByRole('status').filter({ hasText: '記録を保存しました' })).toBeVisible();
    await page.goto('/summary');
    await expect(flash(page)).toBeEmpty();
    await page.goto('/');
    await page.getByText('JavaScriptなしの通知').click();
    await page.getByText('この記録を削除する').click();
    await page.getByRole('button', { name: '削除する' }).click();
    await expect(flash(page)).toHaveText('記録を削除しました');
  });
});

async function saveEntry(page: import('@playwright/test').Page, text: string) {
  await page.goto('/entries/new');
  await page.getByLabel('物忘れ').check();
  await page.getByLabel(bodyLabel).fill(text);
  await page.getByRole('button', { name: '保存する' }).click();
}

test.describe('成功通知の表示位置と自動消去(JavaScriptあり)', () => {
  test.use({ viewport: { width: 1000, height: 240 } });

  test('アプリの幅の中、ヘッダー直下に固定され、スクロールしても見え、下の操作を妨げない', async ({ page }) => {
    await saveEntry(page, '位置の確認その1');
    await saveEntry(page, '位置の確認その2');
    const toast = page.locator('.flash');
    await expect(toast).toHaveText('記録を保存しました');
    // 画面の入れ替えが終わってから寸法を測る
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('header.bar')).toBeVisible();
    await expect(page.locator('.app-shell')).toBeVisible();

    const region = page.locator('.flash-region');
    await expect(region).toHaveCSS('position', 'fixed');
    await expect(region).toHaveCSS('pointer-events', 'none');
    await expect(region).toHaveCSS('z-index', '5');
    const header = (await page.locator('header.bar').boundingBox())!;
    const shell = (await page.locator('.app-shell').boundingBox())!;
    const before = (await toast.boundingBox())!;
    expect(before.y).toBeCloseTo(header.y + header.height, 0);
    expect(before.width).toBeLessThanOrEqual(shell.width + 1);
    expect(before.x).toBeGreaterThanOrEqual(shell.x - 1);
    expect(before.x + before.width).toBeLessThanOrEqual(shell.x + shell.width + 1);

    // スクロールしても同じ位置で見える
    // 画面遷移直後は SvelteKit が先頭へ戻すことがあるので、スクロールが定着するまで繰り返す
    await expect.poll(() => page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); return window.scrollY; })).toBeGreaterThan(0);
    const after = (await toast.boundingBox())!;
    expect(after.y).toBeCloseTo(before.y, 0);
    await expect(toast).toBeInViewport();

    // クリックは通知を素通りして、下の要素に届く
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.flash-region') !== null, { x: after.x + after.width / 2, y: after.y + after.height / 2 });
    expect(hit).toBe(false);
  });

  test('4秒たつとフェードアウトして消える', async ({ page }) => {
    await page.clock.install();
    await saveEntry(page, '自動で消える通知');
    const toast = page.locator('.flash');
    await expect(toast).toHaveText('記録を保存しました');
    await page.waitForTimeout(300); // ハイドレーションを待ってから、時計を止めて少しずつ進める
    await page.clock.pauseAt(new Date(Date.now() + 200));
    await expect(toast).toHaveCSS('opacity', '1');
    let advanced = 0;
    while (advanced < 6000 && !(await toast.evaluate((element) => element.classList.contains('leaving')))) {
      await page.clock.runFor(100);
      advanced += 100;
    }
    // 表示から4秒ごろにフェードが始まる。表示してから時計を止めるまでの誤差は1秒未満
    expect(advanced).toBeGreaterThanOrEqual(3000);
    expect(advanced).toBeLessThanOrEqual(4100);
    await expect(toast).toHaveCSS('opacity', '0'); // フェードそのものは実時間で進む
    await expect(toast).toHaveText('記録を保存しました'); // フェードの間は、まだ領域に残っている
    await page.clock.runFor(500);
    await expect(page.getByRole('status')).toBeEmpty();
  });

  test('次の通知は前の通知の消去時間を引き継がず、あらためて4秒表示される', async ({ page }) => {
    await page.clock.install();
    await saveEntry(page, '一つ目');
    await expect(page.locator('.flash')).toHaveText('記録を保存しました');
    await page.waitForTimeout(300);
    await page.clock.fastForward(3500); // 一つ目の消去(4秒)の直前
    // 同じ画面のまま(クライアント側の遷移で)次の記録を保存する
    await page.getByRole('link', { name: '記録する', exact: true }).first().click();
    await expect(page.locator('.flash-region')).toBeEmpty();
    await page.getByLabel('物忘れ').check();
    await page.getByLabel(bodyLabel).fill('二つ目');
    await page.getByRole('button', { name: '保存する' }).click();
    const toast = page.locator('.flash');
    await expect(toast).toHaveText('記録を保存しました');
    await page.clock.fastForward(2500); // 一つ目のタイマーが残っていれば、ここで消えている
    await expect(toast).toBeVisible();
    await expect(toast).not.toHaveClass(/leaving/);
    await page.clock.fastForward(2500);
    await expect(page.getByRole('status')).toBeEmpty();
  });

  test('動きを減らす設定ではフェードの動きなしで消え、通常はフェードする', async ({ page }) => {
    await saveEntry(page, '動きの設定の確認');
    await expect(page.locator('.flash')).toHaveCSS('transition-duration', '0.4s');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.flash')).toHaveCSS('transition-duration', '0s');
  });
});

test.describe('成功通知の「閉じる」(JavaScriptあり)', () => {
  test('クリックでその場で閉じ、画面は移動せず履歴も増えない。通知の読み上げに「閉じる」は含まれない', async ({ page }) => {
    await saveEntry(page, '閉じる確認');
    await expect(flash(page)).toHaveText('記録を保存しました');
    const close = page.getByRole('link', { name: '通知を閉じる' });
    await expect(close).toHaveText('閉じる');
    await expect(close).toHaveCSS('pointer-events', 'auto');
    await expect(close).toHaveAttribute('href', '/');
    const before = await page.evaluate(() => ({ length: history.length, url: location.href }));
    await close.click();
    await expect(flash(page)).toBeEmpty();
    await expect(close).toHaveCount(0);
    expect(await page.evaluate(() => ({ length: history.length, url: location.href }))).toEqual(before);
  });

  test('キーボードで「閉じる」へ移動して Enter で閉じられる', async ({ page }) => {
    await saveEntry(page, 'キーボードで閉じる');
    const close = page.getByRole('link', { name: '通知を閉じる' });
    await expect(close).toBeVisible();
    await close.focus();
    await expect(close).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(flash(page)).toBeEmpty();
  });
});

test.describe('JavaScriptがない場合は自動で消えない', () => {
  test.use({ javaScriptEnabled: false });
  test('4秒を過ぎても通知が表示されたままで、画面を移ると消える', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(request.url()); });
    await saveEntry(page, 'JavaScriptなしで残る通知');
    const toast = page.getByRole('status').filter({ hasText: '記録を保存しました' });
    await expect(toast).toBeVisible();
    await page.waitForTimeout(4600); // JavaScript があれば、4.4秒までに消えている時間
    await expect(toast).toBeVisible();
    await expect(page.locator('.flash')).toHaveCSS('opacity', '1');
    await expect(page.locator('.flash')).not.toHaveClass(/leaving/);
    // 本当に JavaScript が動いていないこと(オプション名の綴りを誤ると、黙って有効のままになる)
    expect(scripts).toEqual([]);
    await page.goto('/summary');
    await expect(page.locator('.flash-region')).toBeEmpty();
  });
});

test.describe('JavaScriptがない場合の「閉じる」', () => {
  test.use({ javaScriptEnabled: false });
  test('普通のリンクとして同じ画面を読み直し、通知だけが消える', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(request.url()); });
    await saveEntry(page, 'JavaScriptなしで閉じる');
    await expect(flash(page)).toHaveText('記録を保存しました');
    const close = page.getByRole('link', { name: '通知を閉じる' });
    await expect(close).toHaveAttribute('href', '/');
    await close.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(flash(page)).toBeEmpty();
    await expect(close).toHaveCount(0);
    await expect(page.getByText('JavaScriptなしで閉じる')).toBeVisible(); // 画面の内容は残る
    expect(scripts).toEqual([]);
  });
});
