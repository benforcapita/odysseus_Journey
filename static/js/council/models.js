// council/models.js — roster fetch + model list fetch (mirrors compare/models.js shape)
import state from './state.js';
import { sortModelObjects } from '../modelSort.js';

// Same classification rules as compare/models.js so non-chat models never
// appear as a council seat model.
const NON_CHAT_PREFIXES = ['tts-', 'whisper-', 'text-embedding-', 'text-moderation-', 'moderation-', 'embedding'];
const NON_CHAT_SUFFIXES = ['deep-research', '-online'];
const IMAGE_PREFIXES = ['dall-e-3', 'gpt-image', 'chatgpt-image'];
const DEPRECATED_IMAGE = ['dall-e-2'];

export function classifyModel(id) {
  const lower = id.toLowerCase();
  if (DEPRECATED_IMAGE.some(p => lower.startsWith(p))) return 'other';
  if (IMAGE_PREFIXES.some(p => lower.startsWith(p))) return 'image';
  if (NON_CHAT_PREFIXES.some(p => lower.startsWith(p))) return 'other';
  if (NON_CHAT_SUFFIXES.some(p => lower.endsWith(p) || lower.includes(p))) return 'other';
  return 'chat';
}

// Fallback roster used when /api/council/members is unreachable (no skill
// installed). Metadata only — persona bodies will be empty, so seat prompts
// fall back to a generic "you are {figure}, domain: {domain}" instruction.
export const FALLBACK_ROSTER = [
  ['aristotle', 'Aristotle', 'Categorization & structure', 'amber'],
  ['socrates', 'Socrates', 'Assumption destruction', 'white'],
  ['sun-tzu', 'Sun Tzu', 'Strategy & terrain', 'red'],
  ['ada', 'Ada Lovelace', 'Formal systems & abstraction', 'cyan'],
  ['aurelius', 'Marcus Aurelius', 'Resilience & moral clarity', 'silver'],
  ['machiavelli', 'Machiavelli', 'Power & pragmatism', 'green'],
  ['lao-tzu', 'Lao Tzu', 'Indirection & flow', 'lime'],
  ['feynman', 'Richard Feynman', 'First-principles explanation', 'orange'],
  ['torvalds', 'Linus Torvalds', 'Pragmatic engineering', 'yellow'],
  ['musashi', 'Miyamoto Musashi', 'Discipline & timing', 'gray'],
  ['watts', 'Alan Watts', 'Perspective & paradox', 'violet'],
  ['karpathy', 'Andrej Karpathy', 'Applied AI/ML', 'blue'],
  ['sutskever', 'Ilya Sutskever', 'AI safety & alignment', 'indigo'],
  ['kahneman', 'Daniel Kahneman', 'Bias & decision science', 'fuchsia'],
  ['meadows', 'Donella Meadows', 'Systems dynamics', 'teal'],
  ['munger', 'Charlie Munger', 'Mental models & inversion', 'emerald'],
  ['taleb', 'Nassim Taleb', 'Risk & antifragility', 'rose'],
  ['rams', 'Dieter Rams', 'Design restraint', 'stone'],
].map(([id, figure, domain, color]) => ({
  id, name: id, figure, domain, polarity: '', color,
  model_hint: '', provider_affinity: [], triads: [], profiles: [],
  polarity_pairs: [], description: '', persona: '',
}));

const MODELS_CACHE_TTL = 30000;

export async function fetchModels() {
  const now = Date.now();
  if (state._fetchModelsCache && (now - state._fetchModelsCacheTime) < MODELS_CACHE_TTL) {
    return state._fetchModelsCache;
  }
  const res = await fetch(`${state.API_BASE}/api/models`);
  const data = await res.json();
  const models = [];
  if (data.items && data.items.length > 0) {
    data.items.forEach(item => {
      const displayNames = item.models_display || item.models || [];
      const extraDisplay = item.models_extra_display || item.models_extra || [];
      (item.models || []).forEach((mid, i) => {
        models.push({
          id: mid, url: item.url,
          name: (displayNames[i] || mid).split('/').pop(),
          endpointId: item.endpoint_id || null,
          endpointName: item.endpoint_name || '',
          type: classifyModel(mid),
        });
      });
      (item.models_extra || []).forEach((mid, i) => {
        models.push({
          id: mid, url: item.url,
          name: (extraDisplay[i] || mid).split('/').pop(),
          endpointId: item.endpoint_id || null,
          endpointName: item.endpoint_name || '',
          type: classifyModel(mid),
        });
      });
    });
  }
  const chat = models.filter(m => m.type === 'chat');
  state._fetchModelsCache = sortModelObjects(chat);
  state._fetchModelsCacheTime = now;
  return state._fetchModelsCache;
}

export async function fetchRoster() {
  try {
    const res = await fetch(`${state.API_BASE}/api/council/members`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.members || data.members.length === 0) throw new Error('no members');
    state._roster = data.members;
    state._triads = data.triads || {};
    state._profiles = data.profiles || {};
    return data;
  } catch (e) {
    // Degrade to fallback roster so the tool still opens without the skill.
    state._roster = FALLBACK_ROSTER.slice();
    state._triads = {};
    state._profiles = {};
    return { available: false, members: state._roster, triads: {}, profiles: {} };
  }
}

// Pick a sensible default model for a member based on its provider affinity
// + model_hint, falling back to the first available chat model.
export function defaultModelFor(member, models) {
  if (!models || models.length === 0) return null;
  const hint = (member.model_hint || '').toLowerCase();
  if (hint) {
    const byHint = models.find(m => m.id.toLowerCase().includes(hint) || m.name.toLowerCase().includes(hint));
    if (byHint) return byHint;
  }
  // Prefer a provider that matches the member's affinity, to spread seats
  // across families (per the skill's provider-spread guidance).
  const affinity = (member.provider_affinity || []).map(a => a.toLowerCase());
  for (const a of affinity) {
    const m = models.find(mm => (mm.endpointName || '').toLowerCase().includes(a) || (mm.id || '').toLowerCase().includes(a));
    if (m) return m;
  }
  return models[0];
}
