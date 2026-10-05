import { expect, test } from '@playwright/test';

test('窄屏主页与德州线下操作、撤销和刷新恢复', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '小赌怡情' })).toBeVisible();
  await page.locator('.game-choice').filter({ hasText: '德州扑克' }).click();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.getByRole('button', { name: /实体牌 · 手机筹码/ }).click();
  await page.getByRole('button', { name: /进入实体牌记分器/ }).click();
  await expect(page.getByText('当前阶段')).toBeVisible();
  const before = await page.locator('.offline-poker-seat strong').allTextContents();
  await page.getByRole('button', { name: /跟注 10/ }).click();
  await page.getByRole('button', { name: '撤销上一步' }).click();
  expect(await page.locator('.offline-poker-seat strong').allTextContents()).toEqual(before);
  await page.reload();
  await expect(page.getByText('翻牌前', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回首页并保存牌局' }).click();
  await page.locator('.mobile-resume').filter({ hasText: '继续已保存的线下德州' }).click();
  await expect(page.getByText('当前阶段')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('线下德州存档不会遮住线上房间刷新回座', async ({ page }) => {
  await page.goto('/');
  await page.locator('.game-choice').filter({ hasText: '德州扑克' }).click();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.getByRole('button', { name: /实体牌 · 手机筹码/ }).click();
  await page.getByRole('button', { name: /进入实体牌记分器/ }).click();
  await page.getByRole('button', { name: '返回首页并保存牌局' }).click();
  await page.locator('.game-choice').filter({ hasText: '骗子酒馆' }).click();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.getByRole('button', { name: /线上模式/ }).click();
  await page.getByRole('button', { name: /创建线上房间/ }).click();
  const code = (await page.locator('.room-code').innerText()).replace(/\D/g, '');
  await page.reload();
  await expect(page.locator('.room-code')).toContainText(code);
  await expect(page.locator('.room-header')).toContainText('骗子酒馆');
  await page.getByRole('button', { name: '返回首页' }).click();
});

test('两名真人依次相信和质疑后页面保持可操作', async ({ page, browser }) => {
  const guestContext = await browser.newContext({ viewport: page.viewportSize() ?? { width: 390, height: 844 } });
  const guest = await guestContext.newPage();
  try {
    await page.goto('/');
    await page.locator('.game-choice').filter({ hasText: '骗子酒馆' }).click();
    await page.getByRole('button', { name: '开始游戏' }).click();
    await page.getByRole('button', { name: /线上模式/ }).click();
    await page.getByRole('button', { name: /创建线上房间/ }).click();
    const code = (await page.locator('.room-code').innerText()).replace(/\D/g, '');
    await guest.goto('/');
    await guest.getByRole('textbox', { name: '手机端六位房间号' }).fill(code);
    await guest.getByRole('button', { name: /加入房间/ }).click();
    await page.getByRole('button', { name: '开始牌局' }).click();
    await page.locator('.hand-liarsbar .playing-card').first().click();
    await page.getByRole('button', { name: /暗牌声明 · 1 张/ }).click();
    await guest.getByRole('button', { name: '相信并继续' }).click();
    await guest.locator('.hand-liarsbar .playing-card').first().click();
    await guest.getByRole('button', { name: /暗牌声明 · 1 张/ }).click();
    await page.getByRole('button', { name: '质疑上一手' }).click();
    await expect(page.locator('.liar-reveal, .settlement').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await guestContext.close();
  }
});

test('窄屏骗子酒馆三张选择和声明后仍可操作', async ({ page }) => {
  await page.goto('/');
  await page.locator('.game-choice').filter({ hasText: '骗子酒馆' }).click();
  await page.getByRole('button', { name: '开始游戏' }).click();
  await page.getByRole('button', { name: /线上模式/ }).click();
  await page.getByRole('button', { name: /创建线上房间/ }).click();
  await expect(page.locator('.room-header')).toContainText('等待中');
  await page.getByRole('button', { name: '添加牌友' }).click();
  await page.getByRole('button', { name: '开始牌局' }).click();
  const cards = page.locator('.hand-liarsbar .playing-card');
  await expect(cards).toHaveCount(5);
  for (let index = 0; index < 3; index += 1) {
    await cards.nth(index).click();
    await expect(page.locator('.hand-liarsbar .playing-card.selected')).toHaveCount(index + 1);
  }
  await expect(page.locator('.hand-liarsbar .playing-card.selected')).toHaveCount(3);
  await expect(page.locator('.turn-status')).toContainText('已选 3 / 3 张');
  expect(await page.locator('.player-zone').evaluate((zone) => {
    const cards = zone.querySelector('.hand')!.getBoundingClientRect();
    const actions = zone.querySelector('.action-bar')!.getBoundingClientRect();
    return cards.bottom <= actions.top;
  })).toBe(true);
  await page.getByRole('button', { name: /暗牌声明 · 3 张/ }).click();
  await expect(page.locator('.hand-liarsbar .playing-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '质疑上一手' })).toBeVisible();
  await page.getByRole('button', { name: '查看规则' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('button', { name: '质疑上一手' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
