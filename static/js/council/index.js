// council/index.js — orchestrator + public API for the Council tool
//
// Mirrors the Compare module's shape (multi-pane grid built inside
// #chat-container, chat-input-bar moved to the bottom, send button doubles
// as Stop) but convenes a Council of High Intelligence: the user picks
// council members + a model per seat, then watches each member's thinking
// stream in real time across 1-3 deliberation rounds, ending with a
// Chairman synthesis verdict.

import state, { reset } from './state.js';
import { fetchModels, fetchRoster } from './models.js';
import { showCouncilSelector } from './selector.js';
import { streamToSeat, stopAll, stopSeat } from './stream.js';
import {
  createSeatSession, createChairmanSession, deleteSession,
  buildSeatPanes, appendRoundHeader, appendAiMessage, setBadge,
  buildChairmanPane, appendChairmanMessage, setChairmanStatus,
} from './panes.js';
import uiModule from '../ui.js';
import spinnerModule from '../spinner.js';
import markdownModule from '../markdown.js';

const escapeHtml = uiModule.esc;

const SEND_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

function _setSendBtn(mode) {
  const btn = document.querySelector('.send-btn');
  if (!btn) return;
  if (mode === 'stop') {
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    btn.title = 'Stop council';
    btn.dataset.mode = 'streaming';
    btn.classList.remove('mic-mode', 'newchat-mode');
  } else {
    btn.dataset.mode = '';
    btn.innerHTML = SEND_SVG;
    btn.style.color = '';
    btn.title = 'Convene council';
    btn.classList.remove('mic-mode', 'newchat-mode', 'newchat-expanded');
  }
}

function _syncToolbarIndicator(active) {
  const indicator = document.getElementById('council-indicator-btn');
  if (indicator) { indicator.style.display = 'none'; indicator.classList.remove('active'); }
  document.dispatchEvent(new CustomEvent('overflow-state-change'));
}

function init(apiBase) {
  state.API_BASE = apiBase;
  window.addEventListener('beforeunload', () => {
    // Best-effort cleanup of unsaved council sessions on page close
    const ids = state._paneSessionIds.filter(Boolean);
    if (ids.length > 0) {
      navigator.sendBeacon(
        `${state.API_BASE}/api/sessions/bulk-delete`,
        new Blob([JSON.stringify({ ids })], { type: 'application/json' })
      );
    }
  });
}

function isActive() { return state.isActive; }

function closeCouncil() { if (state.isActive) deactivate(true); }

async function toggleMode() {
  if (state.isActive) { deactivate(true); return false; }
  if (state._openingSelector) return false;
  state._openingSelector = true;
  try {
    const confirmed = await showCouncilSelector();
    if (!confirmed) return false;
    if (state._selectedSeats.length < 2) return false;
    state.isActive = true;
    _syncToolbarIndicator(true);
    await _buildCouncilUI();
    return true;
  } catch (err) {
    console.error('Council toggleMode error:', err);
    if (uiModule) uiModule.showError('Council setup failed: ' + err.message);
    return false;
  } finally {
    state._openingSelector = false;
  }
}

