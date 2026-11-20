const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.QINGAN_URL || 'http://127.0.0.1:8027';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Controlled metadata to verify tree aggregation, without changing the API contract.
    await page.route('**/api/search', async route => {
      const response = await route.fetch(), body = await response.json();
      body.hits.forEach((hit, i) => {
        hit.case.cause = i === 3 ? '保证合同纠纷' : '民间借贷纠纷';
        hit.case.cause_path = ['民事', '合同纠纷', hit.case.cause];
      });
      await route.fulfill({ response, json: body });
    });
    await page.goto(`${base}/#/search`);
    const pageTitleSize = await page.locator('.search-heading h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    await page.screenshot({ path: path.join(__dirname, 'product-search-1440.png') });
    await page.locator('#query').fill('只有银行转账记录，没有借条，对方主张赠与，如何认定借贷关系？');
    await page.getByRole('button', { name: '开始检索', exact: true }).click();
    const first = page.locator('.case-row').first();
    await first.locator('[role=tabpanel]:not([hidden]) .case-field-content p').waitFor();
    const font = await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily);
    const roles = await first.evaluate(row => ['.case-title', '.case-field-content p', '.case-meta'].map(selector => {
      const style = getComputedStyle(row.querySelector(selector));
      return { family: style.fontFamily, size: parseFloat(style.fontSize) };
    }));
    assert(roles.every(role => role.family === font));
    assert(pageTitleSize > roles[0].size && roles[0].size > roles[1].size && roles[1].size > roles[2].size);
    assert.equal(await first.locator('[role=tab][aria-selected=true]').evaluate(el => getComputedStyle(el, '::after').content), 'none');
    await first.getByRole('button', { name: '加入检索报告', exact: true }).click();
    const selectedAction = first.getByRole('button', { name: '从检索报告移除', exact: true });
    await selectedAction.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await selectedAction.evaluate(el => getComputedStyle(el).outlineWidth), '2px');
    await page.screenshot({ path: path.join(__dirname, 'product-results-1440.png'), fullPage: true });
    await first.locator('.case-title').click();
    await page.locator('.reader-paragraph p').first().waitFor();
    assert.equal(await page.locator('.reader-paragraph p').first().evaluate(el => getComputedStyle(el).fontFamily), font);
    await page.locator('.reader-scroll').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: path.join(__dirname, 'product-reader-1440.png') });
    await page.getByRole('button', { name: '收起阅读栏' }).click();
    await page.getByRole('tab', { name: '可视化', exact: true }).click();
    assert.equal(await page.locator('#case-view-visual').evaluate(el => getComputedStyle(el, '::after').content), 'none');
    assert.equal(await page.locator('.visual-card h3').first().evaluate(el => getComputedStyle(el).borderInlineStartWidth), '0px');
    assert.equal(await page.locator('.court-donut circle').first().getAttribute('stroke-width'), '16');
    assert.equal(await page.locator('[data-cause-path="民事"]').getAttribute('data-cause-count'), '4');
    assert.equal(await page.locator('[data-cause-path="民事 / 合同纠纷 / 民间借贷纠纷"]').getAttribute('data-cause-count'), '3');
    assert.equal(await page.locator('[data-cause-path="民事 / 合同纠纷 / 保证合同纠纷"]').getAttribute('data-cause-count'), '1');
    assert.equal(await page.locator('.cause-tree-scroll svg').count(), 0);
    await page.screenshot({ path: path.join(__dirname, 'product-visual-1440.png'), fullPage: true });
    // Text scaling must preserve controls and the actual counts.
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.equal(await page.locator('[data-cause-path="民事"]').getAttribute('data-cause-count'), '4');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    for (const width of [768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('.work-header').count(), 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page overflow at ${width}`);
      assert(await page.locator('.cause-tree-scroll').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `cause labels clip at ${width}`);
      await page.screenshot({ path: path.join(__dirname, `product-visual-${width}.png`), fullPage: true });
      await page.locator('.visualization').screenshot({ path: path.join(__dirname, `product-charts-${width}.png`) });
    }
    // Verify escaping and long-label wrapping in the new HTML tree.
    await page.locator('.visualization').evaluate(async host => {
      const { state } = await import('/store.js');
      const { visualization } = await import('/components/visualization.js');
      state.result.hits[0].case.cause_path = ['民事', '<img src=x onerror="window.injected=true">', '用于校验窄屏自然换行的较长案由名称'];
      host.outerHTML = visualization();
    });
    assert.equal(await page.locator('.cause-tree img').count(), 0);
    assert.equal(await page.evaluate(() => Boolean(window.injected)), false);
    assert(await page.locator('.cause-tree-scroll').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert.deepEqual(errors, []);
    console.log('PASS: unified font roles, quieter selected states, chart geometry, real hierarchy counts, 200% text, 320/390/768px reflow and safe long labels.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
