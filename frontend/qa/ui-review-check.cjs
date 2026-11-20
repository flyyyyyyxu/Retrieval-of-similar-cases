const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.QINGAN_URL || 'http://127.0.0.1:8027';
const query = '只有银行转账记录，没有借条，对方主张赠与，如何认定借贷关系？';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/#/reports`);
    assert.equal(await page.locator('.collection-heading a').getAttribute('href'), '#/search');
    await page.goto(`${base}/#/case/loan-1`);
    await page.locator('.document-paper').waitFor();
    assert.equal(await page.locator('.document-toolbar>a').getAttribute('href'), '#/search');
    await page.goto(`${base}/#/search`);
    // Both fields invalid: the first error must retain focus.
    await page.locator('#search-form').evaluate(form => {
      const years = [...form.querySelectorAll('select')].filter(e => e.name.startsWith('year'));
      years[0].value = '2025'; years[1].value = '2020';
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    assert.equal(await page.locator('#query').evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: '重置', exact: true }).click();
    await page.screenshot({ path: path.join(__dirname, 'ui-search-1440.png'), fullPage: true });
    await page.locator('#query').fill(query);
    await page.getByRole('button', { name: '开始检索', exact: true }).click();
    await page.locator('.case-row').first().getByRole('tabpanel').getByText('借贷合意', { exact: false }).waitFor();
    assert.equal(await page.locator('[data-action=expand-case]:visible').count(), 0);
    // Exercise real rendered overflow, without relying on a character-count threshold.
    await page.evaluate(async () => {
      const panel = document.querySelector('.case-row [role=tabpanel]:not([hidden])');
      panel.querySelector('.case-field-content p').textContent = '用于验证真实换行高度的演示摘要。'.repeat(100);
      const { updateExcerptControls } = await import('/components/case-card.js');
      updateExcerptControls();
    });
    assert.equal(await page.locator('[data-action=expand-case]:visible').count(), 1);
    await page.reload();
    await page.locator('.case-row').first().waitFor();
    await page.locator('.case-row').first().getByRole('link', { name: /定位原文/ }).first().click();
    await page.locator('.reader-paper').waitFor();
    await page.screenshot({ path: path.join(__dirname, 'ui-reader-1440.png'), fullPage: true });
    await page.getByRole('button', { name: '收起阅读栏' }).click();

    // Simulate an empty excerpt with a failed document fetch; retry must recover in place.
    let failDocument = true;
    await page.route('**/api/cases/loan-4', route => failDocument ? route.fulfill({ status: 503, json: { detail: '文书读取测试失败' } }) : route.continue());
    await page.evaluate(async () => {
      const { state, documentKey } = await import('/store.js');
      state.documents.delete(documentKey('loan-4'));
      state.result.hits.find(hit => hit.case.id === 'loan-4').snippets = [];
    });
    await page.getByRole('tab', { name: '可视化', exact: true }).click();
    await page.getByRole('tab', { name: /^列表/ }).click();
    const failed = page.locator('.case-row[data-case-id=loan-4]');
    await failed.scrollIntoViewIfNeeded();
    await failed.getByRole('button', { name: '重试', exact: true }).waitFor();
    failDocument = false;
    await failed.getByRole('button', { name: '重试', exact: true }).click();
    await failed.getByRole('tab', { name: '本院查明', exact: true }).waitFor();

    let failEditor = true;
    await page.route('**/vendor/quill/quill.js', route => failEditor ? route.abort() : route.continue());
    await page.locator('.case-row').first().getByRole('button', { name: '加入检索报告', exact: true }).click();
    await page.getByRole('button', { name: /^生成检索报告/ }).click();
    await page.getByRole('button', { name: '重试编辑器' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '加粗', exact: true }).isDisabled(), true);
    failEditor = false;
    await page.getByRole('button', { name: '重试编辑器' }).click();
    await page.locator('.ql-editor').waitFor();
    assert.equal(await page.getByRole('button', { name: '加粗', exact: true }).isEnabled(), true);
    assert((await page.locator('.ql-editor').innerText()).includes('报告概况'));
    assert.equal(await page.locator('#report-message').isVisible(), false);
    await page.screenshot({ path: path.join(__dirname, 'ui-report-1440.png'), fullPage: true });
    await page.getByRole('link', { name: '返回检索', exact: true }).click();
    await page.getByRole('tab', { name: '可视化', exact: true }).click();
    await page.screenshot({ path: path.join(__dirname, 'ui-visual-1440.png'), fullPage: true });
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(__dirname, `ui-visual-${width}.png`), fullPage: true });
    }
    await page.emulateMedia({ forcedColors: 'active' });
    await page.getByRole('button', { name: '展开导航' }).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    assert(await page.getByRole('button', { name: '展开导航' }).evaluate(el => {
      const style = getComputedStyle(el);
      return parseFloat(style.outlineWidth) >= 2 && style.outlineStyle !== 'none';
    }));
    assert.deepEqual(errors, []);
    console.log('PASS: contextual returns, first-error focus, measured excerpt controls, document retry, editor retry, theme screenshots, responsive overflow and high-contrast focus.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