async function _buildCouncilUI() {
  const seats = state._selectedSeats;
  const n = seats.length;
  reset();
  state._selectedSeats = seats; // reset() clears transient state but not seats
  state.isActive = true;

  // Create one ephemeral session per seat (so each member's stream is
  // independent and uses that seat's assigned model).
  state._paneSessionIds = [];
  for (let i = 0; i < n; i++) {
    const sid = await createSeatSession(seats[i]);
    state._paneSessionIds.push(sid);
  }
  if (state._paneSessionIds.some(s => !s)) {
    if (uiModule) uiModule.showError('Could not create one or more council sessions.');
  }

  const container = document.getElementById('chat-container');
  state._elements = [];
  state._savedChildren = [];
  Array.from(container.children).forEach(child => {
    if (child.style.display === 'none') return;
    state._savedChildren.push({ el: child, display: child.style.display });
    child.dataset.councilHidden = '1';
    child.style.display = 'none';
  });
  container.classList.add('compare-active', 'council-active');

  // Hide the Agent/Chat mode toggle while the council is active — council
  // seats always run in plain chat mode, so the toggle is meaningless here.
  state._savedModeToggleDisplay = null;
  const _modeToggle = document.querySelector('.mode-toggle');
  if (_modeToggle) {
    state._savedModeToggleDisplay = _modeToggle.style.display;
    _modeToggle.style.display = 'none';
  }
  // Header bar
  const header = document.createElement('div');
  header.className = 'compare-header-bar council-header-bar';
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 10px;flex-shrink:0;';
  const left = document.createElement('div');
  left.style.cssText = 'display:flex;align-items:center;min-width:0;gap:6px;';
  left.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:0.85"><path d="M12 2a3 3 0 0 0-3 3c0 1.5 1 2.5 1 4 0 2-2 2-2 4a3 3 0 0 0 6 0c0-2-2-2-2-4 0-1.5 1-2.5 1-4a3 3 0 0 0-3-3z"/><path d="M5 21h14"/><path d="M7 21v-2a5 5 0 0 1 10 0v2"/></svg>';
  const label = document.createElement('span');
  label.id = 'council-header-label';
  label.className = 'compare-header-label';
  label.style.cssText = 'font-size:10px;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;';
  label.textContent = 'Council · ' + n + ' members · ' + state._mode + ' mode';
  left.appendChild(label);
  header.appendChild(left);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;align-items:center;gap:6px;';
  const _btnCSS = 'background:none;border:1px solid var(--border);color:var(--fg);cursor:pointer;padding:3px 10px;font-size:11px;font-weight:600;opacity:0.7;transition:all 0.15s;line-height:1;border-radius:4px;display:inline-flex;align-items:center;font-family:inherit;';
  const exportBtn = document.createElement('button');
  exportBtn.id = 'council-export-btn';
  exportBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span style="font-size:11px;margin-left:3px;">Export</span>';
  exportBtn.title = 'Export council transcript';
  exportBtn.style.cssText = _btnCSS;
  exportBtn.addEventListener('click', (e) => { e.stopPropagation(); _toggleExportMenu(exportBtn); });
  actions.appendChild(exportBtn);
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  closeBtn.title = 'Close council';
  closeBtn.style.cssText = _btnCSS;
  closeBtn.addEventListener('click', () => deactivate(true));
  actions.appendChild(closeBtn);
  header.appendChild(actions);
  container.appendChild(header);
  state._elements.push(header);

  // Seat grid
  const grid = document.createElement('div');
  grid.className = 'compare-grid council-grid';
  const cols = Math.min(n, 4);
  grid.dataset.cols = String(cols);
  buildSeatPanes(grid);
  // Stop button delegation
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.pane-action-btn[data-action="stop"]');
    if (b) { e.stopPropagation(); stopSeat(parseInt(b.dataset.seat)); }
  });
  container.appendChild(grid);
  state._elements.push(grid);

  // Chairman pane (full-width, below the grid)
  const chairmanWrap = buildChairmanPane(container);
  chairmanWrap.style.display = 'none'; // reveal when chairman runs
  state._elements.push(chairmanWrap);

  // Move chat input bar to the bottom
  const inputBar = document.querySelector('.chat-input-bar');
  if (inputBar) {
    inputBar.style.display = '';
    if (inputBar.dataset.cmpHidden) delete inputBar.dataset.cmpHidden;
    container.appendChild(inputBar);
  }
  const msgTA = document.getElementById('message');
  if (msgTA) {
    msgTA.placeholder = window.matchMedia('(max-width: 767px)').matches ? '' : 'State the problem for the council…';
    requestAnimationFrame(() => msgTA.focus());
  }
  _setSendBtn('send');
}

