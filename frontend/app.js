import { api } from './api.js';
import { $, esc, toast, loading, empty, caseHash, modeLabel } from './ui.js';
import { state, persist, documentKey, explanationKey, currentCase, saveResult, updateRecord, sortedHits } from './store.js';
import { route, navigate } from './router.js';
import { workspace } from './components/layout.js';
import { openDrawer, closeDrawer, updateDrawer, explanationContent } from './components/drawer.js';
import { homePage, examples, setExampleCaseType } from './views/home.js';
import { searchPage } from './views/search.js';
import { resultPage } from './views/results.js';
import { casePage } from './views/case.js';
import { collectionPage } from './views/collections.js';
import { caseCard, updateExcerptControls } from './components/case-card.js';
import { lawList, citingCases } from './components/law-list.js';
import { openReader, activateReader, closeReaderTab, rememberReaderScroll, positionReader, refreshReader, toggleReaderDirectory } from './components/reader.js';
import { filterFields, positionFilter, hideFilters, readFilters } from './components/filter-panel.js';
import { reportsPage, ensureReports, mountReportEditor, preserveReportEditor, generateReport, saveReport, retryReports } from './views/reports.js';
import { blankScope, readSearchScope } from './components/search-scope.js';
import { openFavoriteChooser, createFolderInChooser, saveFavorite, removeFavorite, openNewFolderDialog, addFolder } from './components/favorites.js';

let operation = 0;
let controller;
const documentJobs = new Map();
const documentQueue = [];
const queuedDocuments = new Set();
let activeDocuments = 0;
let caseObserver;
let observer;
let previousView;
let renderVersion = 0;
let filterRequest = 0;
const go = hash => navigate(hash, render);

function cancelOperation() {
  operation++;
  controller?.abort();
  if (state.parseStatus === 'loading') state.parseStatus = 'idle';
  if (state.resultStatus === 'loading') {
    state.resultStatus = state.result ? 'done' : 'idle';
    if (state.result) {
      state.answerStatus = 'pending';
      state.progressOpen = false;
      state.progress.filter(step => step.status === 'running').forEach(step => {
        Object.assign(step, { status: 'skipped', detail: '已停止整理答复，案例结果已保留。' });
      });
    }
  }
}

function announce(text) {
  $('#announcer').textContent = text;
}

function render({ focus = false } = {}) {
  preserveReportEditor();
  rememberReaderScroll();
  state.filterOpen = false;
  const version = ++renderVersion;
  const current = route();
  closeDrawer();
  observer?.disconnect();
  caseObserver?.disconnect();
  const title = { home: '清案 · 可信类案检索', search: '新建检索 · 清案', results: '检索结果 · 清案', case: '文书阅读 · 清案', history: '历史记录 · 清案', saved: '我的收藏 · 清案', reports: '检索报告 · 清案' };
  document.title = title[current.view] || '清案';
  let content;
  if (current.view === 'home') content = homePage();
  else {
    const pages = {
      search: () => searchPage(), results: () => resultPage(),
      case: () => casePage(current.id, current.paragraph),
      history: () => collectionPage('history'), saved: () => collectionPage('saved'),
      reports: () => reportsPage(current.id),
    };
    content = pages[current.view]?.() || empty('页面不存在', '返回工作区继续检索。', '<a class="btn" href="#/search">返回检索</a>');
    const connection = state.healthError ? `<aside class="service-notice connection-error" role="alert">${esc(state.healthError)} <button type="button" class="text-button" data-action="retry-health">重新连接</button></aside>` : '';
    content = workspace(current.view, connection + content);
  }
  $('#app').innerHTML = content;
  const activeAtRender = document.activeElement;
  const viewChanged = current.view !== previousView;
  previousView = current.view;
  requestAnimationFrame(() => {
    if (version !== renderVersion) return;
    const mayMoveFocus = document.activeElement === activeAtRender || document.activeElement === document.body;
    if (current.view === 'case') {
      const target = current.paragraph && document.getElementById(`doc-${current.paragraph}`);
      if (target) {
        target.scrollIntoView({ block: 'start', behavior: 'instant' });
        if ((focus || viewChanged) && mayMoveFocus) target.focus({ preventScroll: true });
      } else if (viewChanged) window.scrollTo({ top: 0, behavior: 'instant' });
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          document.querySelectorAll('.document-toc a').forEach(link => {
            link.classList.toggle('active', link.hash === caseHash(current.id, entry.target.id.slice(4)));
          });
        }
      }, { rootMargin: '-90px 0px -60% 0px' });
      document.querySelectorAll('.doc-section').forEach(section => observer.observe(section));
    } else if (current.view === 'results' && state.resultStatus === 'done') {
      window.scrollTo({ top: state.resultsY, behavior: 'instant' });
    } else if (viewChanged) window.scrollTo({ top: 0, behavior: 'instant' });
    if ((focus || viewChanged) && mayMoveFocus && !(current.view === 'case' && current.paragraph)) {
      $('main h1, main h2')?.focus({ preventScroll: true });
    }
    positionReader();
    updateExcerptControls();
    if (current.view === 'reports' && current.id) mountReportEditor(current.id);
  });
  observeResultRows();
  if (current.view === 'reports') ensureReports(current.id, render);
  if (state.readerOpen && state.activeReaderId && !state.documents.has(documentKey(state.activeReaderId)) && !state.documentErrors.has(documentKey(state.activeReaderId))) loadDocument(state.activeReaderId);
  if (current.view === 'case' && state.health && !state.documents.has(documentKey(current.id)) && !state.documentErrors.has(documentKey(current.id))) {
    loadDocument(current.id);
  }
}

