import { state, documentKey } from '../store.js';
import { $, esc, icon, safeSource } from '../ui.js';

let outlineObserver;

export function rememberReaderScroll() {
  const scroll = $('.reader-scroll');
  const tab = state.readerTabs.find(item => item.id === scroll?.dataset.caseId);
  if (tab && !tab.needsJump) tab.scrollTop = scroll.scrollTop;
}

export function openReader(id, target = '') {
  rememberReaderScroll();
  if (state.readerMode !== state.health?.data_mode) state.readerTabs = [];
  state.readerMode = state.health?.data_mode;
  let tab = state.readerTabs.find(item => item.id === id);
  if (!tab) {
    const summary = state.result?.hits.find(hit => hit.case.id === id)?.case
      || state.saved.find(item => item.mode === state.health?.data_mode && item.case.id === id)?.case;
    tab = { id, title: summary?.title || id, target, scrollTop: 0, needsJump: Boolean(target) };
    state.readerTabs.push(tab);
  } else if (target) { tab.target = target; tab.needsJump = true; }
  state.activeReaderId = id; state.readerOpen = true;
}

export function activateReader(id) {
  rememberReaderScroll();
  if (state.readerTabs.some(tab => tab.id === id)) state.activeReaderId = id;
}

export function closeReaderTab(id) {
  rememberReaderScroll();
  const index = state.readerTabs.findIndex(tab => tab.id === id);
  state.readerTabs = state.readerTabs.filter(tab => tab.id !== id);
  if (state.activeReaderId === id) state.activeReaderId = state.readerTabs[Math.min(index, state.readerTabs.length - 1)]?.id || null;
  if (!state.readerTabs.length) state.readerOpen = false;
}

export function toggleReaderDirectory() {
  const tab = state.readerTabs.find(item => item.id === state.activeReaderId);
  if (tab) tab.directoryCollapsed = !(tab.directoryCollapsed ?? matchMedia('(max-width: 1320px)').matches);
}

function groupSections(doc) {
  const token = Array.from(doc.id).map(char => char.codePointAt(0).toString(16)).join('-');
  const sections = [];
  for (const paragraph of doc.paragraphs) {
    const label = paragraph.section || '正文';
    if (sections.at(-1)?.label === label) sections.at(-1).paragraphs.push(paragraph);
    else sections.push({ label, id: `reader-section-${token}-${sections.length}`, paragraphs: [paragraph] });
  }
  return sections;
}

function readerContent(tab) {
  const doc = state.documents.get(documentKey(tab.id));
  const error = state.documentErrors.get(documentKey(tab.id));
  if (error) return `<div class="reader-message"><p>暂时无法读取文书。</p><button type="button" class="btn small" data-action="retry-document" data-id="${esc(tab.id)}">重试</button></div>`;
  if (!doc) return '<div class="reader-message" role="status"><span class="mini-spinner" aria-hidden="true"></span>正在读取原文…</div>';
  const sections = groupSections(doc), source = safeSource(doc.source_url);
  const collapsed = tab.directoryCollapsed ?? matchMedia('(max-width: 1320px)').matches;
  const metadata = [doc.court, doc.case_number, doc.judge_date && `${doc.judge_date.replaceAll('-', '.')} 裁判`].filter(Boolean);
  const causes = [...(doc.cause_path?.length ? doc.cause_path : [])];
  if (doc.cause && !causes.includes(doc.cause)) causes.push(doc.cause);
  return `<div class="reader-document-layout ${collapsed ? 'directory-collapsed' : ''}">
    <nav class="reader-directory" aria-label="文书目录"><header><strong>目录</strong><button type="button" class="icon-btn" data-action="toggle-reader-directory" aria-label="${collapsed ? '展开目录' : '收起目录'}" aria-expanded="${!collapsed}" aria-controls="reader-outline">${icon(collapsed ? 'list' : 'back')}</button></header><ul id="reader-outline" class="reader-toc" ${collapsed ? 'hidden' : ''}>${sections.map(section => `<li><a href="#${section.id}" data-action="reader-jump" data-id="${esc(tab.id)}" data-paragraph="${esc(section.paragraphs[0].id)}">${esc(section.label)}</a></li>`).join('')}</ul></nav>
    <div class="reader-scroll" data-case-id="${esc(tab.id)}" tabindex="0" role="region" aria-label="${esc(doc.title)}正文"><article class="reader-paper">
      <header class="reader-document-heading"><h2>${esc(doc.title)}</h2><div class="reader-meta">${metadata.map(value => `<span>${esc(value)}</span>`).join('')}</div>${source ? `<a class="reader-source" href="${esc(source)}" target="_blank" rel="noopener noreferrer">${icon('book')} 查看文书来源</a>` : ''}</header>
      <details class="reader-cause" open><summary>案由 ${icon('chevron')}</summary><div class="reader-cause-path">${causes.length ? causes.map((value, i) => `${i ? '<span class="cause-separator" aria-hidden="true">›</span>' : ''}<span>${esc(value)}</span>`).join('') : '<span class="cause-missing">未提供案由</span>'}</div></details>
      ${!doc.full_text_available ? '<p class="reader-warning">当前正文可能不完整。</p>' : ''}${tab.target && !doc.paragraphs.some(p => p.id === tab.target) ? '<p class="reader-warning">未找到对应引用段落，请核对文书版本。</p>' : ''}
      ${doc.court || doc.doc_type ? `<div class="reader-masthead">${doc.court ? `<p>${esc(doc.court)}</p>` : ''}${doc.doc_type ? `<p class="reader-document-type">${esc(doc.doc_type)}</p>` : ''}${doc.case_number ? `<p class="reader-case-number">${esc(doc.case_number)}</p>` : ''}</div>` : ''}
      ${sections.map(section => `<section class="reader-document-section" id="${section.id}" tabindex="-1"><h3>${esc(section.label)}</h3>${section.paragraphs.map(p => `<div class="reader-paragraph ${p.id === tab.target ? 'reader-target' : ''}" data-paragraph-id="${esc(p.id)}" tabindex="-1"><p>${esc(p.text)}</p></div>`).join('')}</section>`).join('') || '<p class="reader-warning">暂无正文。</p>'}
    </article></div></div>`;
}

