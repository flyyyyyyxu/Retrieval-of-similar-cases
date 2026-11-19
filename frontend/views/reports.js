import { api } from '../api.js';
import { $, esc, icon, empty, loading, toast } from '../ui.js';
import { state } from '../store.js';
import { route } from '../router.js';

const drafts = new Map(), requests = new Set();
let reportList = null, listError = '', editor, editorId, quillPromise, pyramidRegistered = false;
let generating = false;

function loadQuill() {
  if (window.Quill) return Promise.resolve(window.Quill);
  if (!quillPromise) quillPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/quill/quill.js';
    script.onload = () => resolve(window.Quill);
    script.onerror = () => { quillPromise = null; script.remove(); reject(new Error('编辑器加载失败，请重试。')); };
    document.head.append(script);
  });
  return quillPromise;
}

const allowedAttributes = ['bold', 'italic', 'underline', 'strike', 'header', 'align', 'list', 'indent'];
function normalizeOps(ops) {
  return ops.map(op => {
    const item = { insert: op.insert };
    if (op.attributes) {
      const attributes = Object.fromEntries(Object.entries(op.attributes).filter(([key, value]) => allowedAttributes.includes(key) && value != null && value !== false));
      if (attributes.header) attributes.header = Math.min(3, attributes.header);
      if (Object.keys(attributes).length) item.attributes = attributes;
    }
    return item;
  });
}

export function preserveReportEditor() {
  if (!editor) return;
  const draft = drafts.get(editorId);
  if (draft) draft.selection = editor.getSelection();
  editor = null; editorId = null;
}

function toolbar() {
  const b = (format, label, text, value = null) => `<button type="button" class="ql-${format}" ${value !== null ? `value="${value}"` : ''} title="${label}" aria-label="${label}" ${['undo', 'redo', 'clean'].includes(format) ? '' : 'aria-pressed="false"'}>${text}</button>`;
  const sep = '<span class="report-tool-separator" role="separator" aria-orientation="vertical"></span>';
  return `<div id="report-toolbar" role="toolbar" focusgroup="toolbar wrap" aria-label="报告文本格式" aria-controls="report-editor">
    <span class="ql-formats" role="group" aria-label="标题">${b('header', '一级标题', 'H1', 1)}${b('header', '二级标题', 'H2', 2)}${b('header', '三级标题', 'H3', 3)}</span>${sep}
    <span class="ql-formats" role="group" aria-label="文字样式">${b('bold', '加粗', 'B')}${b('italic', '斜体', 'I')}${b('underline', '下划线', 'U')}${b('strike', '删除线', 'S')}</span>${sep}
    <span class="ql-formats" role="group" aria-label="列表">${b('list', '有序列表', '1.', 'ordered')}${b('list', '无序列表', '•', 'bullet')}</span>${sep}
    <span class="ql-formats" role="group" aria-label="段落对齐">${b('align', '左对齐', '≡', '')}${b('align', '居中', '≡', 'center')}${b('align', '右对齐', '≡', 'right')}${b('align', '两端对齐', '☰', 'justify')}</span>${sep}
    <span class="ql-formats" role="group" aria-label="编辑操作">${b('clean', '清除格式', 'Tx')}${b('undo', '撤销', '↶')}${b('redo', '重做', '↷')}</span>
  </div>`;
}

