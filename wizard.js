'use strict';
var Views = window.Views || (window.Views = {});
// AI Project Creator wizard — describe idea → type → confirm → generate.

Views.wizard = function (main) {
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  let step = 1;
  let desc = '';
  let name = '';
  let type = params.get('t') || '';
  let useAi = true;
  let aiConfigured = App.state.aiConfigured;

  const root = h('div');
  main.appendChild(root);

  // lightweight client-side type detection (mirrors server logic)
  function detect() {
    const d = desc.toLowerCase();
    const has = (...w) => w.some(x => d.includes(x));
    const game = has('بازی', 'game', 'پلتفرم', 'مسابقه', 'racing', 'runner');
    const threeD = has('سه بعدی', 'سه‌بعدی', '3d');
    const twoD = has('دو بعدی', 'دوبعدی', '2d');
    if (game && threeD) return 'game3d';
    if (game && twoD) return 'game2d';
    if (game) return 'game2d';
    if (has('اندروید', 'android', 'apk', 'اپلیکیشن', 'app')) return 'android';
    if (threeD) return 'game3d';
    if (twoD) return 'game2d';
    if (has('رابط', 'طراحی', 'ui', 'سایت', 'website', 'وب')) return 'ui';
    return '';
  }

  const TYPES = [
    { id: 'android', icon: 'phone', label: 'type.android', tech: 'Kotlin + Compose + Gradle' },
    { id: 'game2d', icon: 'gamepad', label: 'type.game2d', tech: 'Godot 4 + GDScript' },
    { id: 'game3d', icon: 'box3d', label: 'type.game3d', tech: 'Godot 4 3D' },
    { id: 'ui', icon: 'layers', label: 'type.ui', tech: 'HTML + CSS' },
  ];

  const EXAMPLES = [
    'یک فروشگاه خرید ساده با سبد خرید',
    'اپلیکیشن مدیریت وظایف روزانه',
    'بازی دوبعدی پلتفرمر با سکه',
    'بازی مسابقه سه‌بعدی ماشین',
    'اپلیکیشن آموزشی آزمون‌محور',
    'A simple task manager app',
  ];

  function stepsBar() {
    return h('div', { class: 'wizard-steps' },
      [1, 2, 3].map(s => h('div', { class: 'wstep' + (s <= step ? ' done' : '') })));
  }

  function render() {
    root.innerHTML = '';
    root.appendChild(h('h1', { class: 'page-title' }, i18n.t('wiz.title')));
    root.appendChild(stepsBar());

    if (step === 1) renderIdea();
    else if (step === 2) renderType();
    else renderConfirm();
  }

  function renderIdea() {
    const nextBtn = h('button', { class: 'btn', disabled: true, 'data-testid': 'button-next', onclick: () => { type = type || detect() || ''; step = 2; render(); } }, i18n.t('wiz.step2') + ' →');
    const ta = h('textarea', {
      class: 'input', rows: 4, placeholder: i18n.t('wiz.descLabel'), 'data-testid': 'input-idea',
      oninput: () => { desc = ta.value; updateDetect(); },
    });
    const detectEl = h('p', { class: 'hint' });
    function updateDetect() {
      const d = detect();
      detectEl.innerHTML = d
        ? i18n.t('wiz.detect') + ': <b style="color:var(--primary)">' + i18n.t(TYPE_META[d].chip) + '</b>'
        : '';
      nextBtn.disabled = desc.trim().length < 3;
    }
    root.appendChild(h('div', null,
      h('p', { class: 'page-sub' }, i18n.t('wiz.descLabel')),
      ta, detectEl,
      h('div', { class: 'example-chips' },
        h('span', { class: 'hint' }, i18n.t('wiz.examples')),
        ...EXAMPLES.map(e => h('button', { class: 'chip', onclick: () => { ta.value = e; desc = e; updateDetect(); } }, e)),
      ),
      h('div', { class: 'row mt' }, nextBtn),
    ));
  }

  function renderType() {
    const grid = h('div', { class: 'choice-grid' });
    TYPES.forEach(t => {
      const active = type === t.id;
      grid.appendChild(h('button', {
        class: 'choice' + (active ? ' active' : ''), 'data-testid': 'choice-' + t.id,
        onclick: () => { type = t.id; render(); },
      }, icon(t.icon), h('span', null, i18n.t(t.label)), h('span', { class: 'hint' }, t.tech)));
    });
    root.appendChild(h('div', null,
      h('p', { class: 'page-sub' }, i18n.t('wiz.chooseType')),
      grid,
      h('div', { class: 'row mt' },
        h('button', { class: 'btn ghost', onclick: () => { step = 1; render(); } }, '← ' + i18n.t('common.back')),
        h('button', { class: 'btn', disabled: !type, onclick: () => { step = 3; render(); }, 'data-testid': 'button-next2' }, i18n.t('wiz.step3') + ' →'),
      ),
    ));
  }

  function renderConfirm() {
    const nameInput = h('input', { class: 'input', placeholder: i18n.t('wiz.namePh'), value: name, oninput: () => { name = nameInput.value; }, 'data-testid': 'input-name' });
    const aiToggle = h('input', { type: 'checkbox', checked: useAi, onchange: () => { useAi = aiToggle.checked; }, 'data-testid': 'toggle-ai' });
    const t = TYPES.find(x => x.id === type) || TYPES[0];

    async function create() {
      if (!nameInput.value.trim()) { toast(i18n.t('wiz.nameLabel'), 'err'); return; }
      const btn = document.getElementById('createBtn');
      btn.disabled = true; btn.textContent = i18n.t('wiz.creating');
      try {
        const res = await Api.post('/api/projects', {
          name: nameInput.value.trim(), description: desc, type, useAi: useAi && aiConfigured,
        });
        if (res.jobId) {
          // poll the background AI job, then apply its files
          const overlay = h('div', { class: 'card center', id: 'jobCard' },
            h('div', { class: 'progressbar' }, h('div', { class: 'fill', id: 'jobFill', style: { width: '0%' } })),
            h('p', { class: 'small mt', id: 'jobMsg' }, i18n.t('wiz.creating')));
          root.innerHTML = '';
          root.appendChild(overlay);
          let applied = false;
          for (let i = 0; i < 240; i++) {
            await new Promise(r => setTimeout(r, 1500));
            let job;
            try { job = await Api.get('/api/jobs/' + res.jobId); } catch (e) { break; }
            const fill = document.getElementById('jobFill'), msg = document.getElementById('jobMsg');
            if (fill) fill.style.width = (job.progress || 0) + '%';
            if (msg) msg.textContent = job.message || '';
            if (job.status === 'completed') {
              const app = await Api.post('/api/jobs/' + res.jobId + '/apply', { projectId: res.project.id });
              applied = true;
              toast(i18n.t('asst.applied') + ' ✓', 'ok');
              if (app.provider) toast(i18n.t('hp.title') + ': ' + app.provider + ' / ' + app.model, 'ok');
              location.hash = '#/project/' + res.project.id;
              return;
            }
            if (job.status === 'failed' || job.status === 'cancelled') {
              toast(job.message || i18n.t('status.failed'), 'err');
              // still open the project — user can retry generation from Build tab
              location.hash = '#/project/' + res.project.id;
              return;
            }
          }
          if (!applied) { toast(i18n.t('common.error'), 'err'); btn.disabled = false; btn.textContent = i18n.t('wiz.create'); }
        } else {
          toast(i18n.t('common.done'), 'ok');
          location.hash = '#/project/' + res.project.id;
        }
      } catch (e) {
        toast(e.message, 'err');
        btn.disabled = false; btn.textContent = i18n.t('wiz.create');
      }
    }

    root.appendChild(h('div', null,
      h('p', { class: 'page-sub' }, i18n.t('wiz.step3')),
      h('div', { class: 'card' },
        h('div', { class: 'field' }, h('label', null, i18n.t('wiz.nameLabel')), nameInput),
        h('div', { class: 'kv' }, h('div', { class: 'k' }, i18n.t('wiz.techRec')), h('div', { class: 'v' }, t.label ? i18n.t(t.label) + ' — ' + t.tech : '')),
        h('div', { class: 'kv mt' }, h('div', { class: 'k' }, i18n.t('wiz.descLabel')), h('div', { class: 'v' }, desc.slice(0, 140))),
        aiConfigured ? h('div', { class: 'row mt' },
          aiToggle, h('label', { style: { flex: '1' } }, i18n.t('wiz.aiToggle'))) : null,
        h('p', { class: 'hint mt' }, aiConfigured ? i18n.t('wiz.aiNote') : i18n.t('hp.noKeys')),
      ),
      h('div', { class: 'row mt' },
        h('button', { class: 'btn ghost', onclick: () => { step = 2; render(); } }, '← ' + i18n.t('common.back')),
        h('button', { class: 'btn', id: 'createBtn', onclick: create, 'data-testid': 'button-create' }, icon('spark', 16), i18n.t('wiz.create')),
      ),
    ));
  }

  render();
};