async function connect() {
  try {
    state.health = await api.health();
    setExampleCaseType(state.health.case_type);
    state.healthError = '';
  } catch (error) {
    state.healthError = error.message;
  }
  if (route().view === 'results' && !state.result && !state.resultQuery && state.history[0]) {
    restoreHistory(state.history[0].id, false);
  }
  render();
}

function showFormError(form, field, message, errorId) {
  const error = $(`#${errorId}`, form);
  error.hidden = false;
  error.textContent = message;
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute('aria-describedby', errorId);
  field.focus();
}

function validQuestion(form) {
  const field = $('#query', form);
  const text = field.value.trim();
  if (text.length < 5 || text.length > 5000) {
    showFormError(form, field, '请填写5—5000字的案情或法律问题。', 'query-error');
    return null;
  }
  return text;
}

function setStage(index, status, detail) {
  Object.assign(state.progress[index], { status, detail });
  if (route().view === 'results') render();
  announce(detail);
}

async function startSearch(text, scope = state.searchFilters, clearScope = false) {
  if (state.resultStatus === 'loading') return;
  cancelOperation();
  cancelOptimization();
  const request = operation;
  controller = new AbortController();
  const signal = controller.signal;
  state.draft = text;
  const inputFilters = structuredClone(scope);
  state.resultInputFilters = inputFilters;
  state.resultQuery = { raw_text: text, filters: inputFilters };
  state.result = null;
  state.answer = null;
  state.answerStatus = 'idle';
  state.resultStatus = 'loading';
  state.resultError = '';
  state.parseError = '';
  state.sort = 'relevance';
  state.resultsY = 0;
  state.resultTab = 'cases';
  state.resultFilters = {};
  state.filteredHits = null;
  state.filterOptions = null;
  state.filterError = '';
  state.filterStatus = 'idle';
  state.caseView = 'list';
  filterRequest++;
  state.filterOpen = false;
  state.selectedCases.clear();
  state.reportCases.clear();
  state.progressOpen = true;
  state.progress = [
    { label: '理解检索问题', status: 'running', detail: '识别案情中的争点与检索线索。' },
    { label: '检索相关案例', status: 'waiting', detail: '等待检索线索整理完成。' },
    { label: '整理检索答复', status: 'waiting', detail: '根据检索结果整理总结、裁判观点和案例比较。' },
  ];
  go('#/results');
  let stage = 0;
  try {
    const parsed = await api.parse(text, { signal });
    if (request !== operation) return;
    const query = parsed.query;
    // User-selected values take precedence over inferred filters; unset controls
    // still allow conditions explicitly written in the natural-language question.
    query.filters = { ...query.filters, ...Object.fromEntries(Object.entries(inputFilters).filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length))) };
    if (inputFilters.year_from != null || inputFilters.year_to != null) {
      query.filters.year_from = inputFilters.year_from ?? null;
      query.filters.year_to = inputFilters.year_to ?? null;
    }
    if (inputFilters.years?.length) { query.filters.year_from = null; query.filters.year_to = null; }
    if (inputFilters.year_from != null || inputFilters.year_to != null) query.filters.years = [];
    if (clearScope) query.filters = blankScope();
    state.resultQuery = query;
    state.parsed = query;
    state.parseDegraded = parsed.degraded;
    setStage(0, 'done', query.issues.length
      ? `本次检索围绕：${query.issues.join('；')}。`
      : '已整理检索线索，将按问题中的关键词查找案例。');
    stage = 1;
    setStage(1, 'running', '正在检索案例库，匹配问题中的事实与争议线索。');
    const result = await api.search(query, { signal });
    if (request !== operation) return;
    result.degraded = [...new Set([...parsed.degraded, ...result.degraded])];
    state.result = result;
    if (state.health && state.health.data_mode !== result.data_mode) {
      state.health.data_mode = result.data_mode;
      state.readerOpen = false; state.readerTabs = [];
      state.documents.clear();
      state.explanations.clear();
    }
    setStage(1, 'done', `本次返回${result.hits.length}篇案例。${result.degraded.includes('rerank_skipped') ? '当前沿用基础召回排序，未进行模型重排。' : '已完成候选排序。'}`);
    stage = 2;
    state.answerStatus = 'loading';
    setStage(2, 'running', '正在读取综合答复；具体案例的引用可逐篇核对。');
    try {
      state.answer = await api.answer(result.search_id, { signal });
      if (request !== operation) return;
      state.answerStatus = state.answer.status === 'ready' ? 'done' : 'pending';
      setStage(2, state.answer.status === 'ready' ? 'done' : 'skipped', state.answer.status === 'ready'
        ? '已整理总结、裁判观点和案例比较，请结合原文引用复核。'
        : '当前未生成综合答复，可先查看案例原文。');
    } catch (error) {
      if (request !== operation || error.name === 'AbortError') return;
      state.answerStatus = 'error';
      setStage(2, 'skipped', '综合答复暂不可用，案例检索结果已保留。');
    }
    if (request !== operation) return;
    state.resultStatus = 'done';
    state.progressOpen = false;
    if (!saveResult()) toast('检索完成，但浏览器未能保存历史记录。');
    render();
    announce(`检索完成，返回${result.hits.length}条案例。处理过程已收起。`);
  } catch (error) {
    if (request !== operation || error.name === 'AbortError') return;
    state.resultStatus = 'error';
    state.resultError = error.message;
    setStage(stage, 'error', error.message);
  }
}

