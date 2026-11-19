import { state } from '../store.js';
import { esc, icon, empty, modeLabel } from '../ui.js';
import { caseCard } from '../components/case-card.js';
import { filterSummary } from '../components/filters.js';

export function collectionPage(view) {
  if (view === 'saved') {
    const items = state.saved.filter(item => item.mode === state.health?.data_mode);
    const active = state.folders.find(folder => folder.id === state.activeFolder);
    const visible = active ? items.filter(item => item.folderId === active.id) : items;
    return `<div class="collection-page favorites-page"><div class="collection-heading"><div><h1 tabindex="-1">我的收藏</h1><p>按收藏夹整理案例，随时回到原文。</p></div><button type="button" class="btn small" data-action="new-folder">${icon('plus')} 新建收藏夹</button></div>
      <div class="favorites-layout"><aside class="favorites-folders" aria-label="收藏夹"><h2>收藏夹</h2><nav aria-label="选择收藏夹"><button type="button" data-action="select-folder" data-id="all" aria-current="${!active ? 'true' : 'false'}">${icon('bookmark')}<span>全部收藏</span><small>${items.length}</small></button>${state.folders.map(folder => `<button type="button" data-action="select-folder" data-id="${esc(folder.id)}" aria-current="${folder.id === active?.id ? 'true' : 'false'}">${icon('folder')}<span>${esc(folder.name)}</span><small>${items.filter(item => item.folderId === folder.id).length}</small></button>`).join('')}</nav></aside>
      <section class="favorites-content" aria-label="收藏案例"><div class="favorites-content-heading"><h2>${esc(active?.name || '全部收藏')}</h2><span>${visible.length} 个案例</span></div>${visible.length ? visible.map((item, i) => `<div class="favorite-item"><span class="favorite-location">${icon('folder')}${esc(state.folders.find(folder => folder.id === item.folderId)?.name || '默认收藏夹')}</span>${caseCard({ case: item.case, snippets: [] }, i, true)}</div>`).join('') : empty(active ? '收藏夹里还没有案例' : '还没有收藏案例', '在相关案例或文书详情中点击收藏，选择收藏夹后保存。', '<a class="btn primary" href="#/search">开始检索</a>')}</section></div></div>`;
  }
  return `<div class="collection-page"><div class="collection-heading"><div><h1 tabindex="-1">历史记录</h1><p>当前浏览器保存最近20次检索快照；历史结果不表示重新检索。</p></div><span>${state.history.length} 条记录</span></div>${state.history.length ? `<div class="history-list">${state.history.map(item => `<article><div><span class="mini-label">${esc(new Date(item.time).toLocaleString('zh-CN'))} · ${esc(modeLabel(item.response.data_mode))}</span><button type="button" data-action="open-history" data-id="${esc(item.id)}">${esc(item.query.raw_text)} ${icon('arrow')}</button><p>${esc(filterSummary(item.query.filters))}</p></div><button type="button" class="icon-btn" data-action="delete-history" data-id="${esc(item.id)}" aria-label="删除这条检索记录">${icon('close')}</button></article>`).join('')}</div><button type="button" class="text-button" data-action="clear-history">清空历史记录</button>` : empty('还没有检索记录', '确认条件并完成检索后，这里会保存结果快照。', '<a class="btn primary" href="#/search">开始检索</a>')}</div>`;
}
