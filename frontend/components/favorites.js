import { state, persist, currentCase } from '../store.js';
import { $, esc, icon } from '../ui.js';
import { openDrawer } from './drawer.js';

export function folderOptions(selected = '') {
  return state.folders.map(folder => `<label class="favorite-folder-option"><input type="radio" name="folder_id" value="${esc(folder.id)}" ${folder.id === selected ? 'checked' : ''}><span>${icon('folder')}${esc(folder.name)}</span><small>${state.saved.filter(item => item.mode === state.health?.data_mode && item.folderId === folder.id).length}</small></label>`).join('');
}

export function openFavoriteChooser(id) {
  const doc = currentCase(id);
  if (!doc || !state.health) return;
  const saved = state.saved.find(item => item.case.id === id && item.mode === state.health.data_mode);
  openDrawer(saved ? '管理收藏' : '收藏案例', `<form id="favorite-form" data-case-id="${esc(id)}" novalidate><p class="favorite-case-title">${esc(doc.title)}</p><fieldset class="favorite-folder-list"><legend>选择收藏夹</legend><div id="favorite-folder-options">${folderOptions(saved?.folderId)}</div></fieldset><div class="favorite-new-folder"><label for="favorite-folder-name">新建收藏夹</label><div><input id="favorite-folder-name" name="new_folder_name" type="text" maxlength="40" placeholder="输入收藏夹名称"><button type="button" class="btn small" data-action="favorite-create-folder">新建</button></div></div><p id="favorite-error" class="form-error" role="alert" hidden></p><div class="favorite-dialog-actions">${saved ? `<button type="button" class="text-button remove-favorite" data-action="remove-favorite" data-id="${esc(id)}">取消收藏</button>` : ''}<button type="button" class="btn small" data-action="close-drawer">取消</button><button type="submit" class="btn small primary">保存收藏</button></div></form>`, id, 'modal favorite-dialog');
  ($('#favorite-folder-options input:checked') || $('#favorite-folder-options input'))?.focus();
}

function error(message) {
  const node = $('#favorite-error'); if (node) { node.textContent = message; node.hidden = false; }
}

export function addFolder(name) {
  name = name.trim();
  if (!name || name.length > 40) { error('请填写1—40字的收藏夹名称。'); return null; }
  if (state.folders.some(folder => folder.name === name)) { error('已有同名收藏夹，请换一个名称。'); return null; }
  if (state.folders.length >= 100) { error('收藏夹已达到100个上限。'); return null; }
  const folder = { id: crypto.randomUUID(), name }, old = state.folders;
  state.folders = [...old, folder];
  if (!persist()) { state.folders = old; error('浏览器未能保存收藏夹，请检查存储后重试。'); return null; }
  return folder;
}

export function createFolderInChooser() {
  const input = $('#favorite-folder-name'), folder = addFolder(input?.value || '');
  if (!folder) { input?.focus(); return; }
  $('#favorite-folder-options').innerHTML = folderOptions(folder.id);
  input.value = ''; $('#favorite-error').hidden = true;
  [...document.querySelectorAll('#favorite-folder-options input')].find(radio => radio.value === folder.id)?.focus();
}

export function saveFavorite(form) {
  const id = form.dataset.caseId, folderId = new FormData(form).get('folder_id');
  const folder = state.folders.find(item => item.id === folderId), doc = currentCase(id);
  if (!folder) { error('请先选择一个收藏夹。'); $('input[name=folder_id]', form)?.focus(); return null; }
  if (!doc || !state.health) { error('暂时无法读取案例，请重新打开后收藏。'); return null; }
  const { paragraphs, full_text_available, law_references, content_sections, ...summary } = doc;
  const old = state.saved;
  state.saved = [{ case: summary, mode: state.health.data_mode, folderId }, ...old.filter(item => !(item.case.id === id && item.mode === state.health.data_mode))];
  if (!persist()) { state.saved = old; error('浏览器未能保存收藏，请检查存储后重试。'); return null; }
  return { id, folder };
}

export function removeFavorite(id) {
  const old = state.saved;
  state.saved = old.filter(item => !(item.case.id === id && item.mode === state.health?.data_mode));
  if (!persist()) { state.saved = old; error('浏览器未能保存修改，请重试。'); return false; }
  return true;
}

export function openNewFolderDialog() {
  openDrawer('新建收藏夹', '<form id="new-folder-form" novalidate><label class="new-folder-label" for="new-folder-name">收藏夹名称</label><input id="new-folder-name" name="folder_name" maxlength="40" placeholder="输入收藏夹名称"><p id="favorite-error" class="form-error" role="alert" hidden></p><div class="favorite-dialog-actions"><button type="button" class="btn small" data-action="close-drawer">取消</button><button type="submit" class="btn small primary">创建收藏夹</button></div></form>', 'new-folder', 'modal favorite-dialog');
  $('#new-folder-name')?.focus();
}