async function deactivate(teardown) {
  state._abortControllers.forEach(ac => { if (ac) ac.abort(); });
  state._abortControllers = [];
  const idsToDelete = (teardown ? state._paneSessionIds.filter(Boolean) : []);
  if (state._chairmanSessionId) { idsToDelete.push(state._chairmanSessionId); state._chairmanSessionId = null; }

  state.isActive = false;
  state._streaming = false;
  state._roundRunning = false;
  state._currentRound = 0;
  _syncToolbarIndicator(false);

  const msgTA = document.getElementById('message');
  if (msgTA) msgTA.placeholder = '';

  // Restore the Agent/Chat mode toggle visibility
  const _mtRestore = document.querySelector('.mode-toggle');
  if (_mtRestore && state._savedModeToggleDisplay !== null) {
    _mtRestore.style.display = state._savedModeToggleDisplay;
  }
  state._savedModeToggleDisplay = null;

  // Restore chat-container children
  const container = document.getElementById('chat-container');
  state._elements.forEach(el => { try { el.remove(); } catch (_) {} });
  state._elements = [];
  state._savedChildren.forEach(({ el, display }) => { if (el && el.parentNode === container) { el.style.display = display || ''; delete el.dataset.councilHidden; } });
  state._savedChildren = [];
  container.classList.remove('compare-active', 'council-active');

  if (teardown) {
    if (idsToDelete.length > 0) {
      await Promise.all(idsToDelete.map(sid =>
        fetch(`${state.API_BASE}/api/session/${sid}`, { method: 'DELETE', keepalive: true }).catch(() => {})
      ));
    }
    try { location.href = location.pathname; } catch (_) {}
  }
}

// ── Submit (from main chat input while council is active) ──
function handleCouncilSubmit() {
  if (state._streaming || state._roundRunning) { stopAll(); _setSendBtn('send'); return; }
  const input = document.getElementById('message');
  const message = input ? input.value.trim() : '';
  if (!message) return;
  input.value = '';
  input.style.height = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  state._problem = message;
  _runDeliberation(message);
}

// ── Prompt builders ──
function _personaBlock(seat) {
  const m = seat.member;
  if (m.persona && m.persona.trim()) {
    return 'Read and follow this persona file exactly:\n\n' + m.persona +
      '\n\n(You are ' + m.figure + ' — ' + m.domain + '. Stay in persona throughout.)';
  }
  // Fallback when persona body unavailable (skill not installed)
  return 'You are ' + m.figure + ' — ' + (m.domain || 'a council member') + '. ' +
    (m.polarity ? 'Your polarity: ' + m.polarity + '. ' : '') +
    'Stay in persona throughout the deliberation.';
}

function _roundPrompt(seat, seatIdx, round, problem, peerOutputs, labelMap) {
  const persona = _personaBlock(seat);
  const mode = state._mode;
  if (round === 1) {
    if (mode === 'duo') {
      return persona + '\n\n---\n\nProblem:\n' + problem +
        '\n\nRound 1 — Opening position. State your position on the problem directly. Max 250 words.';
    }
    if (mode === 'quick') {
      return persona + '\n\n---\n\nProblem:\n' + problem +
        '\n\nRound 1 — First restate the problem in one sentence, then give an alternative framing in one sentence, then your rapid analysis. Max 200 words total.';
    }
    return persona + '\n\n---\n\nProblem:\n' + problem +
      '\n\nRound 1 — Independent analysis, blind-first (do not assume what others will say). Max 300 words.';
  }
  if (round === 2) {
    const antiConformity = '\n\nAnti-conformity directive. If your Round 1 position was correct, defend it. Do not update merely because peers disagree, because consensus is forming, or because a position is repeated by multiple members. Update only when presented with sound, validity-aligned reasoning that exposes a specific flaw in your earlier argument. Naming that flaw is required when you update; if you cannot name it, you should not update.';
   if (mode === 'duo') {
     // Duo: no anonymization (only 2 members). Counterpart = the other seat.
     const other = peerOutputs[0];
     return persona + '\n\n---\n\nProblem:\n' + problem +
       '\n\nYour counterpart (' + escapeHtml(state._selectedSeats[other.idx].member.figure) + ') said in Round 1:\n\n' + other.text +
       antiConformity + '\n\nRound 2 — Direct response to your counterpart. Address their strongest point and their weakest. Max 180 words.';
   }
    // Anonymized peers (exclude self). Quick ends the deliberation here with
    // a final position + stance; Full runs a cross-examination (Round 3 is the
    // final position in full mode).
    const peers = labelMap
      .filter(({ idx }) => idx !== seatIdx)
      .map(({ label, idx }) => '### ' + label + '\n' + (peerOutputs.find(p => p.idx === idx) || { text: '' }).text)
      .join('\n\n');
    const tail = mode === 'quick'
      ? '\n\nRound 2 — Final position. Reference peers by Member-X label only. Max 75 words. End with a structured stance line: STANCE: <short option label> | CONFIDENCE: high|med|low | DEALBREAKER: yes|no'
      : '\n\nRound 2 — Cross-examination. Engage at least 2 peers by Member-X label. Max 220 words.';
    return persona + '\n\n---\n\nProblem:\n' + problem +
      '\n\nThe other members (identities masked, referenced by label only) said in Round 1:\n\n' + peers +
      antiConformity + tail;
  }
 if (round === 3) {
    // Round 3 only used in full mode here (quick ends at round 2)
    return persona + '\n\n---\n\nProblem:\n' + problem +
      '\n\nRound 3 — Final position. Real names restored; reference peers by name. Max 100 words. End with a structured stance line: STANCE: <short option label> | CONFIDENCE: high|med|low | DEALBREAKER: yes|no';
  }
  return persona + '\n\nProblem:\n' + problem;
}

