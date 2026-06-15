/**
 * Monochrome inline SVG icons for the native Tools Hub catalog.
 *
 * Every icon is a 20×20 viewBox with currentColor stroke so it inherits the
 * active theme (and the card's accent color) without extra CSS. Unknown icon
 * names fall back to a generic grid/window glyph.
 */

const SVG_WRAPPER = (body) =>
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  body +
  '</svg>';

const ICON_PATHS = {
  // Analytics / data
  'bar-chart': SVG_WRAPPER('<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>'),
  // Math / conversion
  'calculator': SVG_WRAPPER('<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><circle cx="8" cy="11" r="1" fill="currentColor"/><circle cx="12" cy="11" r="1" fill="currentColor"/><circle cx="16" cy="11" r="1" fill="currentColor"/><circle cx="8" cy="16" r="1" fill="currentColor"/><circle cx="12" cy="16" r="1" fill="currentColor"/><circle cx="16" cy="16" r="1" fill="currentColor"/>'),
  // Date / time
  'calendar': SVG_WRAPPER('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
  'clock': SVG_WRAPPER('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  // Development / code
  'code': SVG_WRAPPER('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>'),
  'file-code': SVG_WRAPPER('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="10 12 8 14 10 16"/><polyline points="14 12 16 14 14 16"/>'),
  'file-text': SVG_WRAPPER('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>'),
  'git-compare': SVG_WRAPPER('<line x1="18" y1="9" x2="18" y2="21"/><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>'),
  'grid': SVG_WRAPPER('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>'),
  'hash': SVG_WRAPPER('<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>'),
  // Media / assets
  'image': SVG_WRAPPER('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
  // Security / keys
  'key': SVG_WRAPPER('<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>'),
  'link': SVG_WRAPPER('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  'lock': SVG_WRAPPER('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  // Design / color
  'palette': SVG_WRAPPER('<path d="M12 22c4.97 0 9-4.03 9-9 0-4.97-4.03-9-9-9s-9 4.03-9 9c0 2.76 1.12 5.26 2.93 7.07L12 22z"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="8" r="1.5" fill="currentColor"/><circle cx="14" cy="15" r="1.5" fill="currentColor"/>'),
  // Measure / reference
  'ruler': SVG_WRAPPER('<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>'),
  'search': SVG_WRAPPER('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  // Infrastructure / network
  'server': SVG_WRAPPER('<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>'),
  'shield': SVG_WRAPPER('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
  // Text manipulation
  'sort': SVG_WRAPPER('<line x1="8" y1="4" x2="4" y2="8"/><line x1="4" y1="8" x2="8" y2="12"/><line x1="16" y1="4" x2="20" y2="8"/><line x1="20" y1="8" x2="16" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>'),
  'text': SVG_WRAPPER('<path d="M4 7V5h16v2"/><path d="M9 20h6"/><path d="M12 5v15"/>'),
  'type': SVG_WRAPPER('<path d="M4 7V5h16v2"/><path d="M9 20h6"/><path d="M12 5v15"/>'),
  // People / identity
  'users': SVG_WRAPPER('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="17" cy="7" r="3"/>'),
};

export function getToolIconSvg(name) {
  return ICON_PATHS[name] || ICON_PATHS['grid'];
}

export const STAR_OUTLINE = SVG_WRAPPER('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>');
export const STAR_FILLED = SVG_WRAPPER('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="currentColor"/>');
