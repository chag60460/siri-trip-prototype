import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mockAI } from './ai-mock';
import { createDemoTravelOffers } from '../src/demo-travel';
import type { TripPlanData } from '../src/trip-plan';

const portfolioRoot = process.env.SIRI_PORTFOLIO_ROOT;
test.skip(!portfolioRoot, 'Set SIRI_PORTFOLIO_ROOT to check the separate portfolio repository.');

let localServer: Server | undefined;
let localOrigin = '';

const contentTypes: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

async function portfolioResource(pathname: string, prototypeUrl = '') {
  if (!portfolioRoot) throw new Error('SIRI_PORTFOLIO_ROOT is required.');
  const root = path.resolve(portfolioRoot);
  const file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
  if (!file.startsWith(`${root}${path.sep}`)) throw new Error('The requested fixture is outside the portfolio.');
  let body = await readFile(file);
  if (pathname === '/projects/siri-agent/siri-agent.html') {
    body = Buffer.from(body.toString('utf8').replace('data-prototype-url=""',
      `data-prototype-url="${prototypeUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`));
  }
  return { contentType: contentTypes[path.extname(file)] ?? 'application/octet-stream', body };
}

test.beforeAll(async () => {
  if (!portfolioRoot) return;
  // A real loopback response preserves Chromium's local-network address space.
  localServer = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    void portfolioResource(url.pathname, url.searchParams.get('prototype') ?? '').then(resource => {
      response.writeHead(200, { 'Content-Type': resource.contentType });
      response.end(resource.body);
    }).catch(error => {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
      if (!missing) console.error('Portfolio fixture request failed:', error);
      response.writeHead(missing ? 404 : 500);
      response.end('The requested portfolio fixture is unavailable.');
    });
  });
  const server = localServer;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The portfolio fixture needs a TCP port.');
  localOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  const server = localServer;
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function servePortfolio(page: Page, { publicSite = false, prototypeUrl = '', startAtPrototype = true } = {}) {
  const fragment = startAtPrototype ? '#interactive-prototype' : '';
  if (!publicSite) {
    await page.goto(`${localOrigin}/projects/siri-agent/siri-agent.html?prototype=${encodeURIComponent(prototypeUrl)}${fragment}`);
    return;
  }
  const origin = 'https://portfolio.example.test';
  await page.route(`${origin}/**`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    await route.fulfill(await portfolioResource(pathname, prototypeUrl));
  });
  await page.goto(`${origin}/projects/siri-agent/siri-agent.html${fragment}`);
}

