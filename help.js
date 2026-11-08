'use strict';
var Views = window.Views || (window.Views = {});
// Help & onboarding documentation (Persian).

Views.help = function (main) {
  main.appendChild(h('h1', { class: 'page-title' }, i18n.t('help.title')));

  main.appendChild(h('div', { class: 'card mb' },
    h('h3', { style: { marginBottom: '10px' } }, i18n.t('help.start')),
    h('ol', { style: { paddingInlineStart: '20px', lineHeight: '2.2' } },
      h('li', null, i18n.t('help.start1')),
      h('li', null, i18n.t('help.start2')),
      h('li', null, i18n.t('help.start3')),
      h('li', null, i18n.t('help.start4')),
    ),
    h('div', { class: 'row mt' },
      h('a', { class: 'btn', href: '#/new' }, icon('plus', 15), i18n.t('nav.new')),
      h('a', { class: 'btn ghost', href: '#/providers' }, icon('cpu', 15), i18n.t('nav.ai')),
    ),
  ));

  main.appendChild(h('div', { class: 'card' },
    h('h3', { style: { marginBottom: '10px' } }, i18n.t('help.faq')),
    h('div', { class: 'mb' },
      h('h4', { style: { fontSize: '14px', marginBottom: '4px' } }, i18n.t('help.q1')),
      h('p', { class: 'muted small' }, i18n.t('help.a1'))),
    h('div', { class: 'mb' },
      h('h4', { style: { fontSize: '14px', marginBottom: '4px' } }, i18n.t('help.q2')),
      h('p', { class: 'muted small' }, i18n.t('help.a2'))),
    h('div', { class: 'mb' },
      h('h4', { style: { fontSize: '14px', marginBottom: '4px' } }, i18n.t('help.q3')),
      h('p', { class: 'muted small' }, i18n.t('help.a3'))),
    h('div', null,
      h('h4', { style: { fontSize: '14px', marginBottom: '4px' } }, i18n.t('help.q4')),
      h('p', { class: 'muted small' }, i18n.t('help.a4'))),
  ));
};
