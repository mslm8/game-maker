'use strict';
// Mobile-friendly code editor built on CodeMirror 5.

function cmModeFor(path) {
  const ext = String(path || '').split('.').pop().toLowerCase();
  const map = {
    js: 'javascript', mjs: 'javascript', json: { name: 'javascript', json: true },
    kt: 'text/x-kotlin', kts: 'text/x-kotlin', java: 'text/x-java',
    xml: 'xml', html: 'htmlmixed', svg: 'xml',
    css: 'css', gd: 'python', py: 'python', tscn: 'python', godot: 'python',
    yml: 'yaml', yaml: 'yaml', md: 'markdown', txt: null,
  };
  return map[ext] !== undefined ? map[ext] : null;
}

const Editor = (() => {
  let cm = null;
  let currentPath = null;
  let saveFn = null;       // async (path, content) => void
  let dirty = false;
  let saveTimer = null;
  let statusEl = null;

  function init(container, onSave, statusElement) {
    saveFn = onSave;
    statusEl = statusElement || null;
    if (cm) { cm.toTextArea(); cm = null; }
    const ta = document.createElement('textarea');
    container.appendChild(ta);
    cm = CodeMirror.fromTextArea(ta, {
      mode: 'javascript',
      theme: 'material-darker',
      lineNumbers: true,
      indentUnit: 2,
      tabSize: 2,
      lineWrapping: true,
      viewportMargin: 8,
      inputStyle: 'contenteditable', // better mobile behavior
      extraKeys: { 'Ctrl-S': doSave, 'Cmd-S': doSave },
    });
    cm.on('change', () => {
      dirty = true;
      setStatus('●');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 1600); // autosave
    });
    return cm;
  }

  function setStatus(s) { if (statusEl) statusEl.textContent = s; }

  async function doSave() {
    if (!cm || !saveFn || !currentPath) return;
    if (!dirty) return;
    setStatus(i18n.t('ed.saving'));
    try {
      await saveFn(currentPath, cm.getValue());
      dirty = false;
      setStatus(i18n.t('ed.saved') + ' ✓');
    } catch (e) {
      setStatus(i18n.t('common.error') + ': ' + e.message);
    }
  }

  function openFile(path, content) {
    if (!cm) return;
    if (dirty) doSave();
    currentPath = path;
    const mode = cmModeFor(path);
    cm.setOption('mode', mode || 'null');
    cm.setValue(content ?? '');
    cm.clearHistory();
    dirty = false;
    setStatus(i18n.t('ed.auto'));
    setTimeout(() => cm.refresh(), 30);
  }

  function getValue() { return cm ? cm.getValue() : ''; }
  function getPath() { return currentPath; }
  function isDirty() { return dirty; }
  function focus() { if (cm) cm.focus(); }
  function undo() { if (cm) cm.undo(); }
  function redo() { if (cm) cm.redo(); }
  function search() { if (cm) cm.execCommand('find'); }
  function gotoLine() { if (cm) cm.execCommand('jumpToLine'); }

  function format() {
    if (!cm) return;
    const v = cm.getValue();
    try {
      const obj = JSON.parse(v);
      cm.setValue(JSON.stringify(obj, null, 2));
      toast('JSON مرتب شد', 'ok');
      return;
    } catch (e) { /* not json */ }
    // basic re-indent for brace languages
    if (/[{};]/.test(v)) {
      let out = '', indent = 0;
      const lines = v.split('\n');
      for (let line of lines) {
        line = line.replace(/\s+$/, '');
        const closes = (line.match(/^[}\)]+/) || ['']).length;
        indent = Math.max(0, indent - closes);
        out += '  '.repeat(indent) + line + '\n';
        const opens = (line.match(/\{\s*$/) || []).length;
        indent += opens;
      }
      cm.setValue(out.trimEnd() + '\n');
      toast(i18n.t('common.done'), 'ok');
    } else {
      toast('قالب‌بندی خودکار برای این نوع فایل موجود نیست', 'err');
    }
  }

  return { init, openFile, doSave, getValue, getPath, isDirty, focus, undo, redo, search, gotoLine, format };
})();