test('top shortcut jumps to the final section without launching the app', async ({ page }) => {
  const ai = await mockAI(page);
  await servePortfolio(page, { startAtPrototype: false });
  const shortcut = page.getByRole('link', { name: 'Try interactive prototype', exact: true });
  const heading = page.getByRole('heading', { name: 'Interactive prototype', exact: true });
  await expect(page.locator('.case-study > :last-child')).toHaveAttribute('data-siri-prototype', '');
  await expect(shortcut).toBeInViewport({ ratio: 1 });
  const appearance = await shortcut.evaluate(element => {
    const style = getComputedStyle(element);
    const container = element.closest('.main-content');
    if (!container) throw new Error('The shortcut must be inside the case-study viewport.');
    return {
      height: element.getBoundingClientRect().height, fontSize: parseFloat(style.fontSize),
      background: style.backgroundImage, shadow: style.boxShadow,
      width: container.clientWidth, scrollWidth: container.scrollWidth,
    };
  });
  expect(appearance.height).toBeGreaterThanOrEqual(60);
  expect(appearance.fontSize).toBeGreaterThanOrEqual(16);
  expect(appearance.background).toContain('linear-gradient');
  expect(appearance.shadow).not.toBe('none');
  expect(appearance.scrollWidth).toBeLessThanOrEqual(appearance.width + 1);
  await shortcut.hover();
  await expect(shortcut).toHaveCSS('transform', 'none');
  await expect(shortcut).toHaveCSS('transition-property', 'none');
  await expect(heading).not.toBeInViewport();
  await shortcut.focus();
  await shortcut.press('Enter');
  await expect(page).toHaveURL(/#interactive-prototype$/);
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();
  await expect(page.locator('.siri-prototype iframe')).toHaveCount(0);
  expect(ai.requests).toHaveLength(0);
});

for (const width of [null, 900, 800]) {
  test(`project metadata and sticky shortcut remain usable at ${width ?? 'default'} width`, async ({ page }) => {
    if (width !== null) await page.setViewportSize({ width, height: 1100 });
    await servePortfolio(page, { startAtPrototype: false });
    await expect(page.locator('.project-meta')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.project-meta .meta-value')).toHaveText([
      'Grace Chang', 'Solo Product Designer & Technical Prototyper', 'Published Concept',
    ]);
    const shortcut = page.getByRole('link', { name: 'Try interactive prototype', exact: true });
    for (const section of ['Goals & Success Metrics', 'Functional Requirements']) {
      await page.getByRole('heading', { name: section, exact: true }).scrollIntoViewIfNeeded();
      await expect(shortcut).toBeInViewport({ ratio: 1 });
      const position = await shortcut.evaluate(element => {
        const sticky = element.closest('.prototype-shortcut');
        const container = element.closest('.main-content');
        if (!sticky || !container) throw new Error('The shortcut needs its sticky wrapper and case-study viewport.');
        const scrollTop = getComputedStyle(container).overflowY === 'visible'
          ? 0 : container.getBoundingClientRect().top;
        return {
          actual: sticky.getBoundingClientRect().top,
          expected: scrollTop + parseFloat(getComputedStyle(sticky).top),
        };
      });
      expect(position.actual).toBeCloseTo(position.expected, 0);
    }
    await shortcut.click();
    const heading = page.getByRole('heading', { name: 'Interactive prototype', exact: true });
    await expect(heading).toBeInViewport();
    await expect(heading).toBeFocused();
    const buttonBounds = await shortcut.boundingBox();
    const headingBounds = await heading.boundingBox();
    if (!buttonBounds || !headingBounds) throw new Error('The shortcut and prototype heading must have layout bounds.');
    expect(headingBounds.y).toBeGreaterThan(buttonBounds.y + buttonBounds.height + 8);
    await expect(page.locator('.siri-prototype iframe')).toHaveCount(0);
  });
}

test('shortcut radiates outward only when motion is allowed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await servePortfolio(page, { startAtPrototype: false });
  const shortcut = page.getByRole('link', { name: 'Try interactive prototype', exact: true });
  const waves = await shortcut.evaluate(element => {
    const animations = element.getAnimations({ subtree: true }).filter(animation =>
      animation instanceof CSSAnimation && animation.animationName === 'prototype-radiate');
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 0;
    }
    const start = new DOMMatrixReadOnly(getComputedStyle(element, '::before').transform);
    for (const animation of animations) animation.currentTime = 3000;
    const end = new DOMMatrixReadOnly(getComputedStyle(element, '::before').transform);
    const container = element.closest('.main-content');
    if (!container) throw new Error('The shortcut must be inside the case-study viewport.');
    return {
      count: animations.length, start: { x: start.a, y: start.d }, end: { x: end.a, y: end.d },
      hitTesting: getComputedStyle(element, '::before').pointerEvents,
      width: container.clientWidth, scrollWidth: container.scrollWidth,
    };
  });
  expect(waves.count).toBe(2);
  expect(waves.end.x).toBeGreaterThan(waves.start.x);
  expect(waves.end.y).toBeGreaterThan(waves.start.y);
  expect(waves.hitTesting).toBe('none');
  expect(waves.scrollWidth).toBeLessThanOrEqual(waves.width + 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => shortcut.evaluate(element =>
    ['::before', '::after'].map(pseudo => getComputedStyle(element, pseudo).animationName),
  )).toEqual(['none', 'none']);
  await shortcut.click();
  await expect(page.getByRole('heading', { name: 'Interactive prototype', exact: true })).toBeInViewport();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the top shortcut still reaches the prototype section', async ({ page }) => {
    await servePortfolio(page, { startAtPrototype: false });
    await page.getByRole('heading', { name: 'Goals & Success Metrics', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('link', { name: 'Try interactive prototype', exact: true })).toBeInViewport({ ratio: 1 });
    await page.getByRole('link', { name: 'Try interactive prototype', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Interactive prototype', exact: true })).toBeInViewport();
    await expect(page.locator('.siri-prototype iframe')).toHaveCount(0);
  });
});

