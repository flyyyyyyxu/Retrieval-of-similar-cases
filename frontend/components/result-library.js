import { icon, empty } from '../ui.js';
import { state, sortedHits } from '../store.js';
import { caseCard } from './case-card.js';
import { lawList } from './law-list.js';
import { filterPopover } from './filter-panel.js';
import { visualization } from './visualization.js';

export function resultLibrary() {
  const hits = sortedHits(), casesActive = state.resultTab === 'cases';
  const allSelected = hits.length > 0 && hits.every(hit => state.selectedCases.has(hit.case.id));
  const selected = state.selectedCases.size;
  const noResults = state.result?.hits.length
    ? empty('没有找到符合条件的案例', '', '<button type="button" class="text-button" data-action="clear-result-filters">重置筛选</button>')
    : empty('未找到相关案例', '可调整问题或检索范围后重试。', '<button type="button" class="text-button" data-action="edit-query">调整检索范围</button>');
  return `<section class="result-library" aria-label="检索参考资料"><div class="library-tabbar"><div class="library-tabs" role="tablist" aria-label="参考资料类型">
    <button type="button" role="tab" id="results-tab-cases" data-action="result-tab" data-tab="cases" aria-selected="${casesActive}" tabindex="${casesActive ? '0' : '-1'}">相关案例</button>
    <button type="button" role="tab" id="results-tab-laws" data-action="result-tab" data-tab="laws" aria-selected="${!casesActive}" tabindex="${casesActive ? '-1' : '0'}">引用法规</button>
  </div></div>
    <div id="results-panel-cases" role="tabpanel" aria-labelledby="results-tab-cases" ${casesActive ? '' : 'hidden'}>
      <div class="library-toolbar"><label class="select-all"><input type="checkbox" id="select-all-cases" ${allSelected ? 'checked' : ''}>全选</label>
        <button type="button" class="icon-btn generate-report" data-action="generate-report" title="生成检索报告" aria-label="生成检索报告，已加入${state.reportCases.size}篇案例" ${state.reportGenerating ? 'disabled' : ''}>${icon('report')}<span class="report-badge" aria-hidden="true">${state.reportCases.size}</span><span class="report-trigger-tip">${state.reportGenerating ? '正在生成检索报告…' : '生成检索报告'}</span></button>
        <div class="batch-actions"><button type="button" class="icon-btn" data-action="report-selected" title="将选中案例加入检索报告" aria-label="将选中案例加入检索报告" ${selected ? '' : 'disabled'}>${icon('report-add')}</button><button type="button" class="icon-btn" data-action="export-selected" title="导出案例信息（JSON）" aria-label="导出案例信息（JSON）" ${selected ? '' : 'disabled'}>${icon('download')}</button><button type="button" class="icon-btn" data-action="print-selected" title="打印选中案例" aria-label="打印选中案例" ${selected ? '' : 'disabled'}>${icon('print')}</button></div>
        <span class="selection-count">${selected ? `已选 ${selected} 项` : ''}</span><div class="library-toolbar-end"><label class="sort-label" for="sort"><span class="sr-only">结果排序</span><select id="sort" name="sort"><option value="relevance" ${state.sort === 'relevance' ? 'selected' : ''}>检索顺序</option><option value="newest" ${state.sort === 'newest' ? 'selected' : ''}>日期从新到旧</option><option value="oldest" ${state.sort === 'oldest' ? 'selected' : ''}>日期从旧到新</option></select></label><button type="button" class="library-filter-button" data-action="toggle-result-filters" commandfor="result-filter-popover" command="toggle-popover" aria-expanded="${state.filterOpen}" aria-controls="result-filter-form">${icon('filter')} 过滤条件 ${icon('chevron')}</button></div>
      </div>${filterPopover()}<div class="case-view-tabs" role="tablist" aria-label="案例展示方式"><button type="button" role="tab" id="case-view-list" data-action="case-view" data-view="list" aria-selected="${state.caseView === 'list'}" tabindex="${state.caseView === 'list' ? '0' : '-1'}">${icon('list')} 列表 <span>${hits.length}</span></button><button type="button" role="tab" id="case-view-visual" data-action="case-view" data-view="visual" aria-selected="${state.caseView === 'visual'}" tabindex="${state.caseView === 'visual' ? '0' : '-1'}">${icon('chart')} 可视化</button></div>
      <div role="tabpanel" aria-labelledby="case-view-list" ${state.caseView === 'list' ? '' : 'hidden'}><div class="result-content">${hits.length ? hits.map((hit, i) => caseCard(hit, i)).join('') : noResults}</div></div><div role="tabpanel" aria-labelledby="case-view-visual" ${state.caseView === 'visual' ? 'tabindex="0"' : 'hidden'}>${visualization()}</div>
    </div>
    <div id="results-panel-laws" role="tabpanel" aria-labelledby="results-tab-laws" ${casesActive ? 'hidden' : 'tabindex="0"'}><div class="laws-content">${lawList()}</div></div>
  </section>`;
}
