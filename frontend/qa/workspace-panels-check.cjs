const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.QINGAN_URL || 'http://127.0.0.1:8027';
const screenshot = name => path.join(__dirname, name);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [], filtersSent = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', request => { if (request.url().endsWith('/api/search/filter')) filtersSent.push(request.postDataJSON()); });
    // Controlled classification/summary fixtures only for presentation checks.
    await page.route('**/api/search', async route => {
      const response = await route.fetch(), body = await response.json();
      body.hits.forEach(hit => {
        hit.case.cause_path = ['民事', '民间借贷纠纷'];
        if (hit.case.id === 'loan-3') {
          hit.case.source_type = 'typical';
          hit.case.updated_date = '2025-05-03';
          hit.score = -10;
        }
      });
      await route.fulfill({ response, json: body });
    });
    await page.route('**/api/cases/loan-*', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch(), body = await response.json();
      if (body.id === 'loan-3') {
        body.source_type = 'typical';
        body.content_sections = [
          { key: 'overview', text: '这是来源提供的示例概要，不由界面补全。', paragraph_ids: ['p4'] },
          { key: 'result', text: null, paragraph_ids: ['p6'] },
        ];
      } else if (body.id === 'loan-2') body.content_sections = [];
      await route.fulfill({ response, json: body });
    });
    await page.goto(`${base}/#/search`);
    await page.locator('#query').fill('只有转账记录，没有借条，对方主张赠与，如何查找类似案件？');
    await page.getByRole('button', { name: '开始检索', exact: true }).click();
    await page.locator('.case-row').first().waitFor();
    assert.equal(await page.locator('.case-row').first().getAttribute('data-case-id'), 'loan-3');
    await page.locator('.case-row').first().getByText('这是来源提供的示例概要，不由界面补全。', { exact: true }).waitFor();
    assert.equal(await page.locator('.case-row').first().getByRole('tab').count(), 2);
    assert.equal(await page.locator('.case-row').first().getByRole('tab', { name: '本院认为' }).count(), 0);
    assert((await page.locator('.case-row').first().innerText()).includes('官方典型案例'));
    assert((await page.locator('.case-row').first().innerText()).includes('2025.05.03 更新'));
    await page.locator('#sort').selectOption('newest');
    assert.equal(await page.locator('.case-row').first().getAttribute('data-case-id'), 'loan-3');

    const originalHash = await page.evaluate(() => location.hash);
    await page.locator('.case-row').first().getByRole('link', { name: '定位原文' }).click();
    await page.locator('.reader-target[data-paragraph-id=p4]').waitFor();
    assert.equal(await page.evaluate(() => location.hash), originalHash);
    const firstLeft = await page.locator('#main-content').boundingBox(), readerBox = await page.locator('.document-reader').boundingBox();
    assert(firstLeft.x + firstLeft.width <= readerBox.x + 2);
    await page.locator('[data-case-id=loan-1].case-row .case-title').click();
    await page.locator('.reader-scroll[data-case-id=loan-1] .reader-paper').waitFor();
    await page.locator('[data-case-id=loan-2].case-row .case-title').click();
    await page.locator('.reader-scroll[data-case-id=loan-2] .reader-paper').waitFor();
    assert.equal(await page.locator('.reader-tabs [role=tab]').count(), 3);
    assert.equal(await page.locator('[data-case-id=loan-2].case-row [role=tab]').count(), 0);
    await page.locator('[data-action=reader-tab][data-id=loan-3]').click();
    const scroll = page.locator('.reader-scroll[data-case-id=loan-3]');
    await scroll.evaluate(element => { element.scrollTop = 80; element.dispatchEvent(new Event('scroll')); });
    await page.locator('[data-action=reader-tab][data-id=loan-1]').click();
    await page.locator('[data-action=reader-tab][data-id=loan-3]').click();
    await page.waitForFunction(() => Math.abs(document.querySelector('.reader-scroll[data-case-id="loan-3"]').scrollTop - 80) < 3);
    await page.screenshot({ path: screenshot('workspace-reader-tabs-1440.png') });
    await page.getByRole('button', { name: '关闭当前', exact: true }).click();
    assert.equal(await page.locator('.reader-tabs [role=tab]').count(), 2);
    await page.getByRole('button', { name: '收起阅读栏' }).click();
    assert.equal(await page.locator('.document-reader').count(), 0);

    await page.getByRole('button', { name: '过滤条件', exact: false }).click();
    await page.locator('#result-filter-form').waitFor();
    assert.equal(await page.locator('.filter-group').count(), 12);
    await page.screenshot({ path: screenshot('workspace-filter-12-fields.png') });
    await page.locator('.filter-group summary').filter({ hasText: '裁判日期' }).click();
    await page.locator('[name=date_from]').fill('2026-01-01');
    await page.locator('[name=date_to]').fill('2025-01-01');
    await page.getByRole('button', { name: '应用过滤' }).click();
    assert.equal(filtersSent.length, 0);
    assert.equal(await page.locator('[name=date_to]').evaluate(element => element.validity.valid), false);
    await page.locator('[name=date_from]').fill('');
    await page.locator('[name=date_to]').fill('');
    await page.locator('.filter-group summary').filter({ hasText: '审理法院' }).click();
    await page.getByLabel('上海市某区人民法院', { exact: true }).check();
    await page.getByRole('button', { name: '应用过滤' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.case-row').length === 1);
    assert.deepEqual(filtersSent[0].filters.courts, ['上海市某区人民法院']);
    assert('has_hearing_video' in filtersSent[0].filters && 'case_fee_max' in filtersSent[0].filters);
    assert.equal(filtersSent[0].filters.date_from, null);
    await page.getByRole('button', { name: '过滤条件', exact: false }).click();
    await page.getByRole('button', { name: '重置', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.case-row').length === 4);
    await page.getByRole('tab', { name: '可视化', exact: true }).click();
    await page.locator('.visualization').filter({ visible: true }).waitFor();
    assert.equal(await page.locator('.visualization .visual-card').count(), 3);
    assert((await page.locator('.visualization-scope').innerText()).includes('4篇'));
    assert.equal(await page.locator('.region-table tbody tr').count(), 4);
    assert((await page.locator('.court-donut').innerText()).includes('50.00%'));
    await page.screenshot({ path: screenshot('workspace-visualization-1440.png'), fullPage: true });
    await page.getByRole('tab', { name: '列表', exact: false }).click();
    await page.locator('[data-case-id=loan-1].case-row .case-title').click();
    assert.equal(await page.locator('.reader-tabs [role=tab]').count(), 2);
    for (const width of [1280, 1920, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      // The breakpoint rerenders the reader and restores scroll on the next frame.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('.document-reader').count(), 1);
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `reader overflow ${width}`);
      await page.screenshot({ path: screenshot(`workspace-reader-${width}.png`) });
    }
    assert.equal(await page.locator('#main-content').getAttribute('inert'), '');
    await page.getByRole('button', { name: '收起阅读栏' }).click();
    await page.getByRole('tab', { name: '可视化', exact: true }).click();
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'mobile charts overflow');
    await page.screenshot({ path: screenshot('workspace-visualization-390.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: multi-document split reader, independent scroll/tabs/close, optional summaries, typical priority, 12 filter fields/API, validation/reset, list/visualization and responsive layouts.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