let optimizationController;
let optimizationRequest = 0;
function cancelOptimization() {
  optimizationRequest++;
  optimizationController?.abort();
  state.optimizeStatus = 'idle';
}

async function optimizeQuestion() {
  const form = $('#search-form');
  if (!form || state.optimizeStatus === 'loading') return;
  const text = validQuestion(form);
  if (!text) return;
  cancelOptimization();
  const request = optimizationRequest;
  optimizationController = new AbortController();
  state.draft = text;
  state.optimizeStatus = 'loading';
  state.optimizeNotice = '';
  state.optimization = null;
  render();
  try {
    const response = await api.optimize(text, { signal: optimizationController.signal });
    if (request !== optimizationRequest || state.draft.trim() !== text) return;
    if (response.status === 'ready' && response.optimized_text !== text) {
      state.optimization = response;
      announce('问题优化完成，可预览后选择是否使用。');
    } else {
      state.optimizeNotice = response.notice || '优化结果与原问题一致，可以直接检索。';
    }
  } catch (error) {
    if (request !== optimizationRequest || error.name === 'AbortError') return;
    state.optimizeNotice = `${error.message} 原问题已保留。`;
  } finally {
    if (request === optimizationRequest) {
      state.optimizeStatus = 'idle';
      if (route().view === 'search') render();
    }
  }
}

function refreshCaseRow(id) {
  for (const row of document.querySelectorAll('.reference-case')) {
    if (row.dataset.caseId !== id) continue;
    const collection = row.dataset.collection === 'true';
    const hit = collection
      ? { case: currentCase(id), snippets: [] }
      : state.result?.hits.find(item => item.case.id === id);
    if (!hit?.case) continue;
    const index = [...row.parentElement.children].indexOf(row);
    const focused = row.contains(document.activeElement) ? document.activeElement : null;
    const focusId = focused?.id, action = focused?.dataset.action;
    const scrollLeft = row.querySelector('.case-fields')?.scrollLeft || 0;
    const template = document.createElement('template');
    template.innerHTML = caseCard(hit, index, collection);
    const replacement = template.content.firstElementChild;
    row.replaceWith(replacement);
    updateExcerptControls(replacement);
    if (replacement.querySelector('.case-fields')) replacement.querySelector('.case-fields').scrollLeft = scrollLeft;
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    else if (focused?.matches('[data-select-case]')) replacement.querySelector('[data-select-case]')?.focus({ preventScroll: true });
    else if (action) [...replacement.querySelectorAll('[data-action]')].find(button => button.dataset.action === action)?.focus({ preventScroll: true });
  }
}

function observeResultRows() {
  const current = route();
  if (!state.health) return;
  if (current.view === 'results' && state.resultStatus === 'done' && state.resultTab === 'laws') {
    for (const hit of state.result.hits) queueDocument(hit.case.id);
  } else if (['results', 'saved'].includes(current.view)) {
    caseObserver = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting && entry.target.isConnected) {
        queueDocument(entry.target.dataset.caseId);
        caseObserver.unobserve(entry.target);
      }
    }, { rootMargin: '180px' });
    document.querySelectorAll('.reference-case').forEach(row => caseObserver.observe(row));
  }
  const all = $('#select-all-cases'), visible = sortedHits();
  if (all) all.indeterminate = !all.checked && visible.some(hit => state.selectedCases.has(hit.case.id));
}

function queueDocument(id) {
  const key = documentKey(id);
  if (state.documents.has(key) || state.documentErrors.has(key) || documentJobs.has(key) || queuedDocuments.has(key)) return;
  queuedDocuments.add(key);
  documentQueue.push({ id, key });
  pumpDocuments();
}

