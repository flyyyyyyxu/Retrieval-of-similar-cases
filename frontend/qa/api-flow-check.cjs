// Run against an isolated mock backend with ANTHROPIC_API_KEY='' and RERANK_URL=''.
// PLAYWRIGHT_MODULE can point to an installed Playwright package (no frontend build required).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.QINGAN_URL || 'http://127.0.0.1:8027';
const output = process.env.QINGAN_SCREENSHOTS || __dirname;

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { requests.push(request.url()); });
    await page.goto(base);
    await page.getByRole('link', { name: '开始检索', exact: true }).click();
    await page.locator('#search-form button[type=submit]').click();
    await page.locator('#query-error').waitFor({ state: 'visible' });
    assert.equal(requests.filter(url => url.endsWith('/query/parse')).length, 0);

    await page.locator('[data-action=use-example]').first().click();
    const original = await page.locator('#query').inputValue();
    await page.locator('#query').focus();
    const inputStyle = await page.locator('#query').evaluate(element => {
      const style = getComputedStyle(element);
      return { border: style.borderTopWidth, outline: style.outlineStyle, shadow: style.boxShadow };
    });
    assert.deepEqual(inputStyle, { border: '0px', outline: 'none', shadow: 'none' });
    assert.equal(await page.locator('.query-label').count(), 0);
    await page.screenshot({ path: path.join(output, 'direct-input-1440.png'), fullPage: true });

    // Actual unconfigured model preserves the input and permits direct search.
    await page.locator('[data-action=optimize-question]').click();
    await page.locator('.optimization-notice').waitFor();
    assert.equal(await page.locator('#query').inputValue(), original);
    assert.equal(requests.filter(url => url.endsWith('/api/search')).length, 0);
    const rewritten = '只有转账记录且没有借条，收款方主张赠与，如何查找认定借贷关系的类案？';
    await page.route('**/api/query/optimize', route => route.fulfill({ json: {
      original_text: original, optimized_text: rewritten, status: 'ready', notice: null,
    } }), { times: 1 });
    await page.locator('[data-action=optimize-question]').click();
    await page.locator('.optimization-preview').waitFor();
    assert.equal(await page.locator('#query').inputValue(), original, 'preview must not overwrite');
    await page.locator('[data-action=apply-optimization]').click();
    assert.equal(await page.locator('#query').inputValue(), rewritten);
    await page.route('**/api/query/parse', async route => {
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.continue().catch(() => {});
    }, { times: 1 });
    const responseWait = page.waitForResponse(response => response.url().endsWith('/api/search'));
    await page.locator('#search-form button[type=submit]').click();
    await page.locator('#search-progress[open]').waitFor();
    assert((await page.locator('.query-heading').innerText()).includes(rewritten));
    assert.equal(await page.locator('#confirm-form').count(), 0);
    await page.screenshot({ path: path.join(output, 'direct-progress-1440.png'), fullPage: true });
    const result = await (await responseWait).json();
    await page.locator('.case-row').first().waitFor();
    assert.equal(await page.locator('.case-row').count(), result.hits.length);
    assert.equal(result.hits.length, 4);
    await page.locator('#search-progress:not([open])').waitFor();
    assert((await page.locator('.search-answer-text').innerText()).includes('结论：'));
    assert((await page.locator('.search-answer-text').innerText()).includes('裁判观点：'));
    assert.equal(requests.filter(url => url.endsWith('/api/search/answer')).length, 1);
    assert(!requests.some(url => url.endsWith('/data.js')));
    await page.screenshot({ path: path.join(output, 'direct-results-1440.png'), fullPage: true });

    await page.locator('#sort').selectOption('oldest');
    assert((await page.locator('.case-meta').first().innerText()).includes('2023.06.22'));
    await page.locator('[data-action=explain]').first().click();
    await page.locator('dialog .citation-link').first().waitFor();
    assert((await page.getByRole('dialog').innerText()).includes('原文摘录'));
    await page.getByRole('button', { name: '有参考价值', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '反馈已记录' }).waitFor();
    await page.locator('dialog .citation-link').first().click();
    await page.locator('.reader-target').waitFor();
    assert((await page.locator('.reader-target p').innerText()).length > 0);
    await page.screenshot({ path: path.join(output, 'api-document-1440.png'), fullPage: true });
    await page.getByRole('button', { name: '收起阅读栏' }).click();
    assert.equal(await page.locator('#sort').inputValue(), 'oldest');

    // Result rows now add to reports; the full document retains the separate favorites action.
    const firstId = await page.locator('.case-row').first().getAttribute('data-case-id');
    await page.goto(`${base}/#/case/${firstId}`);
    await page.locator('[data-action=save-case]').first().click();
    await page.getByLabel('默认收藏夹', { exact: false }).check();
    await page.getByRole('button', { name: '保存收藏', exact: true }).click();
    await page.locator('.saved-button').first().waitFor();

    await page.locator('a[href="#/saved"]').click();
    await page.getByRole('heading', { name: '我的收藏', exact: true }).waitFor();
    assert.equal(await page.locator('.case-row').count(), 1);
    await page.locator('.case-title').click();
    await page.locator('.reader-paper').waitFor();
    await page.getByRole('button', { name: '收起阅读栏' }).click();
    await page.locator('a[href="#/history"]').click();
    await page.locator('.history-list article').first().waitFor();
    await page.locator('.history-list [data-action=open-history]').first().click();
    await page.locator('#sort').waitFor();
    await page.reload();
    await page.locator('.case-row').first().waitFor();
    assert.equal(await page.locator('#sort').inputValue(), 'oldest');

    await page.locator('[data-action=edit-query]').click();
    assert.equal(await page.locator('#query').inputValue(), rewritten);
    await page.locator('#query').fill('完全不包含当前词表的查询内容');
    await page.locator('#search-form button[type=submit]').click();
    await page.getByRole('heading', { name: '未找到相关案例' }).waitFor();
    await page.locator('[data-action=edit-query]').first().click();
    await page.locator('#query').fill(original);
    await page.route('**/api/search', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: '测试：服务暂不可用' }) }), { times: 1 });
    await page.locator('#search-form button[type=submit]').click();
    await page.getByRole('heading', { name: '本次检索未完成' }).waitFor();
    await page.getByRole('button', { name: '重新检索', exact: true }).click();
    await page.locator('.case-row').first().waitFor();
    assert.equal(await page.locator('.case-row').count(), 4);

    for (const width of [390, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `results overflow at ${width}`);
      await page.screenshot({ path: path.join(output, `direct-results-${width}.png`), fullPage: true });
    }
    await page.goto(`${base}/#/`);
    await page.locator('[data-action=use-example]').first().click();
    await page.locator('#query').waitFor();
    await page.setViewportSize({ width: 390, height: 1000 });
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'input overflow at 390');
    assert.equal(await page.locator('.work-header').count(), 1);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator('#query').focus();
    await page.screenshot({ path: path.join(output, 'direct-input-390.png'), fullPage: true });

    // Slow parse must not overwrite a newer page after cancellation.
    await page.route('**/api/query/parse', async route => {
      await new Promise(resolve => setTimeout(resolve, 500));
      await route.continue().catch(() => {});
    }, { times: 1 });
    await page.locator('#search-form button[type=submit]').click();
    await page.getByRole('button', { name: '取消检索', exact: true }).click();
    await page.locator('#query').waitFor();
    await page.waitForTimeout(650);
    assert.equal(await page.locator('#confirm-form').count(), 0);
    assert((await page.locator('#query').inputValue()).includes('转账'));

    // Editing while optimization is in flight must preserve the newer input.
    await page.route('**/api/query/optimize', async route => {
      await new Promise(resolve => setTimeout(resolve, 400));
      await route.fulfill({ json: { original_text: original, optimized_text: rewritten, status: 'ready' } }).catch(() => {});
    }, { times: 1 });
    await page.locator('[data-action=optimize-question]').click();
    await page.locator('#query').fill('这是用户后来编辑的另一个检索问题');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#query').inputValue(), '这是用户后来编辑的另一个检索问题');
    assert.equal(await page.locator('.optimization-preview').count(), 0);

    // Future answer strategies fill two cited fields into one reply paragraph.
    const answerPage = await browser.newPage();
    await answerPage.route('**/api/search/answer', async route => {
      const searchId = route.request().postDataJSON().search_id;
      const detail = await (await answerPage.request.get(`${base}/api/cases/loan-1`)).json();
      const paragraph = detail.paragraphs.find(p => p.id === 'p5');
      const point = text => ({ text, origin: 'ai', citations: [{ case_id: 'loan-1', paragraph_id: 'p5', quote: paragraph.text, verified: true }] });
      await route.fulfill({ json: { search_id: searchId, status: 'ready', conclusion: point('测试结论内容'), judicial_view: point('测试裁判观点内容') } });
    });
    await answerPage.goto(`${base}/#/search`);
    await answerPage.locator('#query').fill(original);
    await answerPage.locator('#search-form button[type=submit]').click();
    await answerPage.locator('.case-row').first().waitFor();
    assert.equal(await answerPage.locator('.search-answer-text').count(), 1);
    assert((await answerPage.locator('.search-answer-text').innerText()).includes('测试结论内容'));
    assert((await answerPage.locator('.search-answer-text').innerText()).includes('测试裁判观点内容'));
    assert.equal(await answerPage.locator('.answer-citation').count(), 2);
    await answerPage.close();

    // Returned document fields are untrusted text; source links only accept HTTP(S).
    const untrusted = await browser.newPage();
    await untrusted.route('**/api/cases/loan-1', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.title = '<img src=x onerror="window.injected=true">文书标题';
      body.source_url = 'javascript:window.injected=true';
      body.paragraphs[4].text = '<script>window.injected=true</script>原文';
      await route.fulfill({ response, json: body });
    });
    await untrusted.goto(`${base}/#/case/loan-1/p5`);
    await untrusted.locator('.document-paper').waitFor();
    assert.equal(await untrusted.locator('.document-paper img, .document-paper script').count(), 0);
    assert((await untrusted.locator('.document-heading h1').innerText()).includes('<img'));
    assert.equal(await untrusted.locator('a[href^="javascript:"]').count(), 0);
    assert.equal(await untrusted.evaluate(() => window.injected), undefined);
    await untrusted.close();
    assert.deepEqual(errors, []);
    console.log('PASS: direct search, optimization preview/fallback, execution progress auto-collapse, answer slots, lazy explanation, citation, feedback, saved/history, refresh, errors/retry, cancellation, safe text and responsive layouts.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