test('public portfolio waits for a hosted app instead of probing visitor localhost', async ({ page }) => {
  const localRequests: string[] = [];
  page.on('request', request => {
    if (/^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])/.test(request.url())) localRequests.push(request.url());
  });
  await servePortfolio(page, { publicSite: true });
  await expect(page.locator('[data-prototype-status]')).toContainText('prepared for public access');
  await expect(page.getByRole('button', { name: 'Launch prototype', exact: true })).toHaveCount(0);
  await expect(page.locator('.siri-prototype iframe')).toHaveCount(0);
  await expect(page.locator('[data-prototype-open]')).not.toHaveAttribute('href');
  expect(localRequests).toEqual([]);
});

test('local portfolio exposes the existing app without loading it automatically', async ({ page }) => {
  const ai = await mockAI(page);
  await servePortfolio(page);
  await expect(page.getByRole('button', { name: 'Launch prototype', exact: true })).toBeVisible();
  await expect(page.locator('[data-prototype-open]')).toHaveAttribute('href', 'http://127.0.0.1:5173/?screen=siri');
  await expect(page.locator('[data-prototype-caption]')).toContainText('Local preview only');
  await expect(page.locator('.siri-prototype iframe')).toHaveCount(0);
  expect(ai.requests).toHaveLength(0);
});

test('public portfolio accepts a hosted HTTPS app and preserves its subpath', async ({ page }) => {
  await servePortfolio(page, { publicSite: true, prototypeUrl: 'https://siri.example.test/demo/?screen=home' });
  await expect(page.getByRole('button', { name: 'Launch prototype', exact: true })).toBeVisible();
  await expect(page.locator('[data-prototype-open]')).toHaveAttribute('href', 'https://siri.example.test/demo/?screen=home');
  await expect(page.locator('.siri-prototype iframe')).toHaveCount(0);
});

for (const prototypeUrl of [
  'http://127.0.0.1:5173/', 'https://localhost:5173/', 'http://siri.example.test/',
  'javascript:alert(1)', 'https://user:password@siri.example.test/',
]) {
  test(`public portfolio rejects unsafe configuration: ${prototypeUrl}`, async ({ page }) => {
    await servePortfolio(page, { publicSite: true, prototypeUrl });
    await expect(page.locator('[data-prototype-status]')).toHaveAttribute('role', 'alert');
    await expect(page.locator('[data-prototype-status]')).toContainText('not configured correctly');
    await expect(page.locator('[data-prototype-open]')).not.toHaveAttribute('href');
    await expect(page.locator('.siri-prototype iframe')).toHaveCount(0);
  });
}

