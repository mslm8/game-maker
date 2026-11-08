'use strict';
var Views = window.Views || (window.Views = {});
// AI Provider Center — statuses, key management, priorities, model lists.

Views.providers = async function (main) {
  let data;
  try {
    data = await Api.get('/api/providers');
  } catch (e) {
    main.appendChild(h('div', { class: 'empty-state' }, icon('alert'), h('p', null, e.message)));
    return;
  }
  const { providers, priority } = data;
  App.state.aiConfigured = providers.some(p => p.hasKey);
  App.state.zeroCost = data.zeroCost;

  main.appendChild(h('h1', { class: 'page-title' }, i18n.t('hp.title')));
  main.appendChild(h('p', { class: 'page-sub' }, i18n.t('hp.sub')));

  // zero-cost toggle
  main.appendChild(h('div', { class: 'card row mb', style: { gap: '14px', alignItems: 'center', flexWrap: 'wrap' } },
    h('div', null,
      h('div', { style: { fontWeight: 700, fontSize: '14px' } }, i18n.t('hp.zeroCost')),
      h('div', { class: 'hint' }, i18n.t('hp.zeroCostHint'))),
    h('input', { type: 'checkbox', checked: data.zeroCost, 'data-testid': 'toggle-zerocost', onchange: async (e) => {
      await Api.post('/api/settings', { zero_cost_limit: e.target.checked ? '1' : '0' }).catch(() => {});
      toast(i18n.t('common.done'), 'ok');
    } }),
  ));

  // priority reorder
  const prioWrap = h('div', { class: 'card mb' });
  function drawPrio() {
    prioWrap.innerHTML = '';
    prioWrap.appendChild(h('div', { style: { fontWeight: 700, marginBottom: '8px' } }, i18n.t('hp.priority')));
    prioWrap.appendChild(h('p', { class: 'hint', style: { marginBottom: '10px' } }, i18n.t('hp.priorityHint')));
    const order = [...priority];
    order.forEach((pid, i) => {
      const meta = providers.find(p => p.id === pid);
      if (!meta) return;
      prioWrap.appendChild(h('div', { class: 'row', style: { padding: '6px 0', gap: '12px', flexWrap: 'wrap' } },
        h('span', { class: 'small' }, faNum(i + 1) + '. ' + (i18n.lang === 'fa' ? meta.nameFa : meta.name)),
        h('div', { class: 'row' },
          h('button', { class: 'btn small ghost', disabled: i === 0, onclick: async () => {
            const o = [...priority]; [o[i - 1], o[i]] = [o[i], o[i - 1]];
            await Api.post('/api/providers/priorities', { order: o }).catch(e => toast(e.message, 'err'));
            Views.providers(document.getElementById('main'));
          } }, '↑'),
          h('button', { class: 'btn small ghost', disabled: i === order.length - 1, onclick: async () => {
            const o = [...priority]; [o[i + 1], o[i]] = [o[i], o[i + 1]];
            await Api.post('/api/providers/priorities', { order: o }).catch(e => toast(e.message, 'err'));
            Views.providers(document.getElementById('main'));
          } }, '↓'),
        )));
    });
  }
  drawPrio();

  const listWrap = h('div');
  main.appendChild(prioWrap);
  main.appendChild(listWrap);

  if (!providers.some(p => p.hasKey)) {
    main.insertBefore(h('div', { class: 'preview-label mb' }, icon('alert', 16), i18n.t('hp.noKeys')), listWrap);
  }

  providers.forEach(pv => listWrap.appendChild(providerCard(pv)));

  function statusBadge(pv) {
    const st = pv.status;
    const cls = st === 'CONNECTED' ? 'ok' : st === 'NOT CONFIGURED' ? 'mut' : st === 'RATE LIMITED' || st === 'UNAVAILABLE' ? 'warn' : 'err';
    return h('span', { class: 'badge ' + cls + ' dot', 'data-testid': 'status-' + pv.id }, i18n.t('hp.status.' + st));
  }

  function providerCard(pv) {
    const card = h('div', { class: 'card provider-card', 'data-testid': 'card-provider-' + pv.id });
    const head = h('div', { class: 'provider-head' },
      h('span', { class: 'p-name' }, i18n.lang === 'fa' ? pv.nameFa : pv.name),
      statusBadge(pv),
      pv.hasKey
        ? h('div', { class: 'row' },
            h('button', { class: 'btn small ghost', 'data-testid': 'test-' + pv.id, onclick: async (e) => {
              e.target.disabled = true; e.target.textContent = i18n.t('hp.testing');
              const r = await Api.post('/api/providers/' + pv.id + '/test').catch(err => ({ ok: false, error: err.message }));
              toast(r.ok ? '✓ ' + faNum(r.models.length) + ' ' + i18n.t('hp.models') : '✕ ' + r.error, r.ok ? 'ok' : 'err');
              Views.providers(document.getElementById('main'));
            } }, i18n.t('hp.test')),
            h('button', { class: 'btn small ghost', onclick: async () => {
              if (!confirm(i18n.t('hp.remove') + '?')) return;
              await Api.del('/api/providers/' + pv.id + '/key').catch(e => toast(e.message, 'err'));
              toast(i18n.t('common.done'), 'ok');
              Views.providers(document.getElementById('main'));
            } }, i18n.t('hp.remove')))
        : h('button', { class: 'btn small', 'data-testid': 'addkey-' + pv.id, onclick: () => openKeyModal(pv) }, '+ ' + i18n.t('hp.addKey')),
    );
    card.appendChild(head);

    const costLabel = pv.costNote === 'free_tier' ? i18n.t('hp.costNote.free_tier')
      : pv.costNote === 'mixed' ? i18n.t('hp.costNote.mixed') : i18n.t('hp.costNote.unknown');
    card.appendChild(h('div', { class: 'provider-meta' },
      h('div', { class: 'kv' }, h('div', { class: 'k' }, i18n.t('hp.cost')), h('div', { class: 'v' }, costLabel)),
      pv.hasKey ? h('div', { class: 'kv' }, h('div', { class: 'k' }, 'API Key'), h('div', { class: 'v', dir: 'ltr' }, pv.maskedKey)) : null,
      pv.last_success ? h('div', { class: 'kv' }, h('div', { class: 'k' }, i18n.t('hp.lastOk')), h('div', { class: 'v' }, faTime(pv.last_success))) : null,
      pv.last_error ? h('div', { class: 'kv' }, h('div', { class: 'k' }, i18n.t('hp.lastErr')), h('div', { class: 'v' }, pv.last_error)) : null,
    ));

    if (pv.models && pv.models.length) {
      card.appendChild(h('div', { class: 'model-list' },
        pv.models.slice(0, 12).map(m => h('span', { class: 'badge mut', dir: 'ltr', style: { fontFamily: 'JetBrains Mono, monospace' } }, m)),
        pv.models.length > 12 ? h('span', { class: 'hint' }, '+' + faNum(pv.models.length - 12)) : null));
    }

    if (!pv.hasKey) {
      card.appendChild(h('p', { class: 'hint mt' }, h('a', { href: pv.siteUrl, target: '_blank', rel: 'noopener', style: { color: 'var(--primary)' } }, i18n.t('hp.getKey') + ' ↗')));
    }
    return card;
  }

  function openKeyModal(pv) {
    const keyInp = h('input', { class: 'input', type: 'password', placeholder: i18n.t('hp.keyPh'), dir: 'ltr', 'data-testid': 'input-key-' + pv.id });
    const accInp = pv.needsAccountId ? h('input', { class: 'input', placeholder: i18n.t('hp.accountId'), dir: 'ltr' }) : null;
    const body = h('div', null,
      h('p', { class: 'hint mb' }, h('a', { href: pv.siteUrl, target: '_blank', rel: 'noopener', style: { color: 'var(--primary)' } }, i18n.t('hp.getKey') + ' ↗')),
      h('div', { class: 'field' }, h('label', null, 'API Key'), keyInp),
      accInp ? h('div', { class: 'field' }, h('label', null, i18n.t('hp.accountId')), accInp) : null,
      h('p', { class: 'hint' }, i18n.t('help.a3')),
    );
    modal(pv.name + ' — ' + i18n.t('hp.addKey'), body, [
      h('button', { class: 'btn ghost', onclick: closeModal }, i18n.t('common.cancel')),
      h('button', { class: 'btn', onclick: async (e) => {
        if (!keyInp.value.trim()) return;
        e.target.disabled = true; e.target.textContent = '...';
        try {
          await Api.post('/api/providers/' + pv.id + '/key', { key: keyInp.value.trim(), accountId: accInp ? accInp.value.trim() : undefined });
          const r = await Api.post('/api/providers/' + pv.id + '/test');
          toast(r.ok ? '✓ ' + pv.name : '✕ ' + (r.error || ''), r.ok ? 'ok' : 'err');
          closeModal();
          Views.providers(document.getElementById('main'));
        } catch (err) { toast(err.message, 'err'); e.target.disabled = false; e.target.textContent = i18n.t('hp.save'); }
      } }, i18n.t('hp.save')),
    ]);
  }
};
