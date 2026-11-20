import { esc } from '../ui.js';
import { sortedHits } from '../store.js';

const palette = Array.from({ length: 6 }, (_, i) => `var(--chart-${i + 1})`);
function counts(hits, field) {
  const groups = new Map();
  for (const hit of hits) {
    const name = hit.case[field] || '未提供';
    groups.set(name, (groups.get(name) || 0) + 1);
  }
  return [...groups].sort((a, b) => b[1] - a[1]);
}
const share = (count, total) => total ? `${(count * 100 / total).toFixed(2)}%` : '0.00%';

function causeBranches(hits) {
  const root = new Map();
  for (const { case: c } of hits) {
    const path = [...(c.cause_path || [])];
    if (c.cause && !path.includes(c.cause)) path.push(c.cause);
    if (!path.length) path.push('未提供');
    let branch = root;
    for (const name of path) {
      if (!branch.has(name)) branch.set(name, { name, count: 0, children: new Map() });
      const node = branch.get(name);
      node.count++; branch = node.children;
    }
  }
  function render(branch, parents = []) {
    return `<ul>${[...branch.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN')).map(node => {
      const path = [...parents, node.name];
      return `<li data-cause-count="${node.count}" data-cause-path="${esc(path.join(' / '))}"><div class="cause-node"><span>${esc(node.name)}</span><span class="cause-count">${node.count}篇</span></div>${node.children.size ? render(node.children, path) : ''}</li>`;
    }).join('')}</ul>`;
  }
  return root.size ? render(root) : '<p class="chart-empty">暂无案由数据</p>';
}

export function visualization() {
  const hits = sortedHits(), total = hits.length;
  const regions = counts(hits, 'region'), levels = counts(hits, 'court_level');
  const maxRegionCount = Math.max(1, ...regions.map(([, count]) => count));
  const circumference = 2 * Math.PI * 72;
  let offset = 0;
  const segments = levels.map(([name, count], i) => {
    const length = total ? count / total * circumference : 0;
    const circle = `<circle cx="110" cy="110" r="72" fill="none" stroke="${palette[i % palette.length]}" stroke-width="16" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)"><title>${esc(name)}：${count}篇，${share(count, total)}</title></circle>`;
    offset += length;
    return circle;
  }).join('');
  return `<section class="visualization" aria-label="结果可视化"><p class="visualization-scope">当前结果分布 · ${total}篇</p><div class="visualization-grid">
    <section class="visual-card"><h3>地域</h3><div class="region-table-wrap"><table class="region-table"><thead><tr><th scope="col">地域</th><th scope="col">分布<span class="sr-only">，按最大案件数等比缩放</span></th><th scope="col">案件数</th><th scope="col">占比</th></tr></thead><tbody>${regions.map(([name, count]) => `<tr><th scope="row">${esc(name)}</th><td><span class="region-track" aria-hidden="true"><span class="region-bar" style="--bar-size:${count / maxRegionCount * 100}%"></span></span></td><td>${count}</td><td>${share(count, total)}</td></tr>`).join('') || '<tr><td colspan="4">暂无结果</td></tr>'}</tbody></table></div></section>
    <section class="visual-card"><h3>法院级别</h3><div class="court-donut"><svg viewBox="0 0 220 220" role="img" aria-label="${esc(levels.map(([name, count]) => `${name}${count}篇`).join('，') || '暂无结果')}">${segments}<text x="110" y="105" text-anchor="middle">${total}</text><text x="110" y="128" text-anchor="middle" class="donut-unit">篇案例</text></svg><ul class="chart-legend">${levels.map(([name, count], i) => `<li><span style="--legend-color:${palette[i % palette.length]}"></span><strong>${esc(name)}</strong><span>${count}篇 · ${share(count, total)}</span></li>`).join('')}</ul></div></section>
    <section class="visual-card cause-card"><h3>案由</h3><div class="cause-tree-scroll"><div class="cause-tree" role="group" aria-label="案由层级与案件数量"><div class="cause-tree-root">检索结果<span>${total}篇案例</span></div>${causeBranches(hits)}</div></div></section>
  </div></section>`;
}
