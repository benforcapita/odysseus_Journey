// council/stream.js — SSE streaming into a council seat pane
import state from './state.js';
import markdownModule from '../markdown.js';
import spinnerModule from '../spinner.js';
import uiModule from '../ui.js';

const escapeHtml = uiModule.esc;

function _formatMs(ms) {
  if (ms < 1000) return Math.round(ms) + 'ms';
  if (ms < 10000) return (ms / 1000).toFixed(2) + 's';
  return (ms / 1000).toFixed(1) + 's';
}

/**
 * Stream one round's response into a seat pane.
 * @param seatIdx   seat index
 * @param sessionId per-seat session id
 * @param message   full prompt (persona + round instructions + problem)
 * @param aiMsgEl   the .msg-ai element to stream into
 * @param opts      { timeout, onDone }
 */
export async function streamToSeat(seatIdx, sessionId, message, aiMsgEl, opts) {
  opts = opts || {};
  const aiBody = aiMsgEl ? aiMsgEl.querySelector('.body') : null;
  const hist = aiMsgEl ? aiMsgEl.parentElement : null;
  if (!aiBody) { if (opts.onDone) opts.onDone(null); return; }

  const ac = new AbortController();
  state._abortControllers[seatIdx] = ac;

  // Stop button for this pane
  const paneEl = document.querySelector('.council-pane[data-seat="' + seatIdx + '"]');
  if (paneEl) {
    const stopBtn = paneEl.querySelector('.pane-stop-btn');
    if (stopBtn) stopBtn.style.display = '';
  }

 let accumulated = '';
 let timedOut = false;
  let result = null;            // returned to caller (and mirrored to onDone)
 const effectiveTimeout = opts.timeout || state._timeout;
  let timeoutId = setTimeout(() => { timedOut = true; ac.abort(); }, effectiveTimeout * 1000);
  const _resetIdle = () => { clearTimeout(timeoutId); timeoutId = setTimeout(() => { timedOut = true; ac.abort(); }, effectiveTimeout * 1000); };

  // Live timer
  const timerEl = state._paneElements[seatIdx] && state._paneElements[seatIdx].timerEl;
  const _t0 = performance.now();
  let _timerDone = false;
  function _tick() {
    if (_timerDone || !timerEl) return;
    timerEl.textContent = _formatMs(performance.now() - _t0);
    requestAnimationFrame(_tick);
  }
  requestAnimationFrame(_tick);

  // Throttled live markdown render (thinking blocks render live)
  let _renderPending = false;
  let _renderLastAt = 0;
  const _THROTTLE = 80;
  function _scheduleRender() {
    if (_renderPending) return;
    const now = performance.now();
    const delay = (now - _renderLastAt) >= _THROTTLE ? 0 : _THROTTLE - (now - _renderLastAt);
    _renderPending = true;
    setTimeout(() => {
      _renderPending = false;
      _renderLastAt = performance.now();
      if (markdownModule && accumulated.trim()) {
        aiBody.innerHTML = markdownModule.processWithThinking(
          markdownModule.squashOutsideCode(accumulated)
        );
      } else {
        aiBody.textContent = accumulated;
      }
      if (hist) hist.scrollTop = hist.scrollHeight;
    }, delay);
  }

  try {
    const fd = new FormData();
    fd.append('message', message);
    fd.append('session', sessionId);
    fd.append('mode', 'chat');
    fd.append('use_rag', 'false');
    fd.append('no_documents', 'true');
    fd.append('no_memory', 'true');
    fd.append('compare_mode', 'true');

    const res = await fetch(`${state.API_BASE}/api/chat_stream`, {
      method: 'POST', body: fd, signal: ac.signal,
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => '');
      throw new Error('chat_stream HTTP ' + res.status + (txt ? ': ' + txt.slice(0, 200) : ''));
    }

    // Stop spinner once first bytes arrive
    if (aiMsgEl._spinner) { aiMsgEl._spinner.stop(); aiMsgEl._spinner = null; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      _resetIdle();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') continue;
        try {
          const d = JSON.parse(payload);
          if (d.delta) {
            accumulated += d.delta;
            _scheduleRender();
          }
          if (d.done !== undefined && d.done) {
            // some backends send a final metrics payload
          }
        } catch (_) {}
      }
    }
    // Final render
    if (markdownModule && accumulated.trim()) {
      aiBody.innerHTML = markdownModule.processWithThinking(
        markdownModule.squashOutsideCode(accumulated)
      );
    } else {
      aiBody.textContent = accumulated;
    }
    if (window.hljs) aiBody.querySelectorAll('pre code:not(.hljs)').forEach(b => window.hljs.highlightElement(b));
    if (hist) hist.scrollTop = hist.scrollHeight;
   _timerDone = true;
   if (timerEl) timerEl.textContent = _formatMs(performance.now() - _t0);
    result = { text: accumulated, timedOut: false };
    if (opts.onDone) opts.onDone(result);
 } catch (err) {
   _timerDone = true;
   if (aiMsgEl._spinner) { aiMsgEl._spinner.stop(); aiMsgEl._spinner = null; }
   if (err.name === 'AbortError') {
     if (accumulated.trim()) {
       if (markdownModule) aiBody.innerHTML = markdownModule.processWithThinking(markdownModule.squashOutsideCode(accumulated));
       else aiBody.textContent = accumulated;
     } else {
       aiBody.innerHTML = '<span style="opacity:0.5;font-style:italic;">' + (timedOut ? 'Timed out' : 'Stopped') + '</span>';
     }
      result = { text: accumulated, timedOut };
      if (opts.onDone) opts.onDone(result);
   } else {
     aiBody.innerHTML += '<div style="color:var(--color-error);font-size:0.82em;margin-top:4px;">Error: ' + escapeHtml(err.message) + '</div>';
      result = { text: accumulated, error: err.message };
      if (opts.onDone) opts.onDone(result);
   }
 } finally {
   clearTimeout(timeoutId);
   state._abortControllers[seatIdx] = null;
   const _paneEl = document.querySelector('.council-pane[data-seat="' + seatIdx + '"]');
   if (_paneEl) {
     const stopBtn = _paneEl.querySelector('.pane-stop-btn');
     if (stopBtn) stopBtn.style.display = 'none';
   }
 }
  return result;
}

export function stopSeat(seatIdx) {
  const ac = state._abortControllers[seatIdx];
  if (ac) { ac.abort(); state._abortControllers[seatIdx] = null; }
}

export function stopAll() {
  state._abortControllers.forEach(ac => { if (ac) ac.abort(); });
  state._abortControllers = [];
  state._streaming = false;
  state._roundRunning = false;
}
window.councilStopAll = stopAll;