export function reportsPage(id) {
  if (!id) return `<div class="collection-page reports-page"><div class="collection-heading"><div><h1 tabindex="-1">我的报告</h1><p>查看并继续编辑已保存的检索报告。</p></div><a class="btn small" href="#/results">返回检索</a></div>${listError ? empty('报告暂时无法读取', listError, '<button class="btn" data-action="retry-reports">重试</button>') : reportList === null ? loading('正在读取报告', '') : reportList.length ? `<div class="report-list">${reportList.map(report => `<a href="#/reports/${encodeURIComponent(report.id)}"><span class="report-list-icon">${icon('report')}</span><div><h2>${esc(report.title)}</h2><p>${report.case_ids.length}篇案例 · ${esc(new Date(report.updated_at).toLocaleString('zh-CN'))}</p></div><span>继续编辑 ${icon('arrow')}</span></a>`).join('')}</div>` : empty('还没有检索报告', '在相关案例中加入案例，点击工具栏的报告图标生成。', '<a class="btn primary" href="#/search">开始检索</a>')}</div>`;
  const draft = drafts.get(id);
  if (!draft) return loading('正在读取报告', '');
  if (draft.error) return empty('报告暂时无法读取', draft.error, '<button class="btn" data-action="retry-reports">重试</button>');
  return `<section class="report-page" data-report-id="${esc(id)}"><header class="report-page-header"><div><nav class="report-breadcrumb" aria-label="报告导航"><a href="#/results">${icon('back')} 返回检索</a><span>/</span><a href="#/reports">我的报告</a><span>/</span><span>在线编辑</span></nav><h1 tabindex="-1">${esc(draft.document.title)}</h1></div><div class="report-page-actions"><span id="report-save-status" role="status">${draft.dirty ? '有未保存修改' : '已保存'}</span><button type="button" class="btn small primary" data-action="save-report">保存</button><button type="button" class="btn small" data-action="download-report" data-format="docx">${icon('download')} Word</button><button type="button" class="btn small" data-action="download-report" data-format="pdf">${icon('download')} PDF</button></div></header><p id="report-message" class="form-error" role="alert" hidden></p>
    <div class="report-editing-surface">${toolbar()}<div class="report-paper"><div id="report-editor" aria-label="检索报告正文"></div></div></div></section>`;
}