// ── Run one round across all seats in parallel; collect outputs ──
async function _runRound(round, problem, prevOutputs) {
  state._currentRound = round;
  state._roundRunning = true;
  state._streaming = true;
  _setSendBtn('stop');
  _updateHeader();

  // Build label map for anonymization (full + quick modes)
  let labelMap = [];
  if (round === 2 && state._mode !== 'duo') {
    labelMap = state._selectedSeats.map((_, i) => ({ label: 'Member ' + String.fromCharCode(65 + i), idx: i }));
    state._labelMap = labelMap;
  }

  const roundLabel = 'Round ' + round + (round === 1 ? ' · Independent Analysis' : round === 2 ? ' · Cross-Examination' : ' · Final Position');
  const n = state._selectedSeats.length;

  // For Round 2, peerOutputs = everyone EXCEPT this seat
  const promises = [];
  for (let i = 0; i < n; i++) {
    const seat = state._selectedSeats[i];
    appendRoundHeader(i, roundLabel, state._problem);
    const aiMsg = appendAiMessage(i, seat.member.figure);
    const peerOutputs = (round === 1) ? [] : prevOutputs.filter(p => p.idx !== i);
    const prompt = _roundPrompt(seat, i, round, problem, peerOutputs, labelMap);
    const sid = state._paneSessionIds[i];
    promises.push((async () => {
      if (!sid) {
        if (aiMsg && aiMsg.querySelector) {
          const body = aiMsg.querySelector('.body');
          if (body) body.innerHTML = '<span style="color:var(--color-error);font-size:0.85em;">No session for this seat.</span>';
        }
        setBadge(i, 'offline', 'var(--color-error)');
        return { idx: i, text: '', error: 'no session' };
      }
      const result = await streamToSeat(i, sid, prompt, aiMsg, { timeout: state._timeout });
      const text = (result && result.text) || '';
      setBadge(i, result && result.error ? 'error' : 'done', result && result.error ? 'var(--color-error)' : '');
      return { idx: i, text, error: result && result.error };
    })());
  }
  const outputs = await Promise.all(promises);
  state._roundRunning = false;
  state._streaming = false;
  _setSendBtn('send');
  return outputs;
}

function _updateHeader() {
  const el = document.getElementById('council-header-label');
  if (!el) return;
  const n = state._selectedSeats.length;
  const roundTxt = state._currentRound > 0 ? ' · Round ' + state._currentRound : '';
  el.textContent = 'Council · ' + n + ' members · ' + state._mode + ' mode' + roundTxt;
}

// ── Chairman synthesis ──
// Extract the first {...} JSON object from a model response; tolerates code
// fences and surrounding prose. Returns the parsed object or null.
function _parseSummaryJson(raw) {
  if (!raw) return null;
  let txt = String(raw).trim();
  txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = txt.indexOf('{');
  const end = txt.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(txt.slice(start, end + 1)); } catch (_) { return null; }
}

// When a seat fails to emit valid JSON, fall back to a minimal summary built
// from its final-round prose so the Chairman still has something compact.
function _fallbackSummary(seatIdx, transcript) {
  const seat = state._selectedSeats[seatIdx];
  const fig = (seat && seat.member && seat.member.figure) || ('Member ' + (seatIdx + 1));
  let lastText = '';
  for (let i = transcript.length - 1; i >= 0; i--) {
    const o = transcript[i].outputs.find(x => x.idx === seatIdx);
    if (o && o.text && o.text.trim()) { lastText = o.text.trim(); break; }
  }
  return {
    stance: 'unknown',
    confidence: 'low',
    dealbreaker: 'no',
    position: (lastText.slice(0, 240) || '(no output)'),
    key_arguments: [],
    disagrees_with: [],
    concessions: [],
    open_questions: [],
    _parse_failed: true,
  };
}

