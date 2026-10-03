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
  await page.getByRole('button', { name: /继续线下德州/ }).click();
  await expect(page.getByText('当前阶段')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
  await page.getByRole('button', { name: /暗牌声明 · 3 张/ }).click();
  await expect(page.locator('.hand-liarsbar .playing-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '质疑上一手' })).toBeVisible();
  await page.getByRole('button', { name: '查看规则' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
