'use strict';
var Views = window.Views || (window.Views = {});
// Project workspace: files/editor, AI assistant, preview, design studio, build, history.

Views.project = async function (main, id, tab) {
  let data;
  try {
    data = await Api.get('/api/projects/' + id);
  } catch (e) {
    main.appendChild(h('div', { class: 'empty-state' }, icon('alert'), h('h3', null, i18n.t('common.error')), h('p', null, e.message)));
    return;
  }
  const { project: p, files: fileList, checkpoints } = data;
  const fileCount = fileList.length;

  const tabs = [
    { id: 'files', label: 'proj.files', icon: 'code' },
    { id: 'assistant', label: 'proj.assistant', icon: 'spark' },
    { id: 'preview', label: 'proj.preview', icon: 'play' },
    { id: 'design', label: 'proj.design', icon: 'layers' },
    { id: 'assets', label: 'as.tab', icon: 'image' },
    { id: 'build', label: 'proj.build', icon: 'download' },
    { id: 'history', label: 'proj.history', icon: 'clock' },
  ];
  const activeTab = tabs.some(t => t.id === tab) ? tab : 'files';

  const statusBadge = p.status === 'ready'
    ? h('span', { class: 'badge ok dot' }, i18n.t('status.ready'))
    : p.status === 'generating'
      ? h('span', { class: 'badge warn dot' }, i18n.t('status.generating'))
      : h('span', { class: 'badge err dot' }, i18n.t('status.failed'));

  const tabbar = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(t =>
    h('a', { class: 'tab' + (t.id === activeTab ? ' active' : ''), href: '#/project/' + id + '/' + t.id, role: 'tab', 'data-testid': 'tab-' + t.id }, i18n.t(t.label))));

  main.appendChild(h('div', null,
    h('div', { class: 'row between' },
      h('div', null,
        h('h1', { class: 'page-title' }, p.name),
        h('div', { class: 'row' }, h('span', { class: 'type-chip' }, i18n.t(TYPE_META[p.type].chip)), statusBadge,
          h('span', { class: 'hint' }, faNum(fileCount) + ' ' + i18n.t('dash.statFiles') + ' · ' + faTime(p.updated_at)))),
      h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } },
        h('a', { class: 'btn small ghost', href: '#/projects' }, h('span', { class: 'back-arrow', style: { display: 'inline-block' } }, '←'), ' ' + i18n.t('nav.projects')),
        h('button', { class: 'btn small ghost', 'data-testid': 'button-duplicate', onclick: async () => {
          try {
            const r = await Api.post('/api/projects/' + id + '/duplicate');
            toast(i18n.t('common.done') + ' — #' + r.project.id, 'ok');
            location.hash = '#/project/' + r.project.id;
          } catch (e) { toast(e.message, 'err'); }
        } }, icon('copy', 14), i18n.t('pm.duplicate')),
        h('button', { class: 'btn small ghost', 'data-testid': 'button-archive', onclick: async () => {
          try {
            await Api.post('/api/projects/' + id + (p.archived ? '/restore' : '/archive'));
            toast(i18n.t('common.done'), 'ok');
            location.hash = '#/projects';
          } catch (e) { toast(e.message, 'err'); }
        } }, icon('box', 14), p.archived ? i18n.t('pm.restore') : i18n.t('pm.archive')),
        h('button', { class: 'btn small danger', onclick: async () => {
          if (!confirm(i18n.t('st.wipeConfirm').replace('همه پروژه‌ها، فایل‌ها و تنظیمات', p.name))) return;
          await Api.del('/api/projects/' + id).catch(e => toast(e.message, 'err'));
          location.hash = '#/projects';
        } }, icon('trash', 14), i18n.t('common.delete'))),
    ),
    h('div', { class: 'mt' }, tabbar),
  ));

  const content = h('div');
  main.appendChild(content);

  if (activeTab === 'files') await renderFilesTab(content);
  else if (activeTab === 'assistant') await renderAssistantTab(content);
  else if (activeTab === 'preview') await renderPreviewTab(content);
  else if (activeTab === 'design') await renderDesignTab(content);
  else if (activeTab === 'assets') await renderAssetsTab(content);
  else if (activeTab === 'build') await renderBuildTab(content);
  else await renderHistoryTab(content);

  // -----------------------------------------------------------------------
  async function loadFile(path) {
    const f = await Api.get('/api/projects/' + id + '/file?path=' + encodeURIComponent(path));
    return f.content;
  }
  async function saveFile(path, content) {
    await Api.put('/api/projects/' + id + '/file', { path, content });
  }
  async function refreshFileList() {
    const d = await Api.get('/api/projects/' + id);
    return d.files;
  }

  // ======================= FILES / EDITOR TAB =============================
  async function renderFilesTab(el) {
    if (!fileCount) {
      el.appendChild(h('div', { class: 'empty-state' }, icon('file', 44),
        h('h3', null, i18n.t('files.empty')),
        h('p', null, i18n.t('bc.noProviderSub')),
        h('button', { class: 'btn', onclick: async (e) => {
          e.target.disabled = true;
          try { await Api.post('/api/projects/' + id + '/generate-template', {}); toast(i18n.t('common.done'), 'ok'); renderView(); } catch (err) { toast(err.message, 'err'); }
        } }, icon('spark', 15), i18n.t('wiz.create'))));
      return;
    }

    const treeEl = h('ul', { class: 'filetree' });
    const pathEl = h('span', { class: 'path' }, '');
    const saveState = h('span', { class: 'save-state' }, '');
    const editorHost = h('div', { class: 'editor-wrap' });
    let currentPath = fileList[0].path;

    const fileIcons = { kt: 'code', kts: 'code', xml: 'file', html: 'file', css: 'code', js: 'code', json: 'file', gd: 'code', py: 'code', yml: 'file', yaml: 'file', md: 'file', svg: 'file', tscn: 'file', godot: 'file', txt: 'file' };

    async function drawTree() {
      treeEl.innerHTML = '';
      const files = await refreshFileList();
      files.forEach(f => {
        const ext = f.path.split('.').pop();
        treeEl.appendChild(h('li', {
          class: f.path === currentPath ? 'active' : '', 'data-testid': 'file-' + f.path,
          onclick: async () => {
            if (Editor.isDirty()) await Editor.doSave();
            currentPath = f.path;
            pathEl.textContent = f.path;
            const content = await loadFile(f.path);
            Editor.openFile(f.path, content);
            drawTree();
          },
        }, icon(fileIcons[ext] || 'file', 14), h('span', { class: 'fpath' }, f.path)));
      });
    }

    const searchAllBtn = h('button', { class: 'tbtn', onclick: openSearchAll }, icon('search', 14), i18n.t('files.searchAll'));
    const newFileBtn = h('button', { class: 'tbtn', onclick: openNewFile }, icon('plus', 14), i18n.t('files.new'));
    const renameBtn = h('button', { class: 'tbtn', onclick: openRename }, icon('pen', 14), i18n.t('files.rename'));
    const delBtn = h('button', { class: 'tbtn', onclick: async () => {
      if (!confirm(i18n.t('files.deleteConfirm') + '\n' + currentPath)) return;
      await Api.post('/api/projects/' + id + '/file/delete', { path: currentPath }).catch(e => toast(e.message, 'err'));
      toast(i18n.t('common.done'), 'ok');
      renderView();
    } }, icon('trash', 14), i18n.t('files.delete'));
    const versionsBtn = h('button', { class: 'tbtn', onclick: openVersions }, icon('clock', 14), i18n.t('ed.versions'));
    const aiEditBtn = h('button', { class: 'tbtn', onclick: openAiEdit }, icon('spark', 14), i18n.t('ed.ai'));

    const toolbar = h('div', { class: 'editor-toolbar' },
      pathEl,
      h('button', { class: 'tbtn', onclick: () => Editor.search() }, icon('search', 14), i18n.t('ed.search')),
      h('button', { class: 'tbtn', onclick: () => Editor.undo() }, i18n.t('ed.undo')),
      h('button', { class: 'tbtn', onclick: () => Editor.redo() }, i18n.t('ed.redo')),
      h('button', { class: 'tbtn', onclick: () => Editor.format() }, i18n.t('ed.format')),
      versionsBtn, aiEditBtn,
      h('button', { class: 'tbtn save', onclick: () => Editor.doSave() }, icon('check', 14), i18n.t('ed.save')),
      saveState,
    );

    const filePane = h('aside', { class: 'filepane' },
      h('div', { class: 'pane-head' }, h('span', null, i18n.t('proj.files')), h('div', null, newFileBtn, searchAllBtn)),
      treeEl,
    );

    el.appendChild(h('div', { class: 'workspace' },
      filePane,
      h('div', { class: 'editorpane' },
        toolbar,
        editorHost,
        h('div', { class: 'row' }, renameBtn, delBtn, h('span', { class: 'hint' }, i18n.t('ed.auto'))),
      ),
    ));

    Editor.init(editorHost, async (path, content) => { await saveFile(path, content); }, saveState);
    const first = await loadFile(currentPath);
    pathEl.textContent = currentPath;
    Editor.openFile(currentPath, first);
    drawTree();

    // ---- modals ----
    function openNewFile() {
      const inp = h('input', { class: 'input', placeholder: i18n.t('files.newPh'), dir: 'ltr' });
      modal(i18n.t('files.new'), h('div', { class: 'field' }, inp), [
        h('button', { class: 'btn ghost', onclick: closeModal }, i18n.t('common.cancel')),
        h('button', { class: 'btn', onclick: async () => {
          const path = inp.value.trim();
          if (!path) return;
          try {
            await saveFile(path, '');
            toast(i18n.t('common.done'), 'ok'); closeModal(); renderView();
          } catch (e) { toast(e.message, 'err'); }
        } }, i18n.t('common.save')),
      ]);
    }

    function openRename() {
      const inp = h('input', { class: 'input', value: currentPath, dir: 'ltr' });
      modal(i18n.t('files.rename'), h('div', { class: 'field' }, h('label', null, i18n.t('files.renameTo')), inp), [
        h('button', { class: 'btn ghost', onclick: closeModal }, i18n.t('common.cancel')),
        h('button', { class: 'btn', onclick: async () => {
          try {
            await Api.post('/api/projects/' + id + '/file/rename', { from: currentPath, to: inp.value.trim() });
            toast(i18n.t('common.done'), 'ok'); closeModal(); renderView();
          } catch (e) { toast(e.message, 'err'); }
        } }, i18n.t('common.save')),
      ]);
    }

    async function openVersions() {
      let versions = [];
      try { versions = await Api.get('/api/projects/' + id + '/file/versions?path=' + encodeURIComponent(currentPath)); } catch (e) { /* none */ }
      const body = h('div', null,
        h('p', { class: 'hint mb' }, currentPath),
        versions.length
          ? h('ul', { class: 'timeline' }, versions.map(v =>
              h('li', null, h('span', null, faTime(v.created_at) + ' · ' + faNum(v.size) + ' B'),
                h('button', { class: 'btn small', onclick: async () => {
                  await Api.post('/api/projects/' + id + '/file/restore', { versionId: v.id }).catch(e => toast(e.message, 'err'));
                  toast(i18n.t('ed.restore') + ' ✓', 'ok'); closeModal(); renderView();
                } }, i18n.t('ed.restore')))))
          : h('p', { class: 'muted' }, i18n.t('common.empty')));
      modal(i18n.t('ed.versions'), body, [h('button', { class: 'btn ghost block', onclick: closeModal }, i18n.t('common.close'))]);
    }

    async function openSearchAll() {
      const inp = h('input', { class: 'input', placeholder: i18n.t('search.ph'), dir: 'ltr' });
      const results = h('div', { class: 'mt' });
      const body = h('div', null, inp, results);
      inp.addEventListener('input', async () => {
        results.innerHTML = '';
        if (inp.value.trim().length < 2) return;
        results.appendChild(h('p', { class: 'hint' }, i18n.t('search.searching')));
        try {
          const hits = await Api.post('/api/projects/' + id + '/search', { query: inp.value.trim() });
          results.innerHTML = '';
          if (!hits.length) { results.appendChild(h('p', { class: 'muted' }, i18n.t('search.noHit'))); return; }
          hits.forEach(hit => {
            results.appendChild(h('div', { class: 'search-result', onclick: () => {
              closeModal();
              currentPath = hit.path;
              loadFile(hit.path).then(c => { Editor.openFile(hit.path, c); pathEl.textContent = hit.path; drawTree(); });
            } },
              h('div', { class: 'path' }, hit.path + ' (' + faNum(hit.count) + ')'),
              hit.lines.map(l => h('div', { class: 'line' }, l.line + ': ' + l.text)),
            ));
          });
        } catch (e) { results.appendChild(h('p', { class: 'muted' }, e.message)); }
      });
      modal(i18n.t('files.searchAll'), body, [h('button', { class: 'btn ghost block', onclick: closeModal }, i18n.t('common.close'))]);
    }

    async function openAiEdit() {
      if (!App.state.aiConfigured) { toast(i18n.t('asst.noProvider'), 'err'); return; }
      const ta = h('textarea', { class: 'input', placeholder: i18n.t('ed.askAi') });
      modal(i18n.t('ed.ai'), h('div', { class: 'field' }, ta), [
        h('button', { class: 'btn ghost', onclick: closeModal }, i18n.t('common.cancel')),
        h('button', { class: 'btn', onclick: async (e) => {
          e.target.disabled = true; e.target.textContent = '...';
          try {
            const content = Editor.getValue();
            const res = await Api.post('/api/ai/chat', {
              projectId: id, taskType: 'code',
              messages: [{ role: 'user', content: `File "${currentPath}" currently contains:\n\n${content}\n\nRequested change: ${ta.value}\n\nReturn the complete updated file inside an \`\`\`ai-files JSON block {"files": {"${currentPath}": "..."}}` }],
            });
            const m = res.text.match(/```ai-files\s*([\s\S]*?)```/);
            if (m) {
              const parsed = JSON.parse(m[1]);
              const newPath = Object.keys(parsed.files)[0];
              await saveFile(newPath, parsed.files[newPath]);
              Editor.openFile(newPath, parsed.files[newPath]);
              toast(i18n.t('asst.applied') + ' ✓ (' + res.provider + ')', 'ok');
              closeModal();
            } else {
              // show answer as a toast-free modal content
              modal(i18n.t('ed.ai'), h('div', { class: 'msg assistant', style: { maxWidth: '100%' } }, res.text), [h('button', { class: 'btn ghost block', onclick: closeModal }, i18n.t('common.close'))]);
            }
          } catch (err) { toast(err.message, 'err'); e.target.disabled = false; e.target.textContent = i18n.t('asst.send'); }
        } }, i18n.t('asst.send')),
      ]);
    }
  }

  // ======================= ASSISTANT TAB ==================================
  async function renderAssistantTab(el) {
    let history = [];
    try { history = await Api.get('/api/projects/' + id + '/messages'); } catch (e) { /* none */ }

    const log = h('div', { class: 'chat-log' });
    const input = h('textarea', { placeholder: i18n.t('asst.ph'), 'data-testid': 'input-chat' });
    const sendBtn = h('button', { class: 'btn', 'data-testid': 'button-send' }, icon('send', 16));

    function fmt(text) {
      // render code blocks; detect ai-files blocks
      const div = h('div');
      const parts = String(text).split(/```/);
      parts.forEach((part, i) => {
        if (i % 2 === 1) {
          const firstLine = part.split('\n')[0].trim();
          const body = part.slice(firstLine.length).replace(/^\n/, '');
          if (firstLine === 'ai-files') {
            div.appendChild(h('button', { class: 'btn small', onclick: async (e) => {
              e.target.disabled = true;
              try {
                const r = await Api.post('/api/projects/' + id + '/ai-apply', { text: '```ai-files\n' + body + '\n```' });
                toast(i18n.t('asst.applied') + ' ✓', 'ok');
                e.target.textContent = '✓ ' + (r.created.length + r.updated.length) + ' ' + i18n.t('dash.statFiles');
              } catch (err) { toast(err.message, 'err'); e.target.disabled = false; }
            } }, icon('check', 14), i18n.t('asst.applyFiles')));
          } else {
            div.appendChild(h('pre', null, body));
          }
        } else if (part.trim()) {
          div.appendChild(document.createTextNode(part));
        }
      });
      return div;
    }

    function addMsg(role, content, meta) {
      const m = h('div', { class: 'msg ' + (role === 'user' ? 'user' : 'assistant') });
      m.appendChild(fmt(content));
      if (meta) m.appendChild(h('div', { class: 'msg-meta' }, meta));
      log.appendChild(m);
      log.scrollTop = log.scrollHeight;
      return m;
    }

    history.forEach(m => addMsg(m.role, m.content, m.provider ? m.provider + ' · ' + (m.model || '') : null));

    if (!App.state.aiConfigured) {
      el.appendChild(h('div', { class: 'card empty-state' }, icon('spark', 40),
        h('h3', null, i18n.t('asst.title')),
        h('p', null, i18n.t('asst.noProvider')),
        h('a', { class: 'btn', href: '#/providers' }, i18n.t('asst.goProviders'))));
      return;
    }

    async function send() {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      addMsg('user', text);
      const typing = h('div', { class: 'msg assistant' }, h('div', { class: 'typing' }, h('span'), h('span'), h('span')));
      log.appendChild(typing); log.scrollTop = log.scrollHeight;
      try {
        const msgs = history.map(m => ({ role: m.role, content: m.content }));
        msgs.push({ role: 'user', content: text });
        const res = await Api.post('/api/ai/chat', { projectId: id, messages: msgs, taskType: 'code' });
        typing.remove();
        const metaBits = [res.provider + '/' + res.model];
        if (res.fallbackUsed) metaBits.push(i18n.t('asst.switched'));
        addMsg('assistant', res.text, metaBits.join(' · '));
        if (res.fallbackUsed) toast(i18n.t('asst.switched') + ': ' + res.provider, 'ok');
      } catch (err) {
        typing.remove();
        addMsg('assistant', '⚠ ' + (err.data && err.data.error) || err.message);
      }
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
    });

    el.appendChild(h('div', null,
      h('div', { class: 'chat-box' },
        log,
        h('div', { class: 'chat-input-row' }, input, sendBtn),
      ),
    ));
  }

  // ======================= PREVIEW TAB (§24) ==============================
  async function renderPreviewTab(el) {
    const previewPath = fileList.find(f => f.path === 'preview.html') || fileList.find(f => f.path === 'index.html');
    if (!previewPath) {
      el.appendChild(h('div', { class: 'empty-state' }, icon('play', 44), h('h3', null, i18n.t('pv.noPreview'))));
      return;
    }
    let device = 'phone';
    const frame = h('iframe', { title: 'preview', sandbox: 'allow-scripts allow-pointer-lock allow-same-origin' });
    const errBox = h('div', { class: 'hint', style: { minHeight: '16px', whiteSpace: 'pre-wrap', fontFamily: 'inherit' } });
    let errors = [];
    function applyDevice() {
      const w = device === 'tablet' ? 768 : 375;
      frame.style.width = '100%';
      frame.style.maxWidth = w + 'px';
      frame.style.margin = '0 auto';
      frame.style.display = 'block';
    }
    window.addEventListener('message', function onMsg(ev) {
      if (ev.data && ev.data.__previewError) {
        errors.push(String(ev.data.message).slice(0, 300));
        errBox.textContent = i18n.t('pv.errors') + ':\n' + errors.slice(-4).join('\n');
        errBox.style.color = 'var(--danger)';
      }
    });
    async function load() {
      errors = [];
      errBox.textContent = i18n.t('pv.noErrors');
      errBox.style.color = '';
      const content = await loadFile(previewPath.path);
      // inject an error reporter into the preview document (same-origin srcdoc)
      const hook = '<script>window.onerror=function(m,s,l){try{parent.postMessage({__previewError:1,message:m+" (خط "+l+")"},"*")}catch(e){}};<\/script>';
      frame.srcdoc = content.replace(/<head([^>]*)>/i, (m0, m1) => '<head' + m1 + '>' + hook);
      applyDevice();
    }
    const deviceSel = h('select', { class: 'input small', style: { width: 'auto' }, onchange: () => { device = deviceSel.value; applyDevice(); } },
      h('option', { value: 'phone' }, i18n.t('pv.phone') + ' (375px)'),
      h('option', { value: 'tablet' }, i18n.t('pv.tablet') + ' (768px)'));
    el.appendChild(h('div', { class: 'preview-frame-wrap' },
      p.type === 'android' || p.type === 'game2d' || p.type === 'game3d'
        ? h('div', { class: 'preview-label' }, icon('alert', 16), i18n.t('pv.web')) : null,
      h('div', { class: 'row between', style: { flexWrap: 'wrap', gap: '8px' } },
        h('span', { class: 'hint', dir: 'ltr' }, previewPath.path),
        h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } },
          h('span', { class: 'hint' }, i18n.t('pv.device') + ':'),
          deviceSel,
          h('button', { class: 'btn small ghost', 'data-testid': 'button-refresh-preview', onclick: load }, icon('refresh', 14), i18n.t('pv.refresh')),
          h('button', { class: 'btn small ghost', onclick: () => {
            const w = window.open('', '_blank');
            if (w) { w.document.write(frame.srcdoc); w.document.close(); }
          } }, icon('ext', 14), i18n.t('pv.openTab')),
        ),
      ),
      frame,
      h('div', { class: 'mt', style: { borderTop: '1px solid var(--border)', paddingTop: '8px' } }, errBox),
    ));
    load();
  }

  // ======================= DESIGN STUDIO TAB ==============================
  async function renderDesignTab(el) {
    // load or create the design model
    let design = null;
    const dj = fileList.find(f => f.path === 'design.json');
    if (dj) {
      try { design = JSON.parse(await loadFile('design.json')); } catch (e) { /* invalid */ }
    }
    if (!design || !Array.isArray(design.screens)) {
      design = { screens: [{ title: i18n.t('ds.screen') + ' 1', components: [] }] };
    }
    let curScreen = 0, selIndex = -1;

    const palette = h('div', { class: 'palette card' });
    const canvasFrame = h('div', { class: 'canvas-frame' });
    const propsPane = h('div', { class: 'card' });
    const screenSel = h('select', { class: 'input' });

    const COMPS = ['heading', 'text', 'button', 'input', 'image', 'spacer', 'listItem'];
    COMPS.forEach(c => {
      palette.appendChild(h('button', { class: 'btn small ghost', 'data-testid': 'add-' + c, onclick: () => {
        design.screens[curScreen].components.push({ type: c, text: i18n.t('ds.c.' + c) });
        selIndex = design.screens[curScreen].components.length - 1;
        render();
      } }, '+ ' + i18n.t('ds.c.' + c)));
    });
    palette.appendChild(h('div', { class: 'mt row' },
      h('button', { class: 'btn small ghost', onclick: () => { design.screens.push({ title: i18n.t('ds.newScreen'), components: [] }); curScreen = design.screens.length - 1; selIndex = -1; render(); } }, '+ ' + i18n.t('ds.newScreen')),
      h('button', { class: 'btn small', 'data-testid': 'button-gencode', onclick: genCode }, icon('code', 14), i18n.t('ds.genCode')),
    ));

    function render() {
      // screen selector
      screenSel.innerHTML = '';
      design.screens.forEach((s, i) => {
        const o = h('option', { value: String(i), selected: i === curScreen ? true : null }, s.title);
        screenSel.appendChild(o);
      });
      screenSel.onchange = () => { curScreen = +screenSel.value; selIndex = -1; render(); };

      // canvas
      canvasFrame.innerHTML = '';
      const phone = h('div', { class: 'phone-canvas' });
      const comps = design.screens[curScreen].components;
      if (!comps.length) {
        phone.appendChild(h('p', { class: 'hint center' }, i18n.t('ds.add')));
      }
      comps.forEach((c, i) => {
        const div = h('div', {
          class: 'comp ' + c.type + '-comp' + (i === selIndex ? ' selected' : ''),
          'data-testid': 'comp-' + i,
          style: c.color ? { color: c.color } : null,
          onclick: () => { selIndex = (selIndex === i ? -1 : i); render(); },
        });
        if (c.align === 'center') { div.style.textAlign = 'center'; div.style.width = '100%'; }
        else if (c.align === 'start') { div.style.textAlign = i18n.lang === 'fa' ? 'right' : 'left'; div.style.width = '100%'; }
        div.appendChild(document.createTextNode(c.type === 'spacer' ? '' : (c.text || '')));
        const tools = h('div', { class: 'comp-tools' },
          h('button', { title: i18n.t('ds.up'), onclick: (e) => { e.stopPropagation(); if (i > 0) { comps.splice(i - 1, 0, comps.splice(i, 1)[0]); selIndex = i - 1; render(); } } }, '↑'),
          h('button', { title: i18n.t('ds.down'), onclick: (e) => { e.stopPropagation(); if (i < comps.length - 1) { comps.splice(i + 1, 0, comps.splice(i, 1)[0]); selIndex = i + 1; render(); } } }, '↓'),
          h('button', { title: i18n.t('ds.del'), onclick: (e) => { e.stopPropagation(); comps.splice(i, 1); selIndex = -1; render(); } }, '✕'),
        );
        div.appendChild(tools);
        phone.appendChild(div);
      });
      canvasFrame.appendChild(phone);

      // properties
      propsPane.innerHTML = '';
      propsPane.appendChild(h('h3', { style: { fontSize: '15px', marginBottom: '10px' } }, i18n.t('ds.props')));
      if (selIndex >= 0 && comps[selIndex]) {
        const c = comps[selIndex];
        const textInp = h('input', { class: 'input', value: c.text || '', oninput: () => { c.text = textInp.value; renderCanvasOnly(); } });
        const colorInp = h('input', { class: 'input', type: 'color', value: c.color || '#14b8a6', oninput: () => { c.color = colorInp.value; renderCanvasOnly(); } });
        const alignSel = h('select', { class: 'input', onchange: () => { c.align = alignSel.value; render(); } },
          h('option', { value: '', selected: !c.align ? true : null }, '—'),
          h('option', { value: 'center', selected: c.align === 'center' ? true : null }, i18n.t('ds.align')),
          h('option', { value: 'start', selected: c.align === 'start' ? true : null }, '↦'),
        );
        propsPane.appendChild(h('div', { class: 'prop-row' }, h('label', null, i18n.t('ds.text')), textInp));
        propsPane.appendChild(h('div', { class: 'prop-row' }, h('label', null, i18n.t('ds.color')), colorInp));
        if (c.type !== 'spacer') propsPane.appendChild(h('div', { class: 'prop-row' }, h('label', null, i18n.t('ds.align')), alignSel));
      } else {
        propsPane.appendChild(h('p', { class: 'hint' }, i18n.t('ds.add')));
      }
    }
    function renderCanvasOnly() { render(); }

    el.appendChild(h('div', null,
      h('div', { class: 'row between mb' }, screenSel, h('span', { class: 'hint' }, i18n.t('ds.previewTab'))),
      h('div', { class: 'designer' }, palette, canvasFrame, propsPane),
    ));
    render();

    async function genCode() {
      // checkpoint + write design.json, generated preview.html and (for android) Kotlin screens
      try {
        await Api.post('/api/projects/' + id + '/checkpoint', { label: 'قبل از تولید کد طراحی' });
        await saveFile('design.json', JSON.stringify(design, null, 2));
        await saveFile('preview.html', designToPreviewHtml(design, p.name));
        if (p.type === 'android') {
          await saveFile('app-design/screens.md',
            '# Screens (design sync)\n\n' + design.screens.map(s =>
              '## ' + s.title + '\n' + s.components.map(c => '- [' + c.type + '] ' + (c.text || '')).join('\n')
            ).join('\n\n'));
        }
        if (p.type === 'ui') {
          await saveFile('index.html', designToPreviewHtml(design, p.name));
        }
        toast(i18n.t('ds.genDone'), 'ok');
      } catch (e) { toast(e.message, 'err'); }
    }
  }

  // ======================= BUILD TAB (§18/§19/§22) =========================
  async function renderBuildTab(el) {
    const zipUrl = '/api/projects/' + id + '/export';
    const isGame = p.type === 'game2d' || p.type === 'game3d';

    let provider = null;
    let targets = {};
    try {
      const st = await Api.get('/api/builds/status');
      provider = st.provider;
      targets = st.targets || {};
    } catch (e) { toast(e.message, 'err'); }

    const configured = provider && provider.status === 'CONNECTED';

    // ---- provider config card ----
    const provStatusEl = h('span', { class: 'badge ' + (configured ? 'ok' : 'mut') + ' dot', 'data-testid': 'badge-build-provider' },
      provider ? (provider.status === 'CONNECTED' ? i18n.t('hp.status.CONNECTED') : i18n.t('hp.status.NOT CONFIGURED')) : '…');
    const patInput = h('input', { class: 'input', type: 'password', dir: 'ltr', placeholder: 'ghp_…', 'data-testid': 'input-pat' });
    const repoInput = h('input', { class: 'input', type: 'text', dir: 'ltr', placeholder: 'owner/name', 'data-testid': 'input-repo', value: provider ? (provider.repo || '') : '' });
    const provNote = h('p', { class: 'hint' });

    async function refreshProvider() {
      try {
        const st = await Api.post('/api/builds/test');
        provider = st;
        provStatusEl.textContent = st.status === 'CONNECTED' ? i18n.t('hp.status.CONNECTED') : i18n.t('hp.status.NOT CONFIGURED');
        provStatusEl.className = 'badge ' + (st.status === 'CONNECTED' ? 'ok' : 'mut') + ' dot';
        provNote.textContent = st.status === 'CONNECTED' ? (st.note || '') : (st.error ? st.error : i18n.t('bd.notConfiguredSub'));
      } catch (e) { provNote.textContent = e.message; }
    }

    const provCard = h('div', { class: 'card mb' },
      h('div', { class: 'row', style: { justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' } },
        h('h3', { style: { margin: 0 } }, i18n.t('bd.provider')),
        provStatusEl),
      h('p', { class: 'muted small mt' }, i18n.t('bd.notConfiguredSub')),
      h('p', { class: 'hint' }, i18n.t('bd.freeNote')),
      h('div', { class: 'field mt' }, h('div', { class: 'small mb' }, i18n.t('bd.pat')), patInput),
      h('div', { class: 'field' }, h('div', { class: 'small mb' }, i18n.t('bd.repo')), repoInput),
      h('div', { class: 'row mt', style: { gap: '8px' } },
        h('button', { class: 'btn', 'data-testid': 'button-save-provider', onclick: async () => {
          try {
            const st = await Api.post('/api/builds/config', { pat: patInput.value.trim(), repo: repoInput.value.trim() });
            toast(st.status === 'CONNECTED' ? i18n.t('common.done') : (st.error || st.status), st.status === 'CONNECTED' ? 'ok' : 'err');
            await refreshProvider();
          } catch (e) { toast(e.message, 'err'); }
        } }, i18n.t('bd.save')),
        provider && provider.status === 'CONNECTED' ? h('button', { class: 'btn ghost', onclick: async () => {
          try { await Api.post('/api/builds/config', { pat: null }); await refreshProvider(); toast(i18n.t('common.done'), 'ok'); }
          catch (e) { toast(e.message, 'err'); }
        } }, i18n.t('bd.clear')) : null),
      provNote,
    );

    // ---- submit card ----
    const availTargets = Object.entries(targets).filter(([k, t]) => t.types && t.types.includes(p.type));
    const targetSel = h('select', { class: 'input', 'data-testid': 'select-target' },
      availTargets.map(([k]) => h('option', { value: k }, i18n.t('bd.target.' + k))));
    const submitHint = h('p', { class: 'hint', style: { color: 'var(--warn)' } });
    const startBtn = h('button', { class: 'btn block', 'data-testid': 'button-start-build', onclick: async () => {
      startBtn.disabled = true; startBtn.textContent = i18n.t('bd.status.preparing') + '…';
      try {
        const r = await Api.post('/api/projects/' + id + '/builds', { target: targetSel.value });
        toast(i18n.t('bd.status.queued') + ' — #' + r.buildId, 'ok');
        await drawHistory();
      } catch (e) { toast(e.message, 'err'); }
      startBtn.disabled = false; startBtn.textContent = i18n.t('bd.start');
    } }, i18n.t('bd.start'));
    function drawSubmit() {
      startBtn.disabled = !configured;
      submitHint.textContent = configured ? '' : i18n.t('bd.notConfigured');
    }
    drawSubmit();

    // ---- history card ----
    const historyCard = h('div', { class: 'card' });
    async function drawHistory() {
      historyCard.innerHTML = '';
      historyCard.appendChild(h('h3', { style: { marginBottom: '8px' } }, i18n.t('bd.history')));
      let rows = [];
      try { rows = await Api.get('/api/projects/' + id + '/builds'); } catch (e) { /* */ }
      if (!rows.length) {
        historyCard.appendChild(h('p', { class: 'hint' }, i18n.t('common.empty')));
        return;
      }
      const list = h('div');
      const statusCls = s => s === 'successful' ? 'ok' : s === 'failed' ? 'err' : s === 'cancelled' ? 'mut' : 'warn';
      for (const b of rows) {
        list.appendChild(h('div', { class: 'row between', style: { padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '6px' } },
          h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
            h('span', { class: 'badge ' + statusCls(b.status) + ' dot' }, i18n.t('bd.status.' + b.status)),
            h('span', { class: 'small' }, faTime(b.created_at)),
            h('span', { class: 'small', dir: 'ltr' }, b.target),
            b.status === 'successful' ? h('a', { class: 'btn small', href: '/api/builds/' + b.id + '/artifact', 'data-testid': 'link-artifact-' + b.id }, icon('download', 13), i18n.t('bd.download')) : null,
            ['queued', 'preparing', 'building'].includes(b.status) ? h('button', { class: 'btn small ghost', onclick: async () => {
              try { await Api.post('/api/builds/' + b.id + '/cancel'); toast(i18n.t('bd.status.cancelled'), 'ok'); drawHistory(); }
              catch (e) { toast(e.message, 'err'); }
            } }, i18n.t('bd.cancelBuild')) : null,
            h('button', { class: 'btn small ghost', onclick: () => modal(h('div', null,
              h('h3', null, i18n.t('bd.logs') + ' — #' + b.id),
              h('pre', { dir: 'ltr', style: { whiteSpace: 'pre-wrap', maxHeight: '50vh', overflow: 'auto', fontSize: '11px' } }, b.logs || '—'),
              h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn small', onclick: closeModal }, i18n.t('common.close'))),
            )) }, i18n.t('bd.logs')),
          ),
        ));
      }
      historyCard.appendChild(list);
      const anyActive = rows.some(b => ['queued', 'preparing', 'building'].includes(b.status));
      if (anyActive) setTimeout(drawHistory, 8000);
    }

    el.appendChild(h('div', null,
      h('div', { class: 'card mb' },
        h('h3', { style: { marginBottom: '8px' } }, i18n.t('bc.zip')),
        h('p', { class: 'muted small mb' }, i18n.t('bc.zipHint')),
        h('a', { class: 'btn block', href: zipUrl, 'data-testid': 'link-zip' }, icon('download', 16), i18n.t('bc.zip')),
      ),
      provCard,
      h('div', { class: 'card mb' },
        h('h3', { style: { marginBottom: '8px' } }, i18n.t('bd.target')),
        availTargets.length ? h('div', { class: 'field' }, targetSel) : h('p', { class: 'hint' }, i18n.t('bd.notConfiguredSub')),
        h('div', { style: { height: '10px' } }),
        startBtn,
        submitHint,
        h('div', { class: 'mt' }, h('span', { class: 'hint' }, i18n.t('bd.webVsNative'))),
        isGame ? h('p', { class: 'hint mt' }, i18n.t('bc.gameExportHint')) : null,
      ),
      historyCard,
    ));
    await drawHistory();
  }

  // ======================= ASSETS TAB (§23) ================================
  async function renderAssetsTab(el) {
    const list = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' } });
    const searchInput = h('input', { class: 'input', placeholder: i18n.t('as.search'), 'data-testid': 'input-asset-search', oninput: () => draw() });

    async function draw() {
      const rows = await Api.get('/api/projects/' + id + '/assets?search=' + encodeURIComponent(searchInput.value)).catch(() => []);
      list.innerHTML = '';
      if (!rows.length) {
        list.appendChild(h('div', { class: 'empty-state', style: { gridColumn: '1/-1' } }, icon('image', 40), h('h3', null, i18n.t('as.noAssets'))));
        return;
      }
      for (const a of rows) {
        const isImg = /^image\//.test(a.mime || '');
        const preview = isImg
          ? h('img', { src: '/api/assets/' + a.id + '/content', alt: a.name, style: { width: '100%', height: '86px', objectFit: 'cover', borderRadius: '8px' } })
          : h('div', { style: { height: '86px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' } }, icon('box', 30));
        list.appendChild(h('div', { class: 'card', 'data-testid': 'asset-' + a.id, style: { padding: '10px' } },
          preview,
          h('div', { class: 'small', style: { margin: '8px 0 2px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, a.name),
          h('div', { class: 'hint' }, 'v' + faNum(a.version) + ' · ' + faNum(Math.max(1, Math.round(a.size / 1024))) + ' KB'),
          h('div', { class: 'row', style: { gap: '4px', marginTop: '6px' } },
            h('button', { class: 'btn small ghost', title: i18n.t('as.versions'), onclick: () => {
              Api.get('/api/assets/' + a.id + '/versions').then(vs => modal(i18n.t('as.versions') + ' — ' + a.name,
                h('div', null, vs.map(v => h('div', { class: 'row between', style: { padding: '6px 0' } },
                  h('span', { class: 'small' }, 'v' + faNum(v.version)),
                  h('span', { class: 'hint' }, faTime(v.created_at))))),
                h('button', { class: 'btn small', onclick: closeModal }, i18n.t('common.close')))).catch(e => toast(e.message, 'err'));
            } }, icon('clock', 13)),
            h('button', { class: 'btn small ghost', title: i18n.t('common.delete'), onclick: async () => {
              if (!confirm(i18n.t('as.confirmDelete'))) return;
              try { await Api.del('/api/assets/' + a.id); draw(); toast(i18n.t('common.done'), 'ok'); }
              catch (e) { toast(e.message, 'err'); }
            } }, icon('trash', 13)),
            h('button', { class: 'btn small ghost', title: i18n.t('as.replace'), onclick: () => {
              const inp = h('input', { type: 'file', style: { display: 'none' }, onchange: async () => {
                const f = inp.files[0]; if (!f) return;
                const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
                try { await Api.post('/api/assets/' + a.id + '/replace', { name: f.name, mime: f.type, dataBase64: b64 }); toast(i18n.t('common.done'), 'ok'); draw(); }
                catch (e) { toast(e.message, 'err'); }
              } });
              inp.click();
            } }, icon('upload', 13)),
          ),
        ));
      }
    }

    function pickUpload() {
      const inp = h('input', { type: 'file', style: { display: 'none' }, onchange: async () => {
        const f = inp.files[0]; if (!f) return;
        if (f.size > 10 * 1024 * 1024) { toast('بیش از ۱۰ مگابایت', 'err'); return; }
        const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
        try {
          await Api.post('/api/projects/' + id + '/assets', { name: f.name, mime: f.type, dataBase64: b64 });
          toast(i18n.t('common.done'), 'ok'); draw();
        } catch (e) { toast(e.message, 'err'); }
      } });
      inp.click();
    }

    async function generate() {
      const prompt = h('input', { class: 'input', placeholder: i18n.t('as.prompt') });
      const btn = h('button', { class: 'btn block', onclick: async () => {
        btn.disabled = true; btn.textContent = i18n.t('as.generating');
        try {
          await Api.post('/api/projects/' + id + '/assets/generate', { prompt: prompt.value });
          toast(i18n.t('common.done'), 'ok'); closeModal(); draw();
        } catch (e) { toast(e.message, 'err'); }
        btn.disabled = false; btn.textContent = i18n.t('as.generate');
      } }, i18n.t('as.generate'));
      modal(i18n.t('as.generate'),
        h('div', null,
          h('p', { class: 'hint' }, i18n.t('as.generateHint')),
          h('div', { class: 'field mt' }, prompt),
          h('div', { style: { height: '10px' } }), btn),
        null);
    }

    el.appendChild(h('div', null,
      h('div', { class: 'row between mb', style: { flexWrap: 'wrap', gap: '8px' } },
        h('h3', { style: { margin: 0 } }, i18n.t('as.title')),
        h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } },
          h('button', { class: 'btn small', 'data-testid': 'button-asset-upload', onclick: pickUpload }, icon('upload', 14), i18n.t('as.upload')),
          h('button', { class: 'btn small ghost', 'data-testid': 'button-asset-generate', onclick: generate }, icon('spark', 14), i18n.t('as.generate')),
        )),
      searchInput,
      h('div', { style: { height: '12px' } }),
      list,
    ));
    draw();
  }

  // ======================= HISTORY TAB ====================================
  async function renderHistoryTab(el) {
    let acts = [];
    try {
      const all = await Api.get('/api/activity');
      acts = all.filter(a => a.project_id === p.id);
    } catch (e) { /* ignore */ }

    el.appendChild(h('div', null,
      h('div', { class: 'card mb' },
        h('h3', { style: { marginBottom: '10px' } }, i18n.t('proj.history')),
        checkpoints.length
          ? h('ul', { class: 'timeline' }, checkpoints.map(c =>
              h('li', null,
                h('span', null, c.label),
                h('span', { class: 'tl-time' }, faTime(c.created_at)),
                h('button', { class: 'btn small', onclick: async () => {
                  if (!confirm(i18n.t('ed.restore') + ' — ' + c.label + '?')) return;
                  try {
                    await Api.post('/api/projects/' + id + '/checkpoint/restore', { id: c.id });
                    toast(i18n.t('ed.restore') + ' ✓', 'ok'); renderView();
                  } catch (e) { toast(e.message, 'err'); }
                } }, i18n.t('ed.restore')))))
          : h('p', { class: 'muted' }, i18n.t('common.empty')),
        h('button', { class: 'btn ghost small mt', onclick: async () => {
          await Api.post('/api/projects/' + id + '/checkpoint', { label: i18n.t('ds.props') });
          toast(i18n.t('common.done'), 'ok'); renderView();
        } }, '+ ' + i18n.t('proj.history')),
      ),
      h('div', { class: 'card' },
        h('h3', { style: { marginBottom: '10px' } }, i18n.t('dash.activity')),
        acts.length
          ? h('ul', { class: 'timeline' }, acts.map(a => h('li', null, h('span', null, a.detail || a.action), h('span', { class: 'tl-time' }, faTime(a.created_at)))))
          : h('p', { class: 'muted' }, i18n.t('common.empty')),
      ),
    ));
  }
};

// ---------------------------------------------------------------------------
// design → HTML preview generator (synced with project files)
// ---------------------------------------------------------------------------

function designToPreviewHtml(design, name) {
  const screens = design.screens.map((s, i) => `
  <section class="screen${i === 0 ? ' active' : ''}" data-i="${i}">
    <div class="appbar">${esc(s.title)}</div>
    <div class="content">${s.components.map(c => {
      if (c.type === 'spacer') return '<div class="spacer"></div>';
      const style = (c.color ? 'color:' + esc(c.color) + ';' : '') + (c.align === 'center' ? 'text-align:center;' : '');
      if (c.type === 'heading') return `<h2 style="${style}">${esc(c.text || '')}</h2>`;
      if (c.type === 'text') return `<p style="${style}">${esc(c.text || '')}</p>`;
      if (c.type === 'button') return `<button style="${style}">${esc(c.text || '')}</button>`;
      if (c.type === 'input') return `<input placeholder="${esc(c.text || '')}" style="${style}">`;
      if (c.type === 'image') return `<div class="imgph" style="${style}">🖼 ${esc(c.text || '')}</div>`;
      if (c.type === 'listItem') return `<div class="li" style="${style}"><span class="box"></span>${esc(c.text || '')}</div>`;
      return '';
    }).join('\n')}</div>
  </section>`).join('');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Vazirmatn, Tahoma, sans-serif; background: #10161c; color: #dde6ee; display: flex; flex-direction: column; align-items: center; min-height: 100vh; padding: 20px 10px; }
.nav { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; justify-content: center; }
.nav button { background: #18212a; color: #8fa1b3; border: 1px solid #243140; border-radius: 9px; padding: 7px 14px; font-family: inherit; font-size: 13px; cursor: pointer; }
.nav button.active { background: #14b8a6; color: #06201c; font-weight: 700; }
.phone { width: 100%; max-width: 360px; background: #0d1117; border: 6px solid #2c3540; border-radius: 26px; min-height: 540px; overflow: hidden; }
.appbar { background: #0e7c6b; color: #fff; padding: 13px 16px; font-weight: 700; font-size: 15px; }
.content { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
h2 { font-size: 20px; }
p { color: #8fa1b3; font-size: 14px; }
button.cta, .content > button { background: #14b8a6; color: #06201c; border: none; border-radius: 10px; padding: 11px; font-family: inherit; font-weight: 700; font-size: 14px; cursor: pointer; }
input { background: #161d24; border: 1px solid #2c3540; border-radius: 10px; padding: 11px 13px; color: #dde6ee; font-family: inherit; font-size: 14px; }
.imgph { background: #161d24; border: 1px dashed #2c3540; border-radius: 10px; padding: 22px; text-align: center; color: #5c6d7e; font-size: 13px; }
.li { display: flex; align-items: center; gap: 9px; background: #161d24; border: 1px solid #2c3540; border-radius: 10px; padding: 11px 13px; font-size: 13.5px; }
.li .box { width: 16px; height: 16px; border: 2px solid #4a5a6a; border-radius: 5px; }
.spacer { height: 22px; }
.screen { display: none; }
.screen.active { display: block; }
</style>
</head>
<body>
<div class="nav" id="nav"></div>
<div class="phone">${screens}
</div>
<script>
var screens = document.querySelectorAll('.screen');
var nav = document.getElementById('nav');
screens.forEach(function (s, i) {
  var b = document.createElement('button');
  b.textContent = s.querySelector('.appbar').textContent;
  if (i === 0) b.className = 'active';
  b.onclick = function () {
    screens.forEach(function (x) { x.classList.remove('active'); });
    nav.querySelectorAll('button').forEach(function (x) { x.classList.remove('active'); });
    s.classList.add('active'); b.classList.add('active');
  };
  nav.appendChild(b);
});
<\/script>
</body>
</html>`;
}
