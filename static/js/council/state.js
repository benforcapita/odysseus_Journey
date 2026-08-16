// council/state.js — shared mutable state for the Council tool
const state = {
  API_BASE: '',
  isActive: false,
  _openingSelector: false,        // guards against duplicate modals on rapid clicks
  _streaming: false,              // any round currently streaming
  _roundRunning: false,           // a deliberation round is mid-flight
  _currentRound: 0,               // 0 = not started, 1..3 = deliberation rounds
  _mode: 'full',                  // 'full' | 'quick' | 'duo'
  _timeout: 240,                  // seconds per seat per round (idle timeout)
  _roster: [],                    // full member roster from /api/council/members
  _triads: {},                    // domain -> [member ids]
  _profiles: {},                  // profile name -> [member ids]
  _selectedSeats: [],             // [{ member, model }]
  _paneSessionIds: [],            // one session per seat
  _abortControllers: [],          // per-seat abort controllers
  _paneRoundText: [],             // current round's accumulated text per seat
  _paneOutputs: [],               // per-seat [{ round, text }]
  _paneElements: [],              // per-seat { paneEl, histEl, timerEl, badgeEl }
  _chairmanModel: null,           // {id,url,endpointId,endpointName,name} or null
  _chairmanSessionId: null,
  _problem: '',                   // last problem statement
  _transcript: [],                // [{round, outputs:[{idx,text,error}]}] raw per-round text
  _chairmanOutput: '',           // raw chairman verdict markdown
  _summaries: [],                 // [{idx, raw, json, error}] per-seat JSON conclusion summaries
  _elements: [],                  // DOM nodes injected into chat-container (cleanup)
  _savedChildren: [],             // [{el, display}] for restoring chat-container children
  _labelMap: [],                  // seat index -> 'Member A'/'B'/... (Round 2 anonymization)
  _domainWeightSeat: -1,          // seat index carrying 1.5x weight (full/quick)
  _fetchModelsCache: null,
  _fetchModelsCacheTime: 0,
};

export function reset() {
  state._streaming = false;
  state._roundRunning = false;
  state._currentRound = 0;
  state._abortControllers.forEach(c => { if (c) c.abort(); });
  state._abortControllers = [];
  state._paneSessionIds = [];
  state._paneRoundText = [];
  state._paneOutputs = [];
  state._paneElements = [];
  state._problem = '';
  state._transcript = [];
  state._chairmanOutput = '';
  state._summaries = [];
  state._labelMap = [];
  state._domainWeightSeat = -1;
}

export default state;
