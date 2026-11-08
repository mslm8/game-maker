'use strict';
var Views = window.Views || (window.Views = {});
// Account: sign up / login (§28). Real backend sessions; no simulated auth.

Views.login = function (main) {
  let mode = 'login';
  const err = h('p', { class: 'hint', style: { minHeight: '18px', color: 'var(--danger)' } });
  const email = h('input', { class: 'input', type: 'email', dir: 'ltr', placeholder: 'name@example.com', 'data-testid': 'input-email' });
  const pass = h('input', { class: 'input', type: 'password', dir: 'ltr', placeholder: '••••••••', 'data-testid': 'input-pass' });
  const name = h('input', { class: 'input', dir: 'rtl', placeholder: i18n.t('auth.name'), 'data-testid': 'input-name' });
  const nameWrap = h('div', { class: 'field' });
  const title = h('h2', { class: 'page-title', style: { textAlign: 'center' } });
  const btn = h('button', { class: 'btn block', 'data-testid': 'button-submit', onclick: () => submit() });

  function draw() {
    nameWrap.innerHTML = '';
    if (mode === 'signup') nameWrap.appendChild(h('label', { class: 'field' }, h('div', { class: 'small mb' }, i18n.t('auth.name')), name));
    title.textContent = mode === 'signup' ? i18n.t('auth.signupTitle') : i18n.t('auth.loginTitle');
    btn.textContent = mode === 'signup' ? i18n.t('auth.signup') : i18n.t('auth.login');
    err.textContent = '';
  }
  draw();

  async function submit() {
    err.textContent = '';
    btn.disabled = true;
    try {
      const r = await Api.post('/api/auth/' + mode, {
        email: email.value.trim(), password: pass.value, name: name.value.trim(),
      });
      App.state.user = r.user;
      renderUserChip();
      location.hash = '#/';
      renderView();
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  }

  main.appendChild(h('div', { style: { maxWidth: '380px', margin: '40px auto' } },
    h('div', { class: 'card' },
      h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: '14px' } }, icon('spark', 34)),
      title,
      h('div', { class: 'field' }, h('div', { class: 'small mb' }, i18n.t('auth.email')), email),
      nameWrap,
      h('div', { class: 'field' }, h('div', { class: 'small mb' }, i18n.t('auth.pass')), pass),
      err,
      h('div', { style: { height: '10px' } }),
      btn,
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } },
        h('button', { class: 'btn ghost small', 'data-testid': 'button-switch', onclick: () => { mode = mode === 'login' ? 'signup' : 'login'; draw(); } },
          mode === 'login' ? i18n.t('auth.goSignup') : i18n.t('auth.goLogin'))),
    ),
    h('p', { class: 'hint', style: { textAlign: 'center', marginTop: '14px' } }, i18n.t('auth.recoveryNote')),
  ));
};
