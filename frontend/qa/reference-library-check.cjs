const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.QINGAN_URL || 'http://127.0.0.1:8027';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Only controlled demonstration statutes are injected. No external legal corpus is fetched.
    await page.route('**/api/cases/loan-*', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch(), body = await response.json();
      if (['loan-1', 'loan-2', 'loan-3'].includes(body.id)) {
        body.law_references = [{
          id: 'demo-statute', title: '示例法规（演示）', version: body.id === 'loan-3' ? '第二测试版本' : '第一测试版本',
          authority: '示例发布机构', published_date: '2025-01-01', effective_date: '2025-02-01',
          source_url: 'javascript:window.injected=true',
          articles: [{ id: 'article-1', number: '第一条', text: '此处为验证界面与引用分组的虚构条文。<img src=x onerror="window.injected=true">', paragraph_ids: ['p5'] }],
        }];
      }
      await route.fulfill({ response, json: body });
    });
    await page.goto(`${base}/#/search`);
    await page.locator('#query').fill('只有银行转账记录，没有借条，对方主张款项属于赠与，如何审查借贷关系是否成立？');
    await page.getByRole('button', { name: '开始检索', exact: true }).click();
    await page.locator('.case-row').first().waitFor();
    await page.locator('.case-row').first().getByRole('tabpanel').filter({ visible: true }).getByText('款项交付与借贷合意', { exact: false }).waitFor();
    assert.equal(await page.locator('.result-source, .processing-notes, .sidebar .data-mode, [data-action=service-info]').count(), 0);
    assert.equal(await page.locator('.case-row').count(), 4);
    assert.equal(await page.locator('.case-row').first().getByRole('tab').count(), 4);
    assert((await page.locator('.case-meta').first().innerText()).includes('2025.09.18 裁判'));
    assert.equal(await page.locator('.document-type-pill').count(), 4);
    const first = page.locator('.case-row').first();
    await first.getByRole('tab', { name: '诉讼请求', exact: true }).click();
    assert((await first.getByRole('tabpanel').filter({ visible: true }).innerText()).includes('只有银行转账记录'));
    assert.equal(await first.getByRole('tab', { name: '证据', exact: true }).count(), 0);
    await first.getByRole('tab', { name: '本院认为', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), '本院查明');
    await page.keyboard.press('Enter');
    assert.equal(await first.getByRole('tab', { name: '本院查明', exact: true }).getAttribute('aria-selected'), 'true');
    await first.getByRole('tab', { name: '本院认为', exact: true }).click();

    await page.locator('[data-select-case=loan-1]').check();
    await page.locator('[data-select-case=loan-2]').check();
    assert(await page.locator('#select-all-cases').evaluate(element => element.indeterminate));
    const downloadWait = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出案例信息（JSON）' }).click();
    const download = await downloadWait;
    const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    assert.equal(exported.length, 2);
    assert(!exported[0].paragraphs && !exported[0].law_references);
    await page.getByRole('button', { name: '将选中案例加入检索报告' }).click();
    assert.equal(await page.locator('.add-to-report[aria-pressed=true]').count(), 2);
    assert.equal(await page.locator('.report-badge').innerText(), '2');
    await page.getByRole('button', { name: '过滤条件', exact: false }).click();
    await page.locator('#result-filter-form').waitFor();
    await page.locator('.filter-group summary').filter({ hasText: '审理法院' }).click();
    await page.getByLabel('上海市某区人民法院', { exact: true }).check();
    await page.getByRole('button', { name: '应用过滤' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.case-row').length === 1);
    assert.equal(await page.locator('.case-row').count(), 1);
    await page.evaluate(() => { window.print = () => { window.printedCases = document.querySelectorAll('#selected-case-print .case-row').length; }; });
    await page.getByRole('button', { name: '打印选中案例' }).click();
    await page.waitForFunction(() => window.printedCases === 2);
    assert.equal(await page.locator('#selected-case-print').count(), 0);
    await page.getByRole('button', { name: '过滤条件', exact: false }).click();
    await page.getByRole('button', { name: '重置', exact: true }).click();
    assert.equal(await page.locator('.case-row').count(), 4);
    await page.screenshot({ path: path.join(__dirname, 'reference-cases-1440.png'), fullPage: true });

    await page.getByRole('tab', { name: '引用法规', exact: true }).click();
    await page.locator('.statute-group').first().waitFor();
    assert.equal(await page.locator('.statute-group').count(), 2, 'versions must stay separate');
    assert.equal(await page.getByRole('button', { name: '查看第一条的2个引用案例' }).count(), 1);
    assert((await page.locator('.statute-meta').first().innerText()).includes('2025.02.01 实施'));
    assert.equal(await page.locator('.statute-group img, a[href^="javascript:"]').count(), 0);
    await page.screenshot({ path: path.join(__dirname, 'reference-laws-1440.png'), fullPage: true });
    await page.getByRole('button', { name: '查看第一条的2个引用案例' }).click();
    assert.equal(await page.locator('dialog .law-related-cases>a').count(), 2);
    await page.locator('dialog .law-related-cases>a').first().click();
    await page.locator('.reader-target').waitFor();
    await page.getByRole('button', { name: '收起阅读栏' }).click();
    await page.locator('.statute-group').first().waitFor();
    await page.getByRole('tab', { name: '引用法规', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), '相关案例');
    assert.equal(await page.locator('#results-tab-laws').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#results-tab-cases').getAttribute('aria-selected'), 'true');
    for (const width of [390, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `case overflow at ${width}`);
      await page.screenshot({ path: path.join(__dirname, `reference-cases-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.getByRole('tab', { name: '引用法规', exact: true }).click();
    await page.screenshot({ path: path.join(__dirname, 'reference-laws-390.png'), fullPage: true });
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'law overflow at 390');
    assert.deepEqual(errors, []);
    console.log('PASS: clean layout, case fields, metadata, keyboard tabs, selection/export/favorites, filters, statute versions/counts/source links, drawer navigation and responsive layouts.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