// Per-seat JSON conclusion summary round. Streams a compact JSON request to
// every seat in parallel and collects parsed summaries for the Chairman.
// This keeps the Chairman's context small (each seat ~150 words of JSON vs.
// the full multi-round transcript).
async function _runSummaryRound(problem) {
  const n = state._selectedSeats.length;
  const roundLabel = 'Final Summary (JSON)';
  const schema =
    '{\n' +
    '  "stance": "<short option label, or the word abstain>",\n' +
    '  "confidence": "high" | "med" | "low",\n' +
    '  "dealbreaker": "yes" | "no",\n' +
    '  "position": "<1-2 sentence final position>",\n' +
    '  "key_arguments": ["<short bullet>", "<short bullet>"],\n' +
    '  "disagrees_with": ["<peer name + the specific flaw you challenge>"],\n' +
    '  "concessions": ["<what you updated + the named flaw that drove it>"],\n' +
    '  "open_questions": ["<unresolved question>"]\n' +
    '}';
  const prompts = [];
  for (let i = 0; i < n; i++) {
    const seat = state._selectedSeats[i];
    appendRoundHeader(i, roundLabel, null);
    const aiMsg = appendAiMessage(i, seat.member.figure);
    const prompt =
      _personaBlock(seat) + '\n\n---\n\nProblem:\n' + problem +
      '\n\nYou have completed the deliberation rounds. Now summarize YOUR final conclusion as a single JSON object with EXACTLY this schema:\n\n' +
      schema +
      '\n\nReturn ONLY the JSON object — no prose, no markdown fences, no commentary. Max ~150 words total. Stay in persona inside the values.';
    prompts.push((async () => {
      const sid = state._paneSessionIds[i];
      if (!sid) {
        setBadge(i, 'offline', 'var(--color-error)');
        return { idx: i, raw: '', json: _fallbackSummary(i, state._transcript), error: 'no session' };
      }
      const result = await streamToSeat(i, sid, prompt, aiMsg, { timeout: state._timeout });
      const raw = (result && result.text) || '';
      const json = _parseSummaryJson(raw);
      const summary = json || _fallbackSummary(i, state._transcript);
      if (!json) setBadge(i, 'summary-fallback', 'var(--color-warning)');
      else setBadge(i, 'summary-done', '');
      return { idx: i, raw, json: summary, error: result && result.error, parse_failed: !json };
    })());
  }
  const summaries = await Promise.all(prompts);
  state._summaries = summaries;
  return summaries;
}

