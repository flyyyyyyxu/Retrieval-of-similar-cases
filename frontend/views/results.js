import { state } from '../store.js';
import { esc, icon, empty } from '../ui.js';
import { resultLibrary } from '../components/result-library.js';
import { searchProgress } from '../components/search-progress.js';
import { searchAnswer } from '../components/search-answer.js';
import { filterSummary } from '../components/filters.js';

export function resultPage() {
  const q = state.resultQuery;
  if (!q) return empty('还没有检索结果', '描述案情或法律问题，即可开始检索。', '<a class="btn primary" href="#/search">开始检索</a>');
  const heading = `<div class="query-heading direct-query-heading"><div><span class="query-type">类案检索</span><h1 tabindex="-1">${esc(q.raw_text)}</h1></div><div class="query-actions"><button type="button" class="text-button" data-action="copy-question">复制</button><button type="button" class="text-button" data-action="edit-query">修改</button></div></div>`;
  const scopedHeading = heading + (Object.values(q.filters || {}).some(value => value != null && value !== '' && (!Array.isArray(value) || value.length)) ? `<p class="query-scope-summary">${icon('filter')}${esc(filterSummary(q.filters))}</p>` : '');
  const progress = searchProgress();
  if (state.resultStatus === 'loading') return `<div class="results-page direct-results">${scopedHeading}<section class="response-panel">${progress}<p class="processing-status" role="status">${esc(state.progress.find(step => step.status === 'running')?.detail || '正在检索…')}</p><button type="button" class="text-button" data-action="cancel">取消检索</button></section></div>`;
  if (state.resultStatus === 'error') return `<div class="results-page direct-results">${scopedHeading}<section class="response-panel">${progress}${empty('本次检索未完成', state.resultError, `<button type="button" class="btn primary" data-action="retry-search">重新检索 ${icon('arrow')}</button>`)}</section></div>`;
  const result = state.result;
  if (!result) return `<div class="results-page">${heading}${empty('检索已取消', '问题已保留，可修改后重新检索。')}</div>`;
  return `<div class="results-page direct-results">${scopedHeading}<section class="response-panel">${progress}${searchAnswer()}</section>${resultLibrary()}</div>`;
}
