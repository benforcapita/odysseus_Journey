// council/selector.js — member + per-member model selection modal
import state from './state.js';
import { fetchModels, fetchRoster, defaultModelFor } from './models.js';
import uiModule from '../ui.js';
import spinnerModule from '../spinner.js';
import themeModule from '../theme.js';

const escapeHtml = uiModule.esc;

// Color dot — uses the member's `color` token; falls back to gray.
function _colorDot(color) {
  const c = String(color || 'gray').toLowerCase();
  return '<span class="council-color-dot council-color-' + escapeHtml(c) + '" aria-hidden="true"></span>';
}

function _seatValid(seat) {
  return seat && seat.member && seat.model && seat.model.id;
}

/** Show the council setup modal. Resolves to true when Convene is clicked. */
export function showCouncilSelector() {
  return new Promise((resolve) => {
    let models = [];
    let rosterLoading = true;

    const overlay = document.createElement('div');
    overlay.id = 'council-setup-overlay';
    overlay.className = 'modal';

    const content = document.createElement('div');
    content.className = 'modal-content council-setup-modal';
    content.style.width = 'min(640px, 94vw)';
    content.style.maxHeight = '88vh';

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('h4');
    title.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px"><path d="M12 2a3 3 0 0 0-3 3c0 1.5 1 2.5 1 4 0 2-2 2-2 4a3 3 0 0 0 6 0c0-2-2-2-2-4 0-1.5 1-2.5 1-4a3 3 0 0 0-3-3z"/><path d="M5 21h14"/><path d="M7 21v-2a5 5 0 0 1 10 0v2"/></svg>Council of High Intelligence';
    title.style.marginRight = 'auto';
    header.appendChild(title);

    const headerCtrls = document.createElement('div');
    headerCtrls.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.innerHTML = '&#x2716;';
    closeBtn.style.cssText = 'flex-shrink:0;margin:0;';
    closeBtn.addEventListener('click', () => cleanup(false));
    headerCtrls.appendChild(closeBtn);
    header.appendChild(headerCtrls);
    content.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.style.cssText = 'padding:10px 14px;overflow-y:auto;flex:1;min-height:0;';

    // Mode segmented control
    const modeRow = document.createElement('div');
    modeRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;';
    const modeLabel = document.createElement('span');
    modeLabel.style.cssText = 'font-size:11px;opacity:0.7;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;';
    modeLabel.textContent = 'Mode';
    modeRow.appendChild(modeLabel);
    const modeGroup = document.createElement('div');
    modeGroup.className = 'council-mode-group';
    [['full', 'Full (3 rounds)'], ['quick', 'Quick (2 rounds)'], ['duo', 'Duo (2 members)']].forEach(([val, lbl], i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'council-mode-btn' + (i === 0 ? ' active' : '');
      b.dataset.mode = val;
      b.textContent = lbl;
      b.addEventListener('click', () => {
        state._mode = val;
        modeGroup.querySelectorAll('.council-mode-btn').forEach(x => x.classList.toggle('active', x === b));
        _renderRoster();
        _updateConvene();
      });
      modeGroup.appendChild(b);
    });
    modeRow.appendChild(modeGroup);
    body.appendChild(modeRow);

    // Preset row
    const presetRow = document.createElement('div');
    presetRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;';
    const presetLabel = document.createElement('span');
    presetLabel.style.cssText = 'font-size:11px;opacity:0.7;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;';
    presetLabel.textContent = 'Preset';
    presetRow.appendChild(presetLabel);

    const triadSelect = document.createElement('select');
    triadSelect.className = 'council-preset-select';
    triadSelect.title = 'Predefined 3-member panel by domain';
    triadSelect.appendChild(new Option('Triad…', '', true, true));
    body.appendChild(presetRow);

    const profileSelect = document.createElement('select');
    profileSelect.className = 'council-preset-select';
    profileSelect.title = 'Predefined panel profile';
    profileSelect.appendChild(new Option('Profile…', '', true, true));
    [['classic', 'Classic (18)'], ['exploration-orthogonal', 'Exploration Orthogonal (12)'], ['execution-lean', 'Execution Lean (5)']].forEach(([v, l]) => {
      profileSelect.appendChild(new Option(l, v));
    });

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'council-preset-btn';
    allBtn.textContent = 'All 18';
    allBtn.title = 'Select all members';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'council-preset-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.title = 'Deselect all';

    presetRow.appendChild(triadSelect);
    presetRow.appendChild(profileSelect);
    presetRow.appendChild(allBtn);
    presetRow.appendChild(clearBtn);

    // Selected count + chairman row
    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin:10px 0 6px;flex-wrap:wrap;font-size:11px;';
    const countLabel = document.createElement('span');
    countLabel.id = 'council-count-label';
    countLabel.style.cssText = 'opacity:0.8;';
    metaRow.appendChild(countLabel);
    // Set-all-models: apply one model to every selected member at once
    const setAllWrap = document.createElement('label');
    setAllWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';
    const setAllLbl = document.createElement('span');
    setAllLbl.style.cssText = 'opacity:0.7;font-weight:600;';
    setAllLbl.textContent = 'Set all';
    const setAllSelect = document.createElement('select');
    setAllSelect.id = 'council-setall-select';
    setAllSelect.className = 'council-model-select';
    setAllSelect.title = 'Apply this model to every selected member (or to all 18 if none selected).';
    setAllSelect.appendChild(new Option('All models…', '', true, true));
    setAllSelect.addEventListener('change', () => {
      const opt = setAllSelect.selectedOptions[0];
      if (!opt || !opt.value) { setAllSelect.value = ''; return; }
      const model = {
        id: opt.value, url: opt.dataset.url, endpointId: opt.dataset.endpointId || null,
        endpointName: opt.dataset.endpointName || '', name: opt.dataset.name || opt.value,
      };
      // If nothing is selected yet, select every roster member first.
      if (state._selectedSeats.length === 0) {
        state._selectedSeats = state._roster.map(member => ({ member, model: null }));
      }
      state._selectedSeats.forEach(seat => { seat.model = model; });
      setAllSelect.value = '';
      _renderRoster();
      _updateConvene();
    });
    setAllWrap.appendChild(setAllLbl);
    setAllWrap.appendChild(setAllSelect);
    metaRow.appendChild(setAllWrap);

    const chairmanWrap = document.createElement('label');
    chairmanWrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:auto;';
    const chairmanLbl = document.createElement('span');
    chairmanLbl.style.cssText = 'opacity:0.7;font-weight:600;';
    chairmanLbl.textContent = 'Chairman';
    const chairmanSelect = document.createElement('select');
    chairmanSelect.id = 'council-chairman-select';
    chairmanSelect.className = 'council-model-select';
    chairmanSelect.title = 'Chairman model (synthesizes the verdict). Auto picks a model not on the panel.';
    chairmanSelect.appendChild(new Option('Auto', ''));
    chairmanWrap.appendChild(chairmanLbl);
    chairmanWrap.appendChild(chairmanSelect);
    metaRow.appendChild(chairmanWrap);
    body.appendChild(metaRow);

    // Roster list container
    const listWrap = document.createElement('div');
    listWrap.className = 'council-roster-list';
    listWrap.style.cssText = 'border:1px solid var(--border);border-radius:6px;max-height:46vh;overflow-y:auto;';
    const listInner = document.createElement('div');
    listInner.style.cssText = 'padding:2px;';
    const loading = document.createElement('div');
    loading.style.cssText = 'padding:14px;text-align:center;opacity:0.6;font-size:12px;';
    if (spinnerModule) {
      const sp = spinnerModule.create('Loading council…', 'center');
      loading.appendChild(sp.createElement());
      sp.start();
    } else {
      loading.textContent = 'Loading council…';
    }
    listInner.appendChild(loading);
    listWrap.appendChild(listInner);
    body.appendChild(listWrap);

    // Footer / actions
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;border-top:1px solid var(--border);flex-shrink:0;';
    const hint = document.createElement('span');
    hint.id = 'council-hint';
    hint.style.cssText = 'font-size:11px;opacity:0.6;min-width:0;';
    hint.textContent = 'Select 2–18 members and assign each a model.';
    footer.appendChild(hint);
    const conveneBtn = document.createElement('button');
    conveneBtn.type = 'button';
    conveneBtn.id = 'council-convene-btn';
    conveneBtn.className = 'council-convene-btn';
    conveneBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg><span style="margin-left:5px;">Convene</span>';
    conveneBtn.disabled = true;
    conveneBtn.addEventListener('click', () => cleanup(true));
    footer.appendChild(conveneBtn);
    content.appendChild(body);
    content.appendChild(footer);

    overlay.appendChild(content);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });

    if (themeModule && themeModule.makeDraggable) themeModule.makeDraggable(content, header);

    // ── Render roster ──
    function _renderRoster() {
      listInner.innerHTML = '';
      const roster = state._roster;
      if (!roster || roster.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:14px;text-align:center;opacity:0.6;font-size:12px;';
        empty.textContent = 'No council personas found. Install the /council skill or set ODYSSEUS_COUNCIL_AGENTS_DIR.';
        listInner.appendChild(empty);
        return;
      }
      roster.forEach(member => {
        const row = document.createElement('div');
        row.className = 'council-roster-row';
        row.dataset.id = member.id;

        const left = document.createElement('div');
        left.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;flex:1;';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'council-roster-chk';
        chk.dataset.id = member.id;
        const seat = state._selectedSeats.find(s => s.member && s.member.id === member.id);
        chk.checked = !!seat;
        chk.addEventListener('change', () => {
          if (chk.checked) {
            if (!seat) {
              const model = defaultModelFor(member, models);
              state._selectedSeats.push({ member, model });
            }
          } else {
            state._selectedSeats = state._selectedSeats.filter(s => !(s.member && s.member.id === member.id));
          }
          _renderRoster();
          _updateConvene();
        });
        left.appendChild(chk);
        left.insertAdjacentHTML('beforeend', _colorDot(member.color));
        const name = document.createElement('span');
        name.style.cssText = 'font-weight:600;font-size:0.88em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        name.textContent = member.figure;
        left.appendChild(name);
        const dom = document.createElement('span');
        dom.style.cssText = 'font-size:0.74em;opacity:0.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        dom.textContent = member.domain;
        left.appendChild(dom);
        row.appendChild(left);

        const modelSel = document.createElement('select');
        modelSel.className = 'council-model-select';
        modelSel.disabled = !chk.checked || models.length === 0;
        modelSel.dataset.id = member.id;
        models.forEach(m => {
          const opt = new Option(m.endpointName ? m.name + ' · ' + m.endpointName : m.name, m.id);
          opt.dataset.url = m.url || '';
          opt.dataset.endpointId = m.endpointId || '';
          opt.dataset.endpointName = m.endpointName || '';
          opt.dataset.name = m.name;
          modelSel.appendChild(opt);
        });
        if (seat && seat.model) modelSel.value = seat.model.id;
        modelSel.addEventListener('change', () => {
          const opt = modelSel.selectedOptions[0];
          const s = state._selectedSeats.find(x => x.member && x.member.id === member.id);
          if (s && opt) {
            s.model = {
              id: opt.value, url: opt.dataset.url, endpointId: opt.dataset.endpointId || null,
              endpointName: opt.dataset.endpointName || '', name: opt.dataset.name || opt.value,
            };
          }
          _updateConvene();
        });
        row.appendChild(modelSel);
        listInner.appendChild(row);
      });
    }

    function _applyMemberIds(ids) {
      state._selectedSeats = ids.map(id => {
        const member = state._roster.find(m => m.id === id);
        if (!member) return null;
        return { member, model: defaultModelFor(member, models) };
      }).filter(Boolean);
      _renderRoster();
      _updateConvene();
    }

    function _updateConvene() {
      const seats = state._selectedSeats.filter(_seatValid);
      const n = seats.length;
      countLabel.textContent = n + ' member' + (n === 1 ? '' : 's') + ' selected';
      const minSeats = state._mode === 'duo' ? 2 : 2;
      const maxSeats = state._mode === 'duo' ? 2 : 18;
      const ok = n >= minSeats && n <= maxSeats;
      conveneBtn.disabled = !ok;
      hint.textContent = ok
        ? 'Convene ' + n + ' member' + (n === 1 ? '' : 's') + ' · ' + state._mode + ' mode'
        : (n < minSeats ? 'Select at least ' + minSeats + ' members.' : 'Duo mode uses exactly 2 members.');
      // Chairman dropdown: Auto + all models not currently on the panel
      const panelModelIds = new Set(seats.map(s => s.model.id));
      const prev = chairmanSelect.value;
      chairmanSelect.innerHTML = '';
      chairmanSelect.appendChild(new Option('Auto', ''));
      models.forEach(m => {
        const opt = new Option(m.endpointName ? m.name + ' · ' + m.endpointName : m.name, m.id);
        opt.dataset.url = m.url || '';
        opt.dataset.endpointId = m.endpointId || '';
        opt.dataset.endpointName = m.endpointName || '';
        opt.dataset.name = m.name;
        if (panelModelIds.has(m.id)) opt.disabled = true;
        chairmanSelect.appendChild(opt);
      });
      if (prev && Array.from(chairmanSelect.options).some(o => o.value === prev)) chairmanSelect.value = prev;
    }

    triadSelect.addEventListener('change', () => {
      const ids = state._triads[triadSelect.value];
      if (ids) _applyMemberIds(ids);
      triadSelect.value = '';
    });
    profileSelect.addEventListener('change', () => {
      const ids = state._profiles[profileSelect.value];
      if (ids) _applyMemberIds(ids);
      profileSelect.value = '';
    });
    allBtn.addEventListener('click', () => _applyMemberIds(state._roster.map(m => m.id)));
    clearBtn.addEventListener('click', () => { state._selectedSeats = []; _renderRoster(); _updateConvene(); });

    function cleanup(confirmed) {
      if (confirmed) {
        state._selectedSeats = state._selectedSeats.filter(_seatValid);
        // Resolve chairman model
        const opt = chairmanSelect.selectedOptions[0];
        if (opt && opt.value) {
          state._chairmanModel = {
            id: opt.value, url: opt.dataset.url, endpointId: opt.dataset.endpointId || null,
            endpointName: opt.dataset.endpointName || '', name: opt.dataset.name || opt.value,
          };
        } else {
          state._chairmanModel = null; // auto
        }
      }
      overlay.remove();
      resolve(confirmed);
    }

    // ── Async load roster + models, then render ──
    (async () => {
      try {
        const [_, modelsRes] = await Promise.all([fetchRoster(), fetchModels()]);
        models = modelsRes;
        // Populate the Set-all-models dropdown with every available chat model
        const _setAllSel = document.getElementById('council-setall-select');
        if (_setAllSel) {
          models.forEach(m => {
            const opt = new Option(m.endpointName ? m.name + ' · ' + m.endpointName : m.name, m.id);
            opt.dataset.url = m.url || '';
            opt.dataset.endpointId = m.endpointId || '';
            opt.dataset.endpointName = m.endpointName || '';
            opt.dataset.name = m.name;
            _setAllSel.appendChild(opt);
          });
        }
        // Populate triad dropdown from server-provided table
        Object.keys(state._triads).sort().forEach(k => {
          triadSelect.appendChild(new Option(k + ' (' + state._triads[k].length + ')', k));
        });
        rosterLoading = false;
        _renderRoster();
        _updateConvene();
      } catch (e) {
        rosterLoading = false;
        listInner.innerHTML = '<div style="padding:14px;color:var(--color-error);font-size:12px;">Failed to load: ' + escapeHtml(e.message) + '</div>';
      }
    })();
  });
}
window.showCouncilSelector = showCouncilSelector;
