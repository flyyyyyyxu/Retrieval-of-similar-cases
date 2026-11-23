// Run against scripts/dev-local.sh. Uses the actual API and local case data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.QINGAN_URL || 'http://127.0.0.1:8000';
const output = process.env.QINGAN_SCREENSHOTS || __dirname;
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByText('金融借款 · 示例', { exact: true }).waitFor();
    await page.getByRole('link', { name: '开始检索', exact: true }).click();
    await page.locator('[data-action=use-example]').first().click();
    assert((await page.locator('#query').inputValue()).includes('复利'));
    const response = page.waitForResponse(r => r.url().endsWith('/api/search') && r.request().method() === 'POST');
    await page.locator('#search-form button[type=submit]').click();
    const result = await (await response).json();
    assert(result.hits.length > 0);
    assert(result.hits.every(h => h.case.cause === '金融借款合同纠纷' && h.case.source_type === 'judgment'));
    await page.locator('.case-row').first().waitFor();
    await page.locator('.search-answer:not(.is-pending) .answer-citation').first().waitFor();
    const row = page.locator('.case-row').first();
    await row.getByRole('tab', { name: '案例分析', exact: true }).waitFor();
    await row.getByRole('tab', { name: '案例分析', exact: true }).click();
    assert((await row.locator('[role=tabpanel]:visible').innerText()).includes('AI归纳'));
    await page.screenshot({ path: path.join(output, 'local-cases-results.png'), fullPage: true });
    assert.equal(await page.locator('.case-row .answer-citation, .analysis-citations').count(), 0);
    assert.deepEqual(await page.locator('.answer-part h3').allTextContents(), ['总结', '裁判观点', '案例比较']);
    assert((await page.locator('#answer-summary').locator('..').innerText()).includes('复利'));
    assert((await page.locator('#answer-comparison').locator('..').innerText()).includes('相比'));
    const firstId = await row.getAttribute('data-case-id');
    const detail = await (await page.request.get(`${base}/api/cases/${firstId}`)).json();
    const analysisTarget = await row.locator('[role=tabpanel]:visible .view-original').getAttribute('href');
    assert(analysisTarget.includes(firstId));
    const targetId = analysisTarget.split('/').at(-1);
    await row.locator('[role=tabpanel]:visible .view-original').click();
    await page.locator('.reader-target').waitFor();
    assert.equal(await page.locator('.reader-target p').innerText(), detail.paragraphs.find(p => p.id === targetId).text);
    assert((await page.locator('.reader-document-heading h2').innerText()).includes(detail.title));
    await page.screenshot({ path: path.join(output, 'local-cases-citation.png'), fullPage: true });
    await page.getByRole('button', { name: '收起阅读栏', exact: true }).click();
    for (const label of ['案情概要', '本院认为', '本院查明', '裁判结果']) {
      const tab = row.getByRole('tab', { name: label, exact: true });
      if (!await tab.count()) continue;
      await tab.click();
      const href = await row.locator('[role=tabpanel]:visible .view-original').getAttribute('href');
      const pid = href.split('/').at(-1);
      assert(detail.paragraphs.some(p => p.id === pid));
      await row.locator('[role=tabpanel]:visible .view-original').click();
      await page.locator('.reader-target').waitFor();
      assert.equal(await page.locator('.reader-target p').innerText(), detail.paragraphs.find(p => p.id === pid).text);
      await page.getByRole('button', { name: '收起阅读栏', exact: true }).click();
    }
    const sourceByNumber = new Map();
    for (const citation of await page.locator('.search-answer .answer-citation').all()) {
      const number = await citation.innerText(), href = await citation.getAttribute('href');
      assert(!sourceByNumber.has(number) || sourceByNumber.get(number) === href);
      sourceByNumber.set(number, href);
    }
    // Simulate history created before the three-part contract; reload should regenerate it.
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem('qingan.api.v2'));
      delete data.history[0].answer.version;
      delete data.history[0].answer.case_comparison;
      localStorage.setItem('qingan.api.v2', JSON.stringify(data));
    });
    const regenerated = page.waitForResponse(r => r.url().endsWith('/api/search/answer'));
    await page.reload();
    assert.equal((await (await regenerated).json()).version, 2);
    await page.locator('#answer-comparison').waitFor();
    assert((await page.locator('#answer-comparison').locator('..').innerText()).includes('相比'));
    await page.locator('[data-action=edit-query]').click();
    await page.locator('#query').fill('借款逾期后，复利及律师费应如何审查？');
    await page.locator('[data-scope-summary=regions]').click();
    await page.locator('input[name=regions][value="安徽"]').check();
    await page.locator('[data-scope-summary=regions]').click();
    await page.locator('[data-scope-summary=court_levels]').click();
    await page.locator('input[name=court_levels][value="基层法院"]').check();
    await page.locator('[data-scope-summary=court_levels]').click();
    const filteredResponse = page.waitForResponse(r => r.url().endsWith('/api/search') && r.request().method() === 'POST');
    await page.locator('#search-form button[type=submit]').click();
    const filtered = await (await filteredResponse).json();
    assert(filtered.hits.length > 0);
    assert(filtered.hits.every(h => h.case.region.startsWith('安徽') && h.case.court_level === '基层人民法院'));
    await page.locator('.search-answer:not(.is-pending) .answer-citation').first().waitFor();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1100 });
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `overflow at ${width}`);
    }
    await page.screenshot({ path: path.join(output, 'local-cases-filtered.png'), fullPage: true });
    // Generated text is still untrusted text, even when citations have passed validation.
    const unsafe = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await unsafe.route('**/api/cases/*', async route => {
      const response = await route.fetch();
      const body = await response.json();
      for (const section of body.content_sections || []) if (section.origin === 'ai') section.text = '<img src=x onerror="window.injected=true">安全渲染测试';
      await route.fulfill({ response, json: body });
    });
    await unsafe.goto(base + '/#/search');
    await unsafe.locator('[data-action=use-example]').first().waitFor();
    await unsafe.locator('#query').fill('金融借款复利如何审查');
    await unsafe.locator('#search-form button[type=submit]').click();
    await unsafe.locator('.case-row').first().getByRole('tab', { name: '案例分析', exact: true }).waitFor();
    assert((await unsafe.locator('.case-row').first().innerText()).includes('<img'));
    assert.equal(await unsafe.locator('.case-field-panels img').count(), 0);
    assert.equal(await unsafe.evaluate(() => window.injected), undefined);
    await unsafe.close();
    assert.deepEqual(errors, []);
    console.log('PASS: three answer sections; per-tab original paragraphs and case title; unique global citations; history refresh; province/level filters; 320/390/768/1440 layouts; safe text.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
