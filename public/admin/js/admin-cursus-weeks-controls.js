/**
 * SBI 8.0P.167.103.1-GPT2.1
 * Cursus weeks controls bridge.
 *
 * Périmètre : ajouter / retirer des semaines VIDES dans l'affichage timeline.
 * Important : ce module ne crée plus de marge, ne supprime plus de marge,
 * et ne touche pas aux blocs pédagogiques. Une semaine est ici une colonne
 * de timeline, pas un élément de cursus.
 */

let installed = false;
let observer = null;
let manualWeeks = 0;
let applying = false;

const STORAGE_PREFIX = 'sbi:cursus:manualWeeks:';

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

    const statPeriod = document.getElementById('cursus-stat-period');
    if (statPeriod) statPeriod.textContent = `S1 → S${weeks}`;

    if (!silent) {
      setStatus(`Timeline réglée sur ${weeks} semaines. Pense à sauvegarder le cursus si cette structure est définitive.`, 'success');
    }
  } finally {
    applying = false;
  }
}

function addWeek() {
  const base = Math.max(getRenderedWeeks(), manualWeeks, getRequiredWeeks());
  manualWeeks = base + 1;
  storeWeeks(manualWeeks);
  applyWeeks({ silent: true });
  setStatus(`Semaine ${manualWeeks} ajoutée. Aucun bloc ni marge n’a été créé.`, 'success');
}

function removeWeek() {
  const required = getRequiredWeeks();
  const current = Math.max(getRenderedWeeks(), manualWeeks, required);

  if (current <= required) {
    setStatus(`Impossible de retirer S${current} : cette semaine est nécessaire au contenu existant.`, 'error');
    return;
  }

  manualWeeks = current - 1;
  storeWeeks(manualWeeks);
  applyWeeks({ silent: true });
  setStatus(`Semaine ${current} retirée. Aucun bloc ni marge n’a été supprimé.`, 'success');
}

function bindButtons() {
  const root = getRoot();
  if (!root) return;

  const addButton = document.getElementById('cursus-add-week-btn');
  const removeButton = document.getElementById('cursus-remove-week-btn');

  if (addButton && addButton.dataset.sbiWeeksBound !== 'true') {
    addButton.dataset.sbiWeeksBound = 'true';
    addButton.title = 'Ajouter une semaine vide à la timeline';
    addButton.addEventListener('click', addWeek);
  }

  if (removeButton && removeButton.dataset.sbiWeeksBound !== 'true') {
    removeButton.dataset.sbiWeeksBound = 'true';
    removeButton.title = 'Retirer la dernière semaine vide';
    removeButton.addEventListener('click', removeWeek);
  }
}

function ensureStyles() {
  if (document.getElementById('sbi-cursus-weeks-controls-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-cursus-weeks-controls-style';
  style.textContent = `
    #cursus-add-week-btn,
    #cursus-remove-week-btn {
      min-width: auto;
      white-space: nowrap;
      border-color: rgba(117, 242, 154, .22);
    }
    #cursus-remove-week-btn {
      border-color: rgba(255, 167, 74, .24);
    }
  `;
  document.head.appendChild(style);
}

function observeCursus() {
  observer?.disconnect();
  const root = getRoot();
  if (!root) return;

  bindButtons();
  applyWeeks({ silent: true });

  observer = new MutationObserver(() => {
    window.requestAnimationFrame(() => {
      bindButtons();
      applyWeeks({ silent: true });
    });
  });
  observer.observe(root, { childList: true, subtree: true });
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
