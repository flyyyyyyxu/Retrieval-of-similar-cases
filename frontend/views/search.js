import { state } from '../store.js';
import { esc, icon } from '../ui.js';
import { examples } from './home.js';
import { searchScope } from '../components/search-scope.js';

export function searchPage() {
  const optimizing = state.optimizeStatus === 'loading';
  const candidate = state.optimization;
  return `<div class="search-page direct-search"><div class="search-heading"><h1 tabindex="-1">类案检索</h1><p>描述案情与争点，查找值得参考的案例。</p></div>
    <search><form id="search-form" class="direct-search-form" action="/api/search" method="post" aria-label="类案检索" novalidate><div class="search-form query-composer">
      <label class="sr-only" for="query">案情或法律问题</label>
      <textarea id="query" name="text" required minlength="5" maxlength="5000" aria-describedby="query-error" placeholder="输入法律问题，查找相关类案与裁判观点。可在问题中说明时间、地域等检索范围…">${esc(state.draft)}</textarea>
      <div class="composer-actions"><button type="button" class="optimize-button" data-action="optimize-question" ${optimizing ? 'disabled' : ''}>${optimizing ? '<span class="mini-spinner" aria-hidden="true"></span>' : icon('spark')}<span>${optimizing ? '正在优化…' : '问题优化'}</span></button><button class="send-button" type="submit" aria-label="开始检索" title="开始检索">${icon('send')}</button></div>
      <p id="query-error" class="form-error" role="alert" ${state.parseError ? '' : 'hidden'}>${esc(state.parseError)}</p>
    </div>${searchScope(state.searchFilters)}</form></search>
    ${candidate ? `<section class="optimization-preview" aria-labelledby="optimization-title"><div class="optimization-heading"><h2 id="optimization-title">优化后的问题</h2><button type="button" class="text-button" data-action="dismiss-optimization">保留原问题</button></div><p>${esc(candidate.optimized_text)}</p><button type="button" class="btn small" data-action="apply-optimization">使用这个问题 ${icon('arrow')}</button></section>` : ''}
    ${state.optimizeNotice ? `<p class="optimization-notice" role="status">${esc(state.optimizeNotice)}</p>` : ''}
    <div class="example-heading"><span>试一试</span><span>点击填入后可修改</span></div><div class="direct-examples">${examples.map((text, i) => `<button type="button" data-action="use-example" data-index="${i}">${icon('spark')}<span>${esc(text)}</span></button>`).join('')}</div>
  </div>`;
}
