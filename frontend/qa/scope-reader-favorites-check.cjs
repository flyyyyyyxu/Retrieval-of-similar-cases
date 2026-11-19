const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.QINGAN_URL || 'http://127.0.0.1:8027';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
    const errors = [], searches = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { if (r.url().endsWith('/api/search')) searches.push(r.postDataJSON()); });
    const legacy = await (await page.request.get(`${base}/api/cases/loan-1`)).json();
    delete legacy.paragraphs; delete legacy.content_sections; delete legacy.law_references;
    await page.addInitScript(({ origin, legacy }) => {
      if (location.origin === origin && !localStorage.getItem('qa-seeded')) {
        localStorage.setItem('qingan.api.v2', JSON.stringify({ history: [], saved: [{ case: legacy, mode: 'mock' }] }));
        localStorage.setItem('qa-seeded', '1');
      }
    }, { origin: base, legacy });
    await page.goto(`${base}/#/saved`);
    await page.locator('.favorite-item').waitFor();
    assert((await page.locator('.favorite-location').innerText()).includes('默认收藏夹'));
    await page.getByRole('button', { name: '新建收藏夹', exact: true }).click();
    await page.getByLabel('收藏夹名称', { exact: true }).fill('借贷证据');
    await page.getByRole('button', { name: '创建收藏夹', exact: true }).click();
    await page.getByRole('button', { name: '借贷证据 0', exact: true }).waitFor();
    await page.locator('.sidebar [data-action=new-search]').click();
    await page.locator('#query').fill('只有银行转账记录，没有借条，对方主张赠与，如何认定借贷关系？');
    await page.getByLabel('地域', { exact: true }).selectOption('上海');
    await page.getByLabel('起始年份', { exact: true }).selectOption('2026');
    await page.getByLabel('截止年份', { exact: true }).selectOption('2025');
    await page.getByLabel('法院层级', { exact: true }).selectOption('基层法院');
    await page.getByRole('button', { name: '开始检索', exact: true }).click();
    assert.equal(searches.length, 0);
    assert((await page.locator('#scope-error').innerText()).includes('不能早于'));
    await page.getByLabel('起始年份', { exact: true }).selectOption('2025');
    await page.screenshot({ path: path.join(__dirname, 'scope-search-1440.png') });
    await page.getByLabel('截止年份', { exact: true }).selectOption('');
    // A conflicting inferred scope must not override manually selected values.
    await page.route('**/api/query/parse', async route => {
      const response = await route.fetch(), body = await response.json();
      body.query.filters = { region: '北京', year_from: 2024, year_to: 2024, court_level: '中级法院' };
      await route.fulfill({ response, json: body });
    }, { times: 1 });
    await page.getByRole('button', { name: '开始检索', exact: true }).click();
    await page.locator('.case-row').waitFor();
    assert.equal(await page.locator('.case-row').count(), 1);
    assert.deepEqual(searches[0].query.filters, { region: '上海', year_from: 2025, year_to: null, court_level: '基层法院' });
    assert((await page.locator('.query-scope-summary').innerText()).includes('上海'));
    await page.getByRole('button', { name: '修改', exact: true }).click();
    assert.equal(await page.locator('#scope-region').inputValue(), '上海');
    assert.equal(await page.locator('#scope-year-from').inputValue(), '2025');
    assert.equal(await page.locator('#scope-year-to').inputValue(), '');
    await page.getByRole('button', { name: '开始检索', exact: true }).click();
    await page.locator('.case-row').waitFor();
    await page.getByRole('button', { name: '管理收藏', exact: true }).click();
    await page.getByLabel('借贷证据', { exact: false }).check();
    await page.getByRole('button', { name: '保存收藏', exact: true }).click();
    await page.locator('.is-saved').waitFor();
    await page.getByRole('button', { name: '加入检索报告', exact: true }).click();
    assert.equal(await page.locator('.report-badge').innerText(), '1');
    await page.getByRole('link', { name: /我的收藏/ }).click();
    await page.getByRole('button', { name: '借贷证据 1', exact: true }).click();
    assert.equal(await page.locator('.case-row').count(), 1);
    await page.screenshot({ path: path.join(__dirname, 'favorites-folders-1440.png') });
    await page.reload();
    await page.locator('.favorite-item').waitFor();
    assert((await page.locator('.favorite-location').innerText()).includes('借贷证据'));
    await page.locator('.sidebar [data-action=new-search]').click();
    assert.equal(await page.locator('#scope-region').inputValue(), '');
    await page.locator('#query').fill('只有银行转账记录，没有借条，对方主张赠与，如何认定借贷关系？');
    await page.getByRole('button', { name: '开始检索', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.case-row').length === 4);
    const row = page.locator('.case-row[data-case-id=loan-3]');
    await row.getByRole('button', { name: '收藏案例', exact: true }).click();
    await page.getByRole('button', { name: '保存收藏', exact: true }).click();
    assert((await page.locator('#favorite-error').innerText()).includes('选择'));
    await page.getByLabel('新建收藏夹', { exact: true }).fill('相反观点');
    await page.getByRole('button', { name: '新建', exact: true }).click();
    assert(await page.getByLabel('相反观点', { exact: false }).isChecked());
    await page.screenshot({ path: path.join(__dirname, 'favorite-folder-dialog.png') });
    await page.getByRole('button', { name: '保存收藏', exact: true }).click();
    await row.getByRole('button', { name: '管理收藏', exact: true }).waitFor();
    await row.locator('.case-title').click();
    await page.locator('.reader-paper').waitFor();
    const reader = page.locator('.document-reader');
    assert((await reader.locator('.reader-cause-path').innerText()).includes('民间借贷纠纷'));
    assert.equal(await reader.getByRole('link', { name: /全屏阅读/ }).count(), 0);
    assert.equal(await reader.getByRole('button', { name: '复制引用' }).count(), 0);
    assert(!/\bp\d+\b/.test(await reader.innerText()), 'internal paragraph IDs must not be displayed');
    const hash = await page.evaluate(() => location.hash);
    await reader.getByRole('link', { name: '本院认为', exact: true }).click();
    await page.locator('.reader-target[data-paragraph-id=p5]').waitFor();
    await page.waitForFunction(() => document.querySelector('.reader-toc a[aria-current=true]')?.textContent === '本院认为');
    assert.equal(await reader.locator('.reader-toc a[aria-current=true]').count(), 1);
    assert.equal(await reader.locator('.reader-toc a[aria-current=true]').innerText(), '本院认为');
    assert.equal(await page.evaluate(() => location.hash), hash);
    const targetStyle = await page.locator('.reader-target').evaluate(n => ({ outline: getComputedStyle(n).outlineStyle, background: getComputedStyle(n.querySelector('p')).backgroundColor }));
    assert.equal(targetStyle.outline, 'none');
    assert.equal(targetStyle.background, 'rgba(0, 0, 0, 0)');
    await page.screenshot({ path: path.join(__dirname, 'reader-hierarchy-1440.png') });
    await page.locator('.case-row[data-case-id=loan-1] .case-title').click();
    assert.equal(await page.locator('.reader-tabs [role=tab]').count(), 2);
    await page.getByRole('button', { name: '收起目录', exact: true }).click();
    await page.getByRole('button', { name: '展开目录', exact: true }).waitFor();
    for (const width of [1920, 1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), `reader overflow ${width}`);
      await page.screenshot({ path: path.join(__dirname, `reader-hierarchy-${width}.png`) });
    }
    await page.getByRole('button', { name: '收起阅读栏' }).click();
    await page.locator('.mobile-menu').click();
    await page.getByRole('link', { name: /我的收藏/ }).click();
    await page.getByRole('button', { name: '相反观点 1', exact: true }).click();
    await page.locator('.case-row').getByRole('button', { name: '管理收藏', exact: true }).click();
    await page.getByRole('button', { name: '取消收藏', exact: true }).click();
    assert.equal(await page.locator('.case-row').count(), 0);
    await page.locator('.mobile-menu').click();
    await page.locator('.sidebar [data-action=new-search]').click();
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'mobile search overflow');
    await page.screenshot({ path: path.join(__dirname, 'scope-search-390.png') });
    await page.locator('#query').fill('只有转账记录没有借条，如何查找类案？');
    await page.locator('#scope-region').selectOption('上海');
    await page.locator('#scope-year-from').selectOption('2026');
    await page.locator('#scope-year-to').selectOption('2026');
    await page.getByRole('button', { name: '开始检索', exact: true }).click();
    await page.getByRole('button', { name: '调整检索范围', exact: true }).click();
    assert.equal(await page.locator('#scope-region').inputValue(), '上海');
    assert.equal(await page.locator('#scope-year-from').inputValue(), '2026');
    assert.deepEqual(errors, []);
    console.log('PASS: pre-search scope/validation/precedence/restoration, legacy favorites migration, create/select/move/remove folders, independent report basket, reader hierarchy/cause/TOC/no ID or highlight frame, tabs and responsive layouts.');
  } catch (error) {
    if (page) { console.error((await page.locator('body').innerText()).slice(-1800)); await page.screenshot({ path: path.join(__dirname, 'scope-favorites-failure.png') }); }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