function registerPyramid(Quill) {
  if (pyramidRegistered) return;
  const BlockEmbed = Quill.import('blots/block/embed');
  class ReportPyramid extends BlockEmbed {
    static blotName = 'reportPyramid';
    static tagName = 'DIV';
    static className = 'report-pyramid';
    static create(tiers) {
      const node = super.create();
      node.setAttribute('contenteditable', 'false');
      const safe = tiers.slice(0, 8).map(t => ({ label: String(t.label).slice(0, 40), count: Math.max(0, Math.min(100, Number(t.count) || 0)), color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#8b9f8d' }));
      node.dataset.tiers = JSON.stringify(safe);
      node.setAttribute('role', 'img'); node.setAttribute('aria-label', safe.map(t => `${t.label}${t.count}篇`).join('，'));
      safe.forEach((tier, i) => {
        const row = document.createElement('div');
        row.style.width = `${48 + (i + 1) / safe.length * 48}%`;
        row.style.backgroundColor = tier.color;
        row.textContent = `${tier.label}（${tier.count}）`;
        node.append(row);
      });
      return node;
    }
    static value(node) { return JSON.parse(node.dataset.tiers); }
  }
  Quill.register(ReportPyramid);
  pyramidRegistered = true;
}

function setStatus(text) { const status = $('#report-save-status'); if (status) status.textContent = text; }

function toolbarNavigation(bar) {
  if ('focusGroup' in HTMLElement.prototype) return;
  const buttons = [...bar.querySelectorAll('button')];
  buttons.forEach((button, i) => { button.tabIndex = i ? -1 : 0; });
  bar.addEventListener('focusin', ({ target }) => { if (buttons.includes(target)) buttons.forEach(b => { b.tabIndex = b === target ? 0 : -1; }); });
  bar.addEventListener('keydown', event => {
    const index = buttons.indexOf(event.target);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const direction = getComputedStyle(bar).direction === 'rtl' ? -1 : 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? direction : -direction) + buttons.length) % buttons.length;
    event.preventDefault(); buttons[next].focus();
  });
}

export async function mountReportEditor(id) {
  const host = $('#report-editor'), draft = drafts.get(id);
  if (!host || !draft?.document || host.dataset.mounted) return;
  host.dataset.mounted = 'true';
  try {
    const Quill = await loadQuill();
    if (!host.isConnected) return;
    registerPyramid(Quill);
    editorId = id;
    editor = new Quill(host, { theme: 'snow', formats: [...allowedAttributes, 'reportPyramid'], modules: {
      toolbar: { container: '#report-toolbar', handlers: { undo() { this.quill.history.undo(); }, redo() { this.quill.history.redo(); } } },
      history: { delay: 700, maxStack: 100, userOnly: true },
    } });
    const localEditor = editor;
    editor.root.setAttribute('role', 'textbox'); editor.root.setAttribute('aria-multiline', 'true');
    editor.root.setAttribute('aria-label', '检索报告正文'); editor.root.setAttribute('spellcheck', 'false');
    editor.setContents({ ops: normalizeOps(draft.document.ops) }, 'silent'); editor.history.clear();
    if (draft.selection) editor.setSelection(draft.selection, 'silent');
    function syncToolbar() {
      const f = localEditor.getFormat();
      $('#report-toolbar')?.querySelectorAll('button[aria-pressed]').forEach(button => {
        const format = [...button.classList].find(c => c.startsWith('ql-'))?.slice(3);
        const active = button.hasAttribute('value') ? String(f[format] || '') === button.value : Boolean(f[format]);
        button.setAttribute('aria-pressed', String(active));
      });
    }
    editor.on('text-change', () => {
      draft.document.ops = normalizeOps(localEditor.getContents().ops);
      const first = localEditor.getText().split('\n')[0].trim();
      draft.document.title = (first || '检索报告').slice(0, 120);
      const heading = $('.report-page-header h1'); if (heading) heading.textContent = draft.document.title;
      draft.dirty = true; draft.version++; setStatus('有未保存修改'); syncToolbar();
    });
    editor.on('selection-change', syncToolbar);
    toolbarNavigation($('#report-toolbar')); syncToolbar();
  } catch (error) {
    const message = $('#report-message');
    if (message) { message.hidden = false; message.textContent = error.message; }
  }
}

export async function ensureReports(id, render) {
  const key = id || 'list';
  if (requests.has(key) || (id ? drafts.has(id) : reportList !== null || listError)) return;
  requests.add(key);
  try {
    if (id) drafts.set(id, { document: await api.getReport(id), dirty: false, version: 0 });
    else reportList = await api.reports();
  } catch (error) {
    if (id) drafts.set(id, { error: error.message }); else listError = error.message;
  } finally {
    requests.delete(key);
    if (route().view === 'reports' && route().id === (id || '')) render();
  }
}

export function retryReports(render) {
  const id = route().id;
  if (id) drafts.delete(id); else { reportList = null; listError = ''; }
  render();
}

export async function generateReport(go, render) {
  if (!state.reportCases.size) { toast('请先将案例加入检索报告。'); return; }
  if (generating || !state.result) return;
  generating = true; state.reportGenerating = true;
  const searchId = state.result.search_id, ids = [...state.reportCases], filters = structuredClone(state.resultFilters);
  render();
  try {
    const report = await api.createReport(searchId, ids, filters);
    drafts.set(report.id, { document: report, dirty: false, version: 0 }); reportList = null;
    if (route().view === 'results' && searchId === state.result?.search_id) go(`#/reports/${report.id}`);
    else toast('检索报告已生成，可在“我的报告”查看。');
  } catch (error) { toast(error.message); }
  finally { generating = false; state.reportGenerating = false; if (route().view === 'results') render(); }
}

export async function saveReport(format = null) {
  const id = route().id, draft = drafts.get(id);
  if (!draft?.document || draft.busy) return;
  draft.busy = true;
  const version = draft.version;
  const doc = structuredClone(draft.document);
  const buttons = [...document.querySelectorAll('.report-page-actions button')];
  buttons.forEach(b => { b.disabled = true; }); setStatus(format ? '正在准备下载…' : '正在保存…');
  const message = $('#report-message'); if (message) message.hidden = true;
  try {
    if (draft.dirty) {
      const saved = await api.saveReport(id, { title: doc.title, ops: doc.ops, revision: doc.revision });
      draft.document.revision = saved.revision; draft.document.updated_at = saved.updated_at;
      draft.dirty = version !== draft.version;
      reportList = null;
    }
    if (format) {
      const blob = await api.downloadReport(id, format);
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `${doc.title}.${format}`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    if (route().id === id) setStatus(draft.dirty ? '有未保存修改' : '已保存');
    toast(format ? '下载已开始' : '报告已保存');
  } catch (error) {
    if (message?.isConnected) { message.hidden = false; message.textContent = error.message; }
    setStatus('保存或下载未完成'); toast(error.message);
  } finally { draft.busy = false; buttons.forEach(b => { if (b.isConnected) b.disabled = false; }); }
}

window.addEventListener('beforeunload', event => {
  if ([...drafts.values()].some(draft => draft.dirty)) { event.preventDefault(); event.returnValue = ''; }
});
