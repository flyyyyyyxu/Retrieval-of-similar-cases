import { esc, icon, logo } from '../ui.js';
import { state } from '../store.js';
import { readerPanel } from './reader.js';

export function workspace(view, content) {
  const showReader = state.readerOpen && ['results', 'saved', 'history'].includes(view);
  const mobileReader = showReader && matchMedia('(max-width: 900px)').matches;
  return `<div class="workspace ${showReader ? 'has-reader' : ''}">
    <aside class="sidebar" id="workspace-navigation" ${mobileReader ? 'inert' : ''}>
      <div class="sidebar-brand">${logo()}</div>
      <a href="#/search" class="btn new-search" data-action="new-search">${icon('plus')} 新建检索</a>
      <nav aria-label="工作区导航">
        ${state.result ? `<a href="#/results" class="${['results', 'case'].includes(view) ? 'active' : ''}">${icon('search')} 当前检索</a>` : ''}
        <a href="#/history" class="${view === 'history' ? 'active' : ''}">${icon('history')} 历史记录 <span>${state.history.length || ''}</span></a>
        <a href="#/reports" class="${view === 'reports' ? 'active' : ''}">${icon('report')} 我的报告</a>
        <a href="#/saved" class="${view === 'saved' ? 'active' : ''}">${icon('bookmark')} 我的收藏 <span>${state.saved.length || ''}</span></a>
      </nav>
      ${state.history.length ? `<div class="sidebar-recent"><span class="mini-label">最近检索</span>${state.history.slice(0, 3).map(record => `<button type="button" data-action="open-history" data-id="${esc(record.id)}" title="${esc(record.query.raw_text)}">${esc(record.query.raw_text)}</button>`).join('')}</div>` : ''}
      <div class="sidebar-bottom"><a href="#/">${icon('back')} 产品介绍</a></div>
    </aside>
    <div class="workspace-main"><header class="work-header" ${mobileReader ? 'inert' : ''}><button type="button" class="icon-btn mobile-menu" data-action="toggle-nav" aria-label="展开导航" aria-controls="workspace-navigation" aria-expanded="false">${icon('menu')}</button><a href="#/" class="mobile-brand">清案</a></header>
      <div class="workspace-content"><main id="main-content" ${mobileReader ? 'inert' : ''}>${content}</main>${showReader ? readerPanel() : ''}</div>
    </div>
  </div>`;
}