async function _runChairman(summaries) {
  // Resolve chairman model: explicit pick from selector, else auto (a model
  // not on the panel if possible).
  if (!state._chairmanModel) {
    const models = await fetchModels();
    const panelIds = new Set(state._selectedSeats.map(s => s.model && s.model.id).filter(Boolean));
    state._chairmanModel = models.find(m => !panelIds.has(m.id)) || models[0] || null;
  }
  if (!state._chairmanModel) {
    setChairmanStatus('No model available for Chairman.');
    return;
  }
  const chairmanWrap = document.querySelector('.council-chairman-wrap');
  if (chairmanWrap) chairmanWrap.style.display = '';
  setChairmanStatus('· ' + (state._chairmanModel.name || state._chairmanModel.id));
  const sid = await createChairmanSession();
  state._chairmanSessionId = sid;
  if (!sid) { setChairmanStatus('· failed to create session'); return; }
  const aiMsg = appendChairmanMessage();

  const panelDesc = state._selectedSeats.map((s, i) =>
    'Seat ' + String.fromCharCode(65 + i) + ' = ' + s.member.figure + ' (' + (s.model.name || s.model.id) + ')').join('\n');
  // Compact: one JSON block per seat instead of the full multi-round transcript.
  const summaryText = summaries.map((sum) => {
    const seat = state._selectedSeats[sum.idx];
    const fig = (seat && seat.member && seat.member.figure) || ('Member ' + (sum.idx + 1));
    return '[Seat ' + String.fromCharCode(65 + sum.idx) + ' — ' + fig + ']' +
      (sum.parse_failed ? ' (JSON parse failed — fallback from final round)' : '') +
      '\n' + JSON.stringify(sum.json);
  }).join('\n\n');

  const prompt =
    'You are the Chairman of a council deliberation. You did NOT deliberate. You receive the structured JSON summary of each member\'s final conclusion — not the full transcript. ' +
    'Synthesize the verdict from these summaries. Always preserve dissent; never flatten disagreements into fake consensus. ' +
    'If a member\'s summary is marked as a parse-failed fallback, treat its position as low-confidence.\n\n' +
    'Problem:\n' + state._problem + '\n\n' +
    'Panel map:\n' + panelDesc + '\n\n' +
    'Member summaries (JSON):\n' + summaryText + '\n\n' +
    'Return the verdict in this order, as markdown sections:\n' +
    '1. Selected Panel (members + mode)\n2. Chairman (name, provider, model, selection rationale)\n' +
    '3. Acceptable Compromises\n4. Kill Criteria ("If <X> by <date>, invalidated -> <Y>")\n' +
    '5. Concrete Next Step (one action with an artifact-producing verb)\n' +
    '6. Unresolved Questions\n7. Key Agreements\n8. Key Disagreements\n' +
    '9. Decision Options (2-4 options with tradeoffs)\n10. Recommended Next Steps (ordered)\n' +
    '11. Confidence (high/medium/low + why)\n12. Execution Reliability (live/degraded/offline seat counts, and any parse-failed seats).';

  state._streaming = true;
  _setSendBtn('stop');
  const result = await streamToSeat(-1, sid, prompt, aiMsg, { timeout: Math.max(state._timeout, 90) });
  state._chairmanOutput = (result && result.text) || '';
  state._streaming = false;
  _setSendBtn('send');
  // Chairman session is ephemeral — delete it
  deleteSession(sid);
  state._chairmanSessionId = null;
  setChairmanStatus(result && result.error ? '· synthesis failed' : '· verdict delivered');
}

// ── Deliberation orchestrator ──
async function _runDeliberation(problem) {
  if (state._streaming) return;
  const n = state._selectedSeats.length;
  if (n < 2) return;
  try {
    state._transcript = [];
    const transcript = state._transcript;
    const mode = state._mode;
    const rounds = (mode === 'full') ? 3 : (mode === 'quick' ? 2 : 3);

    let prevOutputs = [];
    for (let r = 1; r <= rounds; r++) {
      const outputs = await _runRound(r, problem, prevOutputs);
      transcript.push({ round: r, outputs });
      prevOutputs = outputs;
      if (outputs.every(o => o.error)) break; // all seats failed — abort
    }

    // Per-seat JSON conclusion summaries — one compact call per member so the
    // Chairman receives structured summaries instead of the full (very large)
    // multi-round transcript. Skipped if every seat already failed.
    let summaries = [];
    if (!transcript.length || !transcript[transcript.length - 1].outputs.every(o => o.error)) {
      summaries = await _runSummaryRound(problem);
    }

    // Chairman synthesis from the compact JSON summaries (full + quick; duo is
    // dialectic, no tally, but a synthesis is still useful for all modes).
    await _runChairman(summaries);
    _updateHeader();
  } catch (err) {
    console.error('Council deliberation error:', err);
    if (uiModule) uiModule.showError('Council failed: ' + err.message);
  } finally {
    state._streaming = false;
    state._roundRunning = false;
    _setSendBtn('send');
  }
}

// ── Export (markdown) ──
function _roundLabel(r) {
  if (r === 1) return 'Round 1 — Independent Analysis';
  if (r === 2) return state._mode === 'duo' ? 'Round 2 — Direct Response' : 'Round 2 — Cross-Examination';
  if (r === 3) return 'Round 3 — Final Position';
  return 'Round ' + r;
}

