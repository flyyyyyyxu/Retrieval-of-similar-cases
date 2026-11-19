import { esc } from '../ui.js';
import { sortedHits } from '../store.js';

const palette = ['#a8d56f', '#e97679', '#66c5c1', '#aebbd1', '#d8bb72', '#8ebca9'];
function counts(hits, field) {
  const groups = new Map();
  for (const hit of hits) {
    const name = hit.case[field] || '未提供';
    groups.set(name, (groups.get(name) || 0) + 1);
  }
  return [...groups].sort((a, b) => b[1] - a[1]);
}
const share = (count, total) => total ? `${(count * 100 / total).toFixed(2)}%` : '0.00%';

export function visualization() {
  const hits = sortedHits(), total = hits.length;
  const regions = counts(hits, 'region'), levels = counts(hits, 'court_level');
  const circumference = 2 * Math.PI * 72;
  let offset = 0;
  const segments = levels.map(([name, count], i) => {
    const length = total ? count / total * circumference : 0;
    const circle = `<circle cx="110" cy="110" r="72" fill="none" stroke="${palette[i % palette.length]}" stroke-width="27" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)"><title>${esc(name)}：${count}篇，${share(count, total)}</title></circle>`;
    offset += length;
    return circle;
  }).join('');
  const causes = new Map();
  for (const hit of hits) {
    const path = hit.case.cause_path?.length ? hit.case.cause_path.join(' / ') : hit.case.cause || '未提供';
    causes.set(path, (causes.get(path) || 0) + 1);
  }
  const entries = [...causes].sort((a, b) => b[1] - a[1]);
  const height = Math.max(260, entries.length * 64 + 60), center = height / 2;
  return `<section class="visualization" aria-label="结果可视化"><p class="visualization-scope">当前结果分布 · ${total}篇</p><div class="visualization-grid">
    <section class="visual-card"><h3>地域</h3><div class="region-table-wrap"><table class="region-table"><thead><tr><th scope="col">地域</th><th scope="col">分布</th><th scope="col">案件数</th><th scope="col">占比</th></tr></thead><tbody>${regions.map(([name, count], i) => `<tr><th scope="row">${esc(name)}</th><td><span class="region-bar" style="--bar-size:${total ? count / total * 100 : 0}%;--bar-color:${i ? '#8ab735' : '#ed8c2b'}"></span></td><td>${count}</td><td>${share(count, total)}</td></tr>`).join('') || '<tr><td colspan="4">暂无结果</td></tr>'}</tbody></table></div></section>
    <section class="visual-card"><h3>法院级别</h3><div class="court-donut"><svg viewBox="0 0 220 220" role="img" aria-label="${esc(levels.map(([name, count]) => `${name}${count}篇`).join('，') || '暂无结果')}">${segments}<text x="110" y="105" text-anchor="middle">${total}</text><text x="110" y="128" text-anchor="middle" class="donut-unit">篇案例</text></svg><ul class="chart-legend">${levels.map(([name, count], i) => `<li><span style="--legend-color:${palette[i % palette.length]}"></span><strong>${esc(name)}</strong><span>${count}篇 · ${share(count, total)}</span></li>`).join('')}</ul></div></section>
    <section class="visual-card cause-card"><h3>案由</h3><div class="cause-tree-scroll"><svg viewBox="0 0 800 ${height}" role="img" aria-label="${esc(entries.map(([name, count]) => `${name}${count}篇`).join('，') || '暂无结果')}"><text x="32" y="${center + 5}">案由</text><circle cx="100" cy="${center}" r="5"/>${entries.map(([name, count], i) => {
      const y = 40 + i * 64 + (height - entries.length * 64) / 2;
      return `<path d="M105 ${center} C240 ${center},240 ${y},380 ${y}"/><circle cx="380" cy="${y}" r="5"/><text x="400" y="${y + 5}"><title>${esc(name)}</title>${esc(name.length > 24 ? name.slice(0, 24) + '…' : name)}（${count}篇）</text>`;
    }).join('')}</svg></div></section>
  </div></section>`;
}
