import { state } from '../store.js';
import { $, esc, icon } from '../ui.js';

// Older browsers load the commands polyfill only as needed; the local fallback
// below remains usable if the internal/offline environment cannot reach the CDN.
if (!('commandForElement' in HTMLButtonElement.prototype)) {
  import('https://esm.run/invokers-polyfill').catch(() => {});
}

export const filterGroups = [
  ['court_levels', '法院级别'], ['reference_levels', '参照级别'], ['courts', '审理法院'],
  ['causes', '案由'], ['procedures', '审判程序'], ['date', '裁判日期'],
  ['doc_types', '文书类型'], ['word_count', '文书篇幅'], ['claim_amount', '标的额'],
  ['case_fee', '案件受理费'], ['disclosure_levels', '文书公开程度'], ['has_hearing_video', '庭审视频'],
];
const referenceLabels = { guiding: '指导性案例', typical: '官方典型案例', reference: '入库参考案例', judgment: '普通裁判文书' };

export function filterFields() {
  const f = state.resultFilters, options = state.filterOptions;
  if (!options) return '<p class="filter-loading" role="status">正在读取过滤条件…</p>';
  return `<form id="result-filter-form" aria-label="案例过滤条件" novalidate>${filterGroups.map(([key, label]) => {
    let content;
    if (key === 'date') {
      content = `<div class="filter-range"><label>起始日期<input type="date" name="date_from" value="${esc(f.date_from)}"></label><label>截止日期<input type="date" name="date_to" value="${esc(f.date_to)}"></label></div>`;
    } else if (['word_count', 'claim_amount', 'case_fee'].includes(key)) {
      const step = key === 'word_count' ? '1' : '0.01', unit = key === 'word_count' ? '字' : '元';
      content = `<div class="filter-range"><label>最小值（${unit}）<input type="number" min="0" step="${step}" name="${key}_min" value="${esc(f[`${key}_min`])}" placeholder="不限"></label><label>最大值（${unit}）<input type="number" min="0" step="${step}" name="${key}_max" value="${esc(f[`${key}_max`])}" placeholder="不限"></label></div>`;
    } else if (key === 'has_hearing_video') {
      content = [['', '不限'], ['true', '有庭审视频'], ['false', '无庭审视频']].map(([value, text]) => `<label class="filter-choice"><input type="radio" name="has_hearing_video" value="${value}" ${(f.has_hearing_video == null && value === '') || String(f.has_hearing_video) === value ? 'checked' : ''}>${text}</label>`).join('');
    } else {
      const values = options[key] || [];
      const search = ['courts', 'causes'].includes(key) ? `<input class="filter-option-search" type="search" data-option-search="${key}" aria-label="搜索${label}" placeholder="搜索${label}">` : '';
      content = search + (values.length ? values.map(value => `<label class="filter-choice" data-option-label="${key}"><input type="checkbox" name="${key}" value="${esc(value)}" ${(f[key] || []).includes(value) ? 'checked' : ''}><span>${esc(referenceLabels[value] || value)}</span></label>`).join('') : '<p class="filter-no-options">暂无可选项</p>');
    }
    return `<details class="filter-group"><summary>${label}${['courts', 'causes'].includes(key) ? icon('search') : ''}${icon('chevron')}</summary><div class="filter-group-content">${content}</div></details>`;
  }).join('')}<div class="filter-footer"><p id="filter-error" class="form-error" role="alert" hidden></p><button type="button" class="btn small" data-action="clear-result-filters">重置</button><button type="submit" class="btn small primary">应用过滤</button></div></form>`;
}

export function filterPopover() {
  return `<aside id="result-filter-popover" popover="auto" aria-labelledby="filter-title" class="result-filter-popover" ${'popover' in HTMLElement.prototype ? '' : 'hidden'}><header class="filter-popover-heading"><h2 id="filter-title">过滤条件</h2><button type="button" commandfor="result-filter-popover" command="hide-popover" data-action="close-filters" class="icon-btn" aria-label="关闭过滤条件">${icon('close')}</button></header><div id="filter-form-host">${filterFields()}</div></aside>`;
}

export function positionFilter() {
  const button = $('[data-action=toggle-result-filters]'), panel = $('#result-filter-popover');
  if (!button || !panel) return;
  const rect = button.getBoundingClientRect();
  const width = Math.min(370, innerWidth - 24);
  panel.style.width = `${width}px`;
  panel.style.left = `${Math.max(12, Math.min(rect.right - width, innerWidth - width - 12))}px`;
  panel.style.top = `${Math.max(12, Math.min(rect.bottom + 6, innerHeight - 280))}px`;
  panel.style.maxHeight = `${innerHeight - parseFloat(panel.style.top) - 12}px`;
}

export function hideFilters() {
  const panel = $('#result-filter-popover');
  if (panel?.hidePopover) panel.hidePopover();
  else if (panel) { panel.hidden = true; panel.classList.remove('is-fallback-open'); }
  state.filterOpen = false;
  $('[data-action=toggle-result-filters]')?.setAttribute('aria-expanded', 'false');
}

export function readFilters(form) {
  form.querySelectorAll('input').forEach(input => input.setCustomValidity(''));
  const data = new FormData(form), filters = {};
  for (const key of ['court_levels', 'reference_levels', 'courts', 'causes', 'procedures', 'doc_types', 'disclosure_levels']) filters[key] = data.getAll(key);
  for (const key of ['date_from', 'date_to']) filters[key] = data.get(key) || null;
  for (const key of ['word_count_min', 'word_count_max', 'claim_amount_min', 'claim_amount_max', 'case_fee_min', 'case_fee_max']) filters[key] = data.get(key) ? Number(data.get(key)) : null;
  filters.has_hearing_video = data.get('has_hearing_video') === '' ? null : data.get('has_hearing_video') === 'true';
  for (const [lower, upper] of [['date_from', 'date_to'], ['word_count_min', 'word_count_max'], ['claim_amount_min', 'claim_amount_max'], ['case_fee_min', 'case_fee_max']]) {
    if (filters[lower] != null && filters[upper] != null && filters[lower] > filters[upper]) {
      form.elements.namedItem(upper).setCustomValidity('最大值不能小于最小值。');
    }
  }
  return form.reportValidity() ? filters : null;
}
