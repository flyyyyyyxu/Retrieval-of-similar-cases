import { state } from '../store.js';
import { esc, icon } from '../ui.js';

// Public, factual execution summary. Never accepts a model's private reasoning text.
export function searchProgress() {
  if (!state.progress.length) return '';
  const busy = state.resultStatus === 'loading';
  const failed = state.resultStatus === 'error';
  const title = busy ? '正在检索与整理' : failed ? '检索未完成' : '检索思路与过程';
  const done = state.progress.filter(step => ['done', 'skipped'].includes(step.status)).length;
  return `<details id="search-progress" class="search-progress" ${state.progressOpen ? 'open' : ''}>
    <summary><span class="${busy ? 'mini-spinner' : 'progress-check'}" aria-hidden="true">${busy ? '' : failed ? '!' : '✓'}</span><span>${title}</span>${!busy && !failed ? '<span class="progress-completed">已完成</span>' : ''}${icon('chevron')}</summary>
    <div class="progress-body"><progress max="3" value="${done}" aria-label="已完成的处理阶段"></progress><ol>${state.progress.map(step => `<li class="step-${esc(step.status)}"><span class="step-dot" aria-hidden="true">${step.status === 'done' ? '✓' : step.status === 'error' ? '!' : '·'}</span><div><strong>${esc(step.label)}</strong><p>${esc(step.detail)}</p></div></li>`).join('')}</ol></div>
  </details>`;
}
