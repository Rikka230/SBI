/**
 * SBI 8.0P.167.106-GPT2.1
 * Cursus weeks / trimester controls + zoom label + horizontal wheel scroll.
 *
 * Règles métier :
 * - une semaine est une colonne de travail, pas un bloc pédagogique ;
 * - + semaine / + trimestre n'ajoutent aucun bloc ni marge ;
 * - - semaine / - trimestre ne retirent que des colonnes vides ;
 * - la durée effective du cursus reste portée par le dernier bloc pédagogique placé.
 */

let installed = false;
let observer = null;
let manualWeeks = 0;
let applying = false;
let pendingApply = 0;
let wheelBound = false;

const STORAGE_PREFIX = 'sbi:cursus:manualWeeks:';
const TRIMESTER_WEEKS = 13;
const DEFAULT_WEEKS = 52;
const BASE_WEEK_WIDTH = 120;

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
  return Math.max(8, blockEnd);
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

  const target = String(weeks);
  const existingCount = ruler.querySelectorAll('.sbi-cursus-week').length;
  const hasCorner = Boolean(ruler.querySelector('.sbi-cursus-ruler-corner'));

  if (ruler.dataset.sbiWeeksRendered === target && existingCount === weeks && hasCorner) return;

  ruler.dataset.sbiWeeksRendered = target;
  ruler.innerHTML = '';

  const corner = document.createElement('div');
  corner.className = 'sbi-cursus-ruler-corner';
  corner.textContent = 'Pistes';
  ruler.appendChild(corner);

  for (let index = 0; index < weeks; index += 1) {
    ruler.appendChild(buildWeekCell(index));
  }
}

function getWeekWidth() {
  const canvas = getCanvas();
  if (!canvas) return BASE_WEEK_WIDTH;
  const width = parseCssNumber(canvas, '--cursus-week-width', BASE_WEEK_WIDTH);
  return width > 0 ? width : BASE_WEEK_WIDTH;
}

function updateZoomLabel() {
  const label = document.getElementById('cursus-zoom-label');
  if (!label) return;
  const percent = Math.round((getWeekWidth() / BASE_WEEK_WIDTH) * 100);
  label.textContent = `${Math.max(45, Math.min(180, percent))}%`;
}

function ensureDefaultVisualWeeks() {
  const required = getRequiredWeeks();
  const stored = readStoredWeeks();

  if (stored > 0) return Math.max(stored, required);
  if (required <= DEFAULT_WEEKS) return DEFAULT_WEEKS;
  return required;
}

function applyWeeks({ silent = true } = {}) {
  if (applying) return;
  const root = getRoot();
  const canvas = getCanvas();
  if (!root || !canvas) return;

  applying = true;
  try {
    const required = getRequiredWeeks();
    const preferred = ensureDefaultVisualWeeks();
    manualWeeks = Math.max(manualWeeks, preferred, required);
    const weeks = Math.max(required, manualWeeks);

    canvas.style.setProperty('--cursus-weeks', String(weeks));
    patchRuler(weeks);
    updateZoomLabel();

    const statPeriod = document.getElementById('cursus-stat-period');
    if (statPeriod) statPeriod.textContent = `S1 → S${weeks}`;

    if (!silent) {
      setStatus(`Timeline affichée sur ${weeks} semaines. Les colonnes vides restent de l’espace de travail.`, 'success');
    }
  } finally {
    applying = false;
  }
}

function scheduleApply() {
  window.cancelAnimationFrame(pendingApply);
  pendingApply = window.requestAnimationFrame(() => applyWeeks({ silent: true }));
}

function addWeeks(count = 1, label = 'semaine') {
  const safeCount = Math.max(1, Number(count) || 1);
  const base = Math.max(getRenderedWeeks(), manualWeeks, getRequiredWeeks(), ensureDefaultVisualWeeks());
  manualWeeks = base + safeCount;
  storeWeeks(manualWeeks);
  applyWeeks({ silent: true });
  setStatus(`+ ${safeCount} ${label}${safeCount > 1 ? 's' : ''} : timeline affichée sur ${manualWeeks} semaines. Aucun bloc ni marge créé.`, 'success');
}

