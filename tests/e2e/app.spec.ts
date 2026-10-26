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

test('一覧の期間・順序と印刷では本文全体を表示する', async ({ page }) => {
  await page.goto('/entries/new');
  await page.getByLabel('物忘れ').check();
  await page.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('最近の記録');
  await page.getByRole('button', { name: '保存する' }).click();
  await page.goto('/entries/new');
  await page.getByLabel('いつあったことか（必須）').fill('2020-01-10');
  await page.getByLabel('思い込み').check();
  await page.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('以前の記録\n2行目\n3行目\n4行目');
  await page.getByRole('button', { name: '保存する' }).click();
  await expect(page.getByText('以前の記録')).toHaveCount(0);
  await page.getByLabel('期間').selectOption('all');
  await page.getByLabel('並び順').selectOption('asc');
  await page.getByRole('button', { name: '表示する' }).click();
  await expect(page.getByText('以前の記録')).toBeVisible();
  await expect(page.locator('.entry-body').first()).toContainText('以前の記録');
  await expect(page.locator('.entry-body').last()).toContainText('最近の記録');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-only')).toContainText('すべて');
  await expect(page.locator('.print-only')).toContainText('古い順');
  await expect(page.locator('.entry-body').first()).toHaveCSS('overflow', 'visible');
  await expect(page.locator('.entry-body').first()).toContainText('4行目');
  await page.emulateMedia({ media: 'screen' });
  await page.goto('/summary');
  const columns = await page.locator('.bar-column').allTextContents();
  await expect(page.locator('.bar-column')).toHaveCount(3);
  const selectedMonth = await page.locator('.month-picker strong').textContent();
  await page.getByRole('button', { name: '先月を表示' }).click();
  await expect(page.locator('.month-picker strong')).not.toHaveText(selectedMonth!);
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
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByRole('alert')).toContainText('別の画面で記録が更新されました');
    await expect(page.getByLabel('気になったことを、思いついたまま書いてください。（必須）')).toHaveValue('端末1の書きかけ');
    await page.reload();
    await expect(page.getByLabel('以前の書きかけ')).toHaveValue('端末1の書きかけ');
    await page.getByRole('button', { name: '書きかけを破棄して最新の記録を編集' }).click();
    await expect(page.getByLabel('気になったことを、思いついたまま書いてください。（必須）')).toHaveValue('端末2の更新');
  } finally { await other.close(); }
});

test.describe('JavaScriptがない場合', () => {
  test.use({ javascriptEnabled: false });
  test('記録の作成と表示名の変更ができる', async ({ page }) => {
    await page.goto('/entries/new');
    await page.getByLabel('物忘れ').check();
    await page.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('   ');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByRole('alert')).toContainText('本文が空です');
    await expect(page.getByLabel('気になったことを、思いついたまま書いてください。（必須）')).toHaveValue('   ');
    await expect(page.getByLabel('物忘れ')).toBeChecked();
    await page.getByLabel('気になったことを、思いついたまま書いてください。（必須）').fill('JavaScriptなしの記録');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByText('JavaScriptなしの記録')).toBeVisible();
    await page.goto('/settings');
    await page.getByLabel('表示名').fill('家族B');
    await page.getByRole('button', { name: '保存する' }).click();
    await expect(page.getByText('表示名を保存しました。')).toBeVisible();
  });
});
