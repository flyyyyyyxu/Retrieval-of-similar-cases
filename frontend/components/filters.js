import { esc } from '../ui.js';
export function filtersForm(filters = {}) {
  return `<fieldset class="filter-fields"><legend>限定检索范围（可选）</legend><div class="filter-grid">
    <label for="filter-region">地域<input id="filter-region" name="region" value="${esc(filters.region)}" placeholder="例如：上海" maxlength="60"></label>
    <label for="filter-from">起始年份<input id="filter-from" name="year_from" type="number" min="1900" max="2100" step="1" value="${esc(filters.year_from)}" placeholder="不限"></label>
    <label for="filter-to">截止年份<input id="filter-to" name="year_to" type="number" min="1900" max="2100" step="1" value="${esc(filters.year_to)}" placeholder="不限"></label>
    <label for="filter-level">法院层级<select id="filter-level" name="court_level"><option value="">不限</option>${['基层法院', '中级法院', '高级法院', '最高人民法院'].map(level => `<option ${filters.court_level === level ? 'selected' : ''}>${level}</option>`).join('')}</select></label>
  </div></fieldset>`;
}
export function filterSummary(filters = {}) {
  return [(filters.regions?.length ? filters.regions.join('、') : filters.region), filters.years?.length && filters.years.join('、') + '年', filters.year_from && `${filters.year_from}年起`, filters.year_to && `至${filters.year_to}年`, (filters.court_levels?.length ? filters.court_levels.join('、') : filters.court_level)].filter(Boolean).join(' · ') || '未限定地域、年份或法院层级';
}
