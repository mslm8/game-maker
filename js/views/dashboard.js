'use strict';
// Dashboard + projects list + background jobs views.

var Views = window.Views || (window.Views = {});

const TYPE_META = {
  android: { chip: 'type.android', icon: 'phone' },
  game2d: { chip: 'type.game2d', icon: 'gamepad' },
  game3d: { chip: 'type.game3d', icon: 'box3d' },
  ui: { chip: 'type.ui', icon: 'layers' },
};

function projectCard(p) {
  const meta = TYPE_META[p.type] || TYPE_META.ui;
  const statusBadge = p.status === 'ready'
    ? h('span', { class: 'badge ok dot' }, i18n.t('status.ready'))
    : p.status === 'generating'
      ? h('span', { class: 'badge warn dot' }, i18n.t('status.generating'))
      : h('span', { class: 'badge err dot' }, i18n.t('status.failed'));
  return h('div', { class: 'card proj-card', 'data-testid': 'card-project-' + p.id },
    h('div', { class: 'row between' },
      h('span', { class: 'name' }, p.name),
      h('span', { class: 'type-chip' }, i18n.t(meta.chip))
    ),
    h('div', { class: 'desc' }, p.description || '—'),
    h('div', { class: 'meta-row' },
      statusBadge,
      h('span', null, faTime(p.updated_at)),
      p.fileCount !== undefined ? h('span', null, faNum(p.fileCount) + ' ' + i18n.t('dash.statFiles')) : null
    ),
    h('div', { class: 'actions' },
      h('a', { class: 'btn small', href: '#/project/' + p.id }, icon('code', 15), i18n.t('common.open')),
      h('a', { class: 'btn small ghost', href: '/api/projects/' + p.id + '/export' }, icon('download', 15), 'ZIP')
    )
  );
}

Views.dashboard = async function (main) {
  const [projects, activity] = await Promise.all([
    Api.get('/api/projects').catch(() => []),
    Api.get('/api/activity').catch(() => []),
  ]);
  const filesCount = projects.reduce((s, p) => s + (p.fileCount || 0), 0);
  const health = await Api.get('/api/health').catch(() => ({ aiConfigured: false }));
  App.state.aiConfigured = health.aiConfigured;

  main.appendChild(h('div', null,
    h('h1', { class: 'page-title' }, i18n.t('dash.welcome')),
    h('p', { class: 'page-sub' }, i18n.t('dash.sub')),

    h('div', { class: 'stat-grid' },
      h('div', { class: 'stat' }, h('div', { class: 'num' }, faNum(projects.length)), h('div', { class: 'lbl' }, i18n.t('dash.statProjects'))),
      h('div', { class: 'stat' }, h('div', { class: 'num' }, faNum(filesCount)), h('div', { class: 'lbl' }, i18n.t('dash.statFiles'))),
      h('div', { class: 'stat' }, h('div', { class: 'num' }, health.aiConfigured ? 'AI ✓' : '—'), h('div', { class: 'lbl' }, i18n.t('nav.ai'))),
    ),

    h('h2', { class: 'section-title' }, i18n.t('dash.quick')),
    h('div', { class: 'grid cols-2' },
      quickCard('dash.android', 'phone', '#/new?t=android'),
      quickCard('dash.game2d', 'gamepad', '#/new?t=game2d'),
      quickCard('dash.game3d', 'box3d', '#/new?t=game3d'),
      quickCard('dash.ui', 'layers', '#/new?t=ui'),
    ),

    h('h2', { class: 'section-title' }, i18n.t('dash.recent')),
    projects.length
      ? h('div', { class: 'grid cols-2' }, projects.slice(0, 4).map(projectCard))
      : h('div', { class: 'card empty-state' },
          icon('folder', 44),
          h('h3', null, i18n.t('dash.empty')),
          h('p', null, i18n.t('dash.emptySub')),
          h('a', { class: 'btn', href: '#/new' }, icon('plus', 16), i18n.t('nav.new'))
        ),

    activity.length ? h('div', null,
      h('h2', { class: 'section-title' }, i18n.t('dash.activity')),
      h('ul', { class: 'timeline card' }, activity.slice(0, 8).map(a =>
        h('li', null,
          h('span', { class: 'muted' }, a.action === 'create' ? '＋' : a.action === 'delete' ? '🗑' : '✦'),
          h('span', null, (a.project_name ? a.project_name + ' — ' : '') + (a.detail || a.action)),
          h('span', { class: 'tl-time' }, faTime(a.created_at))
        ))
      ),
    ) : null
  ));
};

function quickCard(label, iconName, href) {
  return h('a', { class: 'card row', href, style: { gap: '12px', fontWeight: '700' } },
    icon(iconName, 24), h('span', null, i18n.t(label)));
}

// ---------------------------------------------------------------------------
// Projects list (search / filter / sort)
// ---------------------------------------------------------------------------