test('embedded Siri preserves navigation, drafts, and real chat protocol through plan actions', async ({ page, baseURL }, testInfo) => {
  if (!baseURL) throw new Error('The Siri app URL is required.');
  const trip: TripPlanData = {
    destination: 'Kyoto, Japan', origin: 'Seattle', dates: { start: '2030-04-10', end: '2030-04-12' },
    summary: 'A Kyoto plan with gardens and vegetarian meals.',
    itinerary: [{ title: 'Gardens and galleries', date: '2030-04-10', activities: ['Explore a garden and have a vegetarian lunch.'] }],
  };
  const ai = await mockAI(page, () => ({
    text: trip.summary,
    presentation: { question: null, planType: 'trip', preferences: [], trip: { ...trip, offers: createDemoTravelOffers(trip, '2030-03-01') } },
  }));
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await servePortfolio(page, { prototypeUrl: `${baseURL}/?screen=siri` });
  await page.getByRole('button', { name: 'Launch prototype', exact: true }).click();
  const iframe = page.locator('.siri-prototype iframe');
  await expect(iframe).toBeVisible();
  await expect(iframe).not.toHaveClass(/proto-embed--loading/);
  await expect(iframe).toHaveAttribute('src', `${baseURL}/?screen=siri&embed=1`);
  await expect(page.locator('[data-prototype-placeholder]')).toBeHidden();
  const app = page.frameLocator('.siri-prototype iframe');
  await expect(app.getByText('Copilot connected', { exact: true })).toBeVisible();
  await expect(app.locator('.preview-page--embedded')).toBeVisible();
  await expect(app.locator('.preview-topbar')).toBeHidden();
  await expect(app.getByRole('button', { name: 'New chat', exact: true })).toBeVisible();
  const viewport = await app.locator('body').evaluate(element => ({
    width: document.documentElement.clientWidth, height: window.innerHeight,
    scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
  expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.height + 1);
  const input = app.getByRole('textbox', { name: 'Message Siri' });
  await input.fill('Keep this unsent question');
  const embeddedFrame = page.frames().find(frame => frame.url() === `${baseURL}/?screen=siri&embed=1`);
  if (!embeddedFrame) throw new Error('The running embedded app frame is required.');
  let appReloads = 0;
  page.on('framenavigated', frame => { if (frame === embeddedFrame) appReloads += 1; });
  await page.getByRole('link', { name: 'Try interactive prototype', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Interactive prototype', exact: true })).toBeInViewport();
  await expect(input).toHaveValue('Keep this unsent question');
  expect(appReloads).toBe(0);
  await app.getByRole('button', { name: 'Go to Home screen', exact: true }).click();
  await app.getByRole('button', { name: 'Open Bank', exact: true }).click();
  await expect(app.getByRole('dialog', { name: 'Demo Bank', exact: true })).toBeVisible();
  await app.getByRole('button', { name: 'Back to Home', exact: true }).click();
  await app.getByRole('button', { name: 'Go to Siri screen', exact: true }).click();
  await expect(input).toHaveValue('Keep this unsent question');
  expect(ai.requests).toHaveLength(0);
  await input.fill('Plan my Kyoto trip with the supplied preferences.');
  await app.getByRole('button', { name: 'Send message', exact: true }).click();
  for (const name of ['Book flight', 'Book hotel', 'View itinerary']) {
    await expect(app.getByRole('button', { name, exact: true })).toBeVisible();
  }
  expect(ai.requests).toHaveLength(1);
  await app.getByRole('button', { name: 'Book flight', exact: true }).click();
  await expect(app.getByRole('dialog', { name: 'Flight options', exact: true }).locator('article[data-offer-id]')).toHaveCount(3);
  await app.getByRole('button', { name: 'Close Flight options', exact: true }).click();
  await app.getByRole('button', { name: 'View itinerary', exact: true }).click();
  await expect(app.getByRole('dialog', { name: 'Suggested itinerary', exact: true })).toContainText('Gardens and galleries');
  await page.getByRole('link', { name: 'Try interactive prototype', exact: true }).click();
  await expect(app.getByRole('dialog', { name: 'Suggested itinerary', exact: true })).toContainText('Gardens and galleries');
  expect(appReloads).toBe(0);
  expect(ai.requests).toHaveLength(1);
  await iframe.screenshot({ path: testInfo.outputPath('siri-portfolio-embed.png') });
  expect(errors).toEqual([]);
});

test('a nonresponsive frame shows a recoverable error and ignores forged readiness', async ({ page, baseURL }) => {
  if (!baseURL) throw new Error('The Siri app URL is required.');
  await page.clock.install();
  await page.route(`${baseURL}/?screen=siri&embed=1`, route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body>App unavailable</body></html>',
  }));
  await servePortfolio(page, { prototypeUrl: `${baseURL}/?screen=siri` });
  await page.getByRole('button', { name: 'Launch prototype', exact: true }).click();
  await page.evaluate(origin => window.dispatchEvent(new MessageEvent('message', {
    origin, source: window, data: { type: 'siri-prototype:ready' },
  })), baseURL);
  await expect(page.locator('[data-prototype-placeholder]')).toBeVisible();
  await page.clock.runFor(90_001);
  await expect(page.locator('[data-prototype-status]')).toHaveAttribute('role', 'alert');
  await expect(page.locator('.siri-prototype iframe')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
  await expect(page.locator('[data-prototype-open]')).toHaveAttribute('rel', 'noopener noreferrer');
  await mockAI(page);
  await page.unroute(`${baseURL}/?screen=siri&embed=1`);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.siri-prototype iframe')).not.toHaveClass(/proto-embed--loading/);
});