function pumpDocuments() {
  while (activeDocuments < 3 && documentQueue.length) {
    const { id, key } = documentQueue.shift();
    queuedDocuments.delete(key);
    if (key !== documentKey(id)) continue;
    activeDocuments++;
    loadDocument(id).finally(() => { activeDocuments--; pumpDocuments(); });
  }
}

function loadDocument(id) {
  const key = documentKey(id);
  if (documentJobs.has(key)) return documentJobs.get(key);
  if (state.documents.has(key)) return Promise.resolve();
  const job = (async () => {
    try {
      state.documents.set(key, await api.getCase(id));
    } catch (error) {
      state.documentErrors.set(key, error.message);
    } finally {
      documentJobs.delete(key);
    }
    if (key !== documentKey(id)) return;
    if (route().view === 'case' && route().id === id) render({ focus: true });
    else {
      refreshCaseRow(id);
      refreshReader(id);
      const laws = $('.laws-content');
      if (laws && state.resultTab === 'laws') laws.innerHTML = lawList();
    }
  })();
  documentJobs.set(key, job);
  return job;
}

async function loadFilterOptions() {
  const id = state.result?.search_id;
  if (!id) return;
  try {
    const options = await api.filterOptions(id);
    if (id !== state.result?.search_id) return;
    state.filterOptions = options;
    const host = $('#filter-form-host');
    if (host) host.innerHTML = filterFields();
  } catch (error) {
    if (id !== state.result?.search_id) return;
    const host = $('#filter-form-host');
    if (host) host.innerHTML = `<p class="filter-loading">${esc(error.message)}</p><button type="button" class="btn small" data-action="retry-filter-options">重试</button>`;
  }
}

async function applyFilters(filters) {
  if (state.filterStatus === 'loading') return;
  const id = state.result?.search_id, request = ++filterRequest;
  state.filterStatus = 'loading';
  const submit = $('#result-filter-form button[type=submit]');
  if (submit) { submit.disabled = true; submit.textContent = '正在过滤…'; }
  try {
    const response = await api.filterResults(id, filters);
    if (request !== filterRequest || id !== state.result?.search_id) return;
    state.resultFilters = filters;
    state.filteredHits = response.hits;
    state.filterStatus = 'done';
    hideFilters(); preserveResultPosition(); render();
    $('[data-action=toggle-result-filters]')?.focus({ preventScroll: true });
    announce(`过滤完成，返回${response.total}篇案例。`);
  } catch (error) {
    if (request !== filterRequest) return;
    state.filterStatus = 'error';
    const message = $('#filter-error');
    if (message) { message.hidden = false; message.textContent = error.message; }
    if (submit?.isConnected) { submit.disabled = false; submit.textContent = '应用过滤'; }
  }
}

function selectedHits() {
  return (state.result?.hits || []).filter(hit => state.selectedCases.has(hit.case.id));
}

function preserveResultPosition() {
  state.resultsY = window.scrollY;
  updateRecord();
}

function refreshSelection() {
  document.querySelectorAll('.reference-case').forEach(row => {
    const selected = state.selectedCases.has(row.dataset.caseId);
    row.dataset.selected = selected;
    const input = row.querySelector('[data-select-case]');
    if (input) input.checked = selected;
  });
  const visible = sortedHits();
  const master = $('#select-all-cases');
  if (master) {
    master.checked = visible.length > 0 && visible.every(hit => state.selectedCases.has(hit.case.id));
    master.indeterminate = !master.checked && visible.some(hit => state.selectedCases.has(hit.case.id));
  }
  const count = $('.selection-count');
  if (count) count.textContent = state.selectedCases.size ? `已选 ${state.selectedCases.size} 项` : '';
  document.querySelectorAll('.batch-actions button').forEach(button => { button.disabled = !state.selectedCases.size; });
}

function refreshReportBasket() {
  const button = $('[data-action=generate-report]');
  if (button) {
    button.setAttribute('aria-label', `生成检索报告，已加入${state.reportCases.size}篇案例`);
    $('.report-badge', button).textContent = state.reportCases.size;
  }
  updateRecord();
  announce(`检索报告已加入${state.reportCases.size}篇案例。`);
}

async function showExplanation(id) {
  if (!state.result || !state.resultQuery) return;
  const key = explanationKey(id);
  const cached = state.explanations.get(key);
  openDrawer('案情对照与差异', cached ? explanationContent(cached, id) : loading('正在对照案情', '仅展示具有原文引用的内容。'), key);
  if (cached || state.explanationPending.has(key)) return;
  state.explanationPending.add(key);
  const query = structuredClone(state.resultQuery), searchId = state.result.search_id;
  try {
    const response = await api.explain(id, query, searchId);
    // Fail closed if the backend ever returns points without verified references.
    for (const field of ['similarities', 'differences']) {
      response[field] = response[field].filter(point => point.citations.some(c => c.verified && c.case_id === id));
    }
    state.explanations.set(key, response);
    updateDrawer(key, explanationContent(response, id));
  } catch (error) {
    updateDrawer(key, `${empty('对照暂未完成', error.message)}<button type="button" class="btn" data-action="explain" data-id="${esc(id)}">重试对照</button>`);
  } finally {
    state.explanationPending.delete(key);
  }
}

