import { esc, icon, $ } from '../ui.js';

const regions = ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏',
  '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南',
  '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆'];
const levels = ['基层法院', '中级法院', '高级法院', '最高人民法院'];
export const blankScope = () => ({ region: null, year_from: null, year_to: null, court_level: null, regions: [], years: [], court_levels: [] });
const selected = (scope, key, legacy) => scope[key]?.length ? scope[key] : scope[legacy] ? [scope[legacy]] : [];

export function searchScope(scope = {}) {
  const year = new Date().getFullYear();
  const years = [...new Set([...Array.from({ length: year - 1899 }, (_, i) => year - i), ...(scope.years || []), scope.year_from, scope.year_to].filter(Boolean))].sort((a, b) => b - a);
  const options = (value) => `<option value="">不限</option>${years.map(y => `<option value="${y}" ${y === value ? 'selected' : ''}>${y}</option>`).join('')}`;
  const multi = (key, label, items, values, id, extra = '') => `<details class="scope-multiselect"><summary id="${id}" data-scope-summary="${key}"><span>${label}：${values.length ? values.join('、') : '不限'}</span>${icon('chevron')}</summary><div class="scope-options"><fieldset><legend>${label}（可多选）</legend><button type="button" class="text-button" data-action="clear-scope-group" data-group="${key}">清空${label}</button><div class="scope-option-list">${[...new Set([...items, ...values])].map((v, i) => `<div><input type="checkbox" id="scope-${key}-${i}" name="${key}" value="${esc(v)}" data-search-scope ${values.includes(v) ? 'checked' : ''}><label for="scope-${key}-${i}">${esc(v)}</label></div>`).join('')}</div>${extra}</fieldset></div></details>`;
  return `<fieldset class="search-scope"><legend class="sr-only">限定检索范围</legend><span class="scope-caption">${icon('filter')} 筛选</span>
    ${multi('regions', '地域', regions, selected(scope, 'regions', 'region'), 'scope-region')}
    ${multi('years', '年份', years, scope.years || [], 'scope-years', `<div class="scope-range"><span>或按年份范围</span><label for="scope-year-from">起始年份</label><select id="scope-year-from" name="year_from" data-search-scope>${options(scope.year_from)}</select><label for="scope-year-to">截止年份</label><select id="scope-year-to" name="year_to" data-search-scope>${options(scope.year_to)}</select></div>`)}
    ${multi('court_levels', '法院层级', levels, selected(scope, 'court_levels', 'court_level'), 'scope-level')}
    <button type="button" class="text-button scope-reset" data-action="reset-search-scope">重置</button>
    <p id="scope-error" class="form-error" role="alert" hidden></p></fieldset>`;
}

export function readSearchScope(form, validate = false) {
  const from = $('#scope-year-from', form), to = $('#scope-year-to', form);
  if (!from || !to) return blankScope();
  const values = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
  const regions = values('regions'), levels = values('court_levels'), years = values('years').map(Number);
  const filters = { region: regions.length === 1 ? regions[0] : null, regions,
    court_level: levels.length === 1 ? levels[0] : null, court_levels: levels, years,
    year_from: from.value ? Number(from.value) : null, year_to: to.value ? Number(to.value) : null };
  for (const [key, label] of [['regions', '地域'], ['years', '年份'], ['court_levels', '法院层级']]) {
    const list = filters[key], summary = form.querySelector(`[data-scope-summary="${key}"]`);
    const text = `${label}：${list.length ? list.join('、') : key === 'years' && (from.value || to.value) ? `${from.value || '不限'}—${to.value || '不限'}` : '不限'}`;
    summary.querySelector('span').textContent = text; summary.title = text;
  }
  from.removeAttribute('aria-invalid'); to.removeAttribute('aria-invalid');
  const error = $('#scope-error', form); error.hidden = true;
  if (validate && filters.year_from && filters.year_to && filters.year_from > filters.year_to) {
    error.textContent = '截止年份不能早于起始年份。'; error.hidden = false;
    to.closest('details').open = true; to.setAttribute('aria-invalid', 'true'); to.focus(); return null;
  }
  return filters;
}
