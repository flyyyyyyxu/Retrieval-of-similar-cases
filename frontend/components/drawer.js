import { $, esc, icon, degradation, caseHash } from '../ui.js';
export function closeDrawer() {
  const dialog = $('#overlay dialog');
  if (dialog?.open) dialog.close();
  dialog?.remove();
}
export function openDrawer(title, content, key = '', kind = 'drawer') {
  closeDrawer();
  const restoreFocus = document.activeElement;
  $('#overlay').innerHTML = `<dialog class="${kind}" aria-labelledby="drawer-title" data-key="${esc(key)}"><div class="drawer-top"><h2 id="drawer-title">${esc(title)}</h2><button type="button" class="icon-btn" data-action="close-drawer" aria-label="关闭" autofocus>${icon('close')}</button></div><div class="drawer-content">${content}</div></dialog>`;
  const dialog = $('#overlay dialog');
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
  }, { once: true });
  let outsideDown = false;
  const outside = event => {
    const r = dialog.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };
  dialog.addEventListener('pointerdown', event => { outsideDown = outside(event); });
  dialog.addEventListener('pointerup', event => { if (outsideDown && outside(event)) dialog.close(); });
  dialog.showModal();
}
export function updateDrawer(key, content) {
  const dialog = $('#overlay dialog');
  if (dialog?.dataset.key === key) $('.drawer-content', dialog).innerHTML = content;
}
export function explanationContent(explanation, caseId) {
  function points(items) {
    return items.map(point => `<article class="explanation-point"><span class="mini-label">${point.origin === 'original' ? '原文摘录' : 'AI归纳 · 待人工复核'}</span><p>${esc(point.text)}</p>${point.citations.filter(c => c.verified && c.case_id === caseId).map(c => `<blockquote>${esc(c.quote)}</blockquote><a class="citation-link" href="${esc(caseHash(c.case_id, c.paragraph_id))}" data-action="open-case" data-id="${esc(c.case_id)}">核对原文 · ${esc(c.paragraph_id)} ${icon('arrow')}</a>`).join('')}</article>`).join('');
  }
  const hasPoints = explanation.similarities.length || explanation.differences.length;
  return `${degradation(explanation.degraded)}${hasPoints ? `<section class="explanation-group"><h3>${explanation.degraded.includes('explain_fallback') ? '相关原文摘录' : '相似点'}</h3>${points(explanation.similarities) || '<p class="muted">暂无可核验的相似点。</p>'}</section><section class="explanation-group"><h3>重要差异</h3>${points(explanation.differences) || '<p class="muted">暂无可核验的差异信息；不表示案件完全相同。</p>'}</section>` : '<p class="muted">当前没有可展示的核验内容，请直接阅读文书。</p>'}<p class="explanation-note">引用核验表示引句可在原文找到。是否支持归纳、是否适合引用，仍需结合全文判断。</p><div class="feedback-actions"><span>这篇案例对当前问题有参考价值吗？</span><button type="button" class="btn small" data-action="feedback" data-id="${esc(caseId)}" data-relevant="true">有参考价值</button><button type="button" class="btn small" data-action="feedback" data-id="${esc(caseId)}" data-relevant="false">不相关</button></div>`;
}
