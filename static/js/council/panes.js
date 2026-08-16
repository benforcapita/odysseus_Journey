// council/panes.js — seat pane DOM, session creation, layout
import state from './state.js';
import uiModule from '../ui.js';
import spinnerModule from '../spinner.js';

const escapeHtml = uiModule.esc;

function _colorDot(color) {
  const c = String(color || 'gray').toLowerCase();
  return '<span class="council-color-dot council-color-' + escapeHtml(c) + '" aria-hidden="true"></span>';
}

export async function createSeatSession(seat) {
  const fd = new FormData();
  fd.append('name', '[COUNCIL] ' + (seat.member.figure || seat.member.id));
  fd.append('endpoint_url', (seat.model && seat.model.url) || '');
  fd.append('model', (seat.model && seat.model.id) || '');
  if (seat.model && seat.model.endpointId) {
    fd.append('endpoint_id', seat.model.endpointId);
    fd.append('skip_validation', 'true');
  }
  const res = await fetch(`${state.API_BASE}/api/session`, { method: 'POST', body: fd });
  if (!res.ok) return null;
  const data = await res.json();
  return data.id;
}

export async function createChairmanSession() {
  const m = state._chairmanModel;
  const fd = new FormData();
  fd.append('name', '[COUNCIL] Chairman');
  fd.append('endpoint_url', (m && m.url) || '');
  fd.append('model', (m && m.id) || '');
  if (m && m.endpointId) {
    fd.append('endpoint_id', m.endpointId);
    fd.append('skip_validation', 'true');
  }
  const res = await fetch(`${state.API_BASE}/api/session`, { method: 'POST', body: fd });
  if (!res.ok) return null;
  const data = await res.json();
  return data.id;
}

export function deleteSession(sid) {
  if (!sid) return;
  fetch(`${state.API_BASE}/api/session/${sid}`, { method: 'DELETE' }).catch(() => {});
}

export function buildSeatPanes(gridEl) {
  // Build one pane per seat (synchronously — sessions created upstream)
  const seats = state._selectedSeats;
  state._paneElements = [];
  seats.forEach((seat, i) => {
    const pane = document.createElement('div');
    pane.className = 'council-pane compare-pane'; // reuse compare pane CSS
    pane.dataset.seat = String(i);
    const modelShort = (seat.model && seat.model.name) || 'model';
    pane.innerHTML =
      '<div class="pane-header">' +
        '<span class="council-seat-title">' + _colorDot(seat.member.color) +
          '<span class="council-seat-figure">' + escapeHtml(seat.member.figure) + '</span>' +
          '<span class="council-seat-model">' + escapeHtml(modelShort) + '</span>' +
        '</span>' +
        '<span class="pane-timer" id="council-timer-' + i + '"></span>' +
        '<span class="pane-finish-badge" id="council-badge-' + i + '"></span>' +
        '<div class="pane-actions">' +
          '<button class="pane-action-btn pane-stop-btn" data-action="stop" data-seat="' + i + '" title="Stop" style="display:none;"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>' +
        '</div>' +
      '</div>' +
      '<div class="chat-history" id="council-history-' + i + '"></div>';
    gridEl.appendChild(pane);
    state._paneElements.push({
      paneEl: pane,
      histEl: pane.querySelector('.chat-history'),
      timerEl: pane.querySelector('.pane-timer'),
      badgeEl: pane.querySelector('.pane-finish-badge'),
    });
  });
}

// Append a round-divider + user/round header into a seat's history.
export function appendRoundHeader(seatIdx, roundLabel, promptSummary) {
  const el = state._paneElements[seatIdx];
  if (!el) return;
  const divider = document.createElement('div');
  divider.className = 'council-round-divider';
  divider.innerHTML = '<span>' + escapeHtml(roundLabel) + '</span>';
  el.histEl.appendChild(divider);
  if (promptSummary) {
    const u = document.createElement('div');
    u.className = 'msg msg-user';
    u.innerHTML = '<div class="role">Round</div><div class="body"></div>';
    u.querySelector('.body').textContent = promptSummary;
    el.histEl.appendChild(u);
  }
  el.histEl.scrollTop = el.histEl.scrollHeight;
}

// Append an empty AI message with a spinner; returns the element.
export function appendAiMessage(seatIdx, roleLabel) {
  const el = state._paneElements[seatIdx];
  if (!el) return null;
  const ai = document.createElement('div');
  ai.className = 'msg msg-ai';
  ai.innerHTML = '<div class="role">' + escapeHtml(roleLabel || 'Thinking') + '</div><div class="body"></div>';
  const body = ai.querySelector('.body');
  if (spinnerModule) {
    const sp = spinnerModule.create('Thinking…', 'right');
    body.appendChild(sp.createElement());
    sp.start();
    ai._spinner = sp;
  }
  el.histEl.appendChild(ai);
  el.histEl.scrollTop = el.histEl.scrollHeight;
  return ai;
}

export function setBadge(seatIdx, text, color) {
  const el = state._paneElements[seatIdx];
  if (!el || !el.badgeEl) return;
  el.badgeEl.textContent = text || '';
  el.badgeEl.style.color = color || '';
}

export function buildChairmanPane(container) {
  const wrap = document.createElement('div');
  wrap.className = 'council-chairman-wrap';
  wrap.innerHTML =
    '<div class="council-chairman-header">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.8"><path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/></svg>' +
      '<span class="council-chairman-title">Chairman Verdict</span>' +
      '<span class="council-chairman-status" id="council-chairman-status"></span>' +
    '</div>' +
    '<div class="chat-history" id="council-chairman-history"></div>';
  container.appendChild(wrap);
  return wrap;
}

export function appendChairmanMessage() {
  const hist = document.getElementById('council-chairman-history');
  if (!hist) return null;
  const ai = document.createElement('div');
  ai.className = 'msg msg-ai';
  ai.innerHTML = '<div class="role">Chairman</div><div class="body"></div>';
  const body = ai.querySelector('.body');
  if (spinnerModule) {
    const sp = spinnerModule.create('Synthesizing verdict…', 'right');
    body.appendChild(sp.createElement());
    sp.start();
    ai._spinner = sp;
  }
  hist.appendChild(ai);
  hist.scrollTop = hist.scrollHeight;
  return ai;
}

export function setChairmanStatus(text) {
  const el = document.getElementById('council-chairman-status');
  if (el) el.textContent = text || '';
}
window.councilPanes = { buildSeatPanes, appendRoundHeader, appendAiMessage, setBadge, buildChairmanPane, appendChairmanMessage, setChairmanStatus };
