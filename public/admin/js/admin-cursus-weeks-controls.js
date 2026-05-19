/**
 * SBI 8.0P.167.103-GPT2.1
 * Cursus weeks controls bridge.
 *
 * Périmètre : ajouter / retirer rapidement des semaines de marge en fin de timeline,
 * sans modifier le modèle lourd admin-cursus.js.
 */

let installed = false;
let observer = null;

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function getRoot() {
  return document.getElementById('view-cursus');
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

function isMarginBlock(block) {
  return block?.classList?.contains('type-buffer_period')
    || block?.classList?.contains('type-revision_period')
    || block?.classList?.contains('type-catchup_period');
}

function getBlocks() {
  const root = getRoot();
  if (!root) return [];
  return $all('.sbi-cursus-block[data-id]', root);
}

function getTimelineEnd() {
  return getBlocks().reduce((max, block) => Math.max(max, getBlockEnd(block)), 0);
}

function getTrailingMarginBlock() {
  const blocks = getBlocks();
  const timelineEnd = getTimelineEnd();
  if (!timelineEnd) return null;

  return blocks
    .filter(isMarginBlock)
    .filter((block) => getBlockEnd(block) >= timelineEnd)
    .sort((a, b) => getBlockStart(b) - getBlockStart(a))[0] || null;
}

function waitFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function clickAddMarginButton() {
  const root = getRoot();
  if (!root) return false;

  const button = $('[data-add-type="buffer_period"]', root);
  if (!button) return false;

  button.click();
  return true;
}

async function addWeek() {
  if (!getRoot()) return;

  const added = clickAddMarginButton();
  if (!added) {
    setStatus('Impossible d’ajouter une semaine : bouton Marge introuvable.', 'error');
    return;
  }

  await waitFrame();
  setStatus('Semaine de marge ajoutée en fin de cursus. Pense à sauvegarder.', 'success');
}

async function removeTrailingWeek() {
  const root = getRoot();
  if (!root) return;

  const margin = getTrailingMarginBlock();
  if (!margin) {
    setStatus('Aucune semaine de marge en fin de timeline à retirer.', 'error');
    return;
  }

  margin.click();
  await waitFrame();

  const inspector = document.getElementById('cursus-inspector-content');
  const deleteButton = inspector?.querySelector?.('button[data-action="delete-item"]');
  if (!deleteButton) {
    setStatus('Impossible de retirer la semaine : bouton Supprimer introuvable.', 'error');
    return;
  }

  setStatus('Confirmation demandée : supprimer la dernière marge pour retirer une semaine.');
  deleteButton.click();
}

function bindButtons() {
  const root = getRoot();
  if (!root) return;

  const addButton = document.getElementById('cursus-add-week-btn');
  const removeButton = document.getElementById('cursus-remove-week-btn');

  if (addButton && addButton.dataset.sbiWeeksBound !== 'true') {
    addButton.dataset.sbiWeeksBound = 'true';
    addButton.addEventListener('click', addWeek);
  }

  if (removeButton && removeButton.dataset.sbiWeeksBound !== 'true') {
    removeButton.dataset.sbiWeeksBound = 'true';
    removeButton.addEventListener('click', removeTrailingWeek);
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
  observer = new MutationObserver(() => bindButtons());
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
