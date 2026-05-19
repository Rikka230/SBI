/**
 * SBI 8.0P.167.107.2-GPT2.1
 * Cursus safe hardening - micro patch sans MutationObserver global.
 *
 * Périmètre volontairement réduit :
 * - empêcher le drag & drop des blocs verrouillés ;
 * - retirer les boutons Déplacer / Ordre de l'inspecteur ;
 * - reformuler le message UX des éléments parallèles sans cours lié.
 */

let installed = false;
let cleanupFrame = 0;

function getRoot() {
  return document.getElementById('view-cursus');
}

function setStatus(message = '', tone = 'muted') {
  const status = document.getElementById('cursus-save-status');
  if (!status) return;
  status.textContent = message;
  status.style.color = tone === 'error'
    ? '#ff8fa3'
    : tone === 'success'
      ? '#75f29a'
      : '#9fb0cf';
}

function isLockedBlock(block) {
  if (!block) return false;
  if (block.classList.contains('sbi-is-locked')) return true;
  if (block.dataset.sbiLocked === 'true') return true;

  const badges = Array.from(block.querySelectorAll('.sbi-cursus-block-badges span'));
  return badges.some((badge) => badge.textContent.trim() === 'L');
}

function getLockedBlocks(root = getRoot()) {
  if (!root) return [];
  return Array.from(root.querySelectorAll('.sbi-cursus-block[data-id]')).filter(isLockedBlock);
}

function polishLockedBlocks() {
  const root = getRoot();
  if (!root) return;

  getLockedBlocks(root).forEach((block) => {
    block.classList.add('sbi-is-locked');
    block.dataset.sbiLocked = 'true';
    block.setAttribute('draggable', 'false');
    block.setAttribute('aria-disabled', 'true');
    block.title = 'Bloc verrouillé : décoche “Dates / position verrouillées” pour le déplacer.';
  });
}

function polishInspectorActions() {
  const inspector = document.getElementById('cursus-inspector-content');
  if (!inspector) return;

  inspector
    .querySelectorAll('button[data-action="move-left"], button[data-action="move-right"], button[data-action="order-up"], button[data-action="order-down"]')
    .forEach((button) => button.remove());
}

function polishCoherenceMessage() {
  const detail = document.getElementById('cursus-coherence-detail');
  if (!detail) return;

  detail.textContent = detail.textContent
    .replace(/Éléments parallèles sans cours lié/g, 'Un devoir, examen ou live n’est lié à aucun cours')
    .replace(/Elements parallèles sans cours lié/g, 'Un devoir, examen ou live n’est lié à aucun cours');
}

function runPolish() {
  polishLockedBlocks();
  polishInspectorActions();
  polishCoherenceMessage();
}

function schedulePolish() {
  window.cancelAnimationFrame(cleanupFrame);
  cleanupFrame = window.requestAnimationFrame(runPolish);
}

function handleDragStart(event) {
  const root = getRoot();
  if (!root) return;

  const block = event.target?.closest?.('.sbi-cursus-block[data-id]');
  if (!block || !root.contains(block)) return;

  if (!isLockedBlock(block)) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  block.classList.add('sbi-is-locked');
  block.setAttribute('draggable', 'false');
  setStatus('Bloc verrouillé : désactive le verrouillage pour le déplacer.', 'error');
}

function bindEvents() {
  document.addEventListener('dragstart', handleDragStart, true);

  ['click', 'input', 'change', 'keyup'].forEach((eventName) => {
    document.addEventListener(eventName, (event) => {
      const root = getRoot();
      if (!root) return;
      if (event.target && root.contains(event.target)) schedulePolish();
    }, true);
  });

  window.addEventListener('sbi:app-shell:navigated', () => window.setTimeout(schedulePolish, 90));
  window.addEventListener('sbi:app-shell:ready', () => window.setTimeout(schedulePolish, 90));
}

function ensureStyles() {
  if (document.getElementById('sbi-cursus-safe-polish-style')) return;

  const style = document.createElement('style');
  style.id = 'sbi-cursus-safe-polish-style';
  style.textContent = `
    #cursus-inspector-content button[data-action="move-left"],
    #cursus-inspector-content button[data-action="move-right"],
    #cursus-inspector-content button[data-action="order-up"],
    #cursus-inspector-content button[data-action="order-down"] {
      display: none !important;
    }

    .sbi-cursus-block.sbi-is-locked,
    .sbi-cursus-block[data-sbi-locked="true"] {
      cursor: not-allowed !important;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16), 0 14px 28px rgba(0, 0, 0, .28);
    }

    .sbi-cursus-block.sbi-is-locked .sbi-cursus-block-handle,
    .sbi-cursus-block[data-sbi-locked="true"] .sbi-cursus-block-handle {
      opacity: .35;
    }
  `;
  document.head.appendChild(style);
}

export function initAdminCursusSafePolish() {
  if (installed) {
    schedulePolish();
    return;
  }

  installed = true;
  ensureStyles();
  bindEvents();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedulePolish, { once: true });
  } else {
    schedulePolish();
  }
}

initAdminCursusSafePolish();
