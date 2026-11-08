'use strict';
var Views = window.Views || (window.Views = {});
// Settings — language, theme, zero-cost, danger zone.

Views.settings = async function (main) {
  const s = await Api.get('/api/settings').catch(() => ({ language: 'fa', theme: 'dark', zero_cost_limit: '1' }));

  main.appendChild(h('h1', { class: 'page-title' }, i18n.t('st.title')));

  const langSel = h('select', { class: 'input', 'data-testid': 'select-lang', onchange: async (e) => {
    App.state.language = e.target.value;
    i18n.lang = e.target.value;
    await Api.post('/api/settings', { language: e.target.value }).catch(() => {});
    renderView();
  } },
    h('option', { value: 'fa', selected: s.language === 'fa' ? true : null }, 'فارسی'),
    h('option', { value: 'en', selected: s.language === 'en' ? true : null }, 'English'),
  );

  const themeSel = h('select', { class: 'input', onchange: async (e) => {
    App.state.theme = e.target.value;
    applyTheme();
    await Api.post('/api/settings', { theme: e.target.value }).catch(() => {});
  } },
    h('option', { value: 'dark', selected: s.theme === 'dark' ? true : null }, i18n.t('st.dark')),
    h('option', { value: 'light', selected: s.theme === 'light' ? true : null }, i18n.t('st.light')),
  );

  const zcToggle = h('input', { type: 'checkbox', checked: s.zero_cost_limit !== '0', onchange: async (e) => {
    await Api.post('/api/settings', { zero_cost_limit: e.target.checked ? '1' : '0' }).catch(() => {});
    toast(i18n.t('common.done'), 'ok');
  } });

  main.appendChild(h('div', { class: 'card mb' },
    h('div', { class: 'field' }, h('label', null, i18n.t('st.lang')), langSel),
    h('div', { class: 'field' }, h('label', null, i18n.t('st.theme')), themeSel),
    h('div', { class: 'row between' },
      h('label', { style: { fontWeight: 600, fontSize: '13px' } }, i18n.t('st.zeroCost')),
      zcToggle),
  ));

  // --- account (§28) ---
  if (App.state.user) {
    const u = App.state.user;
    main.appendChild(h('div', { class: 'card mb' },
      h('h3', { style: { marginBottom: '10px' } }, i18n.t('ac.title')),
      h('div', { class: 'kv' },
        h('div', { class: 'k' }, i18n.t('ac.email')),
        h('div', { class: 'v', dir: 'ltr' }, u.email)),
      h('div', { class: 'kv' },
        h('div', { class: 'k' }, i18n.t('auth.name')),
        h('div', { class: 'v' }, u.name || '—')),
      h('div', { class: 'row mt', style: { gap: '8px' } },
        h('button', { class: 'btn ghost small', onclick: async () => {
          await Api.post('/api/auth/logout').catch(() => {});
          App.state.user = null;
          renderUserChip();
          location.hash = '#/login';
          renderView();
        } }, i18n.t('auth.logout'))),
      h('p', { class: 'hint mt' }, i18n.t('auth.recoveryNote')),
    ));
  }

  // --- storage (§26) ---
  const storage = await Api.get('/api/storage').catch(() => null);
  if (storage) {
    const kb = Math.round((storage.usage.bytes || 0) / 1024);
    main.appendChild(h('div', { class: 'card mb' },
      h('h3', { style: { marginBottom: '10px' } }, i18n.t('sg.title')),
      h('p', { class: 'small' }, i18n.t('sg.local')),
      h('div', { class: 'kv' },
        h('div', { class: 'k' }, i18n.t('sg.usage')),
        h('div', { class: 'v', dir: 'ltr' }, faNum(kb) + ' KB · ' + faNum(storage.usage.files || 0) + ' فایل')),
      h('p', { class: 'hint mt' }, i18n.t('sg.externalNote')),
    ));
  }

  // --- notifications (§30) ---
  const notifToast = h('input', { type: 'checkbox', checked: true, onchange: () => { toast(i18n.t('common.done'), 'ok'); } });
  const notifBuild = h('input', { type: 'checkbox', checked: true, onchange: () => { toast(i18n.t('common.done'), 'ok'); } });
  main.appendChild(h('div', { class: 'card mb' },
    h('h3', { style: { marginBottom: '10px' } }, i18n.t('st.notifications')),
    h('div', { class: 'row between' }, h('span', { class: 'small' }, i18n.t('st.notifToast')), notifToast),
    h('div', { class: 'row between' }, h('span', { class: 'small' }, i18n.t('st.notifBuild')), notifBuild),
  ));

  main.appendChild(h('div', { class: 'card' },
    h('h3', { style: { color: 'var(--danger)', marginBottom: '10px' } }, i18n.t('st.danger')),
    h('button', { class: 'btn danger', 'data-testid': 'button-wipe', onclick: async () => {
      if (!confirm(i18n.t('st.wipeConfirm'))) return;
      const projects = await Api.get('/api/projects').catch(() => []);
      for (const p of projects) await Api.del('/api/projects/' + p.id).catch(() => {});
      toast(i18n.t('common.done'), 'ok');
      location.hash = '#/';
      renderView();
    } }, icon('trash', 15), i18n.t('st.wipe')),
  ));
};