function _buildCouncilMarkdown() {
  const seats = state._selectedSeats;
  if (!seats || seats.length === 0) return null;
  const transcript = state._transcript || [];
  const chairman = state._chairmanOutput || '';
  if (transcript.length === 0 && !chairman) return null;
  const date = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const problem = state._problem || '(no problem statement)';
  let md = '# Council of High Intelligence\n\n';
  md += '**When:** ' + date + '\n';
  md += '**Mode:** ' + state._mode + '\n';
  md += '**Members:** ' + seats.length + '\n\n';
  md += '## Problem\n\n';
  md += problem + '\n\n';
  md += '## Panel\n\n';
  seats.forEach((s, i) => {
    const fig = (s.member && s.member.figure) || 'Member ' + (i + 1);
    const model = (s.model && (s.model.name || s.model.id)) || 'model';
    md += '- **' + escapeHtml(fig) + '** — ' + escapeHtml(s.member && s.member.domain ? s.member.domain : '') + ' · _' + escapeHtml(model) + '_\n';
  });
  md += '\n';
  transcript.forEach((r) => {
    md += '---\n\n## ' + _roundLabel(r.round) + '\n\n';
    r.outputs.forEach((o) => {
      const seat = seats[o.idx];
      const fig = (seat && seat.member && seat.member.figure) || ('Member ' + (o.idx + 1));
      const model = (seat && seat.model && (seat.model.name || seat.model.id)) || 'model';
      md += '### ' + escapeHtml(fig) + ' · _' + escapeHtml(model) + '_\n\n';
      md += (o.text && o.text.trim()) ? o.text.trim() + '\n\n' : '_(no output)_\n\n';
    });
  });
  const summaries = state._summaries || [];
  if (summaries.length) {
    md += '---\n\n## Member Conclusion Summaries (JSON)\n\n';
    md += '_Compact per-member JSON summaries fed to the Chairman._\n\n';
    summaries.forEach((sum) => {
      const seat = seats[sum.idx];
      const fig = (seat && seat.member && seat.member.figure) || ('Member ' + (sum.idx + 1));
      md += '### ' + escapeHtml(fig) + (sum.parse_failed ? ' _(parse failed — fallback)_' : '') + '\n\n';
      md += '```json\n' + JSON.stringify(sum.json, null, 2) + '\n```\n\n';
    });
  }
  if (chairman.trim()) {
    md += '---\n\n## Chairman Verdict\n\n' + chairman.trim() + '\n\n';
  }
  return md;
}

let _exportMenuEl = null;
function _closeExportMenu() {
  if (_exportMenuEl) { _exportMenuEl.remove(); _exportMenuEl = null; }
}
function _toggleExportMenu(btn) {
  if (_exportMenuEl) { _closeExportMenu(); return; }
  const r = btn.getBoundingClientRect();
  const m = document.createElement('div');
  m.className = 'council-export-menu';
  m.style.cssText = 'position:fixed;z-index:10001;top:' + (r.bottom + 4) + 'px;left:' + r.left + 'px;background:var(--panel,var(--bg));border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.3);padding:4px;font-size:12px;display:flex;flex-direction:column;min-width:170px;';
  const opts = [
    { label: 'Copy as Markdown', fn: () => _exportCopyMarkdown() },
    { label: 'Download .md',     fn: () => _exportDownloadMarkdown() },
    { label: 'Print / Save PDF', fn: () => _exportPrint() },
  ];
  for (const o of opts) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = o.label;
    item.style.cssText = 'background:none;border:none;color:var(--fg);text-align:left;padding:8px 12px;border-radius:6px;cursor:pointer;font:inherit;font-size:12px;';
    item.addEventListener('mouseenter', () => { item.style.background = 'color-mix(in srgb, var(--fg) 8%, transparent)'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'none'; });
    item.addEventListener('click', () => { _closeExportMenu(); o.fn(); });
    m.appendChild(item);
  }
  document.body.appendChild(m);
  _exportMenuEl = m;
  setTimeout(() => document.addEventListener('click', _closeExportMenu, { once: true }), 0);
}

function _exportToast(msg) {
  try { if (uiModule && uiModule.showToast) uiModule.showToast(msg); } catch (_) {}
}

async function _exportCopyMarkdown() {
  const md = _buildCouncilMarkdown();
  if (!md) { _exportToast('Nothing to export yet — convene the council first.'); return; }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(md);
    } else {
      const ta = document.createElement('textarea');
      ta.value = md;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
    }
    _exportToast('Copied council transcript to clipboard');
  } catch (e) { _exportToast('Copy failed'); }
}