async function refreshHistoricalAnswer(searchId) {
  try {
    const answer = await api.answer(searchId);
    if (state.result?.search_id !== searchId) return;
    state.answer = answer;
    state.answerStatus = answer.status === 'ready' ? 'done' : 'pending';
    const record = state.history.find(item => item.id === searchId);
    if (record) { record.answer = structuredClone(answer); record.answerStatus = state.answerStatus; persist(); }
  } catch {
    if (state.result?.search_id !== searchId) return;
    state.answerStatus = 'error';
  }
  if (route().view === 'results') render();
}

function restoreHistory(id, navigateTo = true) {
  const record = state.history.find(item => item.id === id);
  if (!record) return;
  if (state.health && record.response.data_mode !== state.health.data_mode) {
    toast(`这条历史属于${modeLabel(record.response.data_mode)}，与当前数据模式不同。`);
    return;
  }
  cancelOperation();
  Object.assign(state, {
    resultQuery: structuredClone(record.query), parsed: structuredClone(record.query),
    draft: record.query.raw_text, result: structuredClone(record.response),
    resultStatus: 'done', sort: record.sort || 'relevance', resultsY: record.scroll || 0,
    activeHistory: record.id, parseDegraded: [],
    progress: structuredClone(record.progress || []), progressOpen: false,
    answer: structuredClone(record.answer || null), answerStatus: record.answerStatus || 'pending',
    resultTab: record.resultTab || 'cases',
    resultFilters: record.filteredHits ? record.resultFilters || {} : {},
    filteredHits: record.filteredHits || null, caseView: record.caseView || 'list',
    filterOptions: null,
    reportCases: new Set(record.reportCaseIds || []),
    resultInputFilters: structuredClone(record.inputFilters || record.query.filters || {}),
    searchFilters: { ...blankScope(), ...(record.inputFilters || record.query.filters || {}) },
  });
  state.selectedCases.clear();
  if (!record.answer || record.answer.version !== 2) {
    state.answer = null; state.answerStatus = 'loading';
    refreshHistoricalAnswer(record.id);
  }
  if (navigateTo) go('#/results');
}

function refreshFavorites(id) {
  const y = window.scrollY;
  closeDrawer(); render();
  requestAnimationFrame(() => {
    window.scrollTo({ top: y, behavior: 'instant' });
    const button = [...document.querySelectorAll('[data-action=save-case]')].find(item => item.dataset.id === id);
    (button || $('main h1'))?.focus({ preventScroll: true });
  });
}

document.addEventListener('submit', event => {
  if (event.target.id === 'favorite-form') {
    event.preventDefault();
    const result = saveFavorite(event.target);
    if (result) { refreshFavorites(result.id); toast(`已收藏到「${result.folder.name}」`); }
    return;
  }
  if (event.target.id === 'new-folder-form') {
    event.preventDefault();
    const folder = addFolder(String(new FormData(event.target).get('folder_name') || ''));
    if (folder) { state.activeFolder = folder.id; closeDrawer(); render(); toast('收藏夹已创建'); }
    return;
  }
  if (event.target.id === 'result-filter-form') {
    event.preventDefault();
    const filters = readFilters(event.target);
    if (filters) applyFilters(filters);
    return;
  }
  if (event.target.id === 'search-form') {
    event.preventDefault();
    const text = validQuestion(event.target);
    if (!text) return;
    const filters = readSearchScope(event.target, true);
    if (text && filters) { state.searchFilters = filters; startSearch(text, filters); }
  }
});

document.addEventListener('input', event => {
  if (event.target.matches('[data-option-search]')) {
    const key = event.target.dataset.optionSearch, needle = event.target.value.trim();
    document.querySelectorAll('[data-option-label]').forEach(label => {
      if (label.dataset.optionLabel === key) label.hidden = !label.textContent.includes(needle);
    });
  }
  if (event.target.setCustomValidity) event.target.setCustomValidity('');
  if (event.target.id === 'query') {
    state.draft = event.target.value;
    if (state.optimizeStatus === 'loading') {
      cancelOptimization();
      const button = $('[data-action=optimize-question]');
      if (button) { button.disabled = false; button.innerHTML = '✧ <span>问题优化</span>'; }
    }
    state.optimization = null;
    $('.optimization-preview')?.remove();
    state.optimizeNotice = '';
    $('.optimization-notice')?.remove();
    state.parseError = '';
  }
  const form = event.target.closest('form');
  if (form) {
    form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
    const error = $('.form-error', form);
    if (error) error.hidden = true;
  }
});