Views.projects = async function (main, presearch) {
  let search = '', typeFilter = '', sort = 'updated', showArchived = false;

  const listEl = h('div', { class: 'grid cols-2' });
  const resultInfo = h('p', { class: 'hint' });

  async function refresh() {
    listEl.innerHTML = '';
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (typeFilter) params.set('type', typeFilter);
    params.set('sort', sort);
    if (showArchived) params.set('archived', 'only');
    let projects = [];
    try { projects = await Api.get('/api/projects?' + params.toString()); } catch (e) {
      listEl.appendChild(h('div', { class: 'empty-state' }, icon('alert'), h('p', null, e.message)));
      return;
    }
    resultInfo.textContent = faNum(projects.length) + ' ' + i18n.t('dash.statProjects');
    if (!projects.length) {
      listEl.appendChild(h('div', { class: 'empty-state', style: { gridColumn: '1/-1' } },
        icon('folder', 44), h('h3', null, showArchived ? i18n.t('pm.archived') : i18n.t('dash.empty')), h('p', null, i18n.t('dash.emptySub')),
        h('a', { class: 'btn', href: '#/new' }, icon('plus', 16), i18n.t('nav.new'))));
      return;
    }
    projects.forEach(p => listEl.appendChild(projectCard(p)));
  }

  function importZip() {
    const inp = h('input', { type: 'file', accept: '.zip', style: { display: 'none' }, onchange: async () => {
      const f = inp.files[0]; if (!f) return;
      toast(i18n.t('pm.importing'));
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
      try {
        const r = await Api.post('/api/import/project', { zipBase64: b64, name: f.name.replace(/\.zip$/i, '') });
        toast(i18n.t('common.done') + ' — #' + r.project.id, 'ok');
        location.hash = '#/project/' + r.project.id;
      } catch (e) { toast(e.message, 'err'); }
    } });
    inp.click();
  }

  const searchInput = h('input', {
    class: 'input', type: 'search', placeholder: i18n.t('search.ph'), 'data-testid': 'input-search',
    oninput: () => { search = searchInput.value; clearTimeout(searchInput._t); searchInput._t = setTimeout(refresh, 350); },
  });

  const typeSel = h('select', { class: 'input', onchange: () => { typeFilter = typeSel.value; refresh(); }, 'data-testid': 'select-filter' },
    h('option', { value: '' }, i18n.t('filter.all')),
    h('option', { value: 'android' }, i18n.t('type.android')),
    h('option', { value: 'game2d' }, i18n.t('type.game2d')),
    h('option', { value: 'game3d' }, i18n.t('type.game3d')),
    h('option', { value: 'ui' }, i18n.t('type.ui')),
  );
  const sortSel = h('select', { class: 'input', onchange: () => { sort = sortSel.value; refresh(); } },
    h('option', { value: 'updated' }, i18n.t('sort.updated')),
    h('option', { value: 'created' }, i18n.t('sort.created')),
    h('option', { value: 'name' }, i18n.t('sort.name')),
  );
  const archBtn = h('button', { class: 'btn small ghost', 'data-testid': 'button-show-archived', onclick: () => {
    showArchived = !showArchived;
    archBtn.textContent = showArchived ? i18n.t('pm.hideArchived') : i18n.t('pm.showArchived');
    refresh();
  } }, showArchived ? i18n.t('pm.hideArchived') : i18n.t('pm.showArchived'));

  main.appendChild(h('div', null,
    h('h1', { class: 'page-title' }, i18n.t('nav.projects')),
    h('p', { class: 'page-sub' }, i18n.t('dash.allProjects')),
    h('div', { class: 'grid', style: { gridTemplateColumns: '1fr', marginBottom: '12px' } },
      searchInput,
      h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } },
        typeSel, sortSel,
        archBtn,
        h('button', { class: 'btn small', 'data-testid': 'button-import', onclick: importZip }, icon('upload', 14), i18n.t('pm.import')),
        h('span', { style: { flex: '1' } }), resultInfo),
    ),
    listEl,
  ));
  refresh();
};

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

Views.jobs = async function (main) {
  let jobs = [];
  try { jobs = await Api.get('/api/jobs'); } catch (e) { /* ignore */ }
  main.appendChild(h('div', null,
    h('h1', { class: 'page-title' }, i18n.t('jobs.title')),
    h('p', { class: 'page-sub' }, '...'),
    jobs.length
      ? h('div', { class: 'card' }, jobs.map(j => jobRow(j)))
      : h('div', { class: 'empty-state' }, icon('jobs'), h('h3', null, i18n.t('jobs.empty')))
  ));
};

function jobRow(j) {
  const badge = {
    completed: 'ok', failed: 'err', cancelled: 'mut', interrupted: 'warn', running: 'warn', queued: 'mut',
  }[j.status] || 'mut';
  return h('div', { class: 'job-row' },
    h('span', { class: 'badge ' + badge }, i18n.t('jobs.status.' + j.status)),
    h('div', { style: { flex: '1', minWidth: '0' } },
      h('div', { class: 'small', style: { fontWeight: '700' } }, j.type + ' #' + j.id),
      h('div', { class: 'hint' }, j.message || ''),
      h('div', { class: 'progressbar mt', style: { height: '5px' } }, h('div', { class: 'fill', style: { width: (j.progress || 0) + '%' } }))
    ),
    j.status === 'running' || j.status === 'queued'
      ? h('button', { class: 'btn small ghost', onclick: async () => { await Api.post('/api/jobs/' + j.id + '/cancel').catch(e => toast(e.message, 'err')); Views.jobs(document.getElementById('main')); } }, i18n.t('jobs.cancel'))
      : null
  );
}