function _exportDownloadMarkdown() {
  const md = _buildCouncilMarkdown();
  if (!md) { _exportToast('Nothing to export yet — convene the council first.'); return; }
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'council-' + ts + '.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function _exportPrint() {
  const md = _buildCouncilMarkdown();
  if (!md) { _exportToast('Nothing to export yet — convene the council first.'); return; }
  // Render the markdown into a minimal HTML doc and print it. Keeps the
  // transcript self-contained (no app chrome) so Save-as-PDF is clean.
  let html = '<!doctype html><html><head><meta charset="utf-8"><title>Council Transcript</title>';
  html += '<style>body{font:14px/1.5 -apple-system,Inter,system-ui,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;color:#222}h1,h2,h3{line-height:1.25}pre{background:#f5f5f5;padding:10px;border-radius:6px;overflow:auto}code{font-family:ui-monospace,Menlo,monospace}hr{border:0;border-top:1px solid #ddd;margin:20px 0}blockquote{border-left:3px solid #ccc;margin:0;padding-left:12px;color:#555}</style>';
  html += '</head><body>';
  // Naive but sufficient markdown rendering for the printed transcript:
  // headings, bold, italics, code fences, hr, and paragraphs.
  html += _mdToHtml(md);
  html += '</body></html>';
  const w = window.open('', '_blank');
  if (!w) { _exportToast('Pop-up blocked — allow pop-ups to print.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch (_) {} }, 250);
}

// Tiny markdown -> HTML for the print path (compare uses the full markdown
// module; here we keep the print doc dependency-free so it works in a fresh
// tab that does not load the app's modules).
function _mdToHtml(md) {
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  let out = '';
  let inCode = false;
  let inList = false;
  let para = [];
  const flushPara = () => {
    if (para.length) {
      let p = para.join(' ');
      p = esc(p).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^| )\*([^*]+)\*( |$)/g, '$1<em>$2</em>$3').replace(/`([^`]+)`/g, '<code>$1</code>');
      out += '<p>' + p + '</p>\n';
      para = [];
    }
  };
  for (let raw of lines) {
    if (raw.startsWith('```')) { flushPara(); if (inList) { out += '</ul>\n'; inList = false; } inCode = !inCode; if (inCode) out += '<pre><code>'; else out += '</code></pre>\n'; continue; }
    if (inCode) { out += esc(raw) + '\n'; continue; }
    if (/^###\s/.test(raw)) { flushPara(); if (inList) { out += '</ul>\n'; inList = false; } out += '<h3>' + esc(raw.replace(/^###\s/, '')) + '</h3>\n'; continue; }
    if (/^##\s/.test(raw)) { flushPara(); if (inList) { out += '</ul>\n'; inList = false; } out += '<h2>' + esc(raw.replace(/^##\s/, '')) + '</h2>\n'; continue; }
    if (/^#\s/.test(raw)) { flushPara(); if (inList) { out += '</ul>\n'; inList = false; } out += '<h1>' + esc(raw.replace(/^#\s/, '')) + '</h1>\n'; continue; }
    if (/^-\s/.test(raw)) { flushPara(); if (!inList) { out += '<ul>\n'; inList = true; } out += '  <li>' + esc(raw.replace(/^-\s/, '')).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/, '<em>$1</em>') + '</li>\n'; continue; }
    if (raw.trim() === '---') { flushPara(); if (inList) { out += '</ul>\n'; inList = false; } out += '<hr>\n'; continue; }
    if (raw.trim() === '') { flushPara(); if (inList) { out += '</ul>\n'; inList = false; } continue; }
    para.push(raw.trim());
  }
  flushPara();
  if (inList) out += '</ul>\n';
  if (inCode) out += '</code></pre>\n';
  return out;
}
window._buildCouncilMarkdown = _buildCouncilMarkdown;

// ── Public API ──
const councilModule = {
  init,
  toggleMode,
  handleCouncilSubmit,
  isActive,
  deactivate,
  closeCouncil,
};
export default councilModule;
window.councilModule = councilModule;
export { showCouncilSelector };
window.councilStopAll = stopAll;