document.addEventListener('change', event => {
  if (event.target.matches('[data-search-scope]')) {
    const form = event.target.form;
    if (event.target.name === 'years') { $('#scope-year-from', form).value = ''; $('#scope-year-to', form).value = ''; }
    if (['year_from', 'year_to'].includes(event.target.name)) form.querySelectorAll('[name=years]').forEach(el => { el.checked = false; });
    state.searchFilters = readSearchScope(form);
  }
  if (event.target.matches('[data-select-case]')) {
    const id = event.target.dataset.selectCase;
    event.target.checked ? state.selectedCases.add(id) : state.selectedCases.delete(id);
    refreshSelection();
  } else if (event.target.id === 'select-all-cases') {
    for (const hit of sortedHits()) {
      event.target.checked ? state.selectedCases.add(hit.case.id) : state.selectedCases.delete(hit.case.id);
    }
    refreshSelection();
  }
  if (event.target.id === 'sort') {
    state.sort = event.target.value;
    state.resultsY = window.scrollY;
    updateRecord();
    render();
    $('#sort')?.focus({ preventScroll: true });
  }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action, id = button.dataset.id;
  if (action === 'new-search' || action === 'use-example') {
    event.preventDefault();
    cancelOperation();
    cancelOptimization();
    state.optimization = null;
    state.optimizeNotice = '';
    state.draft = action === 'use-example' ? examples[Number(button.dataset.index)] || '' : '';
    if (action === 'new-search') state.searchFilters = blankScope();
    state.parsed = null;
    state.parseDegraded = [];
    state.parseError = '';
    go('#/search');
    requestAnimationFrame(() => $('#query')?.focus());
  } else if (action === 'edit-query') {
    cancelOperation();
    state.draft = state.resultQuery.raw_text;
    state.searchFilters = { ...blankScope(), ...state.resultInputFilters };
    state.parsed = null;
    state.optimization = null;
    state.optimizeNotice = '';
    go('#/search');
    requestAnimationFrame(() => $('#query')?.focus());
  } else if (action === 'reset-search-scope') {
    state.searchFilters = blankScope(); render(); $('#scope-region')?.focus();
  } else if (action === 'optimize-question') optimizeQuestion();
  else if (action === 'apply-optimization') {
    if (!state.optimization) return;
    state.draft = state.optimization.optimized_text;
    state.optimization = null;
    state.optimizeNotice = '';
    render();
    $('#query')?.focus();
  } else if (action === 'dismiss-optimization') {
    state.optimization = null;
    render();
    $('#query')?.focus();
  } else if (action === 'copy-question') {
    try { await navigator.clipboard.writeText(state.resultQuery.raw_text); toast('已复制问题'); }
    catch { toast('复制未完成，请选择问题文本复制。'); }
  } else if (action === 'cancel') {
    cancelOperation();
    go('#/search');
  } else if (action === 'clear-scope-group') {
    const form = button.closest('form');
    form.querySelectorAll(`input[name="${button.dataset.group}"]`).forEach(el => { el.checked = false; });
    if (button.dataset.group === 'years') { $('#scope-year-from', form).value = ''; $('#scope-year-to', form).value = ''; }
    state.searchFilters = readSearchScope(form);
  } else if (action === 'search-without-scope') {
    state.searchFilters = blankScope(); startSearch(state.resultQuery.raw_text, blankScope(), true);
  } else if (action === 'retry-search') startSearch(state.resultQuery.raw_text, state.resultInputFilters);
  else if (action === 'open-case') {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (route().view === 'results') preserveResultPosition();
    state.returnTo = route().view === 'saved' ? 'saved' : 'results';
    const parts = (button.getAttribute('href') || '').split('/');
    const target = parts[3] ? decodeURIComponent(parts[3]) : '';
    closeDrawer();
    openReader(id, target);
    render();
    if (!target || !state.documents.has(documentKey(id))) {
      requestAnimationFrame(() => document.getElementById(`reader-tab-${encodeURIComponent(id)}`)?.focus({ preventScroll: true }));
    }
  } else if (action === 'reader-tab') {
    activateReader(id); render();
    document.getElementById(`reader-tab-${encodeURIComponent(id)}`)?.focus({ preventScroll: true });
  } else if (action === 'reader-jump') {
    event.preventDefault();
    openReader(id, button.dataset.paragraph);
    if ($('.document-reader')?.clientWidth <= 520) state.readerTabs.find(tab => tab.id === id).directoryCollapsed = true;
    render();
  } else if (action === 'toggle-reader-directory') {
    toggleReaderDirectory(); render(); $('[data-action=toggle-reader-directory]')?.focus({ preventScroll: true });
  } else if (action === 'close-reader-tab') {
    closeReaderTab(id); render();
    if (state.readerOpen) document.getElementById(`reader-tab-${encodeURIComponent(state.activeReaderId)}`)?.focus({ preventScroll: true });
    else $('main h1')?.focus({ preventScroll: true });
  } else if (action === 'close-reader') {
    rememberReaderScroll(); state.readerOpen = false; render();
    $('main h1')?.focus({ preventScroll: true });
  } else if (action === 'retry-document') {
    state.documentErrors.delete(documentKey(id));
    loadDocument(id);
    refreshReader(id);
    if (route().view === 'case') render();
    else refreshCaseRow(id);
  } else if (action === 'result-tab') {
    preserveResultPosition();
    state.resultTab = button.dataset.tab;
    updateRecord(); render();
    document.getElementById(`results-tab-${state.resultTab}`)?.focus({ preventScroll: true });
  } else if (action === 'case-field' || action === 'expand-case') {
    if (action === 'case-field') state.caseTabs.set(documentKey(id), button.dataset.field);
    else state.expandedCases.has(documentKey(id)) ? state.expandedCases.delete(documentKey(id)) : state.expandedCases.add(documentKey(id));
    refreshCaseRow(id);
    const row = [...document.querySelectorAll('.reference-case')].find(item => item.dataset.caseId === id);
    if (row) {
      const selected = [...row.querySelectorAll('[role=tab]')].find(tab => tab.getAttribute('aria-selected') === 'true');
      if (action === 'case-field') selected?.focus({ preventScroll: true });
      const list = row.querySelector('.case-fields');
      if (selected) {
        if (selected.offsetLeft < list.scrollLeft) list.scrollLeft = selected.offsetLeft;
        else if (selected.offsetLeft + selected.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = selected.offsetLeft + selected.offsetWidth - list.clientWidth;
      }
    }
    queueDocument(id);
  } else if (action === 'toggle-result-filters') {
    positionFilter();
    const panel = $('#result-filter-popover');
    if (!('commandForElement' in HTMLButtonElement.prototype)) {
      if (panel.showPopover) panel.togglePopover();
      else { panel.hidden = !panel.hidden; state.filterOpen = !panel.hidden; panel.classList.toggle('is-fallback-open', !panel.hidden); }
    }
    if (!state.filterOptions) loadFilterOptions();
  } else if (action === 'close-filters') {
    hideFilters();
    requestAnimationFrame(() => $('[data-action=toggle-result-filters]')?.focus({ preventScroll: true }));
  } else if (action === 'retry-filter-options') {
    loadFilterOptions();
  } else if (action === 'clear-result-filters') {
    filterRequest++;
    state.resultFilters = {}; state.filteredHits = null; state.filterError = '';
    state.filterStatus = 'idle';
    hideFilters(); preserveResultPosition(); render();
    $('[data-action=toggle-result-filters]')?.focus({ preventScroll: true });
  } else if (action === 'case-view') {
    state.caseView = button.dataset.view;
    preserveResultPosition(); render();
    document.getElementById(`case-view-${state.caseView}`)?.focus({ preventScroll: true });
  } else if (action === 'report-case') {
    state.reportCases.has(id) ? state.reportCases.delete(id) : state.reportCases.add(id);
    refreshCaseRow(id); refreshReportBasket();
  } else if (action === 'report-selected') {
    for (const hit of selectedHits()) { state.reportCases.add(hit.case.id); refreshCaseRow(hit.case.id); }
    refreshReportBasket(); toast('选中案例已加入检索报告');
  } else if (action === 'generate-report') {
    preserveResultPosition(); generateReport(go, render);
  } else if (action === 'save-report') saveReport();
  else if (action === 'download-report') saveReport(button.dataset.format);
  else if (action === 'retry-reports') retryReports(render);
  else if (action === 'retry-report-editor') render();
  else if (action === 'export-selected') {
    const data = selectedHits().map(hit => ({ ...hit.case }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = '类案检索-选中案例.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else if (action === 'print-selected') {
    const hits = selectedHits();
    button.disabled = true;
    await Promise.all(hits.map(hit => loadDocument(hit.case.id)));
    const printRoot = document.createElement('section');
    printRoot.id = 'selected-case-print';
    printRoot.innerHTML = hits.map((hit, index) => caseCard(hit, index)).join('');
    document.body.append(printRoot);
    try {
      document.body.classList.add('print-selected-cases');
      window.print();
    } finally {
      document.body.classList.remove('print-selected-cases');
      printRoot.remove();
      if (button.isConnected) button.disabled = false;
    }
  } else if (action === 'retry-laws') {
    for (const hit of state.result.hits) {
      state.documentErrors.delete(documentKey(hit.case.id));
      queueDocument(hit.case.id);
    }
    $('.laws-content').innerHTML = lawList();
  } else if (action === 'law-cases') {
    const law = citingCases(Number(button.dataset.law), Number(button.dataset.article));
    if (law) openDrawer(law.title, law.content);
  } else if (action === 'explain') showExplanation(id);
  else if (action === 'save-case') openFavoriteChooser(id);
  else if (action === 'favorite-create-folder') createFolderInChooser();
  else if (action === 'remove-favorite') {
    if (removeFavorite(id)) { refreshFavorites(id); toast('已取消收藏'); }
  } else if (action === 'new-folder') openNewFolderDialog();
  else if (action === 'select-folder') {
    state.activeFolder = id; render();
    [...document.querySelectorAll('[data-action=select-folder]')].find(item => item.dataset.id === id)?.focus({ preventScroll: true });
  }
  else if (action === 'close-drawer') closeDrawer();
  else if (action === 'open-history') restoreHistory(id);
  else if (action === 'delete-history' || action === 'clear-history') {
    state.history = action === 'clear-history' ? [] : state.history.filter(item => item.id !== id);
    persist(); render(); toast('已删除历史记录');
  } else if (action === 'retry-health') connect();
  else if (action === 'feedback') {
    button.disabled = true;
    try {
      await api.feedback(state.result.search_id, id, button.dataset.relevant === 'true');
      toast('反馈已记录');
    } catch (error) { toast(error.message); }
    finally { if (button.isConnected) button.disabled = false; }
  } else if (action === 'copy-citation') {
    const c = currentCase(id);
    if (!c) return;
    const text = [c.source_type === 'demo' ? '【虚构演示案例】' : '', c.title, c.court, c.case_number, c.judge_date].filter(Boolean).join('，');
    try { await navigator.clipboard.writeText(text); toast('已复制案例引用'); }
    catch {
      openDrawer('复制引用', `<label for="copy-area">请选择并复制以下引用</label><textarea id="copy-area" class="copy-area" readonly>${esc(text)}</textarea>`, 'copy', 'modal');
      $('#copy-area').select();
    }
  } else if (action === 'toggle-nav') {
    const open = $('.workspace').classList.toggle('nav-open');
    button.setAttribute('aria-expanded', String(open));
  }
});

document.addEventListener('keydown', event => {
  const tab = event.target.closest('[role=tab]');
  if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    const tabs = [...tab.closest('[role=tablist]').querySelectorAll('[role=tab]')];
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    event.preventDefault();
    // Manual activation: arrow keys move focus, Enter/Space activates and fetches content.
    tabs.forEach(item => { item.tabIndex = item === next ? 0 : -1; });
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  if (event.key === 'Escape') {
    if (event.target.closest('.document-reader') && !$('#overlay dialog')) {
      state.readerOpen = false; render(); $('main h1')?.focus({ preventScroll: true });
    }
    if (!('popover' in HTMLElement.prototype)) hideFilters();
    $('.workspace')?.classList.remove('nav-open');
    $('.mobile-menu')?.setAttribute('aria-expanded', 'false');
  }
  if (!event.isComposing && event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.target.id === 'query') {
    event.preventDefault();
    event.target.form.requestSubmit();
  }
});
document.addEventListener('focusout', event => {
  const list = event.target.closest('[role=tablist]');
  if (list && !list.contains(event.relatedTarget)) {
    list.querySelectorAll('[role=tab]').forEach(tab => {
      tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
    });
  }
});
window.addEventListener('hashchange', () => {
  const view = route().view;
  if (state.resultStatus === 'loading' && view !== 'results') cancelOperation();
  if (view !== 'search') cancelOptimization();
  render({ focus: true });
});
document.addEventListener('toggle', event => {
  if (event.target.id === 'search-progress' && event.target.isConnected) state.progressOpen = event.target.open;
  if (event.target.id === 'result-filter-popover' && event.target.isConnected) {
    state.filterOpen = event.newState === 'open';
    $('[data-action=toggle-result-filters]')?.setAttribute('aria-expanded', String(state.filterOpen));
  }
}, true);
document.addEventListener('scroll', event => {
  if (event.target.matches?.('.reader-scroll')) rememberReaderScroll();
}, true);
window.addEventListener('resize', () => { if (state.filterOpen) positionFilter(); updateExcerptControls(); });
matchMedia('(max-width: 900px)').addEventListener('change', () => { if (state.readerOpen) render(); });
document.addEventListener('click', event => {
  if (!('popover' in HTMLElement.prototype) && state.filterOpen && !event.target.closest('#result-filter-popover, [data-action=toggle-result-filters]')) hideFilters();
});
render();
connect();

// Native details/checkboxes preserve standard keyboard behavior without a custom listbox.
document.addEventListener('click', event => {
  document.querySelectorAll('.scope-multiselect[open]').forEach(panel => { if (!panel.contains(event.target)) panel.open = false; });
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const panel = event.target.closest('.scope-multiselect[open]');
  if (panel) { panel.open = false; panel.querySelector('summary').focus(); }
});
