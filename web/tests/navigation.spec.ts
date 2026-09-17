import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mockAI } from './ai-mock';

test.beforeEach(async ({ page }) => { await mockAI(page); });

async function phoneBounds(page: Page) {
  const bounds = await page.locator('.screen-pager').boundingBox();
  if (!bounds) throw new Error('The phone pager is not visible.');
  return bounds;
}

async function mouseSwipe(page: Page, direction: 'left' | 'right', fraction = 0.55) {
  const bounds = await phoneBounds(page);
  const start = direction === 'right' ? 0.22 : 0.78;
  const x = bounds.x + bounds.width * start;
  const y = bounds.y + bounds.height * 0.73;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + bounds.width * fraction * (direction === 'right' ? 1 : -1), y, { steps: 10 });
  await page.mouse.up();
}

async function touchSwipe(page: Page, direction: 'left' | 'right' | 'up') {
  const bounds = await phoneBounds(page);
  const x = bounds.x + bounds.width * (direction === 'right' ? 0.22 : direction === 'left' ? 0.78 : 0.5);
  const y = bounds.y + bounds.height * 0.73;
  const dx = direction === 'up' ? 0 : bounds.width * 0.55 * (direction === 'right' ? 1 : -1);
  const dy = direction === 'up' ? -bounds.height * 0.45 : 0;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x, y, radiusX: 5, radiusY: 5, force: 1, id: 1 }],
    });
    for (let step = 1; step <= 10; step += 1) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + dx * step / 10, y: y + dy * step / 10, radiusX: 5, radiusY: 5, force: 1, id: 1 }],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

test('Home is the landing page, with Today and Siri to its left', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.screen-pager')).toHaveAttribute('data-active-screen', 'home');
  await expect(page.getByRole('button', { name: 'Open Siri Trip', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Message Siri' })).toHaveCount(0);
  expect(await page.locator('.swipe-page').evaluateAll(pages => pages.map(node => node.getAttribute('data-screen'))))
    .toEqual(['siri', 'today', 'home']);
  await expect(page.locator('.status-bar')).toHaveCount(1);
  await expect.poll(() => page.locator('.home-app img, .home-dock img').evaluateAll(images =>
    images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
  )).toBe(true);
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('home-screen.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Go to Today screen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.locator('.phone-screen').screenshot({ path: testInfo.outputPath('today-screen.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('mouse dragging enters and exits Siri without losing the conversation or draft', async ({ page }) => {
  await page.goto('/');
  const pager = page.locator('.screen-pager');
  await mouseSwipe(page, 'right');
  await expect(pager).toHaveAttribute('data-active-screen', 'today');
  await mouseSwipe(page, 'right');
  await expect(pager).toHaveAttribute('data-active-screen', 'siri');
  await page.getByRole('textbox', { name: 'Message Siri' }).fill('Keep this unsent draft');
  await mouseSwipe(page, 'left');
  await expect(pager).toHaveAttribute('data-active-screen', 'today');
  await mouseSwipe(page, 'left');
  await expect(pager).toHaveAttribute('data-active-screen', 'home');
  await mouseSwipe(page, 'right');
  await mouseSwipe(page, 'right');
  await expect(pager).toHaveAttribute('data-active-screen', 'siri');
  await expect(page.getByRole('textbox', { name: 'Message Siri' })).toHaveValue('Keep this unsent draft');
  await expect(page.locator('.message')).toHaveCount(0);
});

test('boundary and short drags snap back, and dragging an icon does not tap it', async ({ page }) => {
  await page.goto('/');
  const pager = page.locator('.screen-pager');
  await mouseSwipe(page, 'left');
  await expect(pager).toHaveAttribute('data-active-screen', 'home');
  await mouseSwipe(page, 'right', 0.04);
  await expect(pager).toHaveAttribute('data-active-screen', 'home');

  const icon = page.getByRole('button', { name: 'Open Siri Trip', exact: true });
  const bounds = await icon.boundingBox();
  if (!bounds) throw new Error('Missing Siri Trip icon.');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x - 100, bounds.y + bounds.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(pager).toHaveAttribute('data-active-screen', 'home');
  await icon.click();
  await expect(pager).toHaveAttribute('data-active-screen', 'siri');
  await mouseSwipe(page, 'right');
  await expect(pager).toHaveAttribute('data-active-screen', 'siri');
});

test('real touch gestures page horizontally while Today still scrolls vertically', async ({ page }) => {
  await page.goto('/');
  const pager = page.locator('.screen-pager');
  await touchSwipe(page, 'right');
  await expect(pager).toHaveAttribute('data-active-screen', 'today');
  await touchSwipe(page, 'up');
  await expect.poll(() => page.locator('.today-scroll').evaluate(node => node.scrollTop)).toBeGreaterThan(80);
  await expect(pager).toHaveAttribute('data-active-screen', 'today');
  await touchSwipe(page, 'right');
  await expect(pager).toHaveAttribute('data-active-screen', 'siri');
  await touchSwipe(page, 'left');
  await expect(pager).toHaveAttribute('data-active-screen', 'today');
  await expect.poll(() => page.locator('.today-scroll').evaluate(node => node.scrollTop)).toBeGreaterThan(80);
  await touchSwipe(page, 'left');
  await expect(pager).toHaveAttribute('data-active-screen', 'home');
});

test('user-opened dialogs block paging until dismissed', async ({ page }) => {
  await page.goto('/?screen=siri');
  await page.getByRole('button', { name: 'Conversation actions' }).click();
  await page.getByRole('button', { name: 'Add dates', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Choose dates' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to Today screen', exact: true })).toBeDisabled();
  await mouseSwipe(page, 'left');
  await expect(page.locator('.screen-pager')).toHaveAttribute('data-active-screen', 'siri');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Choose dates' })).not.toBeVisible();
  await mouseSwipe(page, 'left');
  await expect(page.locator('.screen-pager')).toHaveAttribute('data-active-screen', 'today');
});

test('keyboard and trackpad navigation leave text editing and vertical scrolling intact', async ({ page }) => {
  await page.goto('/');
  const pager = page.locator('.screen-pager');
  await pager.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(pager).toHaveAttribute('data-active-screen', 'today');
  await page.keyboard.press('ArrowLeft');
  await expect(pager).toHaveAttribute('data-active-screen', 'siri');
  const input = page.getByRole('textbox', { name: 'Message Siri' });
  await input.fill('A draft');
  await input.press('ArrowRight');
  await expect(pager).toHaveAttribute('data-active-screen', 'siri');
  await pager.focus();
  await page.keyboard.press('ArrowRight');
  await expect(pager).toHaveAttribute('data-active-screen', 'today');
  const bounds = await phoneBounds(page);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.6);
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.locator('.today-scroll').evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await expect(pager).toHaveAttribute('data-active-screen', 'today');
  const pixelRatio = await page.evaluate(() => window.devicePixelRatio);
  await page.mouse.wheel(bounds.width * pixelRatio, 0);
  await expect(pager).toHaveAttribute('data-active-screen', 'home');
});

test('consecutive swipes can interrupt the settling animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await mouseSwipe(page, 'right');
  await mouseSwipe(page, 'right');
  await expect(page.locator('.screen-pager')).toHaveAttribute('data-active-screen', 'siri');
  await expect.poll(() => page.locator('.screen-track').evaluate(node =>
    new DOMMatrixReadOnly(getComputedStyle(node).transform).m41,
  )).toBeCloseTo(0, 0);
  await expect(page.getByRole('textbox', { name: 'Message Siri' })).toBeVisible();
});