function removeWeeks(count = 1, label = 'semaine') {
  const safeCount = Math.max(1, Number(count) || 1);
  const required = getRequiredWeeks();
  const current = Math.max(getRenderedWeeks(), manualWeeks, required, ensureDefaultVisualWeeks());
  const available = current - required;

  if (available < safeCount) {
    setStatus(`Impossible de retirer ${safeCount} ${label}${safeCount > 1 ? 's' : ''} : seules ${available} semaine${available > 1 ? 's' : ''} vide${available > 1 ? 's' : ''} sont disponibles après le dernier bloc.`, 'error');
    return;
  }

  manualWeeks = current - safeCount;
  storeWeeks(manualWeeks);
  applyWeeks({ silent: true });
  setStatus(`− ${safeCount} ${label}${safeCount > 1 ? 's' : ''} : aucun bloc ni marge supprimé.`, 'success');
}

function addWeek() {
  addWeeks(1, 'semaine');
}

function removeWeek() {
  removeWeeks(1, 'semaine');
}

function addTrimester() {
  addWeeks(TRIMESTER_WEEKS, 'semaine');
}

function removeTrimester() {
  removeWeeks(TRIMESTER_WEEKS, 'semaine');
}

function bindButtons() {
  const root = getRoot();
  if (!root) return;

  const bindings = [
    ['cursus-add-week-btn', addWeek, 'Ajouter une semaine vide'],
    ['cursus-remove-week-btn', removeWeek, 'Retirer la dernière semaine vide'],
    ['cursus-add-trimester-btn', addTrimester, 'Ajouter 13 semaines vides'],
    ['cursus-remove-trimester-btn', removeTrimester, 'Retirer 13 semaines vides uniquement si elles sont libres']
  ];

  bindings.forEach(([id, handler, title]) => {
    const button = document.getElementById(id);
    if (!button || button.dataset.sbiWeeksBound === 'true') return;
    button.dataset.sbiWeeksBound = 'true';
    button.title = title;
    button.addEventListener('click', handler);
  });

  const zoomButtons = [document.getElementById('cursus-zoom-in'), document.getElementById('cursus-zoom-out')].filter(Boolean);
  zoomButtons.forEach((button) => {
    if (button.dataset.sbiZoomLabelBound === 'true') return;
    button.dataset.sbiZoomLabelBound = 'true';
    button.addEventListener('click', () => window.setTimeout(updateZoomLabel, 40));
  });
}

function bindHorizontalWheel() {
  if (wheelBound) return;
  const scroll = getScroll();
  if (!scroll) return;

  wheelBound = true;
  scroll.addEventListener('wheel', (event) => {
    if (!getRoot()) return;
    if (event.ctrlKey) return;
    const canScroll = scroll.scrollWidth > scroll.clientWidth + 4;
    if (!canScroll) return;

    const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!dominantDelta) return;

    event.preventDefault();
    scroll.scrollLeft += dominantDelta;
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
    #cursus-add-trimester-btn,
    #cursus-remove-trimester-btn {
      background: rgba(42, 87, 255, .08);
    }
    #cursus-zoom-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 3.25rem;
      height: 2rem;
      padding: 0 .55rem;
      border: 1px solid rgba(255, 255, 255, .12);
      border-radius: 999px;
      color: rgba(230, 238, 255, .82);
      background: rgba(255, 255, 255, .045);
      font-size: .78rem;
      font-weight: 700;
      letter-spacing: .02em;
    }
    #cursus-timeline-scroll {
      scroll-behavior: smooth;
      overscroll-behavior-x: contain;
      cursor: grab;
    }
    #cursus-timeline-scroll:focus-visible {
      outline: 1px solid rgba(117, 242, 154, .45);
      outline-offset: 3px;
    }
    .sbi-cursus-timeline-tools {
      gap: .45rem;
      flex-wrap: wrap;
    }
  `;
  document.head.appendChild(style);
}

function observeCursus() {
  observer?.disconnect();
  const root = getRoot();
  if (!root) return;

  wheelBound = false;
  bindButtons();
  bindHorizontalWheel();
  applyWeeks({ silent: true });

  observer = new MutationObserver(() => scheduleApply());
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'data-id']
  });
}

export function initAdminCursusWeeksControlsBridge() {
  if (installed) {
    observeCursus();
    return;
  }

  installed = true;
  ensureStyles();

  window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(observeCursus, 80));
  window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(observeCursus, 80));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeCursus, { once: true });
  } else {
    observeCursus();
  }
}

initAdminCursusWeeksControlsBridge();
