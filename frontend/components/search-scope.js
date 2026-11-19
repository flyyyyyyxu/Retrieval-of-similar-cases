import { esc, icon, $ } from '../ui.js';

const regions = ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏',
  '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南',
  '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆'];
const levels = ['基层法院', '中级法院', '高级法院', '最高人民法院'];
export const blankScope = () => ({ region: null, year_from: null, year_to: null, court_level: null });

export function searchScope(scope = {}) {
  const year = new Date().getFullYear();
  const years = [...new Set([...Array.from({ length: year - 1899 }, (_, i) => year - i), scope.year_from, scope.year_to].filter(Boolean))].sort((a, b) => b - a);
  const options = (items, selected) => items.map(value => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join('');
  return `<fieldset class="search-scope"><legend class="sr-only">限定检索范围</legend><span class="scope-caption">${icon('filter')} 筛选</span>
    <div class="scope-field"><label for="scope-region">地域</label><select id="scope-region" name="region" data-search-scope><option value="">不限地域</option>${options([...new Set([...regions, scope.region].filter(Boolean))], scope.region)}</select></div>
    <div class="scope-years"><span>年份</span><label class="sr-only" for="scope-year-from">起始年份</label><select id="scope-year-from" name="year_from" data-search-scope aria-describedby="scope-error"><option value="">不限起始</option>${options(years, scope.year_from)}</select><span class="scope-dash" aria-hidden="true">—</span><label class="sr-only" for="scope-year-to">截止年份</label><select id="scope-year-to" name="year_to" data-search-scope aria-describedby="scope-error"><option value="">不限截止</option>${options(years, scope.year_to)}</select></div>
    <div class="scope-field"><label for="scope-level">法院层级</label><select id="scope-level" name="court_level" data-search-scope><option value="">不限层级</option>${options([...new Set([...levels, scope.court_level].filter(Boolean))], scope.court_level)}</select></div>
    <button type="button" class="text-button scope-reset" data-action="reset-search-scope">重置</button>
    <p id="scope-error" class="form-error" role="alert" hidden></p></fieldset>`;
}

export function readSearchScope(form, validate = false) {
  const from = $('#scope-year-from', form), to = $('#scope-year-to', form);
  if (!from || !to) return blankScope();
  const filters = { region: $('#scope-region', form).value || null, year_from: from.value ? Number(from.value) : null,
    year_to: to.value ? Number(to.value) : null, court_level: $('#scope-level', form).value || null };
  from.removeAttribute('aria-invalid'); to.removeAttribute('aria-invalid');
  const error = $('#scope-error', form); error.hidden = true;
  if (validate && filters.year_from && filters.year_to && filters.year_from > filters.year_to) {
    error.textContent = '截止年份不能早于起始年份。'; error.hidden = false;
    to.setAttribute('aria-invalid', 'true'); to.focus(); return null;
  }
  return filters;
}
