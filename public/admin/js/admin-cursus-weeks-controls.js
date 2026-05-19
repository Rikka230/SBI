/**
 * SBI 8.0P.167.107-GPT2.1
 * Cursus weeks / trimester controls bridge.
 *
 * Périmètre : semaines visibles, trimestres visibles, zoom lisible et scroll horizontal.
 * Une semaine / un trimestre ajouté est une surface de travail, jamais un bloc pédagogique.
 */

let installed = false;
let observer = null;
let manualWeeks = 0;
let applying = false;
let scrollBound = false;

const STORAGE_PREFIX = 'sbi:cursus:manualWeeks:';
const DEFAULT_DISPLAY_WEEKS = 52;
const QUARTER_WEEKS = 13;

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function getRoot() {
  return document.getElementById('view-cursus');
}

function getCanvas() {
  return document.getElementById('cursus-timeline-canvas');
}

function getScroll() {
  return document.getElementById('cursus-timeline-scroll');
}

function getRuler() {
  return document.getElementById('cursus-ruler');
}

function getTemplateKey() {
  const template = document.getElementById('cursus-template-select')?.value || 'new';
  const formation = document.getElementById('cursus-formation-select')?.value || 'no-formation';
  const title = document.getElementById('cursus-title-input')?.value?.trim() || '';
  return `${STORAGE_PREFIX}${formation}:${template}:${title}`;
}

function setStatus(message = '', tone = 'muted') {
  const status = document.getElementById('cursus-save-status');
  if (!status) return;
  status.textContent = message;
  status.style.color = tone === 'success'
    ? '#75f29a'
    : tone === 'error'
      ? '#ff8fa3'
      : '#9fb0cf';
}

function parseCssNumber(node, propertyName, fallback = 0) {
  if (!node) return fallback;
  const value = parseFloat(getComputedStyle(node).getPropertyValue(propertyName));
  return Number.isFinite(value) ? value : fallback;
}

function getBlockStart(block) {
  return Math.max(0, Math.round(parseCssNumber(block, '--start-week', 0)));
}

function getBlockSpan(block) {
  return Math.max(1, Math.round(parseCssNumber(block, '--span-week', 1)));
}

function getBlockEnd(block) {
  return getBlockStart(block) + getBlockSpan(block);
}

function getBlocks() {
  const root = getRoot();
  if (!root) return [];
  return $all('.sbi-cursus-block[data-id]', root);
}

function getRequiredWeeks() {
  const blockEnd = getBlocks().reduce((max, block) => Math.max(max, getBlockEnd(block)), 0);
  return Math.max(DEFAULT_DISPLAY_WEEKS, blockEnd);
}

function getEffectiveWeeks() {
  const blockEnd = getBlocks().reduce((max, block) => Math.max(max, getBlockEnd(block)), 0);
  return Math.max(0, blockEnd);
}

function getRenderedWeeks() {
  const canvas = getCanvas();
  if (!canvas) return getRequiredWeeks();
  const raw = parseInt(getComputedStyle(canvas).getPropertyValue('--cursus-weeks'), 10);
  return Number.isFinite(raw) && raw > 0 ? raw : getRequiredWeeks();
}

