/* =====================================================
   icons.js — icônes SVG intégrées, sans connexion Internet
   Remplace automatiquement chaque <i class="fa-solid fa-xxx">
   par une icône SVG dessinée localement, avec le même rendu.
===================================================== */

const ICON_PATHS = {
  'arrow-right-from-bracket': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  'arrow-trend-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  'boxes-stacked': '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  'cash-register': '<rect x="2" y="10" width="20" height="10" rx="2"/><path d="M6 10V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4"/><line x1="2" y1="15" x2="22" y2="15"/><circle cx="12" cy="15" r="1.4"/>',
  'chart-column': '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  'chart-line': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  'check': '<polyline points="20 6 9 17 4 12"/>',
  'circle-check': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'circle-info': '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  'coins': '<circle cx="8" cy="10" r="5.5"/><path d="M14.5 9.5a5.5 5.5 0 1 1 0 9"/>',
  'database': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  'file-csv': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
  'file-import': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="11"/><polyline points="9 14 12 11 15 14"/>',
  'gauge-high': '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  'magnifying-glass': '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'pen': '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  'plus': '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  'print': '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  'receipt': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/>',
  'right-left': '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  'rotate-left': '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  'spinner': '<path d="M21 12a9 9 0 1 1-9-9"/>',
  'tags': '<path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  'trash': '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  'triangle-exclamation': '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'truck-field': '<rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.3"/><circle cx="18.5" cy="18.5" r="2.3"/>',
  'warehouse': '<path d="M3 21V10l9-7 9 7v11"/><path d="M9 21v-8h6v8"/>',
  'xmark': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'
};

function svgForIcon(name) {
  const inner = ICON_PATHS[name];
  if (!inner) return null;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon">${inner}</svg>`;
}

function hydrateIcon(el) {
  if (!el.classList) return;
  const iconClass = Array.from(el.classList).find(c => c.startsWith('fa-') && c !== 'fa-solid' && c !== 'fa-brands' && c !== 'fa-spin');
  if (!iconClass) return;
  const name = iconClass.slice(3);
  const markup = svgForIcon(name);
  if (!markup) return;

  const wrapper = document.createElement('span');
  wrapper.innerHTML = markup;
  const svg = wrapper.firstElementChild;

  el.classList.forEach(c => {
    if (c === 'fa-solid' || c === 'fa-brands' || c === iconClass) return;
    if (c === 'fa-spin') { svg.classList.add('icon-spin'); return; }
    svg.classList.add(c);
  });
  if (el.getAttribute('style')) svg.setAttribute('style', el.getAttribute('style'));
  if (el.title) svg.setAttribute('title', el.title);
  el.replaceWith(svg);
}

function hydrateAllIcons(root) {
  (root || document).querySelectorAll('i[class*="fa-"]').forEach(hydrateIcon);
}

document.addEventListener('DOMContentLoaded', () => {
  hydrateAllIcons(document);

  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches('i[class*="fa-"]')) hydrateIcon(node);
        if (node.querySelectorAll) hydrateAllIcons(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
});