export function readerPanel() {
  if (!state.readerOpen || !state.readerTabs.length) return '';
  const mobile = matchMedia('(max-width: 900px)').matches;
  return `<aside class="document-reader" ${mobile ? 'role="dialog" aria-modal="true"' : ''} aria-label="原文阅读分栏"><div class="reader-toolbar"><strong>原文阅读</strong><div><button type="button" class="text-button" data-action="close-reader-tab" data-id="${esc(state.activeReaderId)}">关闭当前</button><button type="button" class="icon-btn" data-action="close-reader" aria-label="收起阅读栏">${icon('close')}</button></div></div>
    <div class="reader-tabs" role="tablist" aria-label="已打开的文书">${state.readerTabs.map(tab => `<button type="button" role="tab" id="reader-tab-${encodeURIComponent(tab.id)}" data-action="reader-tab" data-id="${esc(tab.id)}" aria-selected="${tab.id === state.activeReaderId}" tabindex="${tab.id === state.activeReaderId ? '0' : '-1'}" title="${esc(tab.title)}">${esc(tab.title)}</button>`).join('')}</div>
    <div class="reader-panels">${state.readerTabs.map(tab => `<div role="tabpanel" class="reader-tab-panel" aria-labelledby="reader-tab-${encodeURIComponent(tab.id)}" ${tab.id === state.activeReaderId ? '' : 'hidden'}>${tab.id === state.activeReaderId ? readerContent(tab) : ''}</div>`).join('')}</div></aside>`;
}

function nativeOutline(root) {
  // Native markers require a shared scroll context. The desktop TOC is an
  // independent scroller beside the document, so it uses the observer fallback.
  return root.contains($('.reader-toc')) && CSS.supports('scroll-target-group: auto') && CSS.supports('selector(:target-current)');
}

function syncOutline() {
  const root = $('.reader-scroll'), links = [...document.querySelectorAll('.reader-toc a')];
  if (!root || !links.length) return;
  const tab = state.readerTabs.find(item => item.id === state.activeReaderId);
  let current;
  if (tab?.outlineTarget) current = links.find(link => link.getAttribute('href') === `#${tab.outlineTarget}`);
  if (!current && nativeOutline(root)) current = $('.reader-toc a:target-current');
  if (!current) {
    const top = root.getBoundingClientRect().top;
    const section = [...root.querySelectorAll('.reader-document-section')].filter(s => s.getBoundingClientRect().top <= top + 45).at(-1);
    current = links.find(a => a.getAttribute('href') === `#${section?.id}`) || links[0];
  }
  links.forEach(link => { link.setAttribute('aria-current', link === current ? 'true' : 'false'); link.classList.toggle('target-current', link === current); });
}

export function positionReader() {
  outlineObserver?.disconnect();
  const tab = state.readerTabs.find(item => item.id === state.activeReaderId), scroll = $('.reader-scroll');
  if (!tab || !scroll) return;
  const doc = state.documents.get(documentKey(tab.id));
  if (tab.needsJump && doc) {
    const target = [...scroll.querySelectorAll('[data-paragraph-id]')].find(p => p.dataset.paragraphId === tab.target);
    if (target) {
      const section = target.closest('.reader-document-section');
      tab.outlineTarget = section.id;
      const anchor = target === section.querySelector('.reader-paragraph') ? section : target;
      scroll.scrollTop += anchor.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 18;
      target.focus({ preventScroll: true });
    }
    tab.needsJump = false; tab.scrollTop = scroll.scrollTop;
  } else if (!tab.needsJump) scroll.scrollTop = tab.scrollTop || 0;
  if (scroll.dataset.outlineReady !== 'true') {
    scroll.dataset.outlineReady = 'true';
    scroll.addEventListener('scrollend', syncOutline);
    const unpin = () => { tab.outlineTarget = null; };
    scroll.addEventListener('wheel', unpin, { passive: true });
    scroll.addEventListener('touchstart', unpin, { passive: true });
    scroll.addEventListener('pointerdown', unpin);
    scroll.addEventListener('keydown', event => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) unpin(); });
  }
  scroll.closest('.reader-document-layout').classList.toggle('native-outline', nativeOutline(scroll));
  if (!nativeOutline(scroll)) {
    outlineObserver = new IntersectionObserver(syncOutline, { root: scroll, rootMargin: '0px 0px -65% 0px' });
    scroll.querySelectorAll('.reader-document-section').forEach(section => outlineObserver.observe(section));
  }
  syncOutline();
}

export function refreshReader(id) {
  if (!state.readerOpen || state.activeReaderId !== id) return;
  const tab = state.readerTabs.find(item => item.id === id), panel = $('.reader-tab-panel:not([hidden])');
  if (tab && panel) {
    const doc = state.documents.get(documentKey(id));
    if (doc) {
      tab.title = doc.title;
      const button = document.getElementById(`reader-tab-${encodeURIComponent(id)}`);
      if (button) { button.textContent = doc.title; button.title = doc.title; }
    }
    rememberReaderScroll(); panel.innerHTML = readerContent(tab); positionReader();
  }
}