function readStoredWeeks() {
  try {
    const value = Number(localStorage.getItem(getTemplateKey()) || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function storeWeeks(value) {
  try {
    localStorage.setItem(getTemplateKey(), String(Math.max(0, Number(value) || 0)));
  } catch {}
}

function buildWeekCell(index) {
  const cell = document.createElement('div');
  cell.className = 'sbi-cursus-week';
  cell.innerHTML = `<span>S${index + 1}</span><small>${index === 0 ? 'Départ' : `+${index * 7} j`}</small>`;
  return cell;
}

function patchRuler(weeks) {
  const ruler = getRuler();
  if (!ruler) return;

  let corner = ruler.querySelector('.sbi-cursus-ruler-corner');
  if (!corner) {
    corner = document.createElement('div');
    corner.className = 'sbi-cursus-ruler-corner';
    corner.textContent = 'Pistes';
    ruler.prepend(corner);
  }

  const existing = $all('.sbi-cursus-week', ruler);
  existing.forEach((node) => node.remove());

  for (let index = 0; index < weeks; index += 1) {
    ruler.appendChild(buildWeekCell(index));
  }
}

function updateZoomLabel() {
  const canvas = getCanvas();
  const label = document.getElementById('cursus-zoom-label');
  if (!canvas || !label) return;
  const weekWidth = parseCssNumber(canvas, '--cursus-week-width', 120);
  const percent = Math.max(25, Math.round((weekWidth / 120) * 100));
  label.textContent = `${percent}%`;
}

function applyWeeks({ silent = true } = {}) {
  if (applying) return;
  const root = getRoot();
  const canvas = getCanvas();
  if (!root || !canvas) return;

  applying = true;
  try {
    const required = getRequiredWeeks();
    const stored = readStoredWeeks();
    manualWeeks = Math.max(manualWeeks, stored, required);
    const weeks = Math.max(required, manualWeeks);

    canvas.style.setProperty('--cursus-weeks', String(weeks));
    patchRuler(weeks);
    updateZoomLabel();

    const statPeriod = document.getElementById('cursus-stat-period');
    if (statPeriod) statPeriod.textContent = `S1 → S${weeks}`;

    if (!silent) {
      setStatus(`Timeline réglée sur ${weeks} semaines.`, 'success');
    }
  } finally {
    applying = false;
  }
}

function setDisplayWeeks(weeks, { persist = true, silent = true } = {}) {
  const required = getRequiredWeeks();
  const next = Math.max(required, Math.round(Number(weeks) || 0));
  manualWeeks = next;
  if (persist) storeWeeks(manualWeeks);
  applyWeeks({ silent });
}

function addWeeks(count, label) {
  const base = Math.max(getRenderedWeeks(), manualWeeks, getRequiredWeeks());
  manualWeeks = base + count;
  storeWeeks(manualWeeks);
  applyWeeks({ silent: true });
  setStatus(`${label} ajouté${label === 'Trimestre' ? '' : 'e'}.`, 'success');
}

function removeWeeks(count, label) {
  const required = getRequiredWeeks();
  const current = Math.max(getRenderedWeeks(), manualWeeks, required);

  if (current - count < required) {
    setStatus(`Impossible de retirer ce ${label.toLowerCase()} : ces semaines contiennent déjà du contenu.`, 'error');
    return;
  }

  manualWeeks = current - count;
  storeWeeks(manualWeeks);
  applyWeeks({ silent: true });
  setStatus(`${label} retiré${label === 'Trimestre' ? '' : 'e'}.`, 'success');
}

function addWeek() {
  addWeeks(1, 'Semaine');
}

function removeWeek() {
  removeWeeks(1, 'Semaine');
}

function addTrimester() {
  addWeeks(QUARTER_WEEKS, 'Trimestre');
}

function removeTrimester() {
  removeWeeks(QUARTER_WEEKS, 'Trimestre');
}

function bindButtons() {
  const root = getRoot();
  if (!root) return;

  const buttons = [
    ['cursus-add-week-btn', addWeek, 'Ajouter une semaine vide à la timeline'],
    ['cursus-remove-week-btn', removeWeek, 'Retirer la dernière semaine vide'],
    ['cursus-add-trimester-btn', addTrimester, 'Ajouter 13 semaines vides'],
    ['cursus-remove-trimester-btn', removeTrimester, 'Retirer 13 semaines vides']
  ];

  buttons.forEach(([id, handler, title]) => {
    const button = document.getElementById(id);
    if (!button || button.dataset.sbiWeeksBound === 'true') return;
    button.dataset.sbiWeeksBound = 'true';
    button.title = title;
    button.addEventListener('click', handler);
  });
}

function bindHorizontalScroll() {
  const scroll = getScroll();
  if (!scroll || scroll.dataset.sbiWheelBound === 'true') return;
  scroll.dataset.sbiWheelBound = 'true';
  scrollBound = true;

  scroll.addEventListener('wheel', (event) => {
    if (!getRoot()) return;
    const dominantVertical = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
    const hasHorizontalOverflow = scroll.scrollWidth > scroll.clientWidth + 8;
    if (!hasHorizontalOverflow || !dominantVertical) return;

    event.preventDefault();
    scroll.scrollLeft += event.deltaY;
  }, { passive: false });
}

function ensureStyles() {
  if (document.getElementById('sbi-cursus-weeks-controls-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-cursus-weeks-controls-style';
  style.textContent = `
    #cursus-add-week-btn,
    #cursus-remove-week-btn,
    #cursus-add-trimester-btn,
    #cursus-remove-trimester-btn {
      min-width: auto;
      white-space: nowrap;
      border-color: rgba(117, 242, 154, .22);
    }
    #cursus-remove-week-btn,
    #cursus-remove-trimester-btn {
      border-color: rgba(255, 167, 74, .24);
    }
    .sbi-cursus-zoom-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 3.4rem;
      min-height: 2rem;
      padding: 0 .55rem;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,.14);
      color: rgba(235, 242, 255, .84);
      font-size: .78rem;
      font-weight: 700;
      letter-spacing: .02em;
      background: rgba(255,255,255,.055);
    }
    #cursus-timeline-scroll {
      overscroll-behavior-inline: contain;
      scrollbar-gutter: stable;
    }
  `;
  document.head.appendChild(style);
}

function observeCursus() {
  observer?.disconnect();
  const root = getRoot();
  if (!root) return;

  bindButtons();
  bindHorizontalScroll();
  applyWeeks({ silent: true });

  observer = new MutationObserver(() => {
    window.requestAnimationFrame(() => {
      bindButtons();
      bindHorizontalScroll();
      applyWeeks({ silent: true });
    });
  });
  observer.observe(root, { childList: true, subtree: true });
}

function installPublicApi() {
  window.SBI_CURSUS_WEEKS = {
    getDisplayWeeks: () => Math.max(getRenderedWeeks(), manualWeeks, getRequiredWeeks()),
    getEffectiveWeeks,
    getEffectiveDurationDays: () => getEffectiveWeeks() * 7,
    setDisplayWeeks,
    refresh: () => applyWeeks({ silent: true })
  };
}

export function initAdminCursusWeeksControlsBridge() {
  if (installed) {
    observeCursus();
    return;
  }

  installed = true;
  ensureStyles();
  installPublicApi();

  window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(observeCursus, 80));
  window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(observeCursus, 80));
  window.addEventListener('sbi:cursus:display-weeks', (event) => {
    const weeks = Number(event.detail?.displayWeeks || 0);
    if (weeks > 0) setDisplayWeeks(weeks, { persist: true, silent: true });
  });

  document.addEventListener('click', (event) => {
    if (!getRoot()) return;
    if (event.target?.id === 'cursus-zoom-in' || event.target?.id === 'cursus-zoom-out') {
      window.setTimeout(updateZoomLabel, 60);
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeCursus, { once: true });
  } else {
    observeCursus();
  }
}

initAdminCursusWeeksControlsBridge();
