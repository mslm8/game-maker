'use strict';
// App shell: hash router, navigation, boot sequence.

const App = {
  state: { language: 'fa', theme: 'dark', aiConfigured: false, zeroCost: true, user: null },
  route: { view: 'dashboard', params: {} },
};

const NAV_ITEMS = [
  { key: 'home', href: '#/', icon: 'home', label: 'nav.home', match: /^#\/?$/ },
  { key: 'projects', href: '#/projects', icon: 'folder', label: 'nav.projects', match: /^#\/projects/ },
  { key: 'new', href: '#/new', icon: 'plus', label: 'nav.newShort', match: /^#\/new/ },
  { key: 'providers', href: '#/providers', icon: 'cpu', label: 'nav.aiShort', match: /^#\/providers/ },
  { key: 'settings', href: '#/settings', icon: 'gear', label: 'nav.settings', match: /^#\/(settings|help)/ },
];

function parseRoute() {
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/project\/(\d+)(?:\/(\w+))?/);
  if (m) return { view: 'project', params: { id: +m[1], tab: m[2] || 'files' } };
  if (/^#\/login/.test(hash)) return { view: 'login', params: {} };
  if (/^#\/new/.test(hash)) return { view: 'wizard', params: {} };
  if (/^#\/projects/.test(hash)) return { view: 'projects', params: {} };
  if (/^#\/providers/.test(hash)) return { view: 'providers', params: {} };
  if (/^#\/settings/.test(hash)) return { view: 'settings', params: {} };
  if (/^#\/help/.test(hash)) return { view: 'help', params: {} };
  if (/^#\/jobs/.test(hash)) return { view: 'jobs', params: {} };
  return { view: 'dashboard', params: {} };
}

function renderNav() {
  const side = document.getElementById('sideNav');
  const bottom = document.getElementById('bottomNav');
  side.innerHTML = ''; bottom.innerHTML = '';
  const cur = App.route.view;

  const items = [
    ...NAV_ITEMS,
    { key: 'help', href: '#/help', icon: 'help', label: 'nav.help', match: /^#\/help/ },
    { key: 'jobs', href: '#/jobs', icon: 'jobs', label: 'nav.jobs', match: /^#\/jobs/ },
  ];

  for (const it of items) {
    const active = (cur === it.key) || (cur === 'project' && it.key === 'projects');
    side.appendChild(h('a', { href: it.href, class: 'side-link' + (active ? ' active' : '') }, icon(it.icon), h('span', null, i18n.t(it.label))));
  }
  for (const it of NAV_ITEMS) {
    const active = (cur === it.key) || (cur === 'project' && it.key === 'projects');
    bottom.appendChild(h('a', { href: it.href, class: active ? 'active' : '', 'data-testid': 'nav-' + it.key }, icon(it.icon), h('span', null, i18n.t(it.label))));
  }
}

function renderUserChip() {
  const el = document.getElementById('userChip');
  if (!el) return;
  el.innerHTML = '';
  const u = App.state.user;
  if (u) {
    el.appendChild(h('button', { class: 'btn small ghost', 'data-testid': 'button-account', onclick: () => { location.hash = '#/settings'; } },
      icon('user', 14), ' ', (u.name || u.email || '').split('@')[0]));
    el.appendChild(h('button', { class: 'btn small ghost', 'data-testid': 'button-logout', title: i18n.t('auth.logout'), onclick: async () => {
      await Api.post('/api/auth/logout').catch(() => {});
      App.state.user = null;
      location.hash = '#/login';
      renderView();
    } }, i18n.t('auth.logout')));
  }
}

async function renderView() {
  App.route = parseRoute();
  renderNav();
  if (typeof closeModal === 'function') closeModal();
  const main = document.getElementById('main');
  main.innerHTML = '';
  main.scrollTop = 0;
  const v = App.route.view;
  if (v !== 'login' && !App.state.user) { location.hash = '#/login'; return; }
  try {
    if (v === 'login') Views.login(main);
    else if (v === 'dashboard') await Views.dashboard(main);
    else if (v === 'projects') await Views.projects(main);
    else if (v === 'wizard') Views.wizard(main);
    else if (v === 'project') await Views.project(main, App.route.params.id, App.route.params.tab);
    else if (v === 'providers') await Views.providers(main);
    else if (v === 'settings') await Views.settings(main);
    else if (v === 'help') Views.help(main);
    else if (v === 'jobs') await Views.jobs(main);
  } catch (err) {
    main.appendChild(h('div', { class: 'empty-state' },
      icon('alert', 40),
      h('h3', null, i18n.t('common.error')),
      h('p', null, err.message || String(err)),
      h('button', { class: 'btn', onclick: () => renderView() }, i18n.t('common.retry'))
    ));
  }
  document.getElementById('brandName').textContent = i18n.t('brand');
  document.title = i18n.t('brand');
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', App.state.theme === 'light' ? 'light' : 'dark');
}

async function boot() {
  // session check first — everything else depends on it
  try {
    const me = await Api.get('/api/auth/me');
    App.state.user = me.user;
  } catch (e) { App.state.user = null; }
  // load persisted settings from the backend
  try {
    const s = await Api.get('/api/settings');
    App.state.language = s.language || 'fa';
    App.state.theme = s.theme || 'dark';
    App.state.zeroCost = s.zero_cost_limit !== '0';
  } catch (e) { /* defaults */ }
  i18n.lang = App.state.language;
  renderUserChip();
  applyTheme();

  document.getElementById('langBtn').addEventListener('click', async () => {
    App.state.language = App.state.language === 'fa' ? 'en' : 'fa';
    i18n.lang = App.state.language;
    try { await Api.post('/api/settings', { language: App.state.language }); } catch (e) { /* offline */ }
    renderView();
  });
  document.getElementById('themeBtn').addEventListener('click', async () => {
    App.state.theme = App.state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    try { await Api.post('/api/settings', { theme: App.state.theme }); } catch (e) { /* offline */ }
  });
  document.getElementById('menuBtn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    const sb = document.getElementById('sidebar');
    if (sb.classList.contains('open') && !sb.contains(e.target) && e.target.id !== 'menuBtn') sb.classList.remove('open');
  });

  window.addEventListener('hashchange', renderView);
  renderView();
}

document.addEventListener('DOMContentLoaded', boot);
